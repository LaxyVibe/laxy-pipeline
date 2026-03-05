# ---------------------------------------------------------------------------
# Firebase Functions — ADK Pipeline HTTP Endpoints
# ---------------------------------------------------------------------------
"""
Exposes the ADK pipeline as Firebase Functions (2nd gen) HTTP endpoints.

Endpoints:
  POST /pipeline-start            — Start a new pipeline run
  POST /pipeline-resume           — Resume from a human gate checkpoint
  GET  /pipeline-status           — Get current pipeline state
  POST /pipeline-audio_generate   — Generate TTS audio for scripts (all languages)
  POST /pipeline-audio_generate_language — Generate TTS audio for a single language
  POST /pipeline-translate_language — Translate scripts into a single language
"""
from __future__ import annotations

import asyncio
import concurrent.futures
import json
import logging
import os
import traceback

# Workaround for macOS fork-safety crash in Python (SIGKILL in ObjC runtime)
os.environ.setdefault("OBJC_DISABLE_INITIALIZE_FORK_SAFETY", "YES")

from firebase_functions import https_fn, options

from agents.pipeline_agent import PipelineExecutor

logger = logging.getLogger(__name__)

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
            location=os.environ.get("GCP_REGION", "us-central1"),
        )
    return _executor


def _cors_headers() -> dict[str, str]:
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
    }


def _json_response(data: dict, status: int = 200) -> https_fn.Response:
    return https_fn.Response(
        json.dumps(data, ensure_ascii=False, default=str),
        status=status,
        headers={**_cors_headers(), "Content-Type": "application/json"},
    )


def _error_response(message: str, status: int = 400) -> https_fn.Response:
    return _json_response({"error": message}, status=status)


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

    if req.method != "POST":
        return _error_response("Method not allowed", 405)

    try:
        body = req.get_json(silent=True) or {}
    except Exception:
        return _error_response("Invalid JSON body")

    question = body.get("question", "")
    session_id = body.get("sessionId")
    uploads = body.get("uploads")
    context = body.get("context")

    if not session_id:
        return _error_response("sessionId is required")

    try:
        executor = get_executor()
        result = _run_async(
            executor.start(session_id, question, uploads=uploads, context=context)
        )
        return _json_response(result)
    except Exception as e:
        logger.error(f"pipeline_start error: {e}\n{traceback.format_exc()}")
        return _error_response(f"Pipeline start failed: {str(e)}", 500)


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
        "feedback": "Looks good, proceed"
    }
    """
    if req.method == "OPTIONS":
        return https_fn.Response("", status=204, headers=_cors_headers())

    if req.method != "POST":
        return _error_response("Method not allowed", 405)

    try:
        body = req.get_json(silent=True) or {}
    except Exception:
        return _error_response("Invalid JSON body")

    session_id = body.get("sessionId")
    checkpoint_id = body.get("checkpointId")
    action = body.get("action")
    feedback = body.get("feedback")

    if not session_id:
        return _error_response("sessionId is required")
    if not checkpoint_id:
        return _error_response("checkpointId is required")
    if action not in ("approve", "reject"):
        return _error_response("action must be 'approve' or 'reject'")

    try:
        executor = get_executor()
        result = _run_async(
            executor.resume(session_id, checkpoint_id, action, feedback=feedback)
        )
        return _json_response(result)
    except ValueError as e:
        return _error_response(str(e), 404)
    except Exception as e:
        logger.error(f"pipeline_resume error: {e}\n{traceback.format_exc()}")
        return _error_response(f"Pipeline resume failed: {str(e)}", 500)


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

    session_id = req.args.get("sessionId")
    if not session_id:
        return _error_response("sessionId query param is required")

    try:
        executor = get_executor()
        result = _run_async(executor.get_status(session_id))
        return _json_response(result)
    except ValueError as e:
        return _error_response(str(e), 404)
    except Exception as e:
        logger.error(f"pipeline_status error: {e}\n{traceback.format_exc()}")
        return _error_response(f"Pipeline status failed: {str(e)}", 500)


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
        "directorNote": { "vocalEnvironment": "", "mission": "", "pacing": "" }
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

    if req.method != "POST":
        return _error_response("Method not allowed", 405)

    try:
        body = req.get_json(silent=True) or {}
    except Exception:
        return _error_response("Invalid JSON body")

    session_id = body.get("sessionId")
    scripts = body.get("scripts")
    voice_id = body.get("voiceId", "Aoede")
    languages = body.get("languages", ["en"])
    director_note = body.get("directorNote")
    translations = body.get("translations")  # per-language translated texts

    if not session_id:
        return _error_response("sessionId is required")
    if not scripts or not isinstance(scripts, list):
        return _error_response("scripts array is required")

    try:
        executor = get_executor()
        result = _run_async(
            executor.generate_audio(
                session_id=session_id,
                scripts=scripts,
                voice_id=voice_id,
                languages=languages,
                director_note=director_note,
                translations=translations,
            )
        )
        return _json_response(result)
    except Exception as e:
        logger.error(f"audio_generate error: {e}\n{traceback.format_exc()}")
        return _error_response(f"Audio generation failed: {str(e)}", 500)


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

    if req.method != "POST":
        return _error_response("Method not allowed", 405)

    try:
        body = req.get_json(silent=True) or {}
    except Exception:
        return _error_response("Invalid JSON body")

    session_id = body.get("sessionId")
    scripts = body.get("scripts")
    voice_id = body.get("voiceId", "Aoede")
    language = body.get("language")
    director_note = body.get("directorNote")
    lang_translations = body.get("translations")  # [{spotId, translatedText}]

    if not session_id:
        return _error_response("sessionId is required")
    if not scripts or not isinstance(scripts, list):
        return _error_response("scripts array is required")
    if not language:
        return _error_response("language is required")

    try:
        executor = get_executor()
        result = _run_async(
            executor.generate_audio_for_language(
                session_id=session_id,
                scripts=scripts,
                voice_id=voice_id,
                language=language,
                director_note=director_note,
                translations=lang_translations,
            )
        )
        return _json_response(result)
    except Exception as e:
        logger.error(f"audio_generate_language error: {e}\n{traceback.format_exc()}")
        return _error_response(f"Audio generation failed: {str(e)}", 500)


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

    if req.method != "POST":
        return _error_response("Method not allowed", 405)

    try:
        body = req.get_json(silent=True) or {}
    except Exception:
        return _error_response("Invalid JSON body")

    scripts = body.get("scripts")
    target_language = body.get("targetLanguage")
    core_language = body.get("coreLanguage")

    if not scripts or not isinstance(scripts, list):
        return _error_response("scripts array is required")
    if not target_language:
        return _error_response("targetLanguage is required")
    if not core_language:
        return _error_response("coreLanguage is required")

    try:
        executor = get_executor()
        result = _run_async(
            executor.translate_language(
                scripts=scripts,
                target_language=target_language,
                core_language=core_language,
            )
        )
        return _json_response(result)
    except Exception as e:
        logger.error(f"translate_language error: {e}\n{traceback.format_exc()}")
        return _error_response(f"Translation failed: {str(e)}", 500)
