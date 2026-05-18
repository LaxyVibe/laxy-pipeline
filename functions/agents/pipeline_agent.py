# ---------------------------------------------------------------------------
# ADK Pipeline Agent — Laxy Guide Creation Pipeline
# ---------------------------------------------------------------------------
"""
Defines the sequential ADK agent pipeline for guide creation.

Pipeline structure:
  S2 (OCR Parse) → S1 (Metadata Extract) → HG1 (Data Review) →
  S4 (Script Gen) → S5 (Image Map) → HG3 (Script Review) →
  S6 (Translation) → HG4 (Translation Review) →
  N5 (Character Select) → S7 (Voice Recommend) → S8 (Director Note) →
  S9 (Audio Gen) → N6 (Audio QA) → HG5 (Audio Review) →
  N8 (Generation History) → S10 (SRT Gen)

Human gates (HG1, HG3, HG4, HG5) pause execution and wait for user input.
"""
from __future__ import annotations

import asyncio
import base64
import io
import json
import logging
import os
import re
import time
import wave
from typing import Any
from uuid import uuid4

from google import genai
from google.genai import types as genai_types
try:
    from google.api_core.client_options import ClientOptions
    from google.cloud import texttospeech
except Exception:  # pragma: no cover - dependency is validated in deployed env
    ClientOptions = None  # type: ignore[assignment]
    texttospeech = None  # type: ignore[assignment]

import firebase_admin
from firebase_admin import storage as fb_storage

from . import audio_alignment
from . import session as session_service
from . import tools
from .prompt_repository import load_prompt

logger = logging.getLogger(__name__)

# ── Retry configuration for Gemini API rate limits ──

MAX_RETRIES = 5
INITIAL_BACKOFF = 2.0   # seconds
MAX_BACKOFF = 60.0      # seconds
BACKOFF_FACTOR = 2.0    # exponential multiplier

_RETRYABLE_KEYWORDS = ("429", "RESOURCE_EXHAUSTED", "rate limit", "quota", "503", "overloaded")


def _read_timeout_env(name: str, default: float) -> float:
    raw = os.environ.get(name)
    if raw is None:
        return default
    try:
        value = float(raw)
    except ValueError:
        logger.warning("Invalid timeout value for %s=%s; using default %.1fs", name, raw, default)
        return default
    if value <= 0:
        logger.warning("Non-positive timeout value for %s=%s; using default %.1fs", name, raw, default)
        return default
    return value


def _read_positive_int_env(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None:
        return default
    try:
        value = int(raw)
    except ValueError:
        logger.warning("Invalid integer value for %s=%s; using default %d", name, raw, default)
        return default
    if value <= 0:
        logger.warning("Non-positive integer value for %s=%s; using default %d", name, raw, default)
        return default
    return value


def _read_bool_env(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() not in {"0", "false", "no", "off"}


DEFAULT_LLM_TIMEOUT_SECONDS = _read_timeout_env("PIPELINE_LLM_TIMEOUT_SECONDS", 180.0)
DEFAULT_STEP_TIMEOUT_SECONDS = _read_timeout_env("PIPELINE_STEP_TIMEOUT_SECONDS", 300.0)
STEP_TIMEOUT_SECONDS = {
    "s2_ocr_parse": _read_timeout_env("PIPELINE_STEP_TIMEOUT_S2_OCR_PARSE", 300.0),
    "s4_script_gen": _read_timeout_env("PIPELINE_STEP_TIMEOUT_S4_SCRIPT_GEN", 300.0),
    "s6_translation": _read_timeout_env("PIPELINE_STEP_TIMEOUT_S6_TRANSLATION", 300.0),
    "s9_audio_gen": _read_timeout_env("PIPELINE_STEP_TIMEOUT_S9_AUDIO_GEN", 900.0),
}

ALIGNMENT_TIMEOUT_SECONDS = _read_timeout_env("PIPELINE_AUDIO_ALIGNMENT_TIMEOUT_SECONDS", 30.0)
ALIGNMENT_MIN_CUE_SECONDS = _read_timeout_env("PIPELINE_AUDIO_ALIGNMENT_MIN_CUE_SECONDS", 1.0)
ALIGNMENT_MAX_CUE_SECONDS = _read_timeout_env("PIPELINE_AUDIO_ALIGNMENT_MAX_CUE_SECONDS", 4.0)
ALIGNMENT_MAX_CJK_CHARS = _read_positive_int_env("PIPELINE_AUDIO_ALIGNMENT_MAX_CJK_CHARS", 12)
ALIGNMENT_MAX_LATIN_CHARS = _read_positive_int_env("PIPELINE_AUDIO_ALIGNMENT_MAX_LATIN_CHARS", 22)
ALIGNMENT_AI_SEGMENTATION_ENABLED = _read_bool_env("PIPELINE_AUDIO_ALIGNMENT_AI_SEGMENTATION_ENABLED", True)
RECOVERABLE_ALIGNMENT_ERROR_MARKERS = (
    "speech-to-text returned no word timestamps",
    "no character timings could be expanded",
)

FAILURE_HOTSPOT_THRESHOLD = _read_positive_int_env("PIPELINE_FAILURE_HOTSPOT_THRESHOLD", 3)


def _log_telemetry(event: str, *, level: int = logging.INFO, **fields: Any) -> None:
    payload: dict[str, Any] = {
        "event": event,
        "ts_ms": int(time.time() * 1000),
    }
    for key, value in fields.items():
        if value is None or value == "":
            continue
        payload[key] = value
    logger.log(level, "pipeline_telemetry %s", json.dumps(payload, ensure_ascii=False, sort_keys=True, default=str))


def _is_retryable(exc: Exception) -> bool:
    """Check if an exception is a transient rate-limit / overload error."""
    if isinstance(exc, (TimeoutError, asyncio.TimeoutError)):
        return True
    msg = str(exc).lower()
    return any(kw.lower() in msg for kw in _RETRYABLE_KEYWORDS)


def _format_retry_context(context: dict[str, Any] | None) -> str:
    if not context:
        return ""
    keys = (
        "operation",
        "session_id",
        "run_id",
        "step_id",
        "language",
        "spot_id",
        "correlation_id",
        "tenant_id",
        "actor_id",
    )
    parts: list[str] = []
    for key in keys:
        value = context.get(key)
        if value is not None and value != "":
            parts.append(f"{key}={value}")
    return f" [{' '.join(parts)}]" if parts else ""


async def _retry_generate_content(
    client: genai.Client,
    *,
    timeout_seconds: float | None = None,
    retry_context: dict[str, Any] | None = None,
    retry_tracker: dict[str, int] | None = None,
    **kwargs: Any,
) -> Any:
    """Call client.aio.models.generate_content with exponential backoff on 429."""
    effective_timeout = timeout_seconds if timeout_seconds is not None else DEFAULT_LLM_TIMEOUT_SECONDS
    context_suffix = _format_retry_context(retry_context)
    backoff = INITIAL_BACKOFF
    for attempt in range(1, MAX_RETRIES + 1):
        if retry_tracker is not None:
            retry_tracker["attempts"] = int(retry_tracker.get("attempts", 0)) + 1
        attempt_started = time.time()
        try:
            response = await asyncio.wait_for(
                client.aio.models.generate_content(**kwargs),
                timeout=effective_timeout,
            )
            if attempt > 1:
                elapsed_ms = int((time.time() - attempt_started) * 1000)
                logger.info(
                    "Gemini API call recovered on attempt %d/%d (elapsed=%dms)%s",
                    attempt,
                    MAX_RETRIES,
                    elapsed_ms,
                    context_suffix,
                )
            return response
        except asyncio.CancelledError:
            logger.warning(
                "Gemini API call cancelled on attempt %d/%d%s",
                attempt,
                MAX_RETRIES,
                context_suffix,
            )
            raise
        except Exception as exc:
            elapsed_ms = int((time.time() - attempt_started) * 1000)
            is_retryable = _is_retryable(exc)
            if attempt < MAX_RETRIES and is_retryable:
                if retry_tracker is not None:
                    retry_tracker["retries"] = int(retry_tracker.get("retries", 0)) + 1
                jitter = backoff * (0.5 + 0.5 * (hash(str(attempt)) % 100) / 100)
                logger.warning(
                    "Gemini API call failed on attempt %d/%d (elapsed=%dms). "
                    "Retrying in %.1fs… [%s]%s",
                    attempt,
                    MAX_RETRIES,
                    elapsed_ms,
                    jitter,
                    exc,
                    context_suffix,
                )
                await asyncio.sleep(jitter)
                backoff = min(backoff * BACKOFF_FACTOR, MAX_BACKOFF)
            else:
                if retry_tracker is not None:
                    retry_tracker["failures"] = int(retry_tracker.get("failures", 0)) + 1
                logger.error(
                    "Gemini API call failed permanently on attempt %d/%d "
                    "(elapsed=%dms, retryable=%s) [%s]%s",
                    attempt,
                    MAX_RETRIES,
                    elapsed_ms,
                    is_retryable,
                    exc,
                    context_suffix,
                )
                raise

# ── Model configuration ──

MODELS = {
    "flash": "gemini-2.5-flash",
    "pro": "gemini-2.5-pro",
    "tts": os.environ.get("TTS_MODEL", "gemini-3.1-flash-tts-preview"),
}

TEMPERATURES = {
    "s2_ocr_parse": 0.3,
    "s1_metadata_extract": 0.2,
    "s4_script_gen": 0.8,
    "s5_image_map": 0.3,
    "s6_translation": 0.5,
    "s7_voice_recommend": 0.5,
    "s8_director_note": 0.6,
    "guide_script_enhance": 0.7,
    "generate_character": 0.8,
}

# Maps step_id → display label for frontend compatibility
STEP_LABELS = {
    "s2_ocr_parse": "S2: OCR Parse (Gemini)",
    "s1_metadata_extract": "S1: Metadata Extract (Gemini)",
    "hg1_data_review": "HG1: Data Review",
    "s4_script_gen": "S4: Script Gen (Gemini Pro)",
    "s5_image_map": "S5: Image Map (Gemini)",
    "hg3_script_review": "HG3: Script Review",
    "s6_translation": "S6: Translation (Gemini Pro)",
    "hg4_translation_review": "HG4: Translation Review",
    "n5_character_select": "N5: Character Select",
    "s7_voice_recommend": "S7: Voice Recommend (Gemini)",
    "s8_director_note": "S8: Director Note (Gemini)",
    "s9_audio_gen": "S9: Audio Gen (Gemini TTS)",
    "n6_audio_qa": "N6: Audio Playback QA",
    "hg5_audio_review": "HG5: Audio Review",
    "n8_generation_history": "N8: Generation History",
    "s10_srt_gen": "S10: SRT Gen (AI aligned)",
    "pipeline_complete": "Pipeline Complete",
}

# Ordered list of all steps
PIPELINE_STEPS = [
    "s2_ocr_parse",
    "s1_metadata_extract",
    "hg1_data_review",
    "s4_script_gen",
    "s5_image_map",
    "hg3_script_review",
    "s6_translation",
    "hg4_translation_review",
    "n5_character_select",
    "s7_voice_recommend",
    "s8_director_note",
    "s9_audio_gen",
    "n6_audio_qa",
    "hg5_audio_review",
    "n8_generation_history",
    "s10_srt_gen",
    "pipeline_complete",
]

HUMAN_GATES = {"hg1_data_review", "hg3_script_review", "hg4_translation_review", "hg5_audio_review"}


class SessionAlreadyExistsError(ValueError):
    """Raised when a start call tries to recreate an existing session."""


class IdempotencyConflictError(ValueError):
    """Raised when an idempotency key is reused with different request input."""


class IdempotencyInProgressError(RuntimeError):
    """Raised when the same idempotent request is already being processed."""

# ── Pipeline execution engine ──


class PipelineExecutor:
    """
    Orchestrates the sequential pipeline, executing LLM steps via ADK agents,
    tool steps via Python functions, and pausing at human gates.

    This is a stateful executor that persists progress to Firestore so the
    pipeline can be paused/resumed across HTTP requests.
    """

    def __init__(self, project_id: str | None = None, location: str | None = None):
        self.project_id = project_id or os.environ.get("GCP_PROJECT", os.environ.get("GCLOUD_PROJECT", ""))
        self.location = location or os.environ.get("GEMINI_LOCATION", os.environ.get("VERTEX_LOCATION", "global"))
        self._tts_client = None

        # Use Gemini API key if provided; otherwise fall back to Vertex AI
        api_key = os.environ.get("GEMINI_API_KEY")
        if api_key:
            logger.info("Using Gemini API key (google-genai direct mode)")
            self._client = genai.Client(api_key=api_key)
        else:
            logger.info("Using Vertex AI (project=%s, location=%s)", self.project_id, self.location)
            self._client = genai.Client(vertexai=True, project=self.project_id, location=self.location)

    @staticmethod
    def _build_tts_client(location: str):
        if texttospeech is None or ClientOptions is None:
            raise RuntimeError("Cloud TTS dependency is missing; install google-cloud-texttospeech>=2.29.0")
        endpoint = (
            f"{location}-texttospeech.googleapis.com"
            if location and location != "global"
            else "texttospeech.googleapis.com"
        )
        return texttospeech.TextToSpeechClient(
            client_options=ClientOptions(api_endpoint=endpoint),
        )

    def _get_tts_client(self):
        if self._tts_client is None:
            self._tts_client = self._build_tts_client(self.location)
        return self._tts_client

    @staticmethod
    def _build_idempotency_fingerprint(payload: dict[str, Any]) -> str:
        """Build deterministic fingerprint for idempotency input comparison."""
        return json.dumps(payload, sort_keys=True, ensure_ascii=False, default=str)

    @staticmethod
    def _get_step_timeout_seconds(step_id: str) -> float:
        return STEP_TIMEOUT_SECONDS.get(step_id, DEFAULT_STEP_TIMEOUT_SECONDS)

    @staticmethod
    def _clean_string(value: Any) -> str | None:
        if value is None:
            return None
        if isinstance(value, str):
            trimmed = value.strip()
            return trimmed or None
        return str(value)

    @classmethod
    def _extract_telemetry_context(
        cls,
        session_context: dict[str, Any] | None,
        request_metadata: dict[str, Any] | None,
    ) -> dict[str, str]:
        sources: list[dict[str, Any]] = []
        if isinstance(request_metadata, dict):
            sources.append(request_metadata)
        if isinstance(session_context, dict):
            nested = session_context.get("_telemetry")
            if isinstance(nested, dict):
                sources.append(nested)
            sources.append(session_context)

        aliases = {
            "correlation_id": ("correlation_id", "correlationId"),
            "request_id": ("request_id", "requestId"),
            "tenant_id": ("tenant_id", "tenantId", "tenant"),
            "actor_id": ("actor_id", "actorId", "userId", "userUid"),
        }
        result: dict[str, str] = {}
        for output_key, keys in aliases.items():
            value: str | None = None
            for source in sources:
                for key in keys:
                    candidate = cls._clean_string(source.get(key))
                    if candidate:
                        value = candidate
                        break
                if value:
                    break
            if value:
                result[output_key] = value
        return result

    @classmethod
    def _build_runtime_context(
        cls,
        *,
        session_id: str,
        run_id: str,
        session_context: dict[str, Any] | None,
        request_metadata: dict[str, Any] | None,
    ) -> dict[str, Any]:
        telemetry = cls._extract_telemetry_context(session_context, request_metadata)
        runtime: dict[str, Any] = {
            "sessionId": session_id,
            "runId": run_id,
        }
        if telemetry.get("correlation_id"):
            runtime["correlationId"] = telemetry["correlation_id"]
        if telemetry.get("request_id"):
            runtime["requestId"] = telemetry["request_id"]
        if telemetry.get("tenant_id"):
            runtime["tenantId"] = telemetry["tenant_id"]
        if telemetry.get("actor_id"):
            runtime["actorId"] = telemetry["actor_id"]
        return runtime

    def _emit_step_telemetry(
        self,
        *,
        event: str,
        runtime_context: dict[str, Any],
        step_id: str,
        attempt: int,
        status: str,
        duration_ms: int | None,
        retries: int,
        llm_attempts: int,
        timeout_seconds: float | None = None,
        error_code: str | None = None,
    ) -> None:
        level = logging.INFO if status != "ERROR" else logging.WARNING
        _log_telemetry(
            event,
            level=level,
            session_id=runtime_context.get("sessionId"),
            run_id=runtime_context.get("runId"),
            correlation_id=runtime_context.get("correlationId"),
            request_id=runtime_context.get("requestId"),
            tenant_id=runtime_context.get("tenantId"),
            actor_id=runtime_context.get("actorId"),
            step_id=step_id,
            attempt=attempt,
            status=status,
            duration_ms=duration_ms,
            retries=retries,
            llm_attempts=llm_attempts,
            timeout_seconds=timeout_seconds,
            error_code=error_code,
        )

    def _emit_failure_hotspot_if_needed(
        self,
        *,
        session_id: str,
        runtime_context: dict[str, Any],
        step_id: str,
        error_code: str,
    ) -> None:
        session = session_service.get_session(session_id) or {}
        steps = session.get("steps", [])
        failure_count = sum(
            1
            for step in steps
            if step.get("step_id") == step_id and step.get("status") == "ERROR"
        )
        if failure_count < FAILURE_HOTSPOT_THRESHOLD:
            return

        _log_telemetry(
            "pipeline.failure_hotspot",
            level=logging.ERROR,
            session_id=runtime_context.get("sessionId"),
            run_id=runtime_context.get("runId"),
            correlation_id=runtime_context.get("correlationId"),
            request_id=runtime_context.get("requestId"),
            tenant_id=runtime_context.get("tenantId"),
            actor_id=runtime_context.get("actorId"),
            step_id=step_id,
            failure_count=failure_count,
            threshold=FAILURE_HOTSPOT_THRESHOLD,
            error_code=error_code,
        )

    async def start(
        self,
        session_id: str,
        question: str,
        uploads: list[dict[str, Any]] | None = None,
        context: dict[str, Any] | None = None,
        idempotency_key: str | None = None,
        request_metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """
        Start a new pipeline run. Executes steps sequentially until
        hitting a human gate or completing the pipeline.
        """
        fingerprint = self._build_idempotency_fingerprint({
            "sessionId": session_id,
            "question": question,
            "uploads": uploads or [],
            "context": context or {},
        })
        existing_record: dict[str, Any] | None = None

        if idempotency_key:
            existing_record = session_service.get_idempotency_request(session_id, "start", idempotency_key)
            if existing_record:
                existing_fingerprint = existing_record.get("fingerprint")
                if existing_fingerprint and existing_fingerprint != fingerprint:
                    raise IdempotencyConflictError(
                        f"Idempotency key conflict for session {session_id} (start)"
                    )

                status = existing_record.get("status")
                response = existing_record.get("response")
                if status == "completed" and isinstance(response, dict):
                    logger.info("Returning cached idempotent start response for session %s", session_id)
                    return response
                if status == "in_progress":
                    raise IdempotencyInProgressError(
                        f"Idempotent start request already in progress for session {session_id}"
                    )

        existing_session = session_service.get_session(session_id)
        if existing_session and not idempotency_key:
            raise SessionAlreadyExistsError(f"Session already exists: {session_id}")
        if existing_session and idempotency_key and not existing_record:
            raise SessionAlreadyExistsError(
                f"Session already exists without matching idempotency record: {session_id}"
            )

        session_context = dict(context or {})
        telemetry_context = self._extract_telemetry_context(session_context, request_metadata)
        if telemetry_context:
            existing_telemetry = session_context.get("_telemetry")
            merged_telemetry = dict(existing_telemetry) if isinstance(existing_telemetry, dict) else {}
            merged_telemetry.update(telemetry_context)
            session_context["_telemetry"] = merged_telemetry

        if not existing_session:
            session_service.create_session(session_id, {
                "question": question,
                "uploads": uploads or [],
                "context": session_context,
            })

        run_id = f"start-{int(time.time() * 1000)}"
        logger.info(
            "Pipeline start requested: session=%s run_id=%s idempotency=%s",
            session_id,
            run_id,
            bool(idempotency_key),
        )
        if idempotency_key:
            session_service.upsert_idempotency_request(session_id, "start", idempotency_key, {
                "status": "in_progress",
                "fingerprint": fingerprint,
                "run_id": run_id,
                "started_at_ms": int(time.time() * 1000),
                "response": None,
                "error": None,
            })

        try:
            result = await self._run_from(
                session_id,
                start_step_index=0,
                question=question,
                uploads=uploads,
                run_id=run_id,
                request_metadata=request_metadata,
            )
            if idempotency_key:
                session_service.upsert_idempotency_request(session_id, "start", idempotency_key, {
                    "status": "completed",
                    "fingerprint": fingerprint,
                    "run_id": run_id,
                    "completed_at_ms": int(time.time() * 1000),
                    "response": result,
                    "error": None,
                })
            return result
        except Exception as exc:
            if idempotency_key:
                session_service.upsert_idempotency_request(session_id, "start", idempotency_key, {
                    "status": "failed",
                    "fingerprint": fingerprint,
                    "run_id": run_id,
                    "completed_at_ms": int(time.time() * 1000),
                    "error": str(exc),
                })
            raise

    async def resume(
        self,
        session_id: str,
        checkpoint_id: str,
        action: str,
        feedback: str | None = None,
        idempotency_key: str | None = None,
        request_metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """
        Resume a pipeline from a human gate checkpoint.
        - action='approve': continue to next step
        - action='reject': re-run the steps before the gate
        
        The `feedback` parameter may contain a JSON-encoded structured payload
        with human edits (approved spots, edited scripts, translation corrections, etc.).
        Parsed edits are merged into session outputs so downstream steps consume
        the human-corrected data instead of the original AI output.
        """
        session = session_service.get_session(session_id)
        if not session:
            raise ValueError(f"Session not found: {session_id}")

        fingerprint = self._build_idempotency_fingerprint({
            "sessionId": session_id,
            "checkpointId": checkpoint_id,
            "action": action,
            "feedback": feedback,
        })

        if idempotency_key:
            existing_record = session_service.get_idempotency_request(session_id, "resume", idempotency_key)
            if existing_record:
                existing_fingerprint = existing_record.get("fingerprint")
                if existing_fingerprint and existing_fingerprint != fingerprint:
                    raise IdempotencyConflictError(
                        f"Idempotency key conflict for session {session_id} (resume)"
                    )

                status = existing_record.get("status")
                response = existing_record.get("response")
                if status == "completed" and isinstance(response, dict):
                    logger.info("Returning cached idempotent resume response for session %s", session_id)
                    return response
                if status == "in_progress":
                    raise IdempotencyInProgressError(
                        f"Idempotent resume request already in progress for session {session_id}"
                    )

        stored_checkpoint = session.get("checkpoint_id")
        if stored_checkpoint != checkpoint_id:
            # Allow retry: if the checkpoint was already cleared (None) by a
            # previous attempt that failed mid-execution, accept the request
            # as long as the gate is a valid pipeline step.
            if stored_checkpoint is None and checkpoint_id in HUMAN_GATES:
                logger.info(
                    "Checkpoint already cleared for %s — treating as retry for %s",
                    session_id, checkpoint_id,
                )
            else:
                raise ValueError(
                    f"Checkpoint mismatch: expected {stored_checkpoint}, got {checkpoint_id}"
                )

        # Clear the checkpoint (idempotent on retry)
        session_service.clear_checkpoint(session_id)

        # Parse structured feedback if provided
        structured_feedback = None
        if feedback:
            try:
                structured_feedback = json.loads(feedback)
            except (json.JSONDecodeError, ValueError):
                # Plain text feedback — store as-is
                structured_feedback = None

        # Find the gate's position in the pipeline
        gate_index = PIPELINE_STEPS.index(checkpoint_id) if checkpoint_id in PIPELINE_STEPS else -1
        if gate_index < 0:
            raise ValueError(f"Unknown checkpoint: {checkpoint_id}")

        run_id = f"resume-{int(time.time() * 1000)}"
        logger.info(
            "Pipeline resume requested: session=%s checkpoint=%s action=%s run_id=%s idempotency=%s",
            session_id,
            checkpoint_id,
            action,
            run_id,
            bool(idempotency_key),
        )
        if idempotency_key:
            session_service.upsert_idempotency_request(session_id, "resume", idempotency_key, {
                "status": "in_progress",
                "fingerprint": fingerprint,
                "run_id": run_id,
                "started_at_ms": int(time.time() * 1000),
                "response": None,
                "error": None,
            })

        try:
            if action == "approve":
                # Continue from the step after the gate
                next_index = gate_index + 1

                # Store the feedback/approval payload in session
                gate_output: dict[str, Any] = {"action": "approve"}
                if structured_feedback:
                    gate_output["structured"] = structured_feedback
                    # Merge human edits into upstream outputs so downstream steps use corrected data
                    self._apply_structured_feedback(session_id, checkpoint_id, structured_feedback)
                elif feedback:
                    gate_output["feedback"] = feedback

                session_service.update_session(session_id, {
                    f"outputs.{checkpoint_id}": gate_output,
                })
            elif action == "reject":
                # Find the start of the current stage (first step after previous gate)
                next_index = self._find_stage_start(gate_index)

                gate_output_r: dict[str, Any] = {"action": "reject"}
                if structured_feedback:
                    gate_output_r["structured"] = structured_feedback
                elif feedback:
                    gate_output_r["feedback"] = feedback

                session_service.update_session(session_id, {
                    f"outputs.{checkpoint_id}": gate_output_r,
                })
            else:
                raise ValueError(f"Unknown action: {action}")

            # Reload session to get latest outputs
            session = session_service.get_session(session_id)
            question = session.get("question", "")
            uploads = session.get("uploads")

            result = await self._run_from(
                session_id,
                start_step_index=next_index,
                question=question,
                uploads=uploads,
                run_id=run_id,
                request_metadata=request_metadata,
            )

            if idempotency_key:
                session_service.upsert_idempotency_request(session_id, "resume", idempotency_key, {
                    "status": "completed",
                    "fingerprint": fingerprint,
                    "run_id": run_id,
                    "completed_at_ms": int(time.time() * 1000),
                    "response": result,
                    "error": None,
                })
            return result
        except Exception as exc:
            if idempotency_key:
                session_service.upsert_idempotency_request(session_id, "resume", idempotency_key, {
                    "status": "failed",
                    "fingerprint": fingerprint,
                    "run_id": run_id,
                    "completed_at_ms": int(time.time() * 1000),
                    "error": str(exc),
                })
            raise

    async def get_status(self, session_id: str) -> dict[str, Any]:
        """Get current pipeline status for a session."""
        session = session_service.get_session(session_id)
        if not session:
            raise ValueError(f"Session not found: {session_id}")

        return self._build_response(session_id, session)

    # ── Standalone per-language translation (called by /pipeline/translate) ──

    async def translate_language(
        self,
        scripts: list[dict[str, Any]],
        target_language: str,
        core_language: str,
        retry_tracker: dict[str, int] | None = None,
    ) -> dict[str, Any]:
        """
        Translate scripts into a single target language using Gemini.

        Returns:
          { lang, label, spots: [{ spotId, spotNumber, title, originalText, translatedText }] }
        """
        prompt = load_prompt("s6_translation")
        model = MODELS["flash"]
        temperature = TEMPERATURES.get("s6_translation", 0.5)

        # Build per-language user message
        scripts_summary = "\n\n---\n\n".join(
            f'Spot #{s.get("spotNumber", i+1)} "{s.get("title", "")}":\n{s.get("scriptText", "")}'
            for i, s in enumerate(scripts)
        )

        lang_label = target_language  # will be enriched on the frontend
        user_message = (
            f"Translate the following {len(scripts)} approved script(s) "
            f"from {core_language} into {target_language}.\n"
            f"Return ONLY valid JSON with this structure:\n"
            f'{{"translations": [{{"spotId": "...", "translatedText": "..."}}]}}\n\n'
            f"Scripts:\n{scripts_summary}"
        )

        response = await _retry_generate_content(
            self._client,
            timeout_seconds=self._get_step_timeout_seconds("s6_translation"),
            retry_context={
                "operation": "translate_language",
                "step_id": "s6_translation",
                "language": target_language,
            },
            retry_tracker=retry_tracker,
            model=model,
            contents=user_message,
            config=genai.types.GenerateContentConfig(
                system_instruction=prompt,
                temperature=temperature,
            ),
        )

        text = response.text if response.text else ""

        # Parse JSON
        clean = text.strip()
        if clean.startswith("```"):
            clean = clean.split("\n", 1)[1] if "\n" in clean else clean[3:]
            if clean.endswith("```"):
                clean = clean[:-3]
            clean = clean.strip()

        try:
            parsed = json.loads(clean)
        except (json.JSONDecodeError, ValueError):
            # Fallback: wrap raw text as single-spot translation
            parsed = {
                "translations": [
                    {"spotId": s.get("spotId", f"spot-{i}"), "translatedText": clean}
                    for i, s in enumerate(scripts)
                ]
            }

        # Normalise output to language-first format
        raw_items = parsed.get("translations", [])
        spots = []
        for i, item in enumerate(raw_items):
            spot_id = item.get("spotId", scripts[i].get("spotId", f"spot-{i}") if i < len(scripts) else f"spot-{i}")
            spot_number = item.get("spotNumber", scripts[i].get("spotNumber", i + 1) if i < len(scripts) else i + 1)
            title = item.get("title", scripts[i].get("title", f"Spot {i + 1}") if i < len(scripts) else f"Spot {i + 1}")
            original = scripts[i].get("scriptText", "") if i < len(scripts) else ""
            translated = item.get("translatedText", item.get("text", ""))

            # Handle case where backend returns spot-first format with nested translations dict
            if not translated and isinstance(item.get("translations"), dict):
                translated = item["translations"].get(target_language, "")

            spots.append({
                "spotId": spot_id,
                "spotNumber": spot_number,
                "title": title,
                "originalText": original,
                "translatedText": translated,
            })

        return {
            "lang": target_language,
            "label": lang_label,
            "spots": spots,
            "approved": False,
        }

    # ── Standalone director note generation ──

    async def generate_director_note(
        self,
        script_content: str,
        character_name: str | None = None,
        character_role: str | None = None,
        content_version: str | None = None,
        context: str | None = None,
    ) -> dict[str, Any]:
        """Generate a director note from script content using Gemini."""
        prompt_text = load_prompt("s8_director_note")
        model = MODELS["flash"]
        temperature = TEMPERATURES.get("s8_director_note", 0.6)

        # Build context message
        parts: list[str] = []
        if context:
            parts.append(f"Context / Creative Direction: {context}")
        parts.append(f"Script Content:\n{script_content}")
        if character_name:
            parts.append(f"Character: {character_name}")
        if character_role:
            parts.append(f"Character Role: {character_role}")
        if content_version:
            parts.append(f"Content Version: {content_version}")

        user_message = (
            "Generate a director's note for the audio guide production "
            "based on this context.\n\n" + "\n\n".join(parts)
        )

        response = await _retry_generate_content(
            self._client,
            timeout_seconds=self._get_step_timeout_seconds("s8_director_note"),
            retry_context={"operation": "generate_director_note"},
            model=model,
            contents=user_message,
            config=genai.types.GenerateContentConfig(
                system_instruction=prompt_text,
                temperature=temperature,
            ),
        )

        text = response.text if response.text else ""
        clean = text.strip()
        if clean.startswith("```"):
            clean = clean.split("\n", 1)[1] if "\n" in clean else clean[3:]
            if clean.endswith("```"):
                clean = clean[:-3]
            clean = clean.strip()

        try:
            parsed = json.loads(clean)
        except (json.JSONDecodeError, ValueError):
            parsed = {"success": False, "raw": text}

        # Normalize field names to frontend convention
        raw = parsed.get("directorNote", parsed) if isinstance(parsed, dict) else parsed
        if isinstance(raw, dict):
            result = {
                "scene": raw.get("scene") or raw.get("vocalEnvironment") or "",
                "style": raw.get("style") or raw.get("mission") or raw.get("missionOfSpeech") or "",
                "pacing": raw.get("pacing") or raw.get("pacingAndEnergy") or "",
            }
        else:
            result = {"scene": "", "style": "", "pacing": ""}

        return {"success": True, "directorNote": result}

    # ── Standalone script enhancement ──

    async def enhance_script(
        self,
        script_content: str,
        character_name: str | None = None,
        character_role: str | None = None,
        context_directive: str | None = None,
        cue_density: str | None = None,
    ) -> dict[str, Any]:
        """Enhance a script with AI-generated performance cues."""
        if cue_density == "none":
            return {"success": True, "enhancedScript": script_content.strip()}

        prompt_text = load_prompt("guide_script_enhance")
        model = MODELS["flash"]
        temperature = TEMPERATURES.get("guide_script_enhance", 0.7)

        parts: list[str] = []
        if character_name:
            char_desc = character_name
            if character_role:
                char_desc += f" — {character_role}"
            parts.append(f"Character Identity: {char_desc}")
        if context_directive:
            parts.append(f"Contextual Venue/Goal: {context_directive}")
        if cue_density == "light":
            parts.append(
                "Cue Density Target: Level 1 (Light). Use sparse cues only where they "
                "materially improve delivery, usually no more than one cue before a sentence or beat."
            )
        elif cue_density == "medium":
            parts.append(
                "Cue Density Target: Level 2 (Expressive). Use richer emotional and pacing cues "
                "proactively, including multiple cues when a line benefits, while keeping the script readable."
            )
        parts.append(f"Original Script:\n{script_content}")
        parts.append(
            "Enhance the script with natural performance tags. There is no hard "
            "per-sentence tag cap, but keep the result readable and avoid cue clutter."
        )

        user_message = "\n\n".join(parts)

        response = await _retry_generate_content(
            self._client,
            timeout_seconds=self._get_step_timeout_seconds("guide_script_enhance"),
            retry_context={"operation": "enhance_script"},
            model=model,
            contents=user_message,
            config=genai.types.GenerateContentConfig(
                system_instruction=prompt_text,
                temperature=temperature,
            ),
        )

        text = response.text if response.text else ""
        enhanced = text.strip()
        # Strip markdown code fences if present
        if enhanced.startswith("```"):
            enhanced = enhanced.split("\n", 1)[1] if "\n" in enhanced else enhanced[3:]
            if enhanced.endswith("```"):
                enhanced = enhanced[:-3]
            enhanced = enhanced.strip()

        return {"success": True, "enhancedScript": enhanced}

    async def generate_japanese_hiragana(
        self,
        script_content: str,
    ) -> dict[str, Any]:
        """Convert Japanese narration text into all-Hiragana reading text."""
        prompt_text = load_prompt("ja_hiragana_narration")
        model = MODELS["flash"]
        masked_script_content, tag_placeholders = self._mask_audio_tags_for_hiragana(script_content)

        response = await _retry_generate_content(
            self._client,
            timeout_seconds=self._get_step_timeout_seconds("guide_script_enhance"),
            retry_context={"operation": "generate_japanese_hiragana"},
            model=model,
            contents=masked_script_content,
            config=genai.types.GenerateContentConfig(
                system_instruction=prompt_text,
                temperature=0.2,
                response_mime_type="text/plain",
            ),
        )

        text = response.text if response.text else ""
        hiragana = text.strip()
        if hiragana.startswith("```"):
            hiragana = hiragana.split("\n", 1)[1] if "\n" in hiragana else hiragana[3:]
            if hiragana.endswith("```"):
                hiragana = hiragana[:-3]
            hiragana = hiragana.strip()

        hiragana = self._restore_audio_tags_from_hiragana(hiragana, tag_placeholders)
        return {"success": True, "hiraganaText": hiragana}

    @staticmethod
    def _mask_audio_tags_for_hiragana(text: str) -> tuple[str, dict[str, str]]:
        """Replace bracketed audio tags with stable placeholders before Hiragana conversion."""
        tag_placeholders: dict[str, str] = {}

        def _replace(match: re.Match[str]) -> str:
            placeholder = f"⟦AUDIO_TAG_{len(tag_placeholders)}⟧"
            tag_placeholders[placeholder] = match.group(0)
            return placeholder

        masked = re.sub(r"\[[^\]\r\n]+\]", _replace, text)
        return masked, tag_placeholders

    @staticmethod
    def _restore_audio_tags_from_hiragana(text: str, tag_placeholders: dict[str, str]) -> str:
        restored = text
        for placeholder, original_tag in tag_placeholders.items():
            restored = restored.replace(placeholder, original_tag)
        return restored

    # ── Standalone character generation ──

    async def generate_character(
        self,
        designer_prompt: str,
    ) -> dict[str, Any]:
        """Generate a full character profile from a free-text designer prompt."""
        prompt_text = load_prompt("generate_character")
        model = MODELS["flash"]
        temperature = TEMPERATURES.get("generate_character", 0.8)

        user_message = (
            f"Character concept:\n{designer_prompt}\n\n"
            "Generate the character profile as a single JSON object."
        )

        response = await _retry_generate_content(
            self._client,
            timeout_seconds=self._get_step_timeout_seconds("generate_character"),
            retry_context={"operation": "generate_character"},
            model=model,
            contents=user_message,
            config=genai.types.GenerateContentConfig(
                system_instruction=prompt_text,
                temperature=temperature,
            ),
        )

        text = response.text if response.text else ""
        raw = text.strip()
        # Strip markdown code fences if present
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
            if raw.endswith("```"):
                raw = raw[:-3]
            raw = raw.strip()

        import json as _json

        character = _json.loads(raw)

        required_fields = [
            "name", "role", "avatar", "genderIdentity",
            "coreTimbre", "personalityDNA", "linguisticFingerprint",
            "brandPersona", "staticInstruction",
        ]
        for field in required_fields:
            if field not in character or not character[field]:
                raise ValueError(f"Missing required field: {field}")

        if character.get("genderIdentity") not in ("masculine", "feminine", "neutral"):
            character["genderIdentity"] = "neutral"

        if "accent" not in character:
            character["accent"] = ""

        return {"success": True, "character": character}

    # ── Standalone audio generation (called by /pipeline/audio-generate) ──

    async def generate_audio_for_language(
        self,
        session_id: str,
        scripts: list[dict[str, Any]],
        voice_id: str,
        language: str,
        director_note: dict[str, Any] | None = None,
        translations: list[dict[str, Any]] | None = None,
        retry_tracker: dict[str, int] | None = None,
    ) -> dict[str, Any]:
        """
        Generate TTS audio for every spot in a **single** language.

        Returns:
          { lang, audioFiles: [...], srtFiles: [...] }
        """
        audio_files: list[dict[str, Any]] = []
        srt_files: list[dict[str, Any]] = []
        bucket = fb_storage.bucket()

        # Build translation lookup for this language
        lang_translations: dict[str, str] = {}
        if translations:
            for t in translations:
                key = t.get("spotId", "")
                text = t.get("translatedText", "")
                if key and text:
                    lang_translations[key] = text

        for script in scripts:
            spot_id = script.get("spotId", f"spot_{script.get('spotNumber', 0):03d}")
            spot_number = script.get("spotNumber", 0)
            title = script.get("title", "")
            text = lang_translations.get(spot_id, "") or script.get("scriptText", "")
            if not text.strip():
                continue

            try:
                output_audio_data, output_mime_type, output_extension, alignment_audio_data, duration_ms = (
                    await self._synthesize_tts_audio(
                    text=text,
                    director_note=director_note,
                    voice_id=voice_id,
                    language=language,
                    )
                )

                storage_path = f"audio/{session_id}/{language}/{spot_id}.{output_extension}"
                download_token = str(uuid4())
                blob = bucket.blob(storage_path)
                blob.metadata = {"firebaseStorageDownloadTokens": download_token}
                blob.upload_from_string(output_audio_data, content_type=output_mime_type)

                storage_emulator = os.environ.get("FIREBASE_STORAGE_EMULATOR_HOST") or os.environ.get("STORAGE_EMULATOR_HOST")
                if storage_emulator:
                    host = storage_emulator if storage_emulator.startswith("http") else f"http://{storage_emulator}"
                    encoded_path = storage_path.replace("/", "%2F")
                    audio_url = f"{host}/v0/b/{bucket.name}/o/{encoded_path}?alt=media&token={download_token}"
                else:
                    blob.make_public()
                    audio_url = blob.public_url

                logger.info(
                    "TTS generated: %s/%s — %s bytes, %sms → %s",
                    language,
                    spot_id,
                    len(output_audio_data),
                    duration_ms,
                    storage_path,
                )

                audio_files.append({
                    "lang": language,
                    "spotId": spot_id,
                    "spotNumber": spot_number,
                    "title": title,
                    "audioUrl": audio_url,
                    "durationMs": duration_ms,
                    "voiceId": voice_id,
                    "model": MODELS["tts"],
                })

                srt_entries = await self._generate_aligned_srt_entries(
                    text=text,
                    audio_data=alignment_audio_data,
                    language=language,
                    duration_ms=duration_ms,
                )
                raw_srt = tools.format_srt(srt_entries)
                srt_files.append({
                    "lang": language,
                    "spotId": spot_id,
                    "entries": srt_entries,
                    "rawSrt": raw_srt,
                })

            except audio_alignment.AlignmentError as e:
                logger.error(
                    "Alignment failed for %s/%s: %s",
                    language,
                    spot_id,
                    e,
                    exc_info=True,
                )
                raise RuntimeError(f"ALIGNMENT_FAILED:{language}/{spot_id}:{e}") from e
            except Exception as e:
                logger.error(f"TTS failed for {language}/{spot_id}: {e}", exc_info=True)
                audio_files.append({
                    "lang": language,
                    "spotId": spot_id,
                    "spotNumber": spot_number,
                    "title": title,
                    "audioUrl": "",
                    "durationMs": 0,
                    "error": self._format_audio_generation_error(e),
                })

        return {
            "lang": language,
            "audioFiles": audio_files,
            "srtFiles": srt_files,
            "alignmentRequired": True,
            "alignmentProvider": "google-cloud-speech",
        }

    async def generate_audio(
        self,
        session_id: str,
        scripts: list[dict[str, Any]],
        voice_id: str,
        languages: list[str],
        director_note: dict[str, Any] | None = None,
        translations: dict[str, list[dict[str, Any]]] | None = None,
        retry_tracker: dict[str, int] | None = None,
    ) -> dict[str, Any]:
        """
        Generate TTS audio for each spot × language using Gemini TTS.

        Returns a dict with:
          - audioFiles: list of {lang, spotId, audioUrl, durationMs}
          - srtFiles:   list of {lang, spotId, entries[], rawSrt}
        """
        audio_files: list[dict[str, Any]] = []
        srt_files: list[dict[str, Any]] = []

        for lang in languages:
            result = await self.generate_audio_for_language(
                session_id=session_id,
                scripts=scripts,
                voice_id=voice_id,
                language=lang,
                director_note=director_note,
                translations=translations.get(lang) if translations else None,
                retry_tracker=retry_tracker,
            )
            audio_files.extend(result.get("audioFiles", []))
            srt_files.extend(result.get("srtFiles", []))

        return {
            "success": True,
            "audioFiles": audio_files,
            "srtFiles": srt_files,
            "totalAudioFiles": len([a for a in audio_files if a.get("audioUrl")]),
            "totalSrtFiles": len(srt_files),
            "alignmentRequired": True,
            "alignmentProvider": "google-cloud-speech",
        }

    @classmethod
    def _build_tts_text(cls, transcript: str, director_note: dict[str, Any] | None = None) -> str:
        """Combine direction + transcript using Gemini TTS' prompt/transcript boundary."""
        if not director_note:
            return transcript

        compiled_prompt = str(
            director_note.get("compiledPrompt")
            or director_note.get("stylePrompt")
            or ""
        ).strip()
        if compiled_prompt:
            prompt = cls._sanitize_compiled_tts_prompt(compiled_prompt)
            if prompt:
                return f"{prompt}\n\n#### TRANSCRIPT\n{transcript}"

        scene = cls._first_director_note_value(director_note, "scene", "vocalEnvironment")
        style = cls._first_director_note_value(director_note, "style", "mission", "missionOfSpeech")
        pacing = cls._first_director_note_value(director_note, "pacing", "pacingAndEnergy")

        parts: list[str] = []
        if scene:
            parts.extend(["## THE SCENE", scene])

        director_lines = []
        if style:
            director_lines.append(f"Style: {style}")
        if pacing:
            director_lines.append(f"Pacing: {pacing}")
        if director_lines:
            if parts:
                parts.append("")
            parts.extend(["## DIRECTOR'S NOTES", *director_lines])

        if not parts:
            return transcript
        prompt = "\n".join(parts)
        return f"{prompt}\n\n#### TRANSCRIPT\n{transcript}"

    @classmethod
    def _build_tts_prompt_and_transcript(
        cls,
        transcript: str,
        director_note: dict[str, Any] | None = None,
    ) -> tuple[str, str]:
        """Split direction and transcript for Cloud TTS Gemini-TTS requests."""
        clean_transcript = str(transcript or "").strip()
        if not director_note:
            return "", clean_transcript

        compiled_prompt = str(
            director_note.get("compiledPrompt")
            or director_note.get("compiledPromptOverride")
            or director_note.get("stylePrompt")
            or ""
        ).strip()
        if compiled_prompt:
            prompt = cls._sanitize_compiled_tts_prompt(compiled_prompt)
            return prompt, clean_transcript

        scene = cls._first_director_note_value(director_note, "scene", "vocalEnvironment")
        style = cls._first_director_note_value(director_note, "style", "mission", "missionOfSpeech")
        pacing = cls._first_director_note_value(director_note, "pacing", "pacingAndEnergy")

        lines: list[str] = []
        if scene:
            lines.append(f"Scene: {scene}")
        if style:
            lines.append(f"Style: {style}")
        if pacing:
            lines.append(f"Pacing: {pacing}")
        return "\n".join(lines), clean_transcript

    @classmethod
    def _sanitize_compiled_tts_prompt(cls, compiled_prompt: str) -> str:
        """
        Convert the UI's rich preview prompt into TTS-safe positive delivery cues.

        Gemini 3.1 TTS currently returns upstream 500s for some long meta-control
        prompt lines (for example "Do not add any bracket tags"). The preview prompt
        is still useful as source material, but the actual TTS request should avoid
        negative text-generation instructions and sample transcript echoes.
        """
        stop_headings = {"## SAMPLE CONTEXT", "#### TRANSCRIPT"}
        skipped_prefixes = (
            "Preferred voice model:",
            "Do not ",
            "Don't ",
            "Stay in character",
        )
        skipped_fragments = (
            "avoid meta commentary",
            "ready-to-speak",
            "Read the text naturally as written",
        )
        heading_map = {
            "## AUDIO PROFILE": "Audio profile:",
            "## THE SCENE": "Scene:",
            "## DIRECTOR'S NOTES": "Director notes:",
        }

        lines: list[str] = []
        for raw_line in compiled_prompt.splitlines():
            line = raw_line.strip()
            if not line:
                continue
            if line in stop_headings:
                break
            if line.startswith("#") and line not in heading_map:
                continue
            if line in heading_map:
                lines.append(heading_map[line])
                continue
            if line.startswith(skipped_prefixes):
                continue
            lowered = line.lower()
            if any(fragment.lower() in lowered for fragment in skipped_fragments):
                continue
            lines.append(cls._rewrite_tts_prompt_line(line))

        compact = cls._compact_tts_prompt_lines(lines)
        return compact[:1200].rstrip()

    @staticmethod
    def _rewrite_tts_prompt_line(line: str) -> str:
        if line.startswith("You are "):
            return f"Character: {line.removeprefix('You are ').strip()}"
        if line.startswith("Personality DNA:"):
            return line.replace("Personality DNA:", "Personality:", 1)
        if line.startswith("Linguistic fingerprint:"):
            return line.replace("Linguistic fingerprint:", "Linguistic style:", 1)
        return line

    @staticmethod
    def _compact_tts_prompt_lines(lines: list[str]) -> str:
        compact: list[str] = []
        previous_heading = False
        for line in lines:
            is_heading = line.endswith(":") and not line.startswith(("Style:", "Pacing:", "Scene:"))
            if is_heading and previous_heading:
                compact[-1] = line
            else:
                compact.append(line)
            previous_heading = is_heading
        return "\n".join(compact)

    @staticmethod
    def _map_tts_language_code(language: str) -> str:
        normalized = (language or "").strip()
        if not normalized:
            return "en-US"

        aliases = {
            "en": "en-US",
            "ja": "ja-JP",
            "ko": "ko-KR",
            "zh": "cmn-CN",
            "zh-cn": "cmn-CN",
            "zh-tw": "cmn-tw",
            "fr": "fr-FR",
            "de": "de-DE",
            "es": "es-ES",
            "it": "it-IT",
            "pt": "pt-PT",
        }
        lowered = normalized.lower()
        if lowered in aliases:
            return aliases[lowered]
        if "-" in normalized:
            return normalized
        return aliases.get(lowered, "en-US")

    @staticmethod
    def _first_director_note_value(director_note: dict[str, Any], *keys: str) -> str:
        for key in keys:
            value = director_note.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        return ""

    async def _generate_aligned_srt_entries(
        self,
        *,
        text: str,
        audio_data: bytes | None,
        language: str,
        duration_ms: int,
    ) -> list[dict[str, Any]]:
        alignment_text = audio_alignment.strip_performance_tags(text) or text
        duration_sec = max(0.001, duration_ms / 1000.0)
        if not audio_data:
            logger.info(
                "No LINEAR16-safe alignment audio available for %s; using rule-based subtitle fallback",
                language,
            )
            return tools.srt_generate_for_text(alignment_text, duration_sec)

        timeout_seconds = min(
            self._get_step_timeout_seconds("s9_audio_gen"),
            ALIGNMENT_TIMEOUT_SECONDS,
        )

        forced_break_positions: set[int] | None = None
        if ALIGNMENT_AI_SEGMENTATION_ENABLED:
            segments = await self._segment_text_with_gemini(
                text=alignment_text,
                language=language,
            )
            if segments:
                forced_break_positions = self._build_forced_break_positions_from_segments(
                    reference_text=alignment_text,
                    segments=segments,
                )
                if not forced_break_positions:
                    logger.warning(
                        "AI segmentation returned unusable segments for %s; falling back to rule-based grouping",
                        language,
                    )

        try:
            word_timestamps = await asyncio.to_thread(
                audio_alignment.transcribe_audio_word_timestamps,
                audio_data,
                language,
                timeout_seconds=timeout_seconds,
            )
            return await asyncio.to_thread(
                audio_alignment.build_aligned_srt_entries,
                alignment_text,
                duration_sec,
                word_timestamps,
                max_cjk_chars=ALIGNMENT_MAX_CJK_CHARS,
                max_latin_chars=ALIGNMENT_MAX_LATIN_CHARS,
                min_cue_seconds=ALIGNMENT_MIN_CUE_SECONDS,
                max_cue_seconds=ALIGNMENT_MAX_CUE_SECONDS,
                forced_break_positions=forced_break_positions,
            )
        except audio_alignment.AlignmentError as exc:
            lowered = str(exc).lower()
            if any(marker in lowered for marker in RECOVERABLE_ALIGNMENT_ERROR_MARKERS):
                logger.warning(
                    "Recoverable alignment failure for %s; using rule-based subtitle fallback: %s",
                    language,
                    exc,
                )
                fallback = tools.srt_generate_for_text(alignment_text, duration_sec)
                if fallback:
                    return fallback
            raise

    async def _synthesize_tts_audio(
        self,
        *,
        text: str,
        director_note: dict[str, Any] | None,
        voice_id: str,
        language: str,
    ) -> tuple[bytes, str, str, bytes | None, int]:
        """Synthesize Gemini-TTS audio using Cloud TTS, outputting MP3 plus WAV for alignment."""
        prompt, transcript = self._build_tts_prompt_and_transcript(text, director_note)
        language_code = self._map_tts_language_code(language)

        def _run_cloud_tts(request_prompt: str, audio_encoding) -> tuple[bytes, str]:
            tts_client = self._get_tts_client()
            synthesis_input = texttospeech.SynthesisInput(
                text=transcript,
                prompt=request_prompt,
            )
            voice = texttospeech.VoiceSelectionParams(
                language_code=language_code,
                name=voice_id,
                model_name=MODELS["tts"],
            )
            audio_config_kwargs: dict[str, Any] = {"audio_encoding": audio_encoding}
            if audio_encoding in (
                texttospeech.AudioEncoding.LINEAR16,
                texttospeech.AudioEncoding.MP3,
            ):
                audio_config_kwargs["sample_rate_hertz"] = 24000
            audio_config = texttospeech.AudioConfig(**audio_config_kwargs)
            response = tts_client.synthesize_speech(
                input=synthesis_input,
                voice=voice,
                audio_config=audio_config,
            )
            audio_content = bytes(response.audio_content)
            return audio_content, self._mime_for_cloud_audio_encoding(audio_encoding, audio_content)

        async def _run_with_prompt_fallback(audio_encoding) -> tuple[bytes, str]:
            try:
                return await asyncio.to_thread(_run_cloud_tts, prompt, audio_encoding)
            except Exception as exc:
                if prompt and "prohibited_content" in str(exc).lower():
                    logger.warning(
                        "Cloud TTS blocked directed prompt for %s/%s; retrying with transcript-only fallback",
                        language,
                        voice_id,
                    )
                    return await asyncio.to_thread(_run_cloud_tts, "", audio_encoding)
                raise

        output_audio_data, output_mime_type = await _run_with_prompt_fallback(texttospeech.AudioEncoding.MP3)
        output_extension = self._audio_extension_for_mime(output_mime_type)

        alignment_audio_data: bytes | None = None
        duration_ms = self._estimate_duration_ms(output_audio_data, output_mime_type)
        try:
            alignment_audio_data, alignment_mime_type = await _run_with_prompt_fallback(texttospeech.AudioEncoding.LINEAR16)
            duration_ms = self._estimate_duration_ms(alignment_audio_data, alignment_mime_type)
        except Exception as exc:
            logger.warning(
                "WAV alignment synthesis unavailable for %s/%s; using duration fallback only: %s",
                language,
                voice_id,
                exc,
            )

        return output_audio_data, output_mime_type, output_extension, alignment_audio_data, duration_ms

    async def _segment_text_with_gemini(
        self,
        *,
        text: str,
        language: str,
    ) -> list[str] | None:
        clean_text = (text or "").strip()
        if not clean_text:
            return None

        user_message = self._build_ai_segmentation_prompt(
            text=clean_text,
            language=language,
        )

        try:
            response = await _retry_generate_content(
                self._client,
                timeout_seconds=min(self._get_step_timeout_seconds("s9_audio_gen"), 20.0),
                retry_context={
                    "operation": "audio_alignment_segment",
                    "step_id": "s9_audio_gen",
                    "language": language,
                },
                model=MODELS["flash"],
                contents=user_message,
                config=genai.types.GenerateContentConfig(
                    temperature=0.1,
                ),
            )
        except Exception as exc:
            logger.warning("AI segmentation call failed for %s: %s", language, exc)
            return None

        raw = (response.text or "").strip()
        if not raw:
            return None

        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
            if raw.endswith("```"):
                raw = raw[:-3]
            raw = raw.strip()

        try:
            payload = json.loads(raw)
        except (json.JSONDecodeError, ValueError):
            logger.warning("AI segmentation returned invalid JSON for %s", language)
            return None

        segments_raw = payload.get("segments") if isinstance(payload, dict) else None
        if not isinstance(segments_raw, list):
            return None

        segments = [str(item).strip() for item in segments_raw if str(item).strip()]
        if len(segments) <= 1:
            return None

        reference = "".join(char for char in clean_text if not char.isspace())
        joined = "".join("".join(char for char in seg if not char.isspace()) for seg in segments)
        if joined != reference:
            logger.warning(
                "AI segmentation text mismatch for %s; ignoring AI segments",
                language,
            )
            return None
        return segments

    @staticmethod
    def _build_ai_segmentation_prompt(*, text: str, language: str) -> str:
        lowered = (language or "").strip().lower()
        if lowered.startswith(("zh", "ja", "ko")):
            language_structure_rule = (
                "Respect CJK sentence structure: keep semantic chunks intact "
                "(subject-topic + predicate, verb-object, modifier-noun, fixed compounds)."
            )
            preferred_length_rule = (
                "Target each segment to around 6-16 CJK characters when possible; "
                "avoid segments shorter than 3 CJK characters."
            )
        else:
            language_structure_rule = (
                "Respect sentence syntax for the target language: split mainly at clause boundaries, "
                "and keep function words attached to their phrases."
            )
            preferred_length_rule = (
                "Target each segment to around 3-12 words when possible; "
                "avoid one- or two-word fragments unless necessary."
            )

        return (
            f"Language: {language}\n"
            "Task: Segment the text into subtitle-ready lines for mobile readability.\n"
            "Rules:\n"
            "1) Preserve original character order exactly.\n"
            "2) Do not rewrite, add, remove, or reorder any character.\n"
            "3) First split by punctuation boundaries; then split long spans only when necessary.\n"
            f"4) {language_structure_rule}\n"
            f"5) {preferred_length_rule}\n"
            "6) Never output punctuation-only segments.\n"
            "7) Return JSON only, format: {\"segments\":[\"...\",\"...\"]}.\n\n"
            f"Text:\n{text}"
        )

    @staticmethod
    def _build_forced_break_positions_from_segments(
        *,
        reference_text: str,
        segments: list[str],
    ) -> set[int] | None:
        ref_chars = [char for char in reference_text if not char.isspace()]
        ref_str = "".join(ref_chars)
        segment_strs = ["".join(char for char in segment if not char.isspace()) for segment in segments]
        if not segment_strs:
            return None

        joined = "".join(segment_strs)
        if joined != ref_str:
            return None

        forced_break_positions: set[int] = set()
        cursor = 0
        for segment in segment_strs[:-1]:
            cursor += len(segment)
            if cursor > 0:
                forced_break_positions.add(cursor - 1)
        return forced_break_positions or None

    @staticmethod
    def _pcm_to_wav(pcm_data: bytes, sample_rate: int = 24000, channels: int = 1, sample_width: int = 2) -> bytes:
        """Wrap raw PCM bytes in a WAV header."""
        buf = io.BytesIO()
        with wave.open(buf, "wb") as wf:
            wf.setnchannels(channels)
            wf.setsampwidth(sample_width)
            wf.setframerate(sample_rate)
            wf.writeframes(pcm_data)
        return buf.getvalue()

    @classmethod
    def _prepare_audio_output(
        cls,
        audio_data: bytes | bytearray | memoryview,
        mime_type: str,
    ) -> tuple[bytes, str, str, bytes | None, int]:
        """Prepare downloadable output bytes while keeping alignment-safe audio bytes."""
        normalized_audio_data = bytes(audio_data)
        base_mime_type = (mime_type or "").split(";", 1)[0].strip().lower()

        if cls._mime_indicates_raw_pcm(mime_type):
            sample_rate = cls._extract_sample_rate_from_mime(mime_type, default=24000)
            alignment_audio_data = cls._pcm_to_wav(normalized_audio_data, sample_rate=sample_rate)
            duration_ms = cls._estimate_duration_ms(alignment_audio_data, "audio/wav")
            return alignment_audio_data, "audio/wav", "wav", alignment_audio_data, duration_ms

        if base_mime_type in {"audio/mpeg", "audio/mp3"}:
            duration_ms = cls._estimate_duration_ms(normalized_audio_data, "audio/mpeg")
            return normalized_audio_data, "audio/mpeg", "mp3", None, duration_ms

        if base_mime_type in {"audio/wav", "audio/x-wav"}:
            duration_ms = cls._estimate_duration_ms(normalized_audio_data, "audio/wav")
            return normalized_audio_data, "audio/wav", "wav", normalized_audio_data, duration_ms

        duration_ms = cls._estimate_duration_ms(normalized_audio_data, mime_type)
        return normalized_audio_data, mime_type or "application/octet-stream", "bin", None, duration_ms

    @staticmethod
    def _extract_sample_rate_from_mime(mime_type: str, default: int = 24000) -> int:
        """Extract sample rate (Hz) from mime strings like 'audio/L16;rate=24000'."""
        if not mime_type:
            return default
        lower = mime_type.lower()
        for token in lower.split(";"):
            token = token.strip()
            if token.startswith("rate="):
                try:
                    rate = int(token.split("=", 1)[1])
                    if rate > 0:
                        return rate
                except Exception:
                    return default
        return default

    @staticmethod
    def _mime_indicates_raw_pcm(mime_type: str) -> bool:
        """Return True when a mime type indicates raw PCM payload."""
        if not mime_type:
            return False
        base = mime_type.split(";", 1)[0].strip().lower()
        return base in {"audio/l16", "audio/pcm", "audio/raw", "audio/x-raw"}

    @staticmethod
    def _estimate_duration_ms(audio_data: bytes, mime_type: str) -> int:
        """Estimate audio duration in ms from WAV data."""
        try:
            buf = io.BytesIO(audio_data)
            with wave.open(buf, "rb") as wf:
                frames = wf.getnframes()
                rate = wf.getframerate()
                if rate > 0:
                    return int((frames / rate) * 1000)
        except Exception:
            pass
        # Fallback: estimate from byte size (16-bit mono 24kHz)
        return int(len(audio_data) / (24000 * 2) * 1000)

    @staticmethod
    def _audio_extension_for_mime(mime_type: str) -> str:
        base = (mime_type or "").split(";", 1)[0].strip().lower()
        if base in {"audio/mpeg", "audio/mp3"}:
            return "mp3"
        if base in {"audio/wav", "audio/x-wav"}:
            return "wav"
        return "bin"

    @staticmethod
    def _format_audio_generation_error(error: Any) -> str:
        """Normalize audio generation errors before they reach API responses."""
        raw_message = str(error or "").strip()
        if not raw_message:
            return "Audio generation failed."

        compact_message = " ".join(raw_message.split())
        lowered = compact_message.lower()

        if "could not be converted to bytes" in lowered:
            return "The TTS provider returned audio in an unreadable format."
        if "audio payload could not be read" in lowered:
            return "The TTS provider returned audio that could not be read."
        if "no audio data returned from gemini tts response" in lowered:
            return "The TTS provider did not return any playable audio."
        if PipelineExecutor._is_prohibited_content_block(compact_message):
            return "The TTS provider blocked this audio prompt."

        raw_audio_markers = ("bytearray(", "lame3.", "\\xff\\xf3", "b'\\xff", 'b"\\xff')
        binary_noise_markers = ("\\x00", "\\x01", "\\x02", "\\x03", "\\xff", "\\xfe")
        if any(marker in lowered for marker in raw_audio_markers):
            return "The TTS provider returned audio in an unreadable format."
        if len(compact_message) > 240 and any(marker in lowered for marker in binary_noise_markers):
            return "The TTS provider returned audio in an unreadable format."

        return compact_message

    @staticmethod
    def _sniff_audio_mime_type(audio_data: bytes) -> str:
        """Infer Gemini TTS audio format when the SDK omits mime_type."""
        if audio_data.startswith(b"RIFF") and audio_data[8:12] == b"WAVE":
            return "audio/wav"
        if audio_data.startswith(b"ID3"):
            return "audio/mpeg"
        if len(audio_data) >= 2 and audio_data[0] == 0xFF and (audio_data[1] & 0xE0) == 0xE0:
            return "audio/mpeg"
        # Gemini TTS docs describe inline audio as raw 24kHz PCM by default.
        return "audio/L16;rate=24000"

    @staticmethod
    def _mime_for_cloud_audio_encoding(audio_encoding: Any, audio_data: bytes) -> str:
        if texttospeech is not None:
            if audio_encoding == texttospeech.AudioEncoding.MP3:
                return "audio/mpeg"
            if audio_encoding == texttospeech.AudioEncoding.LINEAR16:
                return "audio/wav"
        return PipelineExecutor._sniff_audio_mime_type(audio_data)

    @staticmethod
    def _coerce_inline_audio_bytes(data: Any) -> bytes:
        """Accept SDK bytes objects and base64 strings returned by Gemini TTS."""
        if isinstance(data, bytes):
            return data
        if isinstance(data, bytearray):
            return bytes(data)
        if isinstance(data, memoryview):
            return data.tobytes()
        if isinstance(data, str):
            try:
                return base64.b64decode(data, validate=True)
            except Exception as exc:
                raise ValueError(f"inline audio base64 decode failed: {exc}") from exc
        return bytes(data)

    @staticmethod
    def _extract_audio_inline_data(response: Any) -> tuple[bytes | None, str, str | None]:
        """Extract first inline audio payload from Gemini response candidates."""
        candidates = getattr(response, "candidates", None) or []

        for candidate in candidates:
            content = getattr(candidate, "content", None)
            parts = getattr(content, "parts", None) if content is not None else None
            if not parts:
                continue
            for part in parts:
                inline_data = getattr(part, "inline_data", None)
                if inline_data is None:
                    continue
                try:
                    data = getattr(inline_data, "data", None)
                    mime_type = getattr(inline_data, "mime_type", None)
                except Exception as exc:
                    return None, "audio/wav", PipelineExecutor._format_audio_generation_error(
                        f"Audio payload could not be read: {exc}"
                    )
                if not data:
                    continue
                try:
                    normalized_audio = PipelineExecutor._coerce_inline_audio_bytes(data)
                    resolved_mime_type = mime_type or PipelineExecutor._sniff_audio_mime_type(normalized_audio)
                    return normalized_audio, resolved_mime_type, None
                except Exception as exc:
                    return None, mime_type or "audio/L16;rate=24000", PipelineExecutor._format_audio_generation_error(
                        f"Audio payload could not be converted to bytes: {exc}"
                    )

        details: list[str] = []
        prompt_feedback = getattr(response, "prompt_feedback", None)
        block_reason = getattr(prompt_feedback, "block_reason", None) if prompt_feedback is not None else None
        block_reason_message = (
            getattr(prompt_feedback, "block_reason_message", None)
            if prompt_feedback is not None
            else None
        )
        if block_reason:
            details.append(f"block_reason={block_reason}")
        if block_reason_message:
            details.append(str(block_reason_message))

        response_text = getattr(response, "text", None)
        if response_text:
            text_preview = str(response_text).strip().replace("\n", " ")
            if text_preview:
                details.append(f"text={text_preview[:240]}")

        for candidate in candidates:
            finish_reason = getattr(candidate, "finish_reason", None)
            if finish_reason:
                details.append(f"finish_reason={finish_reason}")

        suffix = f" ({'; '.join(dict.fromkeys(details))})" if details else ""
        return None, "audio/wav", f"No audio content returned from Gemini TTS response{suffix}"

    @staticmethod
    def _is_prohibited_content_block(extraction_error: str | None) -> bool:
        """Return True when Gemini reported a PROHIBITED_CONTENT policy block."""
        if not extraction_error:
            return False
        lowered = extraction_error.lower()
        return (
            "block_reason=prohibited_content" in lowered
            or "block_reason=blockedreason.prohibited_content" in lowered
        )

    async def _run_from(
        self,
        session_id: str,
        start_step_index: int,
        question: str | None = None,
        uploads: list[dict[str, Any]] | None = None,
        run_id: str | None = None,
        request_metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Execute pipeline steps starting from the given index."""
        session = session_service.get_session(session_id)
        if not session:
            raise ValueError(f"Session not found: {session_id}")

        active_run_id = run_id or f"run-{int(time.time() * 1000)}-{start_step_index}"
        session_service.update_session(session_id, {
            "status": "running",
            "checkpoint_id": None,
            "active_run_id": active_run_id,
        })

        outputs = session.get("outputs", {})
        session_context = session.get("context", {})
        runtime_context = self._build_runtime_context(
            session_id=session_id,
            run_id=active_run_id,
            session_context=session_context if isinstance(session_context, dict) else {},
            request_metadata=request_metadata,
        )
        # Make session context available to step executors via a reserved outputs key
        outputs["_context"] = session_context if isinstance(session_context, dict) else {}
        outputs["_runtime"] = runtime_context

        for i in range(start_step_index, len(PIPELINE_STEPS)):
            step_id = PIPELINE_STEPS[i]
            step_attempt = session_service.next_step_attempt(session_id, step_id)
            started_at_ms = int(time.time() * 1000)
            step_timeout_seconds = self._get_step_timeout_seconds(step_id)
            step_retry_stats: dict[str, int] = {"attempts": 0, "retries": 0}
            runtime_context["activeStepId"] = step_id
            runtime_context["stepRetryStats"] = step_retry_stats
            logger.info(
                "Executing step %s (session=%s run=%s attempt=%s timeout=%.1fs)",
                step_id,
                session_id,
                active_run_id,
                step_attempt,
                step_timeout_seconds,
            )
            self._emit_step_telemetry(
                event="pipeline.step.start",
                runtime_context=runtime_context,
                step_id=step_id,
                attempt=step_attempt,
                status="RUNNING",
                duration_ms=0,
                retries=0,
                llm_attempts=0,
                timeout_seconds=step_timeout_seconds,
            )

            # Human gates — pause execution
            if step_id in HUMAN_GATES:
                completed_at_ms = int(time.time() * 1000)
                step_result = {
                    "step_id": step_id,
                    "label": STEP_LABELS[step_id],
                    "status": "STOPPED",
                    "output": None,
                    "attempt": step_attempt,
                    "run_id": active_run_id,
                    "started_at_ms": started_at_ms,
                    "completed_at_ms": completed_at_ms,
                }
                session_service.append_step(session_id, step_result)
                session_service.set_checkpoint(session_id, step_id)
                self._emit_step_telemetry(
                    event="pipeline.step.finish",
                    runtime_context=runtime_context,
                    step_id=step_id,
                    attempt=step_attempt,
                    status="STOPPED",
                    duration_ms=completed_at_ms - started_at_ms,
                    retries=int(step_retry_stats.get("retries", 0)),
                    llm_attempts=int(step_retry_stats.get("attempts", 0)),
                    timeout_seconds=step_timeout_seconds,
                )
                break

            # Pipeline complete marker
            if step_id == "pipeline_complete":
                completed_at_ms = int(time.time() * 1000)
                step_result = {
                    "step_id": step_id,
                    "label": STEP_LABELS[step_id],
                    "status": "FINISHED",
                    "output": {"success": True, "message": "Pipeline completed successfully"},
                    "attempt": step_attempt,
                    "run_id": active_run_id,
                    "started_at_ms": started_at_ms,
                    "completed_at_ms": completed_at_ms,
                }
                session_service.append_step(session_id, step_result)
                session_service.complete_session(session_id)
                self._emit_step_telemetry(
                    event="pipeline.step.finish",
                    runtime_context=runtime_context,
                    step_id=step_id,
                    attempt=step_attempt,
                    status="FINISHED",
                    duration_ms=completed_at_ms - started_at_ms,
                    retries=int(step_retry_stats.get("retries", 0)),
                    llm_attempts=int(step_retry_stats.get("attempts", 0)),
                    timeout_seconds=step_timeout_seconds,
                )
                break

            # Execute the step
            try:
                output = await asyncio.wait_for(
                    self._execute_step(step_id, question, uploads, outputs),
                    timeout=step_timeout_seconds,
                )
                completed_at_ms = int(time.time() * 1000)
                step_result = {
                    "step_id": step_id,
                    "label": STEP_LABELS[step_id],
                    "status": "FINISHED",
                    "output": output,
                    "attempt": step_attempt,
                    "run_id": active_run_id,
                    "started_at_ms": started_at_ms,
                    "completed_at_ms": completed_at_ms,
                }
                outputs[step_id] = output
                session_service.append_step(session_id, step_result)
                logger.info(
                    "Step %s completed (session=%s run=%s attempt=%s duration_ms=%d)",
                    step_id,
                    session_id,
                    active_run_id,
                    step_attempt,
                    completed_at_ms - started_at_ms,
                )
                self._emit_step_telemetry(
                    event="pipeline.step.finish",
                    runtime_context=runtime_context,
                    step_id=step_id,
                    attempt=step_attempt,
                    status="FINISHED",
                    duration_ms=completed_at_ms - started_at_ms,
                    retries=int(step_retry_stats.get("retries", 0)),
                    llm_attempts=int(step_retry_stats.get("attempts", 0)),
                    timeout_seconds=step_timeout_seconds,
                )
            except asyncio.TimeoutError:
                timeout_message = f"Step timed out after {step_timeout_seconds:.1f}s"
                logger.warning(
                    "Step %s timed out (session=%s run=%s attempt=%s timeout=%.1fs)",
                    step_id,
                    session_id,
                    active_run_id,
                    step_attempt,
                    step_timeout_seconds,
                )
                completed_at_ms = int(time.time() * 1000)
                step_result = {
                    "step_id": step_id,
                    "label": STEP_LABELS[step_id],
                    "status": "ERROR",
                    "output": {
                        "error": timeout_message,
                        "error_code": "STEP_TIMEOUT",
                        "stepId": step_id,
                        "attempt": step_attempt,
                    },
                    "attempt": step_attempt,
                    "run_id": active_run_id,
                    "started_at_ms": started_at_ms,
                    "completed_at_ms": completed_at_ms,
                }
                session_service.append_step(session_id, step_result)
                session_service.update_session(session_id, {
                    "status": "error",
                    "last_error": {
                        "step_id": step_id,
                        "attempt": step_attempt,
                        "run_id": active_run_id,
                        "code": "STEP_TIMEOUT",
                        "message": timeout_message,
                    },
                })
                self._emit_step_telemetry(
                    event="pipeline.step.finish",
                    runtime_context=runtime_context,
                    step_id=step_id,
                    attempt=step_attempt,
                    status="ERROR",
                    duration_ms=completed_at_ms - started_at_ms,
                    retries=int(step_retry_stats.get("retries", 0)),
                    llm_attempts=int(step_retry_stats.get("attempts", 0)),
                    timeout_seconds=step_timeout_seconds,
                    error_code="STEP_TIMEOUT",
                )
                self._emit_failure_hotspot_if_needed(
                    session_id=session_id,
                    runtime_context=runtime_context,
                    step_id=step_id,
                    error_code="STEP_TIMEOUT",
                )
                break
            except asyncio.CancelledError as exc:
                cancel_message = "Pipeline execution cancelled"
                logger.warning(
                    "Step %s cancelled (session=%s run=%s attempt=%s)",
                    step_id,
                    session_id,
                    active_run_id,
                    step_attempt,
                )
                completed_at_ms = int(time.time() * 1000)
                step_result = {
                    "step_id": step_id,
                    "label": STEP_LABELS[step_id],
                    "status": "ERROR",
                    "output": {
                        "error": cancel_message,
                        "error_code": "PIPELINE_CANCELLED",
                        "stepId": step_id,
                        "attempt": step_attempt,
                    },
                    "attempt": step_attempt,
                    "run_id": active_run_id,
                    "started_at_ms": started_at_ms,
                    "completed_at_ms": completed_at_ms,
                }
                session_service.append_step(session_id, step_result)
                session_service.update_session(session_id, {
                    "status": "error",
                    "last_error": {
                        "step_id": step_id,
                        "attempt": step_attempt,
                        "run_id": active_run_id,
                        "code": "PIPELINE_CANCELLED",
                        "message": cancel_message,
                    },
                })
                self._emit_step_telemetry(
                    event="pipeline.step.finish",
                    runtime_context=runtime_context,
                    step_id=step_id,
                    attempt=step_attempt,
                    status="ERROR",
                    duration_ms=completed_at_ms - started_at_ms,
                    retries=int(step_retry_stats.get("retries", 0)),
                    llm_attempts=int(step_retry_stats.get("attempts", 0)),
                    timeout_seconds=step_timeout_seconds,
                    error_code="PIPELINE_CANCELLED",
                )
                self._emit_failure_hotspot_if_needed(
                    session_id=session_id,
                    runtime_context=runtime_context,
                    step_id=step_id,
                    error_code="PIPELINE_CANCELLED",
                )
                raise RuntimeError(cancel_message) from exc
            except Exception as e:
                logger.error(f"Step {step_id} failed: {e}", exc_info=True)
                completed_at_ms = int(time.time() * 1000)
                step_result = {
                    "step_id": step_id,
                    "label": STEP_LABELS[step_id],
                    "status": "ERROR",
                    "output": {
                        "error": str(e),
                        "stepId": step_id,
                        "attempt": step_attempt,
                    },
                    "attempt": step_attempt,
                    "run_id": active_run_id,
                    "started_at_ms": started_at_ms,
                    "completed_at_ms": completed_at_ms,
                }
                session_service.append_step(session_id, step_result)
                session_service.update_session(session_id, {
                    "status": "error",
                    "last_error": {
                        "step_id": step_id,
                        "attempt": step_attempt,
                        "run_id": active_run_id,
                        "message": str(e),
                    },
                })
                self._emit_step_telemetry(
                    event="pipeline.step.finish",
                    runtime_context=runtime_context,
                    step_id=step_id,
                    attempt=step_attempt,
                    status="ERROR",
                    duration_ms=completed_at_ms - started_at_ms,
                    retries=int(step_retry_stats.get("retries", 0)),
                    llm_attempts=int(step_retry_stats.get("attempts", 0)),
                    timeout_seconds=step_timeout_seconds,
                    error_code="STEP_FAILED",
                )
                self._emit_failure_hotspot_if_needed(
                    session_id=session_id,
                    runtime_context=runtime_context,
                    step_id=step_id,
                    error_code="STEP_FAILED",
                )
                break

        # Reload session and build response
        session = session_service.get_session(session_id)
        return self._build_response(session_id, session)

    async def _execute_step(
        self,
        step_id: str,
        question: str | None,
        uploads: list[dict[str, Any]] | None,
        outputs: dict[str, Any],
    ) -> Any:
        """Execute a single pipeline step."""
        runtime_context = outputs.get("_runtime", {})
        retry_tracker = None
        if isinstance(runtime_context, dict):
            candidate = runtime_context.get("stepRetryStats")
            if isinstance(candidate, dict):
                retry_tracker = candidate

        # Tool function steps
        if step_id == "n5_character_select":
            context = outputs.get("s4_script_gen", {})
            spots = outputs.get("s1_metadata_extract", {}).get("spots", [])
            # Read selectedCharacterId from session context (sent by the frontend wizard)
            session_context = outputs.get("_context", {})
            character_id = session_context.get("selectedCharacterId")
            return tools.character_select({
                "selectedCharacterId": character_id,
                "spots": spots,
                "scripts": context.get("scripts", []),
            })

        if step_id == "n6_audio_qa":
            audio_output = outputs.get("s9_audio_gen", {})
            audio_files = audio_output.get("audioFiles", [])
            return tools.audio_playback_qa(audio_files)

        if step_id == "n8_generation_history":
            return tools.generation_history(outputs)

        if step_id == "s10_srt_gen":
            scripts = outputs.get("s4_script_gen", {}).get("scripts", [])
            translations_out = outputs.get("s6_translation", {})
            raw_translations = translations_out.get("translations", [])

            # If S9 already generated SRT with actual audio durations, prefer those
            audio_output = outputs.get("s9_audio_gen", {})
            s9_srt_files = audio_output.get("srtFiles", [])
            s9_audio_files = audio_output.get("audioFiles", [])
            alignment_required = bool(audio_output.get("alignmentRequired", False))

            if s9_srt_files:
                # S9 produced duration-accurate SRT — build a lookup of covered (lang, spotId)
                covered = {(s.get("lang"), s.get("spotId")) for s in s9_srt_files}

                if alignment_required:
                    expected = {
                        (af.get("lang"), af.get("spotId"))
                        for af in s9_audio_files
                        if af.get("audioUrl")
                    }
                    missing = sorted(expected - covered)
                    if missing:
                        missing_labels = ", ".join(f"{lang}/{spot}" for lang, spot in missing)
                        raise RuntimeError(
                            f"ALIGNMENT_FAILED: missing aligned SRT for {missing_labels}"
                        )
                    return {
                        "success": True,
                        "srtFiles": list(s9_srt_files),
                        "totalFiles": len(s9_srt_files),
                    }

                result_srt = list(s9_srt_files)  # start with S9's files

                # For any script/translation NOT covered by S9, fall back to rule-based
                # Build duration lookup from S9 audio files
                duration_lookup: dict[tuple[str, str], float] = {}
                for af in s9_audio_files:
                    key = (af.get("lang", ""), af.get("spotId", ""))
                    duration_lookup[key] = af.get("durationMs", 0) / 1000.0

                # Check core-language scripts
                for script in scripts:
                    spot_id = script.get("spotId", "")
                    if ("en", spot_id) not in covered:
                        text = script.get("scriptText", "")
                        if isinstance(script.get("variants"), dict):
                            text = script["variants"].get("professional", text)
                        dur = duration_lookup.get(("en", spot_id))
                        if dur and dur > 0:
                            entries = tools.srt_generate_for_text(text, dur)
                        else:
                            entries = tools._text_to_srt_entries(text)
                        result_srt.append({
                            "lang": "en",
                            "spotId": spot_id,
                            "entries": entries,
                            "totalEntries": len(entries),
                        })

                # Check translations
                if raw_translations and isinstance(raw_translations[0].get("translations"), dict):
                    for item in raw_translations:
                        sid = item.get("spotId", "")
                        for lang, text in item.get("translations", {}).items():
                            if (lang, sid) not in covered:
                                dur = duration_lookup.get((lang, sid))
                                if dur and dur > 0:
                                    entries = tools.srt_generate_for_text(str(text), dur)
                                else:
                                    entries = tools._text_to_srt_entries(str(text))
                                result_srt.append({
                                    "lang": lang,
                                    "spotId": sid,
                                    "entries": entries,
                                    "totalEntries": len(entries),
                                })

                return {
                    "success": True,
                    "srtFiles": result_srt,
                    "totalFiles": len(result_srt),
                }

            if alignment_required:
                successful_audio = [af for af in s9_audio_files if af.get("audioUrl")]
                if successful_audio:
                    raise RuntimeError("ALIGNMENT_FAILED: no aligned SRT files were produced")

            # No S9 SRT available — fall back to full rule-based generation
            # S6 returns spot-first: [{spotId, translations: {en, ja, ...}}]
            # srt_generate expects language-first: [{lang, spots: [{spotId, translatedText}]}]
            translations = raw_translations
            if raw_translations and isinstance(raw_translations[0].get("translations"), dict):
                lang_map: dict[str, list[dict[str, Any]]] = {}
                for item in raw_translations:
                    spot_id = item.get("spotId", "")
                    spot_num = item.get("spotNumber", 0)
                    title = item.get("title", "")
                    for lang, text in item.get("translations", {}).items():
                        if lang not in lang_map:
                            lang_map[lang] = []
                        lang_map[lang].append({
                            "spotId": spot_id,
                            "spotNumber": spot_num,
                            "title": title,
                            "translatedText": str(text),
                        })
                translations = [{"lang": lang, "spots": spots} for lang, spots in lang_map.items()]
            return tools.srt_generate(scripts, translations)

        # S9 Audio Gen uses the real TTS pipeline
        if step_id == "s9_audio_gen":
            voice_output = outputs.get("s7_voice_recommend", {})
            # S7 returns "suggested" not "voiceId"
            voice_id = voice_output.get("suggested", voice_output.get("voiceId", "Aoede"))
            script_output = outputs.get("s4_script_gen", {})
            raw_scripts = script_output.get("scripts", [])
            # S4 returns variants dict per script; flatten to scriptText for TTS
            scripts_list = []
            for s in raw_scripts:
                script = dict(s)
                if not script.get("scriptText") and isinstance(script.get("variants"), dict):
                    v = script["variants"]
                    script["scriptText"] = v.get("professional", v.get("academic", v.get("quick", "")))
                scripts_list.append(script)
            # S8 now returns scene/style/pacing; keep old aliases for stored sessions.
            raw_director = outputs.get("s8_director_note", {})
            if "directorNote" in raw_director:
                raw_director = raw_director["directorNote"]
            director_note = {
                "scene": raw_director.get("scene", raw_director.get("vocalEnvironment", "")),
                "style": raw_director.get("style", raw_director.get("mission", raw_director.get("missionOfSpeech", ""))),
                "pacing": raw_director.get("pacing", raw_director.get("pacingAndEnergy", "")),
            }
            session_id = f"pipeline-tts-{os.urandom(4).hex()}"
            return await self.generate_audio(
                session_id=session_id,
                scripts=scripts_list,
                voice_id=voice_id,
                languages=["en"],
                director_note=director_note,
                retry_tracker=retry_tracker,
            )

        # Other LLM steps
        return await self._run_llm_step(step_id, question, uploads, outputs, retry_tracker=retry_tracker)

    async def _run_llm_step(
        self,
        step_id: str,
        question: str | None,
        uploads: list[dict[str, Any]] | None,
        outputs: dict[str, Any],
        retry_tracker: dict[str, int] | None = None,
    ) -> Any:
        """Run an LLM step using the Gemini API via google-genai."""
        prompt_text = load_prompt(step_id)
        model = self._get_model_for_step(step_id)
        temperature = TEMPERATURES.get(step_id, 0.5)

        # Build the user message based on step dependencies
        user_message = self._build_user_message(step_id, question, uploads, outputs)

        # Call Gemini via the genai client (with retry for rate limits)
        runtime_context = outputs.get("_runtime", {})
        session_id = runtime_context.get("sessionId") if isinstance(runtime_context, dict) else None
        run_id = runtime_context.get("runId") if isinstance(runtime_context, dict) else None
        correlation_id = runtime_context.get("correlationId") if isinstance(runtime_context, dict) else None
        tenant_id = runtime_context.get("tenantId") if isinstance(runtime_context, dict) else None
        actor_id = runtime_context.get("actorId") if isinstance(runtime_context, dict) else None
        tracker = retry_tracker
        if tracker is None and isinstance(runtime_context, dict):
            candidate = runtime_context.get("stepRetryStats")
            if isinstance(candidate, dict):
                tracker = candidate
        response = await _retry_generate_content(
            self._client,
            timeout_seconds=self._get_step_timeout_seconds(step_id),
            retry_context={
                "operation": "pipeline_step",
                "step_id": step_id,
                "session_id": session_id,
                "run_id": run_id,
                "correlation_id": correlation_id,
                "tenant_id": tenant_id,
                "actor_id": actor_id,
            },
            retry_tracker=tracker,
            model=model,
            contents=user_message,
            config=genai.types.GenerateContentConfig(
                system_instruction=prompt_text,
                temperature=temperature,
            ),
        )

        # Extract text response
        text = response.text if response.text else ""

        # Try to parse as JSON
        try:
            # Strip markdown code fences if present
            clean = text.strip()
            if clean.startswith("```"):
                clean = clean.split("\n", 1)[1] if "\n" in clean else clean[3:]
                if clean.endswith("```"):
                    clean = clean[:-3]
                clean = clean.strip()
            parsed = json.loads(clean)

            # Attach usage metadata
            if hasattr(response, "usage_metadata") and response.usage_metadata:
                parsed["_meta"] = {
                    "type": "llm",
                    "model": model,
                    "usage": {
                        "input_tokens": getattr(response.usage_metadata, "prompt_token_count", 0),
                        "output_tokens": getattr(response.usage_metadata, "candidates_token_count", 0),
                        "total_tokens": getattr(response.usage_metadata, "total_token_count", 0),
                    },
                }
            return parsed

        except (json.JSONDecodeError, ValueError):
            # Return raw text with metadata
            result: dict[str, Any] = {"_content": text}
            if hasattr(response, "usage_metadata") and response.usage_metadata:
                result["_meta"] = {
                    "type": "llm",
                    "model": model,
                    "usage": {
                        "input_tokens": getattr(response.usage_metadata, "prompt_token_count", 0),
                        "output_tokens": getattr(response.usage_metadata, "candidates_token_count", 0),
                        "total_tokens": getattr(response.usage_metadata, "total_token_count", 0),
                    },
                }
            return result

    def _get_model_for_step(self, step_id: str) -> str:
        """Return the appropriate model for a given step."""
        if step_id == "s9_audio_gen":
            return MODELS["tts"]
        # Use Flash for all steps (Pro has much tighter rate limits at Tier 1)
        return MODELS["flash"]

    def _build_user_message(
        self,
        step_id: str,
        question: str | None,
        uploads: list[dict[str, Any]] | None,
        outputs: dict[str, Any],
    ) -> str | list:
        """Build the user message for an LLM step based on its upstream dependencies."""
        if step_id == "s2_ocr_parse":
            return self._build_ocr_message(question, uploads)

        if step_id == "s1_metadata_extract":
            ocr_output = outputs.get("s2_ocr_parse", {})
            ocr_text = ocr_output.get("_content", json.dumps(ocr_output, ensure_ascii=False))
            ctx = outputs.get("_context", {})
            core_lang = ctx.get("coreLanguage", "en")
            return (
                f"Extract structured metadata from the following parsed document text. "
                f"Write all text fields (title, description, etc.) in {core_lang} (the venue's core language). "
                f"Return ONLY valid JSON:\n\n{ocr_text}"
            )

        if step_id == "s4_script_gen":
            metadata = outputs.get("s1_metadata_extract", {})
            ctx = outputs.get("_context", {})
            core_lang = ctx.get("coreLanguage", "en")
            return (
                f"Generate audio guide scripts for all spots in the following approved metadata. "
                f"Write ALL scripts in {core_lang} (the venue's core language). "
                f"Create all 5 audience variants (kids, academic, quick, professional, brief) for each spot. "
                f"Return ONLY valid JSON:\n\n{json.dumps(metadata, ensure_ascii=False)}"
            )

        if step_id == "s5_image_map":
            scripts = outputs.get("s4_script_gen", {})
            return f"Assign images to spots based on the following scripts and available assets. Return ONLY valid JSON:\n\n{json.dumps(scripts, ensure_ascii=False)}"

        if step_id == "s6_translation":
            scripts = outputs.get("s4_script_gen", {})
            # Read target languages from entity config (session context)
            ctx = outputs.get("_context", {})
            target_langs = ctx.get("supportedLanguages", ["en"])
            core_lang = ctx.get("coreLanguage", "ja")
            # Ensure the core language is included in the list
            if core_lang not in target_langs:
                target_langs = [core_lang] + list(target_langs)
            lang_list_str = ", ".join(target_langs)
            return (
                f"Translate the following approved scripts into EXACTLY these target languages: {lang_list_str}.\n"
                f"Use the 'professional' variant as the base text. "
                f"Return ONLY valid JSON.\n\n{json.dumps(scripts, ensure_ascii=False)}"
            )

        if step_id == "s7_voice_recommend":
            char_output = outputs.get("n5_character_select", {})
            # Include the character ID so the LLM considers it when recommending a voice
            character_id = char_output.get("characterId")
            context_payload = dict(char_output)
            if character_id:
                context_payload["selectedCharacterId"] = character_id
            return f"Based on the selected character and content context below, recommend the best TTS voice. Return ONLY valid JSON:\n\n{json.dumps(context_payload, ensure_ascii=False)}"

        if step_id == "s8_director_note":
            voice_output = outputs.get("s7_voice_recommend", {})
            return f"Generate a director's note for the audio guide production based on this context. Consider the character, voice, and content type:\n\n{json.dumps(voice_output, ensure_ascii=False)}"

        return question or ""

    def _build_ocr_message(
        self,
        question: str | None,
        uploads: list[dict[str, Any]] | None,
    ) -> str | list:
        """
        Build a multimodal content list for OCR parsing.
        If uploads contain base64 file data, send them inline to Gemini
        so it can actually read the PDF/image content.
        """
        text_part = (
            "Please extract and parse ALL text content from the uploaded document(s). "
            "Organise by exhibit/item number and include all metadata fields you can identify. "
            "Return the extracted text faithfully — do NOT invent or hallucinate content.\n\n"
            f"{question or ''}"
        )

        if not uploads:
            return text_part

        # Build multimodal parts: inline file data + text instruction
        parts: list[Any] = []

        for upload in uploads:
            data_uri = upload.get("data", "")
            mime = upload.get("mime", "application/pdf")
            name = upload.get("name", "file")

            if data_uri and data_uri.startswith("data:"):
                # Parse data URI: "data:<mime>;base64,<b64data>"
                try:
                    header, b64data = data_uri.split(",", 1)
                    # Extract mime from header if present
                    if ";base64" in header:
                        mime_from_header = header.split(":", 1)[1].split(";", 1)[0]
                        if mime_from_header:
                            mime = mime_from_header
                    file_bytes = base64.b64decode(b64data)
                    parts.append(
                        genai.types.Part.from_bytes(data=file_bytes, mime_type=mime)
                    )
                    logger.info(f"Attached inline file: {name} ({mime}, {len(file_bytes)} bytes)")
                except Exception as e:
                    logger.warning(f"Failed to decode upload {name}: {e}")
                    parts.append(f"[File: {name} — could not decode]")
            else:
                # No inline data — just mention the file name
                parts.append(f"[File: {name} — no inline data available]")

        # Text instruction comes after the file parts so the model sees the document first
        parts.append(text_part)

        return parts

    def _apply_structured_feedback(
        self,
        session_id: str,
        checkpoint_id: str,
        feedback: dict[str, Any],
    ) -> None:
        """
        Merge human-edited data from structured gate feedback into session outputs.

        For example, HG3 (Script Review) feedback may contain editedScripts with
        user-corrected scriptText. These corrections are merged into the s4_script_gen
        output so that downstream steps (S6 Translation, S9 Audio Gen) use the
        human-corrected text instead of the original AI output.
        """
        updates: dict[str, Any] = {}

        if checkpoint_id == "hg1_data_review":
            # Merge edited spots into s1_metadata_extract
            if "spots" in feedback:
                updates["outputs.s1_metadata_extract"] = {"spots": feedback["spots"]}

        elif checkpoint_id == "hg3_script_review":
            # Merge edited scripts into s4_script_gen
            edited = feedback.get("editedScripts")
            if isinstance(edited, list) and edited:
                # Reload current s4 output and patch scriptText per spot
                session = session_service.get_session(session_id)
                s4_output = (session or {}).get("outputs", {}).get("s4_script_gen", {})
                scripts = s4_output.get("scripts", [])
                edits_by_spot = {e["spotId"]: e for e in edited if isinstance(e, dict) and "spotId" in e}
                for script in scripts:
                    sid = script.get("spotId", "")
                    if sid in edits_by_spot:
                        edit = edits_by_spot[sid]
                        if "scriptText" in edit:
                            script["scriptText"] = edit["scriptText"]
                        # If backend uses variants, also update the professional variant
                        if isinstance(script.get("variants"), dict) and "scriptText" in edit:
                            script["variants"]["professional"] = edit["scriptText"]
                s4_output["scripts"] = scripts
                updates["outputs.s4_script_gen"] = s4_output

        elif checkpoint_id == "hg4_translation_review":
            # Merge edited translations into s6_translation
            edited_translations = feedback.get("editedTranslations")
            if isinstance(edited_translations, list) and edited_translations:
                session = session_service.get_session(session_id)
                s6_output = (session or {}).get("outputs", {}).get("s6_translation", {})
                raw_translations = s6_output.get("translations", [])
                # Frontend sends language-first: [{lang, spots: [{spotId, translatedText}]}]
                # Backend stores spot-first: [{spotId, translations: {lang: text}}]
                if raw_translations and isinstance(raw_translations[0].get("translations"), dict):
                    # Spot-first format — apply edits
                    for lang_edit in edited_translations:
                        lang = lang_edit.get("lang", "")
                        for spot_edit in lang_edit.get("spots", []):
                            spot_id = spot_edit.get("spotId", "")
                            new_text = spot_edit.get("translatedText", "")
                            for item in raw_translations:
                                if item.get("spotId") == spot_id:
                                    trans = item.get("translations", {})
                                    if lang in trans:
                                        trans[lang] = new_text
                    s6_output["translations"] = raw_translations
                    updates["outputs.s6_translation"] = s6_output

        elif checkpoint_id == "hg5_audio_review":
            # Store audio review feedback (character preferences, pronunciation markers)
            if "characterId" in feedback or "voiceId" in feedback or "directorNote" in feedback:
                updates[f"outputs.{checkpoint_id}_preferences"] = {
                    "characterId": feedback.get("characterId"),
                    "voiceId": feedback.get("voiceId"),
                    "directorNote": feedback.get("directorNote"),
                    "pronunciationMarkers": feedback.get("pronunciationMarkers", []),
                }

        if updates:
            session_service.update_session(session_id, updates)

    def _find_stage_start(self, gate_index: int) -> int:
        """Find the first step index for the stage containing the given gate."""
        # Walk backwards from the gate to find the previous gate (or start)
        for i in range(gate_index - 1, -1, -1):
            if PIPELINE_STEPS[i] in HUMAN_GATES:
                return i + 1  # Start after the previous gate
        return 0  # Start of pipeline

    def _build_response(self, session_id: str, session: dict[str, Any]) -> dict[str, Any]:
        """Build the API response from session state."""
        steps = session.get("steps", [])
        status = session.get("status", "running")
        checkpoint_id = session.get("checkpoint_id")

        # Map steps to response format
        response_steps = []
        for step in steps:
            response_steps.append({
                "stepId": step["step_id"],
                "label": step.get("label", STEP_LABELS.get(step["step_id"], step["step_id"])),
                "status": step.get("status", "FINISHED"),
                "output": step.get("output"),
            })

        return {
            "apiVersion": "v1",
            "sessionId": session_id,
            "checkpointId": checkpoint_id,
            "steps": response_steps,
            "finalText": session.get("final_text"),
            "status": status,
        }
