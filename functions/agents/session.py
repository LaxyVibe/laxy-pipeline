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

import os
from typing import Any

import firebase_admin
from firebase_admin import credentials, firestore

# Initialise Firebase Admin SDK (uses ADC in Cloud Functions)
if not firebase_admin._apps:
    firebase_admin.initialize_app()

db = firestore.client()

SESSIONS_COLLECTION = "pipeline_sessions"


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
