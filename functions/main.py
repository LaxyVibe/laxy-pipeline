# ---------------------------------------------------------------------------
# Firebase Functions — ADK Pipeline HTTP Endpoints
# ---------------------------------------------------------------------------
"""
Exposes the ADK pipeline as Firebase Functions (2nd gen) HTTP endpoints.

Endpoints:
  POST /pipeline-start            — Start a new pipeline run
  POST /pipeline-resume           — Resume from a human gate checkpoint
  GET  /pipeline-status           — Get current pipeline state
    POST /pipeline-publish          — Start/retry a publish job
    GET  /pipeline-publish-status   — Poll publish job status
  POST /pipeline-audio_generate   — Generate TTS audio for scripts (all languages)
  POST /pipeline-audio_generate_language — Generate TTS audio for a single language
  POST /pipeline-translate_language — Translate scripts into a single language
"""
from __future__ import annotations

import asyncio
import base64
import binascii
import concurrent.futures
import hashlib
import json
import logging
import os
import re
import time
import traceback
from contextvars import ContextVar, Token
from typing import Any
from uuid import uuid4

# Workaround for macOS fork-safety crash in Python (SIGKILL in ObjC runtime)
os.environ.setdefault("OBJC_DISABLE_INITIALIZE_FORK_SAFETY", "YES")

from firebase_admin import auth as fb_auth
from firebase_functions import https_fn, options
from pydantic import ValidationError

from agents import audio_alignment
from agents import session as session_service
from agents.pipeline_agent import (
    IdempotencyConflictError,
    IdempotencyInProgressError,
    PipelineExecutor,
    SessionAlreadyExistsError,
)
from contracts.pipeline_contract import (
    AudioSessionBootstrapRequest,
    AudioGenerateLanguageRequest,
    AudioGenerateRequest,
    EnhanceScriptRequest,
    GenerateJapaneseHiraganaRequest,
    GenerateCharacterRequest,
    GenerateDirectorNoteRequest,
    PublishGuideRequest,
    PublishStatusRequest,
    PipelineStartRequest,
    PipelineResumeRequest,
    PipelineStatusRequest,
    TranslateLanguageRequest,
    validate_publish_response,
    validate_pipeline_response,
)

logger = logging.getLogger(__name__)

PUBLISH_MAX_ATTEMPTS = 3
PUBLISH_PROCESSING_WINDOW_MS = int(os.environ.get("PUBLISH_PROCESSING_WINDOW_MS", "2000"))
AUDIT_LOG_COLLECTION_PATH = "_platform/system/auditLogs"
AUDIO_E2E_STUB_DATA_URL = (
    "data:audio/mpeg;base64,"
    "UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA="
)

ADMIN_ROLES = {"super-admin", "client-admin", "client-editor"}
SUPER_ADMIN_ROLE = "super-admin"

# Shared executor instance (singleton across cold-start requests)
_executor: PipelineExecutor | None = None

# Dedicated thread + event loop for async code.
# The google-genai client uses httpx/anyio internally which tracks cancel
# scopes per-task.  nest_asyncio breaks this by nesting run_until_complete()
# inside an already-running loop.  Instead we keep a single background thread
# with its own clean event loop — each request submits work and blocks on the
# future.  This avoids any nesting issues while keeping the genai client's
# session alive across requests.
_thread_pool = concurrent.futures.ThreadPoolExecutor(max_workers=1)
_loop: asyncio.AbstractEventLoop | None = None
_loop_lock = asyncio.Lock()  # only used during bootstrap
_request_context_var: ContextVar[dict[str, Any] | None] = ContextVar("request_context", default=None)


def _get_loop() -> asyncio.AbstractEventLoop:
    """Return (and lazily create) a dedicated event loop running in a background thread."""
    global _loop
    if _loop is not None and not _loop.is_closed():
        return _loop

    _loop = asyncio.new_event_loop()

    def _run_loop(loop: asyncio.AbstractEventLoop) -> None:
        asyncio.set_event_loop(loop)
        loop.run_forever()

    _thread_pool.submit(_run_loop, _loop)
    return _loop


def _run_async(coro):
    """Submit an async coroutine to the background loop and block until done."""
    loop = _get_loop()
    future = asyncio.run_coroutine_threadsafe(coro, loop)
    return future.result()  # blocks the HTTP-handling thread until the coro finishes


def get_executor() -> PipelineExecutor:
    global _executor
    if _executor is None:
        _executor = PipelineExecutor(
            project_id=os.environ.get("GCP_PROJECT", os.environ.get("GCLOUD_PROJECT")),
            location=os.environ.get("GEMINI_LOCATION", os.environ.get("VERTEX_LOCATION", "global")),
        )
    return _executor


def _cors_headers() -> dict[str, str]:
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
    }


def _non_empty(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        trimmed = value.strip()
        return trimmed or None
    return str(value)


def _pick_first_non_empty(*values: Any) -> str | None:
    for value in values:
        candidate = _non_empty(value)
        if candidate:
            return candidate
    return None


def _read_bool_env(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() not in {"0", "false", "no", "off"}


def _decode_bearer_claims(auth_header: str | None) -> dict[str, Any]:
    if not auth_header or not auth_header.lower().startswith("bearer "):
        return {}
    token = auth_header.split(" ", 1)[1].strip()
    parts = token.split(".")
    if len(parts) < 2:
        return {}
    payload = parts[1]
    payload += "=" * ((4 - len(payload) % 4) % 4)
    try:
        raw = base64.urlsafe_b64decode(payload.encode("utf-8"))
        parsed = json.loads(raw.decode("utf-8"))
        return parsed if isinstance(parsed, dict) else {}
    except (ValueError, UnicodeDecodeError, binascii.Error, json.JSONDecodeError):
        return {}


def _extract_bearer_token(auth_header: str | None) -> str | None:
    if not auth_header:
        return None
    if not auth_header.lower().startswith("bearer "):
        return None
    token = auth_header.split(" ", 1)[1].strip()
    return token or None


def _extract_claim_role(claims: dict[str, Any]) -> str | None:
    role = claims.get("role")
    if isinstance(role, str) and role.strip():
        return role.strip()

    roles = claims.get("roles")
    if isinstance(roles, list):
        for role_item in roles:
            if isinstance(role_item, str) and role_item.strip():
                return role_item.strip()
            if isinstance(role_item, dict):
                role_id = _pick_first_non_empty(role_item.get("id"), role_item.get("name"))
                if role_id:
                    return role_id
    return None


def _extract_claim_tenant(claims: dict[str, Any]) -> str | None:
    firebase_claims = claims.get("firebase") if isinstance(claims.get("firebase"), dict) else {}
    return _pick_first_non_empty(
        claims.get("tenantId"),
        claims.get("tenant_id"),
        claims.get("tenant"),
        firebase_claims.get("tenantId"),
        firebase_claims.get("tenant_id"),
        firebase_claims.get("tenant"),
    )


def _extract_claim_actor_id(claims: dict[str, Any]) -> str | None:
    return _pick_first_non_empty(
        claims.get("uid"),
        claims.get("user_id"),
        claims.get("sub"),
    )


def _extract_claim_email(claims: dict[str, Any]) -> str | None:
    email = claims.get("email")
    if isinstance(email, str):
        return email.strip() or None
    return None


def _verify_bearer_claims(auth_header: str | None) -> dict[str, Any] | None:
    token = _extract_bearer_token(auth_header)
    if not token:
        return None

    try:
        verified = fb_auth.verify_id_token(token, check_revoked=False)
        return verified if isinstance(verified, dict) else None
    except Exception as exc:
        if _read_bool_env("PIPELINE_ALLOW_UNVERIFIED_AUTH", False):
            logger.warning("Using unverified bearer claims due to PIPELINE_ALLOW_UNVERIFIED_AUTH: %s", exc)
            fallback = _decode_bearer_claims(auth_header)
            return fallback if fallback else None
        logger.warning("Bearer token verification failed: %s", exc)
        return None


def _authorise_admin_request(
    req: https_fn.Request,
    *,
    require_tenant_scope: bool = True,
) -> tuple[dict[str, Any] | None, https_fn.Response | None]:
    if not _read_bool_env("PIPELINE_AUTH_REQUIRED", True):
        return ({"role": SUPER_ADMIN_ROLE}, None)

    auth_header = _non_empty(req.headers.get("Authorization"))
    claims = _verify_bearer_claims(auth_header)
    if not claims:
        return (
            None,
            _error_response(
                "Authentication required",
                status=401,
                code="AUTH_REQUIRED",
                retryable=False,
            ),
        )

    role = _extract_claim_role(claims)
    if role not in ADMIN_ROLES:
        return (
            None,
            _error_response(
                "Forbidden: admin role required",
                status=403,
                code="FORBIDDEN_ROLE",
                retryable=False,
            ),
        )

    tenant_id = _extract_claim_tenant(claims)
    actor_id = _extract_claim_actor_id(claims)
    actor_email = _extract_claim_email(claims)
    if require_tenant_scope and role != SUPER_ADMIN_ROLE and not tenant_id:
        return (
            None,
            _error_response(
                "Forbidden: tenant scope required",
                status=403,
                code="FORBIDDEN_TENANT_SCOPE",
                retryable=False,
            ),
        )

    _update_request_context(
        actor_id=actor_id,
        actor_email=actor_email,
        tenant_id=tenant_id,
        role=role,
    )
    return ({
        "claims": claims,
        "role": role,
        "tenant_id": tenant_id,
        "actor_id": actor_id,
        "actor_email": actor_email,
    }, None)


def _log_observability_event(event: str, *, level: int = logging.INFO, **fields: Any) -> None:
    payload: dict[str, Any] = {
        "event": event,
        "ts_ms": int(time.time() * 1000),
    }
    for key, value in fields.items():
        if value is None or value == "":
            continue
        payload[key] = value
    logger.log(level, "telemetry %s", json.dumps(payload, ensure_ascii=False, sort_keys=True, default=str))


def _build_request_context(req: https_fn.Request, endpoint: str) -> dict[str, Any]:
    trace_header = _non_empty(req.headers.get("X-Cloud-Trace-Context"))
    trace_request_id = trace_header.split("/", 1)[0] if trace_header else None
    request_id = _pick_first_non_empty(
        req.headers.get("X-Request-Id"),
        trace_request_id,
    ) or f"req-{uuid4().hex}"

    correlation_id = _pick_first_non_empty(
        req.headers.get("X-Correlation-Id"),
        request_id,
    ) or f"corr-{uuid4().hex}"

    claims = _decode_bearer_claims(_non_empty(req.headers.get("Authorization")))

    actor_id = _pick_first_non_empty(
        req.headers.get("X-Actor-Id"),
        _extract_claim_actor_id(claims),
    )
    actor_email = _pick_first_non_empty(
        req.headers.get("X-Actor-Email"),
        _extract_claim_email(claims),
    )
    tenant_id = _pick_first_non_empty(
        req.headers.get("X-Tenant-Id"),
        _extract_claim_tenant(claims),
    )
    role = _pick_first_non_empty(claims.get("role"), _extract_claim_role(claims))

    return {
        "endpoint": endpoint,
        "method": req.method,
        "path": _non_empty(getattr(req, "path", None)),
        "request_id": request_id,
        "correlation_id": correlation_id,
        "actor_id": actor_id,
        "actor_email": actor_email,
        "tenant_id": tenant_id,
        "role": role,
        "started_perf": time.perf_counter(),
    }


def _set_request_context(req: https_fn.Request, *, endpoint: str) -> Token[dict[str, Any] | None]:
    context = _build_request_context(req, endpoint)
    token = _request_context_var.set(context)
    _log_observability_event(
        "http.request.start",
        endpoint=context.get("endpoint"),
        method=context.get("method"),
        path=context.get("path"),
        request_id=context.get("request_id"),
        correlation_id=context.get("correlation_id"),
        tenant_id=context.get("tenant_id"),
        actor_id=context.get("actor_id"),
    )
    return token


def _clear_request_context(token: Token[dict[str, Any] | None]) -> None:
    _request_context_var.reset(token)


def _current_request_context() -> dict[str, Any]:
    context = _request_context_var.get()
    return dict(context) if isinstance(context, dict) else {}


def _update_request_context(**fields: Any) -> None:
    context = _current_request_context()
    if not context:
        return
    changed = False
    for key, value in fields.items():
        candidate = _non_empty(value)
        if candidate and context.get(key) != candidate:
            context[key] = candidate
            changed = True
    if changed:
        _request_context_var.set(context)


def _update_actor_tenant_from_context(context: dict[str, Any] | None) -> None:
    if not isinstance(context, dict):
        return
    _update_request_context(
        actor_id=_pick_first_non_empty(
            context.get("actorId"),
            context.get("userId"),
            context.get("userUid"),
        ),
        tenant_id=_pick_first_non_empty(
            context.get("tenantId"),
            context.get("tenant_id"),
            context.get("tenant"),
        ),
    )


def _resolve_context_tenant_id(context: dict[str, Any] | None) -> str | None:
    if not isinstance(context, dict):
        return None
    return _pick_first_non_empty(
        context.get("tenantId"),
        context.get("tenant_id"),
        context.get("tenant"),
    )


def _enforce_payload_tenant_scope(
    context: dict[str, Any] | None,
    auth_context: dict[str, Any],
) -> tuple[dict[str, Any], https_fn.Response | None]:
    payload_context = dict(context) if isinstance(context, dict) else {}
    payload_tenant = _resolve_context_tenant_id(payload_context)
    claim_tenant = _non_empty(auth_context.get("tenant_id"))
    role = _non_empty(auth_context.get("role"))

    if role != SUPER_ADMIN_ROLE:
        if not claim_tenant:
            return (
                payload_context,
                _error_response(
                    "Forbidden: tenant scope required",
                    status=403,
                    code="FORBIDDEN_TENANT_SCOPE",
                    retryable=False,
                ),
            )
        if payload_tenant and payload_tenant != claim_tenant:
            return (
                payload_context,
                _error_response(
                    "Forbidden: tenant mismatch",
                    status=403,
                    code="FORBIDDEN_TENANT_MISMATCH",
                    details={
                        "requestTenantId": payload_tenant,
                        "claimTenantId": claim_tenant,
                    },
                    retryable=False,
                ),
            )
        payload_context["tenantId"] = claim_tenant
    elif claim_tenant and not payload_tenant:
        payload_context["tenantId"] = claim_tenant

    return (payload_context, None)


def _extract_session_tenant_id(session: dict[str, Any]) -> str | None:
    if not isinstance(session, dict):
        return None

    direct_tenant = _pick_first_non_empty(
        session.get("tenantId"),
        session.get("tenant_id"),
        session.get("tenant"),
    )
    if direct_tenant:
        return direct_tenant

    context = session.get("context")
    if not isinstance(context, dict):
        return None

    telemetry = context.get("_telemetry") if isinstance(context.get("_telemetry"), dict) else {}
    return _pick_first_non_empty(
        context.get("tenantId"),
        context.get("tenant_id"),
        context.get("tenant"),
        telemetry.get("tenant_id"),
        telemetry.get("tenantId"),
        telemetry.get("tenant"),
    )


def _enforce_session_tenant_scope(
    session_id: str,
    auth_context: dict[str, Any],
) -> https_fn.Response | None:
    role = _non_empty(auth_context.get("role"))
    if role == SUPER_ADMIN_ROLE:
        return None

    claim_tenant = _non_empty(auth_context.get("tenant_id"))
    if not claim_tenant:
        return _error_response(
            "Forbidden: tenant scope required",
            status=403,
            code="FORBIDDEN_TENANT_SCOPE",
            retryable=False,
        )

    session = session_service.get_session(session_id)
    if not session:
        return _error_response("Session not found", 404, code="SESSION_NOT_FOUND")

    session_tenant = _extract_session_tenant_id(session)
    if not session_tenant:
        return _error_response(
            "Forbidden: session has no tenant scope",
            status=403,
            code="FORBIDDEN_SESSION_SCOPE",
            retryable=False,
        )

    if session_tenant != claim_tenant:
        _write_audit_log(
            "pipeline.session.access.denied",
            resource=f"pipeline_sessions/{session_id}",
            details={
                "sessionTenantId": session_tenant,
                "claimTenantId": claim_tenant,
            },
            success=False,
        )
        return _error_response(
            "Forbidden: session tenant mismatch",
            status=403,
            code="FORBIDDEN_SESSION_TENANT_MISMATCH",
            details={
                "sessionTenantId": session_tenant,
                "claimTenantId": claim_tenant,
            },
            retryable=False,
        )

    return None


def _audit_logs_collection_ref() -> Any | None:
    db = getattr(session_service, "db", None)
    if db is None:
        return None

    parts = [segment for segment in AUDIT_LOG_COLLECTION_PATH.split("/") if segment]
    if len(parts) != 3:
        return None
    return db.collection(parts[0]).document(parts[1]).collection(parts[2])


def _write_audit_log(
    action: str,
    *,
    resource: str,
    details: dict[str, Any] | None = None,
    success: bool = True,
) -> None:
    collection = _audit_logs_collection_ref()
    if collection is None:
        return

    context = _current_request_context()
    payload = {
        "tenantId": _pick_first_non_empty(context.get("tenant_id"), context.get("tenantId")),
        "userId": _pick_first_non_empty(context.get("actor_id"), context.get("actorId")),
        "userEmail": _pick_first_non_empty(context.get("actor_email"), context.get("actorEmail")),
        "action": action,
        "resource": resource,
        "details": {
            "success": success,
            "endpoint": context.get("endpoint"),
            "requestId": context.get("request_id"),
            "correlationId": context.get("correlation_id"),
            **(details or {}),
        },
        "timestamp": session_service.firestore.SERVER_TIMESTAMP,
    }

    try:
        collection.document().set(payload)
    except Exception as exc:
        logger.warning("Failed to write audit log (%s): %s", action, exc)


def _executor_request_metadata() -> dict[str, Any]:
    context = _current_request_context()
    metadata: dict[str, Any] = {}
    for key in ("request_id", "correlation_id", "tenant_id", "actor_id"):
        value = context.get(key)
        if value:
            metadata[key] = value
    return metadata


def _response_headers() -> dict[str, str]:
    headers = {**_cors_headers(), "Content-Type": "application/json"}
    context = _current_request_context()
    correlation_id = context.get("correlation_id")
    request_id = context.get("request_id")
    if correlation_id:
        headers["X-Correlation-Id"] = str(correlation_id)
    if request_id:
        headers["X-Request-Id"] = str(request_id)
    return headers


def _emit_response_event(status: int, *, error_code: str | None = None) -> None:
    context = _current_request_context()
    if not context:
        return
    started_perf = context.get("started_perf")
    duration_ms = None
    if isinstance(started_perf, (int, float)):
        duration_ms = int((time.perf_counter() - started_perf) * 1000)

    level = logging.INFO if status < 500 else logging.ERROR
    _log_observability_event(
        "http.request.finish",
        level=level,
        endpoint=context.get("endpoint"),
        method=context.get("method"),
        path=context.get("path"),
        request_id=context.get("request_id"),
        correlation_id=context.get("correlation_id"),
        tenant_id=context.get("tenant_id"),
        actor_id=context.get("actor_id"),
        session_id=context.get("session_id"),
        checkpoint_id=context.get("checkpoint_id"),
        publish_id=context.get("publish_id"),
        target_language=context.get("target_language"),
        http_status=status,
        duration_ms=duration_ms,
        success=status < 400,
        error_code=error_code,
    )


def _json_response(data: dict, status: int = 200, *, error_code: str | None = None) -> https_fn.Response:
    _emit_response_event(status, error_code=error_code)
    return https_fn.Response(
        json.dumps(data, ensure_ascii=False, default=str),
        status=status,
        headers=_response_headers(),
    )


def _error_response(
    message: str,
    status: int = 400,
    *,
    code: str = "BAD_REQUEST",
    details: Any | None = None,
    retryable: bool = False,
) -> https_fn.Response:
    return _json_response({
        "error": {
            "code": code,
            "message": message,
            "details": details,
            "retryable": retryable,
        }
    }, status=status, error_code=code)


def _audio_e2e_stub_enabled() -> bool:
    return _read_bool_env("PIPELINE_AUDIO_E2E_STUB", False)


def _format_srt_timestamp(milliseconds: int) -> str:
    total_ms = max(0, int(milliseconds))
    hours, remainder = divmod(total_ms, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    seconds, millis = divmod(remainder, 1_000)
    return f"{hours:02}:{minutes:02}:{seconds:02},{millis:03}"


def _build_stub_srt_file(language: str, spot_id: str, text: str, duration_ms: int) -> dict[str, Any]:
    duration_sec = max(0.1, duration_ms / 1000.0)
    pieces = text.split()
    if not pieces:
        pieces = [char for char in text if not char.isspace()]
    if not pieces:
        pieces = ["."]

    step = duration_sec / max(len(pieces), 1)
    word_timestamps: list[audio_alignment.WordTiming] = []
    for idx, token in enumerate(pieces):
        start = step * idx
        end = step * (idx + 1)
        word_timestamps.append({
            "word": token,
            "startSeconds": start,
            "endSeconds": end,
        })

    entries = audio_alignment.build_aligned_srt_entries(
        reference_text=text,
        duration_sec=duration_sec,
        word_timestamps=word_timestamps,
    )
    raw_srt = "\n".join(
        line
        for entry in entries
        for line in [
            str(entry["index"]),
            f"{entry['startTime']} --> {entry['endTime']}",
            entry["text"],
            "",
        ]
    )
    return {
        "lang": language,
        "spotId": spot_id,
        "entries": entries,
        "rawSrt": raw_srt,
    }


def _build_audio_generate_language_stub_response(payload: AudioGenerateLanguageRequest) -> dict[str, Any]:
    translation_lookup = {
        item.spotId: item.translatedText
        for item in (payload.translations or [])
        if _non_empty(item.spotId) and _non_empty(item.translatedText)
    }

    audio_files: list[dict[str, Any]] = []
    srt_files: list[dict[str, Any]] = []

    for script in payload.scripts:
        spoken_text = _non_empty(translation_lookup.get(script.spotId)) or _non_empty(script.scriptText)
        if not spoken_text:
            continue

        # Deterministic duration so CI assertions remain stable.
        duration_ms = max(1_200, min(12_000, 900 + (len(spoken_text) * 35)))
        audio_url = f"{AUDIO_E2E_STUB_DATA_URL}#lang={payload.language}&spot={script.spotId}"
        history_metadata: dict[str, Any] = {}
        if payload.historyTarget is not None:
            generated_at_ms = int(time.time() * 1000)
            history_metadata = {
                "guideId": payload.historyTarget.guideId,
                "spotId": payload.historyTarget.spotId,
                "lang": payload.historyTarget.lang,
                "versionId": f"stub-version-{generated_at_ms:x}",
                "storagePath": f"audio/{payload.sessionId}/{payload.language}/{payload.historyTarget.spotId}.wav",
                "generatedAtMs": generated_at_ms,
                "isActiveVersion": True,
                "isLatestVersion": True,
            }

        audio_files.append({
            "lang": payload.language,
            "spotId": payload.historyTarget.spotId if payload.historyTarget is not None else script.spotId,
            "spotNumber": script.spotNumber,
            "title": (
                payload.historyTarget.spotTitle or script.title
                if payload.historyTarget is not None
                else script.title
            ),
            "audioUrl": audio_url,
            "durationMs": duration_ms,
            "voiceId": payload.voiceId,
            "model": "deterministic-e2e-stub",
            **history_metadata,
        })
        srt_files.append(_build_stub_srt_file(payload.language, script.spotId, spoken_text, duration_ms))

    return {
        "lang": payload.language,
        "audioFiles": audio_files,
        "srtFiles": srt_files,
    }


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "guide"


def _build_qr_data_url(seed: str) -> str:
    """Build a deterministic lightweight SVG QR-like data URL without external deps."""
    grid = 25
    cell = 10
    size = grid * cell
    digest = hashlib.sha256(seed.encode("utf-8")).digest()

    def is_finder(row: int, col: int) -> bool:
        return (
            (row < 8 and col < 8)
            or (row < 8 and col > grid - 9)
            or (row > grid - 9 and col < 8)
        )

    def finder_pixel(row: int, col: int) -> bool:
        if row < 8 and col < 8:
            fx, fy = 0, 0
        elif row < 8 and col > grid - 9:
            fx, fy = grid - 7, 0
        else:
            fx, fy = 0, grid - 7
        rx = col - fx
        ry = row - fy
        border = rx == 0 or rx == 6 or ry == 0 or ry == 6
        inner = 2 <= rx <= 4 and 2 <= ry <= 4
        return border or inner

    rects: list[str] = [f'<rect width="{size}" height="{size}" fill="white"/>']
    bit_index = 0
    for row in range(grid):
        for col in range(grid):
            if is_finder(row, col):
                if finder_pixel(row, col):
                    rects.append(
                        f'<rect x="{col * cell}" y="{row * cell}" width="{cell}" height="{cell}" fill="black"/>'
                    )
                continue

            byte = digest[bit_index % len(digest)]
            bit = (byte >> (bit_index % 8)) & 1
            bit_index += 1
            if bit:
                rects.append(
                    f'<rect x="{col * cell}" y="{row * cell}" width="{cell}" height="{cell}" fill="black"/>'
                )

    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 {size} {size}">'
        + "".join(rects)
        + "</svg>"
    )
    encoded = base64.b64encode(svg.encode("utf-8")).decode("ascii")
    return f"data:image/svg+xml;base64,{encoded}"


def _build_publish_response_from_job(job: dict[str, Any]) -> dict[str, Any]:
    return validate_publish_response({
        "success": True,
        "publishId": job["publish_id"],
        "status": job["status"],
        "guideUrl": job["guide_url"],
        "shortUrl": job["short_url"],
        "slug": job["slug"],
        "qrDataUrl": job["qr_data_url"],
        "publishedAt": int(job.get("published_at_ms") or job.get("processing_started_at_ms") or int(time.time() * 1000)),
        "retryable": bool(job.get("retryable", False)),
        "attempts": int(job.get("attempts", 1)),
        "maxAttempts": int(job.get("max_attempts", PUBLISH_MAX_ATTEMPTS)),
    })


@https_fn.on_request(
    memory=options.MemoryOption.GB_2,
    timeout_sec=1800,
    region="us-central1",
)
def pipeline_start(req: https_fn.Request) -> https_fn.Response:
    """
    Start a new pipeline run.

    Request body:
    {
        "question": "Process museum exhibits...",
        "sessionId": "studio-abc123",
        "idempotencyKey": "start-20260319-001",
        "uploads": [{ "data": "base64...", "name": "file.pdf", "mime": "application/pdf" }],
        "context": { ... optional extra context ... }
    }

    Response:
    {
        "sessionId": "studio-abc123",
        "checkpointId": "hg1_data_review" | null,
        "steps": [{ "stepId": "s2_ocr_parse", "label": "S2: OCR Parse (Gemini)", "status": "FINISHED", "output": {...} }],
        "finalText": null,
        "status": "awaiting_input" | "running" | "completed" | "error"
    }
    """
    if req.method == "OPTIONS":
        return https_fn.Response("", status=204, headers=_cors_headers())

    context_token = _set_request_context(req, endpoint="pipeline_start")
    try:
        if req.method != "POST":
            return _error_response("Method not allowed", 405, code="METHOD_NOT_ALLOWED")

        auth_context, auth_error = _authorise_admin_request(req, require_tenant_scope=True)
        if auth_error:
            _write_audit_log(
                "pipeline.start.denied",
                resource="pipeline_sessions",
                details={"reason": "auth_failed"},
                success=False,
            )
            return auth_error

        try:
            body = req.get_json(silent=True) or {}
        except Exception:
            return _error_response("Invalid JSON body", code="INVALID_JSON_BODY")

        try:
            payload = PipelineStartRequest.model_validate(body)
        except ValidationError as e:
            return _error_response(
                "Invalid request body",
                code="INVALID_REQUEST_BODY",
                details=e.errors(),
            )

        session_context, tenant_error = _enforce_payload_tenant_scope(
            payload.context if isinstance(payload.context, dict) else None,
            auth_context or {},
        )
        if tenant_error:
            _write_audit_log(
                "pipeline.start.denied",
                resource=f"pipeline_sessions/{payload.sessionId}",
                details={"reason": "tenant_scope"},
                success=False,
            )
            return tenant_error

        _update_request_context(session_id=payload.sessionId)
        _update_actor_tenant_from_context(session_context)

        try:
            executor = get_executor()
            result = _run_async(
                executor.start(
                    payload.sessionId,
                    payload.question,
                    uploads=[item.model_dump() for item in payload.uploads] if payload.uploads else None,
                    context=session_context,
                    idempotency_key=payload.idempotencyKey,
                    request_metadata=_executor_request_metadata(),
                )
            )
            _write_audit_log(
                "pipeline.start",
                resource=f"pipeline_sessions/{payload.sessionId}",
                details={
                    "idempotencyKeyPresent": bool(payload.idempotencyKey),
                },
                success=True,
            )
            return _json_response(validate_pipeline_response(result))
        except SessionAlreadyExistsError as e:
            return _error_response(
                str(e),
                409,
                code="SESSION_ALREADY_EXISTS",
                retryable=False,
            )
        except IdempotencyConflictError as e:
            return _error_response(
                str(e),
                409,
                code="IDEMPOTENCY_KEY_CONFLICT",
                retryable=False,
            )
        except IdempotencyInProgressError as e:
            return _error_response(
                str(e),
                409,
                code="IDEMPOTENCY_REQUEST_IN_PROGRESS",
                retryable=True,
            )
        except Exception as e:
            logger.error(f"pipeline_start error: {e}\n{traceback.format_exc()}")
            _write_audit_log(
                "pipeline.start.failed",
                resource=f"pipeline_sessions/{payload.sessionId}",
                details={"error": str(e)},
                success=False,
            )
            return _error_response(
                "Pipeline start failed",
                500,
                code="PIPELINE_START_FAILED",
                details=str(e),
                retryable=True,
            )
    finally:
        _clear_request_context(context_token)


@https_fn.on_request(
    memory=options.MemoryOption.GB_2,
    timeout_sec=1800,
    region="us-central1",
)
def pipeline_resume(req: https_fn.Request) -> https_fn.Response:
    """
    Resume a pipeline from a human gate checkpoint.

    Request body:
    {
        "sessionId": "studio-abc123",
        "checkpointId": "hg1_data_review",
        "action": "approve" | "reject",
        "idempotencyKey": "resume-20260319-001",
        "feedback": "Looks good, proceed"
    }
    """
    if req.method == "OPTIONS":
        return https_fn.Response("", status=204, headers=_cors_headers())

    context_token = _set_request_context(req, endpoint="pipeline_resume")
    try:
        if req.method != "POST":
            return _error_response("Method not allowed", 405, code="METHOD_NOT_ALLOWED")

        auth_context, auth_error = _authorise_admin_request(req, require_tenant_scope=True)
        if auth_error:
            _write_audit_log(
                "pipeline.resume.denied",
                resource="pipeline_sessions",
                details={"reason": "auth_failed"},
                success=False,
            )
            return auth_error

        try:
            body = req.get_json(silent=True) or {}
        except Exception:
            return _error_response("Invalid JSON body", code="INVALID_JSON_BODY")

        try:
            payload = PipelineResumeRequest.model_validate(body)
        except ValidationError as e:
            return _error_response(
                "Invalid request body",
                code="INVALID_REQUEST_BODY",
                details=e.errors(),
            )

        session_scope_error = _enforce_session_tenant_scope(payload.sessionId, auth_context or {})
        if session_scope_error:
            _write_audit_log(
                "pipeline.resume.denied",
                resource=f"pipeline_sessions/{payload.sessionId}",
                details={"reason": "tenant_scope"},
                success=False,
            )
            return session_scope_error

        _update_request_context(session_id=payload.sessionId, checkpoint_id=payload.checkpointId)

        try:
            executor = get_executor()
            result = _run_async(
                executor.resume(
                    payload.sessionId,
                    payload.checkpointId,
                    payload.action,
                    feedback=payload.feedback,
                    idempotency_key=payload.idempotencyKey,
                    request_metadata=_executor_request_metadata(),
                )
            )
            _write_audit_log(
                "pipeline.resume",
                resource=f"pipeline_sessions/{payload.sessionId}",
                details={
                    "checkpointId": payload.checkpointId,
                    "action": payload.action,
                },
                success=True,
            )
            return _json_response(validate_pipeline_response(result))
        except IdempotencyConflictError as e:
            return _error_response(
                str(e),
                409,
                code="IDEMPOTENCY_KEY_CONFLICT",
                retryable=False,
            )
        except IdempotencyInProgressError as e:
            return _error_response(
                str(e),
                409,
                code="IDEMPOTENCY_REQUEST_IN_PROGRESS",
                retryable=True,
            )
        except ValueError as e:
            if "Session not found" in str(e):
                return _error_response(str(e), 404, code="SESSION_NOT_FOUND")
            return _error_response(str(e), 409, code="PIPELINE_STATE_CONFLICT")
        except Exception as e:
            logger.error(f"pipeline_resume error: {e}\n{traceback.format_exc()}")
            _write_audit_log(
                "pipeline.resume.failed",
                resource=f"pipeline_sessions/{payload.sessionId}",
                details={"error": str(e), "checkpointId": payload.checkpointId},
                success=False,
            )
            return _error_response(
                "Pipeline resume failed",
                500,
                code="PIPELINE_RESUME_FAILED",
                details=str(e),
                retryable=True,
            )
    finally:
        _clear_request_context(context_token)


@https_fn.on_request(
    memory=options.MemoryOption.GB_2,
    timeout_sec=1800,
    region="us-central1",
)
def pipeline_status(req: https_fn.Request) -> https_fn.Response:
    """
    Get current pipeline state for reconnection/polling.

    Query params:
        ?sessionId=studio-abc123
    """
    if req.method == "OPTIONS":
        return https_fn.Response("", status=204, headers=_cors_headers())

    context_token = _set_request_context(req, endpoint="pipeline_status")
    try:
        if req.method != "GET":
            return _error_response("Method not allowed", 405, code="METHOD_NOT_ALLOWED")

        auth_context, auth_error = _authorise_admin_request(req, require_tenant_scope=True)
        if auth_error:
            _write_audit_log(
                "pipeline.status.denied",
                resource="pipeline_sessions",
                details={"reason": "auth_failed"},
                success=False,
            )
            return auth_error

        try:
            payload = PipelineStatusRequest.model_validate({"sessionId": req.args.get("sessionId")})
        except ValidationError as e:
            return _error_response(
                "Invalid query params",
                code="INVALID_QUERY_PARAMS",
                details=e.errors(),
            )

        _update_request_context(session_id=payload.sessionId)

        session_scope_error = _enforce_session_tenant_scope(payload.sessionId, auth_context or {})
        if session_scope_error:
            _write_audit_log(
                "pipeline.status.denied",
                resource=f"pipeline_sessions/{payload.sessionId}",
                details={"reason": "tenant_scope"},
                success=False,
            )
            return session_scope_error

        try:
            executor = get_executor()
            result = _run_async(executor.get_status(payload.sessionId))
            _write_audit_log(
                "pipeline.status.read",
                resource=f"pipeline_sessions/{payload.sessionId}",
                details=None,
                success=True,
            )
            return _json_response(validate_pipeline_response(result))
        except ValueError as e:
            return _error_response(str(e), 404, code="SESSION_NOT_FOUND")
        except Exception as e:
            logger.error(f"pipeline_status error: {e}\n{traceback.format_exc()}")
            _write_audit_log(
                "pipeline.status.failed",
                resource=f"pipeline_sessions/{payload.sessionId}",
                details={"error": str(e)},
                success=False,
            )
            return _error_response(
                "Pipeline status failed",
                500,
                code="PIPELINE_STATUS_FAILED",
                details=str(e),
                retryable=True,
            )
    finally:
        _clear_request_context(context_token)


@https_fn.on_request(
    memory=options.MemoryOption.GB_2,
    timeout_sec=1800,
    region="us-central1",
)
def pipeline_publish(req: https_fn.Request) -> https_fn.Response:
    """
    Start or retry a guide publish job.

    Request body:
    {
        "sessionId": "publish-abc123",
        "publishId": "pub-publish-abc123",
        "retry": false,
        "venueName": "Laxy Museum",
        "coreLanguage": "en",
        "supportedLanguages": ["en", "ja"],
        "customSlug": "my-guide",
        "spotsCount": 5,
        "scriptsCount": 5,
        "slideshowsCount": 5,
        "audioCount": 2,
        "srtCount": 2
    }

    Response:
    {
        "success": true,
        "publishId": "pub-publish-abc123",
        "status": "processing",
        "guideUrl": "https://guide.laxy.app/g/my-guide",
        "shortUrl": "https://laxy.click/my-guide",
        "slug": "my-guide",
        "qrDataUrl": "data:image/svg+xml;base64,...",
        "publishedAt": 1710000000000,
        "retryable": true,
        "attempts": 1,
        "maxAttempts": 3
    }
    """
    if req.method == "OPTIONS":
        return https_fn.Response("", status=204, headers=_cors_headers())

    context_token = _set_request_context(req, endpoint="pipeline_publish")
    try:
        if req.method != "POST":
            return _error_response("Method not allowed", 405, code="METHOD_NOT_ALLOWED")

        auth_context, auth_error = _authorise_admin_request(req, require_tenant_scope=True)
        if auth_error:
            _write_audit_log(
                "pipeline.publish.denied",
                resource="publish_jobs",
                details={"reason": "auth_failed"},
                success=False,
            )
            return auth_error

        try:
            body = req.get_json(silent=True) or {}
        except Exception:
            return _error_response("Invalid JSON body", code="INVALID_JSON_BODY")

        try:
            payload = PublishGuideRequest.model_validate(body)
        except ValidationError as e:
            return _error_response(
                "Invalid request body",
                code="INVALID_REQUEST_BODY",
                details=e.errors(),
            )

        session_scope_error = _enforce_session_tenant_scope(payload.sessionId, auth_context or {})
        if session_scope_error:
            _write_audit_log(
                "pipeline.publish.denied",
                resource=f"pipeline_sessions/{payload.sessionId}",
                details={"reason": "tenant_scope"},
                success=False,
            )
            return session_scope_error

        _update_request_context(session_id=payload.sessionId, publish_id=payload.publishId)

        if payload.slideshowsCount <= 0:
            return _error_response(
                "Cannot publish without configured slideshows",
                status=409,
                code="PUBLISH_PRECONDITION_FAILED",
                details={"slideshowsCount": payload.slideshowsCount},
                retryable=False,
            )

        if payload.audioCount <= 0 or payload.srtCount <= 0:
            return _error_response(
                "Cannot publish without audio and subtitle assets",
                status=409,
                code="PUBLISH_PRECONDITION_FAILED",
                details={"audioCount": payload.audioCount, "srtCount": payload.srtCount},
                retryable=False,
            )

        if payload.retry and not payload.publishId:
            return _error_response(
                "retry=true requires publishId",
                code="INVALID_REQUEST_BODY",
                details={"publishId": "required when retry=true"},
            )

        try:
            slug = _slugify(payload.customSlug or payload.venueName)
            publish_id = payload.publishId or f"pub-{payload.sessionId}"
            _update_request_context(publish_id=publish_id)
            guide_base = os.environ.get("PUBLISH_GUIDE_BASE_URL", "https://guide.laxy.app/g").rstrip("/")
            short_base = os.environ.get("PUBLISH_SHORT_BASE_URL", "https://laxy.click").rstrip("/")

            existing = session_service.get_publish_job(publish_id)
            if existing and existing.get("session_id") != payload.sessionId:
                return _error_response(
                    "Publish job session mismatch",
                    status=409,
                    code="PUBLISH_SESSION_MISMATCH",
                    details={"publishId": publish_id, "sessionId": payload.sessionId},
                    retryable=False,
                )

            if existing and existing.get("status") == "published":
                _write_audit_log(
                    "pipeline.publish.read",
                    resource=f"publish_jobs/{publish_id}",
                    details={"status": "published", "cached": True},
                    success=True,
                )
                return _json_response(_build_publish_response_from_job(existing))

            if not payload.retry and existing and existing.get("status") == "processing":
                _write_audit_log(
                    "pipeline.publish.read",
                    resource=f"publish_jobs/{publish_id}",
                    details={"status": "processing", "cached": True},
                    success=True,
                )
                return _json_response(_build_publish_response_from_job(existing))

            max_attempts = int(existing.get("max_attempts", PUBLISH_MAX_ATTEMPTS)) if existing else PUBLISH_MAX_ATTEMPTS
            prior_attempts = int(existing.get("attempts", 0)) if existing else 0
            attempts = prior_attempts + 1

            if attempts > max_attempts:
                return _error_response(
                    "Maximum publish retry attempts exceeded",
                    status=409,
                    code="PUBLISH_MAX_RETRIES_EXCEEDED",
                    details={
                        "publishId": publish_id,
                        "attempts": attempts,
                        "maxAttempts": max_attempts,
                    },
                    retryable=False,
                )

            now_ms = int(time.time() * 1000)
            job_payload = {
                "session_id": payload.sessionId,
                "status": "processing",
                "guide_url": f"{guide_base}/{slug}",
                "short_url": f"{short_base}/{slug}",
                "slug": slug,
                "qr_data_url": _build_qr_data_url(f"{guide_base}/{slug}"),
                "processing_started_at_ms": now_ms,
                "published_at_ms": None,
                "retryable": attempts < max_attempts,
                "attempts": attempts,
                "max_attempts": max_attempts,
                "last_error": None,
            }

            if existing:
                session_service.update_publish_job(publish_id, job_payload)
            else:
                session_service.create_publish_job(publish_id, job_payload)

            created_or_updated = {
                "publish_id": publish_id,
                **job_payload,
            }
            _write_audit_log(
                "pipeline.publish",
                resource=f"publish_jobs/{publish_id}",
                details={
                    "attempts": attempts,
                    "retry": bool(payload.retry),
                    "sessionId": payload.sessionId,
                },
                success=True,
            )
            return _json_response(_build_publish_response_from_job(created_or_updated))
        except Exception as e:
            logger.error(f"pipeline_publish error: {e}\n{traceback.format_exc()}")
            _write_audit_log(
                "pipeline.publish.failed",
                resource=f"publish_jobs/{payload.publishId or f'pub-{payload.sessionId}'}",
                details={"error": str(e)},
                success=False,
            )
            return _error_response(
                "Publish failed",
                500,
                code="PUBLISH_FAILED",
                details=str(e),
                retryable=True,
            )
    finally:
        _clear_request_context(context_token)


@https_fn.on_request(
    memory=options.MemoryOption.GB_2,
    timeout_sec=1800,
    region="us-central1",
)
def pipeline_publish_status(req: https_fn.Request) -> https_fn.Response:
    """
    Poll current publish job state.

    Query params:
        ?publishId=pub-publish-abc123
    """
    if req.method == "OPTIONS":
        return https_fn.Response("", status=204, headers=_cors_headers())

    context_token = _set_request_context(req, endpoint="pipeline_publish_status")
    try:
        if req.method != "GET":
            return _error_response("Method not allowed", 405, code="METHOD_NOT_ALLOWED")

        auth_context, auth_error = _authorise_admin_request(req, require_tenant_scope=True)
        if auth_error:
            _write_audit_log(
                "pipeline.publish_status.denied",
                resource="publish_jobs",
                details={"reason": "auth_failed"},
                success=False,
            )
            return auth_error

        try:
            payload = PublishStatusRequest.model_validate({"publishId": req.args.get("publishId")})
        except ValidationError as e:
            return _error_response(
                "Invalid query params",
                code="INVALID_QUERY_PARAMS",
                details=e.errors(),
            )

        _update_request_context(publish_id=payload.publishId)

        try:
            job = session_service.get_publish_job(payload.publishId)
            if not job:
                return _error_response(
                    "Publish job not found",
                    404,
                    code="PUBLISH_JOB_NOT_FOUND",
                    details={"publishId": payload.publishId},
                    retryable=False,
                )

            linked_session_id = _non_empty(job.get("session_id"))
            if linked_session_id:
                session_scope_error = _enforce_session_tenant_scope(linked_session_id, auth_context or {})
                if session_scope_error:
                    _write_audit_log(
                        "pipeline.publish_status.denied",
                        resource=f"publish_jobs/{payload.publishId}",
                        details={"reason": "tenant_scope", "sessionId": linked_session_id},
                        success=False,
                    )
                    return session_scope_error

            status = job.get("status")
            if status == "processing":
                started_ms = int(job.get("processing_started_at_ms") or 0)
                now_ms = int(time.time() * 1000)
                if started_ms and (now_ms - started_ms) >= PUBLISH_PROCESSING_WINDOW_MS:
                    session_service.update_publish_job(payload.publishId, {
                        "status": "published",
                        "published_at_ms": now_ms,
                        "retryable": False,
                        "last_error": None,
                    })
                    job = {
                        **job,
                        "status": "published",
                        "published_at_ms": now_ms,
                        "retryable": False,
                        "last_error": None,
                    }

            _write_audit_log(
                "pipeline.publish_status.read",
                resource=f"publish_jobs/{payload.publishId}",
                details={"status": job.get("status")},
                success=True,
            )
            return _json_response(_build_publish_response_from_job(job))
        except Exception as e:
            logger.error(f"pipeline_publish_status error: {e}\n{traceback.format_exc()}")
            _write_audit_log(
                "pipeline.publish_status.failed",
                resource=f"publish_jobs/{payload.publishId}",
                details={"error": str(e)},
                success=False,
            )
            return _error_response(
                "Publish status failed",
                500,
                code="PUBLISH_STATUS_FAILED",
                details=str(e),
                retryable=True,
            )
    finally:
        _clear_request_context(context_token)


@https_fn.on_request(
    memory=options.MemoryOption.GB_2,
    timeout_sec=1800,
    region="us-central1",
)
def audio_session_bootstrap(req: https_fn.Request) -> https_fn.Response:
    """
    Create (or reuse) a tenant-scoped pipeline session for standalone audio generation.

    Request body:
    {
        "sessionId": "audio-abc123",
        "context": { "tenantId": "tenant_001" }
    }

    Response:
    {
        "success": true,
        "sessionId": "audio-abc123",
        "status": "created" | "exists",
        "tenantId": "tenant_001"
    }
    """
    if req.method == "OPTIONS":
        return https_fn.Response("", status=204, headers=_cors_headers())

    context_token = _set_request_context(req, endpoint="audio_session_bootstrap")
    try:
        if req.method != "POST":
            return _error_response("Method not allowed", 405, code="METHOD_NOT_ALLOWED")

        auth_context, auth_error = _authorise_admin_request(req, require_tenant_scope=True)
        if auth_error:
            _write_audit_log(
                "pipeline.audio_session_bootstrap.denied",
                resource="pipeline_sessions",
                details={"reason": "auth_failed"},
                success=False,
            )
            return auth_error

        try:
            body = req.get_json(silent=True) or {}
        except Exception:
            return _error_response("Invalid JSON body", code="INVALID_JSON_BODY")

        try:
            payload = AudioSessionBootstrapRequest.model_validate(body)
        except ValidationError as e:
            return _error_response(
                "Invalid request body",
                code="INVALID_REQUEST_BODY",
                details=e.errors(),
            )

        session_context, tenant_error = _enforce_payload_tenant_scope(
            payload.context if isinstance(payload.context, dict) else None,
            auth_context or {},
        )
        if tenant_error:
            _write_audit_log(
                "pipeline.audio_session_bootstrap.denied",
                resource=f"pipeline_sessions/{payload.sessionId}",
                details={"reason": "tenant_scope"},
                success=False,
            )
            return tenant_error

        _update_request_context(session_id=payload.sessionId)
        _update_actor_tenant_from_context(session_context)

        existing = session_service.get_session(payload.sessionId)
        if existing:
            session_scope_error = _enforce_session_tenant_scope(payload.sessionId, auth_context or {})
            if session_scope_error:
                _write_audit_log(
                    "pipeline.audio_session_bootstrap.denied",
                    resource=f"pipeline_sessions/{payload.sessionId}",
                    details={"reason": "session_scope"},
                    success=False,
                )
                return session_scope_error

            existing_context = existing.get("context") if isinstance(existing.get("context"), dict) else {}
            merged_context = {
                **existing_context,
                **(session_context or {}),
            }
            if merged_context != existing_context:
                session_service.update_session(payload.sessionId, {
                    "context": merged_context,
                })

            _write_audit_log(
                "pipeline.audio_session_bootstrap",
                resource=f"pipeline_sessions/{payload.sessionId}",
                details={"status": "exists"},
                success=True,
            )
            return _json_response({
                "success": True,
                "sessionId": payload.sessionId,
                "status": "exists",
                "tenantId": _resolve_context_tenant_id(session_context),
            })

        session_service.create_session(payload.sessionId, {
            "question": "audio_mvp_session",
            "uploads": [],
            "context": session_context,
        })

        _write_audit_log(
            "pipeline.audio_session_bootstrap",
            resource=f"pipeline_sessions/{payload.sessionId}",
            details={"status": "created"},
            success=True,
        )
        return _json_response({
            "success": True,
            "sessionId": payload.sessionId,
            "status": "created",
            "tenantId": _resolve_context_tenant_id(session_context),
        })
    except Exception as e:
        logger.error(f"audio_session_bootstrap error: {e}\n{traceback.format_exc()}")
        _write_audit_log(
            "pipeline.audio_session_bootstrap.failed",
            resource="pipeline_sessions",
            details={"error": str(e)},
            success=False,
        )
        return _error_response(
            "Audio session bootstrap failed",
            500,
            code="AUDIO_SESSION_BOOTSTRAP_FAILED",
            details=str(e),
            retryable=True,
        )
    finally:
        _clear_request_context(context_token)


@https_fn.on_request(
    memory=options.MemoryOption.GB_2,
    timeout_sec=1800,
    region="us-central1",
)
def audio_generate(req: https_fn.Request) -> https_fn.Response:
    """
    Generate TTS audio for approved scripts.

    Request body:
    {
        "sessionId": "audio-abc123",
        "scripts": [
            { "spotId": "spot_001", "spotNumber": 1, "title": "Cloud Dragon", "scriptText": "Welcome to..." }
        ],
        "voiceId": "Aoede",
        "languages": ["en"],
        "directorNote": { "scene": "", "style": "", "pacing": "" }
    }

    Response:
    {
        "success": true,
        "audioFiles": [{ "lang": "en", "spotId": "spot_001", "audioUrl": "https://...", "durationMs": 12345 }],
        "srtFiles":   [{ "lang": "en", "spotId": "spot_001", "entries": [...], "rawSrt": "..." }],
        "totalAudioFiles": 4,
        "totalSrtFiles": 4
    }
    """
    if req.method == "OPTIONS":
        return https_fn.Response("", status=204, headers=_cors_headers())

    context_token = _set_request_context(req, endpoint="audio_generate")
    try:
        if req.method != "POST":
            return _error_response("Method not allowed", 405, code="METHOD_NOT_ALLOWED")

        auth_context, auth_error = _authorise_admin_request(req, require_tenant_scope=True)
        if auth_error:
            _write_audit_log(
                "pipeline.audio_generate.denied",
                resource="pipeline_sessions",
                details={"reason": "auth_failed"},
                success=False,
            )
            return auth_error

        try:
            body = req.get_json(silent=True) or {}
        except Exception:
            return _error_response("Invalid JSON body", code="INVALID_JSON_BODY")

        try:
            payload = AudioGenerateRequest.model_validate(body)
        except ValidationError as e:
            return _error_response(
                "Invalid request body",
                code="INVALID_REQUEST_BODY",
                details=e.errors(),
            )

        session_scope_error = _enforce_session_tenant_scope(payload.sessionId, auth_context or {})
        if session_scope_error:
            _write_audit_log(
                "pipeline.audio_generate.denied",
                resource=f"pipeline_sessions/{payload.sessionId}",
                details={"reason": "tenant_scope"},
                success=False,
            )
            return session_scope_error

        _update_request_context(session_id=payload.sessionId)

        try:
            executor = get_executor()
            result = _run_async(
                executor.generate_audio(
                    session_id=payload.sessionId,
                    scripts=[item.model_dump() for item in payload.scripts],
                    voice_id=payload.voiceId,
                    languages=payload.languages,
                    director_note=payload.directorNote,
                    translations={
                        lang: [item.model_dump() for item in items]
                        for lang, items in payload.translations.items()
                    } if payload.translations else None,
                )
            )
            _write_audit_log(
                "pipeline.audio_generate",
                resource=f"pipeline_sessions/{payload.sessionId}",
                details={"languages": payload.languages, "scriptsCount": len(payload.scripts)},
                success=True,
            )
            return _json_response(result)
        except Exception as e:
            logger.error(f"audio_generate error: {e}\n{traceback.format_exc()}")
            _write_audit_log(
                "pipeline.audio_generate.failed",
                resource=f"pipeline_sessions/{payload.sessionId}",
                details={"error": str(e)},
                success=False,
            )
            return _error_response(
                "Audio generation failed",
                500,
                code="AUDIO_GENERATION_FAILED",
                details=str(e),
                retryable=True,
            )
    finally:
        _clear_request_context(context_token)


@https_fn.on_request(
    memory=options.MemoryOption.GB_2,
    timeout_sec=1800,
    region="us-central1",
)
def audio_generate_language(req: https_fn.Request) -> https_fn.Response:
    """
    Generate TTS audio for all spots in a SINGLE language.

    Request body:
    {
        "sessionId": "audio-abc123",
        "scripts": [ { "spotId": "spot_001", ... } ],
        "voiceId": "Aoede",
        "language": "ja",
        "directorNote": { ... },
        "translations": [ { "spotId": "spot_001", "translatedText": "..." } ]
    }
    Response:
    { "lang": "ja", "audioFiles": [...], "srtFiles": [...] }
    """
    if req.method == "OPTIONS":
        return https_fn.Response("", status=204, headers=_cors_headers())

    context_token = _set_request_context(req, endpoint="audio_generate_language")
    try:
        if req.method != "POST":
            return _error_response("Method not allowed", 405, code="METHOD_NOT_ALLOWED")

        auth_context, auth_error = _authorise_admin_request(req, require_tenant_scope=True)
        if auth_error:
            _write_audit_log(
                "pipeline.audio_generate_language.denied",
                resource="pipeline_sessions",
                details={"reason": "auth_failed"},
                success=False,
            )
            return auth_error

        try:
            body = req.get_json(silent=True) or {}
        except Exception:
            return _error_response("Invalid JSON body", code="INVALID_JSON_BODY")

        try:
            payload = AudioGenerateLanguageRequest.model_validate(body)
        except ValidationError as e:
            return _error_response(
                "Invalid request body",
                code="INVALID_REQUEST_BODY",
                details=e.errors(),
            )

        session_scope_error = _enforce_session_tenant_scope(payload.sessionId, auth_context or {})
        if session_scope_error:
            _write_audit_log(
                "pipeline.audio_generate_language.denied",
                resource=f"pipeline_sessions/{payload.sessionId}",
                details={"reason": "tenant_scope", "language": payload.language},
                success=False,
            )
            return session_scope_error

        _update_request_context(session_id=payload.sessionId, target_language=payload.language)

        if _audio_e2e_stub_enabled():
            result = _build_audio_generate_language_stub_response(payload)
            _write_audit_log(
                "pipeline.audio_generate_language.stub",
                resource=f"pipeline_sessions/{payload.sessionId}",
                details={"language": payload.language, "scriptsCount": len(payload.scripts)},
                success=True,
            )
            return _json_response(result)

        try:
            executor = get_executor()
            result = _run_async(
                executor.generate_audio_for_language(
                    session_id=payload.sessionId,
                    scripts=[item.model_dump() for item in payload.scripts],
                    voice_id=payload.voiceId,
                    language=payload.language,
                    history_target=payload.historyTarget.model_dump() if payload.historyTarget else None,
                    director_note=payload.directorNote,
                    translations=[item.model_dump() for item in payload.translations] if payload.translations else None,
                )
            )
            _write_audit_log(
                "pipeline.audio_generate_language",
                resource=f"pipeline_sessions/{payload.sessionId}",
                details={"language": payload.language, "scriptsCount": len(payload.scripts)},
                success=True,
            )
            return _json_response(result)
        except Exception as e:
            logger.error(f"audio_generate_language error: {e}\n{traceback.format_exc()}")
            _write_audit_log(
                "pipeline.audio_generate_language.failed",
                resource=f"pipeline_sessions/{payload.sessionId}",
                details={"error": str(e), "language": payload.language},
                success=False,
            )
            return _error_response(
                "Audio generation failed",
                500,
                code="AUDIO_GENERATION_FAILED",
                details=str(e),
                retryable=True,
            )
    finally:
        _clear_request_context(context_token)


@https_fn.on_request(
    memory=options.MemoryOption.GB_2,
    timeout_sec=1800,
    region="us-central1",
)
def translate_language(req: https_fn.Request) -> https_fn.Response:
    """
    Translate scripts into a single target language using Gemini.

    Request body:
    {
        "scripts": [ ... ],
        "targetLanguage": "zh-TW",
        "coreLanguage": "en"
    }
    Response:
    {
        "lang": "zh-TW",
        "label": "Chinese (Traditional)",
        "spots": [ { "spotId": "spot_001", "translatedText": "..." }, ... ],
        "approved": false
    }
    """
    if req.method == "OPTIONS":
        return https_fn.Response("", status=204, headers=_cors_headers())

    context_token = _set_request_context(req, endpoint="translate_language")
    try:
        if req.method != "POST":
            return _error_response("Method not allowed", 405, code="METHOD_NOT_ALLOWED")

        auth_context, auth_error = _authorise_admin_request(req, require_tenant_scope=False)
        if auth_error:
            _write_audit_log(
                "pipeline.translate_language.denied",
                resource="translations",
                details={"reason": "auth_failed"},
                success=False,
            )
            return auth_error

        try:
            body = req.get_json(silent=True) or {}
        except Exception:
            return _error_response("Invalid JSON body", code="INVALID_JSON_BODY")

        try:
            payload = TranslateLanguageRequest.model_validate(body)
        except ValidationError as e:
            return _error_response(
                "Invalid request body",
                code="INVALID_REQUEST_BODY",
                details=e.errors(),
            )

        _update_request_context(target_language=payload.targetLanguage)

        try:
            executor = get_executor()
            result = _run_async(
                executor.translate_language(
                    scripts=[item.model_dump() for item in payload.scripts],
                    target_language=payload.targetLanguage,
                    core_language=payload.coreLanguage,
                )
            )
            _write_audit_log(
                "pipeline.translate_language",
                resource="translations",
                details={"targetLanguage": payload.targetLanguage, "scriptsCount": len(payload.scripts)},
                success=True,
            )
            return _json_response(result)
        except Exception as e:
            logger.error(f"translate_language error: {e}\n{traceback.format_exc()}")
            _write_audit_log(
                "pipeline.translate_language.failed",
                resource="translations",
                details={"error": str(e), "targetLanguage": payload.targetLanguage},
                success=False,
            )
            return _error_response(
                "Translation failed",
                500,
                code="TRANSLATION_FAILED",
                details=str(e),
                retryable=True,
            )
    finally:
        _clear_request_context(context_token)


@https_fn.on_request(
    memory=options.MemoryOption.GB_1,
    timeout_sec=120,
    region="us-central1",
)
def generate_director_note(req: https_fn.Request) -> https_fn.Response:
    """
    Generate a director note using AI from script content and optional context.

    Request body:
    {
        "scriptContent": "Welcome to the ancient temple...",
        "characterName": "Ada",
        "characterRole": "Warm, approachable narrator",
        "contentVersion": "standard",
        "context": "A peaceful Buddhist temple in Kyoto"
    }

    Response:
    {
        "success": true,
        "directorNote": {
            "scene": "...",
            "style": "...",
            "pacing": "..."
        }
    }
    """
    if req.method == "OPTIONS":
        return https_fn.Response("", status=204, headers=_cors_headers())

    context_token = _set_request_context(req, endpoint="generate_director_note")
    try:
        if req.method != "POST":
            return _error_response("Method not allowed", 405, code="METHOD_NOT_ALLOWED")

        auth_context, auth_error = _authorise_admin_request(req, require_tenant_scope=False)
        if auth_error:
            _write_audit_log(
                "pipeline.generate_director_note.denied",
                resource="director_note",
                details={"reason": "auth_failed"},
                success=False,
            )
            return auth_error

        try:
            body = req.get_json(silent=True) or {}
        except Exception:
            return _error_response("Invalid JSON body", code="INVALID_JSON_BODY")

        try:
            payload = GenerateDirectorNoteRequest.model_validate(body)
        except ValidationError as e:
            return _error_response(
                "Invalid request body",
                code="INVALID_REQUEST_BODY",
                details=e.errors(),
            )

        try:
            executor = get_executor()
            result = _run_async(
                executor.generate_director_note(
                    script_content=payload.scriptContent,
                    character_name=payload.characterName,
                    character_role=payload.characterRole,
                    content_version=payload.contentVersion,
                    context=payload.context,
                )
            )
            _write_audit_log(
                "pipeline.generate_director_note",
                resource="director_note",
                details={"contentVersion": payload.contentVersion},
                success=True,
            )
            return _json_response(result)
        except Exception as e:
            logger.error(f"generate_director_note error: {e}\n{traceback.format_exc()}")
            _write_audit_log(
                "pipeline.generate_director_note.failed",
                resource="director_note",
                details={"error": str(e)},
                success=False,
            )
            return _error_response(
                "Director note generation failed",
                500,
                code="DIRECTOR_NOTE_GENERATION_FAILED",
                details=str(e),
                retryable=True,
            )
    finally:
        _clear_request_context(context_token)


@https_fn.on_request(
    memory=options.MemoryOption.GB_1,
    timeout_sec=120,
    region="us-central1",
)
def enhance_script(req: https_fn.Request) -> https_fn.Response:
    """
    Enhance a script with AI-generated performance cues.

    Request body:
    {
        "scriptContent": "Welcome to the ancient temple...",
        "characterName": "Ada",
        "characterRole": "Warm, approachable narrator",
        "contextDirective": "A peaceful Buddhist temple in Kyoto",
        "cueDensity": "light"
    }

    Response:
    {
        "success": true,
        "enhancedScript": "[excited] Welcome to the ancient temple..."
    }
    """
    if req.method == "OPTIONS":
        return https_fn.Response("", status=204, headers=_cors_headers())

    context_token = _set_request_context(req, endpoint="enhance_script")
    try:
        if req.method != "POST":
            return _error_response("Method not allowed", 405, code="METHOD_NOT_ALLOWED")

        auth_context, auth_error = _authorise_admin_request(req, require_tenant_scope=False)
        if auth_error:
            _write_audit_log(
                "pipeline.enhance_script.denied",
                resource="script_enhancement",
                details={"reason": "auth_failed"},
                success=False,
            )
            return auth_error

        try:
            body = req.get_json(silent=True) or {}
        except Exception:
            return _error_response("Invalid JSON body", code="INVALID_JSON_BODY")

        try:
            payload = EnhanceScriptRequest.model_validate(body)
        except ValidationError as e:
            return _error_response(
                "Invalid request body",
                code="INVALID_REQUEST_BODY",
                details=e.errors(),
            )

        try:
            executor = get_executor()
            result = _run_async(
                executor.enhance_script(
                    script_content=payload.scriptContent,
                    character_name=payload.characterName,
                    character_role=payload.characterRole,
                    context_directive=payload.contextDirective,
                    cue_density=payload.cueDensity,
                )
            )
            _write_audit_log(
                "pipeline.enhance_script",
                resource="script_enhancement",
                details={"characterName": payload.characterName, "cueDensity": payload.cueDensity},
                success=True,
            )
            return _json_response(result)
        except Exception as e:
            logger.error(f"enhance_script error: {e}\n{traceback.format_exc()}")
            _write_audit_log(
                "pipeline.enhance_script.failed",
                resource="script_enhancement",
                details={"error": str(e)},
                success=False,
            )
            return _error_response(
                "Script enhancement failed",
                500,
                code="SCRIPT_ENHANCEMENT_FAILED",
                details=str(e),
                retryable=True,
            )
    finally:
        _clear_request_context(context_token)


@https_fn.on_request(
    memory=options.MemoryOption.GB_1,
    timeout_sec=120,
    region="us-central1",
)
def generate_japanese_hiragana(req: https_fn.Request) -> https_fn.Response:
    """
    Convert Japanese script text into standard Hiragana narration reading.

    Request body:
    {
        "scriptContent": "明日、軽やかに風景を描く。"
    }

    Response:
    {
        "success": true,
        "hiraganaText": "あす、かろやかにふうけいをえがく。"
    }
    """
    if req.method == "OPTIONS":
        return https_fn.Response("", status=204, headers=_cors_headers())

    context_token = _set_request_context(req, endpoint="generate_japanese_hiragana")
    try:
        if req.method != "POST":
            return _error_response("Method not allowed", 405, code="METHOD_NOT_ALLOWED")

        auth_context, auth_error = _authorise_admin_request(req, require_tenant_scope=False)
        if auth_error:
            _write_audit_log(
                "pipeline.generate_japanese_hiragana.denied",
                resource="japanese_hiragana_generation",
                details={"reason": "auth_failed"},
                success=False,
            )
            return auth_error

        try:
            body = req.get_json(silent=True) or {}
        except Exception:
            return _error_response("Invalid JSON body", code="INVALID_JSON_BODY")

        try:
            payload = GenerateJapaneseHiraganaRequest.model_validate(body)
        except ValidationError as e:
            return _error_response(
                "Invalid request body",
                code="INVALID_REQUEST_BODY",
                details=e.errors(),
            )

        try:
            executor = get_executor()
            result = _run_async(
                executor.generate_japanese_hiragana(
                    script_content=payload.scriptContent,
                )
            )
            _write_audit_log(
                "pipeline.generate_japanese_hiragana",
                resource="japanese_hiragana_generation",
                details={"scriptLength": len(payload.scriptContent)},
                success=True,
            )
            return _json_response(result)
        except Exception as e:
            logger.error(f"generate_japanese_hiragana error: {e}\n{traceback.format_exc()}")
            _write_audit_log(
                "pipeline.generate_japanese_hiragana.failed",
                resource="japanese_hiragana_generation",
                details={"error": str(e)},
                success=False,
            )
            return _error_response(
                "Japanese Hiragana conversion failed",
                500,
                code="JAPANESE_HIRAGANA_GENERATION_FAILED",
                details=str(e),
                retryable=True,
            )
    finally:
        _clear_request_context(context_token)


@https_fn.on_request(
    memory=options.MemoryOption.GB_1,
    timeout_sec=120,
    region="us-central1",
)
def generate_character(req: https_fn.Request) -> https_fn.Response:
    """
    Generate a full character profile from structured Character Designer inputs.

    Request body:
    {
        "name": "John",
        "gender": "Male",
        "role": "Museum Manager",
        "context": "A knowledgeable person who has a formal and confident tone."
    }

    Response:
    {
        "success": true,
        "character": {
            "name": "...",
            "gender": "...",
            "role": "...",
            "context": "...",
            "avatar": "...",
            "genderIdentity": "feminine" | "masculine" | "neutral",
            "coreTimbre": "...",
            "personalityDNA": "...",
            "linguisticFingerprint": "...",
            "brandPersona": "...",
            "accent": "...",
            "staticInstruction": "...",
            "audioProfileMarkdown": "# AUDIO PROFILE: ..."
        }
    }
    """
    if req.method == "OPTIONS":
        return https_fn.Response("", status=204, headers=_cors_headers())

    context_token = _set_request_context(req, endpoint="generate_character")
    try:
        if req.method != "POST":
            return _error_response("Method not allowed", 405, code="METHOD_NOT_ALLOWED")

        auth_context, auth_error = _authorise_admin_request(req, require_tenant_scope=False)
        if auth_error:
            _write_audit_log(
                "pipeline.generate_character.denied",
                resource="character_generation",
                details={"reason": "auth_failed"},
                success=False,
            )
            return auth_error

        try:
            body = req.get_json(silent=True) or {}
        except Exception:
            return _error_response("Invalid JSON body", code="INVALID_JSON_BODY")

        try:
            payload = GenerateCharacterRequest.model_validate(body)
        except ValidationError as e:
            return _error_response(
                "Invalid request body",
                code="INVALID_REQUEST_BODY",
                details=e.errors(),
            )

        try:
            executor = get_executor()
            result = _run_async(
                executor.generate_character(
                    name=payload.name,
                    gender=payload.gender,
                    role=payload.role,
                    context=payload.context,
                )
            )
            _write_audit_log(
                "pipeline.generate_character",
                resource="character_generation",
                details={
                    "nameLength": len(payload.name),
                    "roleLength": len(payload.role),
                    "contextLength": len(payload.context),
                },
                success=True,
            )
            return _json_response(result)
        except Exception as e:
            logger.error(f"generate_character error: {e}\n{traceback.format_exc()}")
            _write_audit_log(
                "pipeline.generate_character.failed",
                resource="character_generation",
                details={"error": str(e)},
                success=False,
            )
            return _error_response(
                "Character generation failed",
                500,
                code="CHARACTER_GENERATION_FAILED",
                details=str(e),
                retryable=True,
            )
    finally:
        _clear_request_context(context_token)
