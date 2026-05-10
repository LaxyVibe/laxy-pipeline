# ---------------------------------------------------------------------------
# Firestore Session Service for ADK pipeline
# ---------------------------------------------------------------------------
"""
Configures ADK session persistence using Firestore.

Sessions are stored under `pipeline_sessions/{session_id}` and contain:
- Current pipeline position (active step)
- All intermediate outputs from completed steps
- The checkpoint_id when paused at a human gate
- File uploads metadata
"""
from __future__ import annotations

import hashlib
from typing import Any

import firebase_admin
from firebase_admin import credentials, firestore

# Initialise Firebase Admin SDK (uses ADC in Cloud Functions)
if not firebase_admin._apps:
    firebase_admin.initialize_app()

db = firestore.client()

SESSIONS_COLLECTION = "pipeline_sessions"
PUBLISH_JOBS_COLLECTION = "publish_jobs"
IDEMPOTENCY_COLLECTION = "pipeline_idempotency_requests"


def get_session(session_id: str) -> dict[str, Any] | None:
    """Load a pipeline session from Firestore."""
    doc = db.collection(SESSIONS_COLLECTION).document(session_id).get()
    if doc.exists:
        return doc.to_dict()
    return None


def create_session(session_id: str, initial_data: dict[str, Any] | None = None) -> dict[str, Any]:
    """Create a new pipeline session in Firestore."""
    data = {
        "session_id": session_id,
        "status": "running",
        "current_step": None,
        "checkpoint_id": None,
        "steps": [],
        "outputs": {},
        "step_attempts": {},
        "created_at": firestore.SERVER_TIMESTAMP,
        "updated_at": firestore.SERVER_TIMESTAMP,
        **(initial_data or {}),
    }
    db.collection(SESSIONS_COLLECTION).document(session_id).set(data)
    return data


def update_session(session_id: str, updates: dict[str, Any]) -> None:
    """Update an existing pipeline session."""
    updates["updated_at"] = firestore.SERVER_TIMESTAMP
    db.collection(SESSIONS_COLLECTION).document(session_id).update(updates)


def append_step(session_id: str, step: dict[str, Any]) -> None:
    """Append a completed step to the session's step list."""
    db.collection(SESSIONS_COLLECTION).document(session_id).update({
        "steps": firestore.ArrayUnion([step]),
        f"outputs.{step['step_id']}": step.get("output"),
        "current_step": step["step_id"],
        "updated_at": firestore.SERVER_TIMESTAMP,
    })


def set_checkpoint(session_id: str, checkpoint_id: str) -> None:
    """Mark the session as paused at a human gate checkpoint."""
    update_session(session_id, {
        "status": "awaiting_input",
        "checkpoint_id": checkpoint_id,
    })


def clear_checkpoint(session_id: str) -> None:
    """Clear the checkpoint after human gate approval/rejection."""
    update_session(session_id, {
        "status": "running",
        "checkpoint_id": None,
    })


def complete_session(session_id: str) -> None:
    """Mark the session as completed."""
    update_session(session_id, {
        "status": "completed",
    })


def next_step_attempt(session_id: str, step_id: str) -> int:
    """Increment and return the attempt number for a pipeline step."""
    session = get_session(session_id)
    if not session:
        raise ValueError(f"Session not found: {session_id}")

    step_attempts = session.get("step_attempts", {})
    historical_attempts = sum(1 for step in session.get("steps", []) if step.get("step_id") == step_id)
    baseline = max(int(step_attempts.get(step_id, 0)), historical_attempts)
    current = baseline + 1
    update_session(session_id, {
        f"step_attempts.{step_id}": current,
    })
    return current


def _idempotency_doc_id(session_id: str, operation: str, idempotency_key: str) -> str:
    raw = f"{session_id}:{operation}:{idempotency_key}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def get_idempotency_request(
    session_id: str,
    operation: str,
    idempotency_key: str,
) -> dict[str, Any] | None:
    """Load idempotency request record for a session operation."""
    doc_id = _idempotency_doc_id(session_id, operation, idempotency_key)
    doc = db.collection(IDEMPOTENCY_COLLECTION).document(doc_id).get()
    if doc.exists:
        return doc.to_dict()
    return None


def upsert_idempotency_request(
    session_id: str,
    operation: str,
    idempotency_key: str,
    record: dict[str, Any],
) -> None:
    """Create or update an idempotency request record."""
    doc_id = _idempotency_doc_id(session_id, operation, idempotency_key)
    data = {
        "session_id": session_id,
        "operation": operation,
        "idempotency_key": idempotency_key,
        "updated_at": firestore.SERVER_TIMESTAMP,
        **record,
    }
    if "created_at" not in record:
        data["created_at"] = firestore.SERVER_TIMESTAMP

    db.collection(IDEMPOTENCY_COLLECTION).document(doc_id).set(data, merge=True)


def get_publish_job(publish_id: str) -> dict[str, Any] | None:
    """Load a publish job document from Firestore."""
    doc = db.collection(PUBLISH_JOBS_COLLECTION).document(publish_id).get()
    if doc.exists:
        return doc.to_dict()
    return None


def create_publish_job(publish_id: str, initial_data: dict[str, Any]) -> dict[str, Any]:
    """Create a publish job document in Firestore."""
    data = {
        "publish_id": publish_id,
        "created_at": firestore.SERVER_TIMESTAMP,
        "updated_at": firestore.SERVER_TIMESTAMP,
        **initial_data,
    }
    db.collection(PUBLISH_JOBS_COLLECTION).document(publish_id).set(data)
    return data


def update_publish_job(publish_id: str, updates: dict[str, Any]) -> None:
    """Update a publish job document in Firestore."""
    updates["updated_at"] = firestore.SERVER_TIMESTAMP
    db.collection(PUBLISH_JOBS_COLLECTION).document(publish_id).update(updates)
