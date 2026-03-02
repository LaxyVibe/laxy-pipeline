# ---------------------------------------------------------------------------
# Firebase Functions — ADK Pipeline HTTP Endpoints
# ---------------------------------------------------------------------------
"""
Exposes the ADK pipeline as Firebase Functions (2nd gen) HTTP endpoints.

Endpoints:
  POST /pipeline-start   — Start a new pipeline run
  POST /pipeline-resume  — Resume from a human gate checkpoint
  GET  /pipeline-status   — Get current pipeline state
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import traceback

from firebase_functions import https_fn, options

from agents.pipeline_agent import PipelineExecutor

logger = logging.getLogger(__name__)

# Shared executor instance
_executor: PipelineExecutor | None = None


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
    memory=options.MemoryOption.MB_512,
    timeout_sec=540,
    region="us-central1",
    cors=options.CorsOptions(cors_origins="*", cors_methods=["GET", "POST"]),
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
        loop = asyncio.new_event_loop()
        result = loop.run_until_complete(
            executor.start(session_id, question, uploads=uploads, context=context)
        )
        loop.close()
        return _json_response(result)
    except Exception as e:
        logger.error(f"pipeline_start error: {e}\n{traceback.format_exc()}")
        return _error_response(f"Pipeline start failed: {str(e)}", 500)


@https_fn.on_request(
    memory=options.MemoryOption.MB_512,
    timeout_sec=540,
    region="us-central1",
    cors=options.CorsOptions(cors_origins="*", cors_methods=["GET", "POST"]),
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
        loop = asyncio.new_event_loop()
        result = loop.run_until_complete(
            executor.resume(session_id, checkpoint_id, action, feedback=feedback)
        )
        loop.close()
        return _json_response(result)
    except ValueError as e:
        return _error_response(str(e), 404)
    except Exception as e:
        logger.error(f"pipeline_resume error: {e}\n{traceback.format_exc()}")
        return _error_response(f"Pipeline resume failed: {str(e)}", 500)


@https_fn.on_request(
    memory=options.MemoryOption.MB_256,
    timeout_sec=60,
    region="us-central1",
    cors=options.CorsOptions(cors_origins="*", cors_methods=["GET", "POST"]),
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
        loop = asyncio.new_event_loop()
        result = loop.run_until_complete(executor.get_status(session_id))
        loop.close()
        return _json_response(result)
    except ValueError as e:
        return _error_response(str(e), 404)
    except Exception as e:
        logger.error(f"pipeline_status error: {e}\n{traceback.format_exc()}")
        return _error_response(f"Pipeline status failed: {str(e)}", 500)
