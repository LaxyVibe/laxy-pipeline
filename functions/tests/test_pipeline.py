# ---------------------------------------------------------------------------
# Tests for PipelineExecutor (pipeline_agent.py)
# ---------------------------------------------------------------------------
"""
Unit tests for the pipeline orchestration logic.

All Firestore (session service) and LLM (genai) calls are mocked so
these tests exercise the control flow:
  - step sequencing
  - human gate pausing
  - approve / reject resume logic
  - error handling
  - response building
"""
from __future__ import annotations

import json
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# We need to mock firebase_admin BEFORE importing session (which initialises it)
import sys

# Create a fake firebase_admin module tree
_mock_firebase_admin = MagicMock()
_mock_firebase_admin._apps = {"[DEFAULT]": True}  # pretend already initialised
_mock_firestore = MagicMock()
_mock_firebase_admin.firestore = _mock_firestore
sys.modules.setdefault("firebase_admin", _mock_firebase_admin)
sys.modules.setdefault("firebase_admin.credentials", MagicMock())
sys.modules.setdefault("firebase_admin.firestore", _mock_firestore)
sys.modules.setdefault("firebase_admin.storage", MagicMock())

# Now also mock the genai client so we don't need real credentials
_mock_google = MagicMock()
_mock_genai = MagicMock()
_mock_google.genai = _mock_genai
for mod_name, mod_mock in [
    ("google", _mock_google),
    ("google.genai", _mock_genai),
    ("google.genai.types", MagicMock()),
    ("google.adk", MagicMock()),
    ("google.adk.agents", MagicMock()),
    ("google.adk.runners", MagicMock()),
    ("google.adk.sessions", MagicMock()),
]:
    sys.modules[mod_name] = sys.modules.get(mod_name, mod_mock)

# Now import the code under test
from agents import audio_alignment  # noqa: E402
from agents.pipeline_agent import (  # noqa: E402
    HUMAN_GATES,
    PIPELINE_STEPS,
    STEP_LABELS,
    PipelineExecutor,
    SessionAlreadyExistsError,
)


# ── Fixtures ──────────────────────────────────────────────────────────────

def _make_in_memory_sessions() -> dict[str, dict[str, Any]]:
    """Simple in-memory session store for testing."""
    return {}


def _make_mock_session_service(store: dict[str, dict[str, Any]]):
    """Create mock functions that back onto a dict store."""
    idempotency_store: dict[str, dict[str, Any]] = {}

    def _idp_key(session_id: str, operation: str, idempotency_key: str) -> str:
        return f"{session_id}:{operation}:{idempotency_key}"

    def get_session(sid: str):
        return store.get(sid)

    def create_session(sid: str, data=None):
        session = {
            "session_id": sid,
            "status": "running",
            "current_step": None,
            "checkpoint_id": None,
            "steps": [],
            "outputs": {},
            "step_attempts": {},
            **(data or {}),
        }
        store[sid] = session
        return session

    def update_session(sid: str, updates: dict):
        sess = store[sid]
        for k, v in updates.items():
            if k == "updated_at":
                continue
            if "." in k:
                parts = k.split(".", 1)
                sess.setdefault(parts[0], {})[parts[1]] = v
            else:
                sess[k] = v

    def append_step(sid: str, step: dict):
        sess = store[sid]
        sess["steps"].append(step)
        sess.setdefault("outputs", {})[step["step_id"]] = step.get("output")
        sess["current_step"] = step["step_id"]

    def next_step_attempt(sid: str, step_id: str) -> int:
        sess = store[sid]
        attempts = sess.setdefault("step_attempts", {})
        historical_attempts = sum(1 for step in sess.get("steps", []) if step.get("step_id") == step_id)
        baseline = max(int(attempts.get(step_id, 0)), historical_attempts)
        attempts[step_id] = baseline + 1
        return attempts[step_id]

    def get_idempotency_request(sid: str, operation: str, idempotency_key: str):
        return idempotency_store.get(_idp_key(sid, operation, idempotency_key))

    def upsert_idempotency_request(sid: str, operation: str, idempotency_key: str, record: dict):
        key = _idp_key(sid, operation, idempotency_key)
        existing = idempotency_store.get(key, {})
        idempotency_store[key] = {**existing, **record}

    def set_checkpoint(sid: str, cp: str):
        store[sid]["status"] = "awaiting_input"
        store[sid]["checkpoint_id"] = cp

    def clear_checkpoint(sid: str):
        store[sid]["status"] = "running"
        store[sid]["checkpoint_id"] = None

    def complete_session(sid: str):
        store[sid]["status"] = "completed"

    return MagicMock(
        get_session=MagicMock(side_effect=get_session),
        create_session=MagicMock(side_effect=create_session),
        update_session=MagicMock(side_effect=update_session),
        append_step=MagicMock(side_effect=append_step),
        next_step_attempt=MagicMock(side_effect=next_step_attempt),
        get_idempotency_request=MagicMock(side_effect=get_idempotency_request),
        upsert_idempotency_request=MagicMock(side_effect=upsert_idempotency_request),
        set_checkpoint=MagicMock(side_effect=set_checkpoint),
        clear_checkpoint=MagicMock(side_effect=clear_checkpoint),
        complete_session=MagicMock(side_effect=complete_session),
    )


@pytest.fixture
def executor():
    """Return a PipelineExecutor with a mocked genai client."""
    with patch("agents.pipeline_agent.genai") as mock_genai:
        mock_client = MagicMock()
        mock_genai.Client.return_value = mock_client
        mock_genai.types = MagicMock()
        ex = PipelineExecutor(project_id="test-project")
        ex._client = mock_client
        yield ex


@pytest.fixture
def session_store():
    return _make_in_memory_sessions()


@pytest.fixture
def mock_ss(session_store):
    return _make_mock_session_service(session_store)


GATE_SEQUENCE = [
    "hg1_data_review",
    "hg3_script_review",
    "hg4_translation_review",
    "hg5_audio_review",
]

GATE_STAGE_START = {
    "hg1_data_review": "s2_ocr_parse",
    "hg3_script_review": "s4_script_gen",
    "hg4_translation_review": "s6_translation",
    "hg5_audio_review": "n5_character_select",
}


def _make_llm_json_response(payload: str = '{"result": "ok"}') -> MagicMock:
    response = MagicMock()
    response.text = payload
    response.usage_metadata = None
    return response


async def _advance_to_gate(executor: PipelineExecutor, session_id: str, target_gate: str) -> dict[str, Any]:
    """Start a session then approve through gates until target_gate is reached."""
    result = await executor.start(session_id, "Describe this exhibit")
    if target_gate == "hg1_data_review":
        return result

    safety = 0
    while result.get("checkpointId") and result.get("checkpointId") != target_gate:
        checkpoint_id = result["checkpointId"]
        result = await executor.resume(
            session_id,
            checkpoint_id,
            "approve",
            feedback=f"advance-{checkpoint_id}",
        )
        safety += 1
        if safety > len(GATE_SEQUENCE) + 1:
            raise AssertionError("Failed to advance to target gate within expected steps")

    if result.get("checkpointId") != target_gate:
        raise AssertionError(
            f"Expected checkpoint {target_gate}, got {result.get('checkpointId')}"
        )
    return result


# ── Constants tests ───────────────────────────────────────────────────────


class TestPipelineConstants:
    def test_step_labels_cover_all_steps(self):
        for step_id in PIPELINE_STEPS:
            assert step_id in STEP_LABELS, f"Missing label for {step_id}"

    def test_human_gates_are_in_pipeline(self):
        for gate in HUMAN_GATES:
            assert gate in PIPELINE_STEPS, f"Gate {gate} not in PIPELINE_STEPS"

    def test_pipeline_ends_with_complete(self):
        assert PIPELINE_STEPS[-1] == "pipeline_complete"

    def test_four_human_gates(self):
        assert len(HUMAN_GATES) == 4

    def test_correct_gate_names(self):
        expected = {"hg1_data_review", "hg3_script_review", "hg4_translation_review", "hg5_audio_review"}
        assert HUMAN_GATES == expected


class TestAudioHistoryPersistence:
    def test_persist_audio_history_version_ignores_none_spot_title(self, executor):
        mock_db = MagicMock()
        mock_batch = MagicMock()
        mock_guide_ref = MagicMock()
        mock_summary_collection = MagicMock()
        mock_summary_ref = MagicMock()
        mock_version_collection = MagicMock()
        mock_version_ref = MagicMock()

        mock_db.batch.return_value = mock_batch
        mock_db.collection.return_value = mock_guide_ref
        mock_guide_ref.document.return_value = mock_guide_ref
        mock_guide_ref.collection.return_value = mock_summary_collection
        mock_summary_collection.document.return_value = mock_summary_ref
        mock_summary_ref.collection.return_value = mock_version_collection
        mock_version_collection.document.return_value = mock_version_ref

        with patch("agents.pipeline_agent.fb_firestore.client", return_value=mock_db):
            metadata = executor._persist_audio_history_version(
                history_target={
                    "guideId": "guide-1",
                    "spotId": "spot-1",
                    "spotTitle": None,
                    "lang": "en",
                },
                session_id="session-1",
                spot_id="spot-1",
                spot_number=1,
                title="Entrance Hall",
                script_text="Welcome in.",
                language="en",
                audio_url="https://example.com/audio.mp3",
                storage_path="audio/guide-1/spot-1/en/version.mp3",
                duration_ms=1200,
                voice_id="Aoede",
            )

        summary_payload = mock_batch.set.call_args_list[0].args[1]
        version_payload = mock_batch.set.call_args_list[1].args[1]

        assert summary_payload["spotTitle"] == "Entrance Hall"
        assert version_payload["spotTitle"] == "Entrance Hall"
        assert metadata["spotId"] == "spot-1"
        assert metadata["lang"] == "en"


# ── start() tests ─────────────────────────────────────────────────────────


class TestPipelineStart:
    @pytest.mark.asyncio
    async def test_start_stops_at_first_human_gate(self, executor, mock_ss):
        """Pipeline should execute S2, S1, then stop at HG1."""
        with patch("agents.pipeline_agent.session_service", mock_ss):
            # Mock LLM calls to return simple JSON
            mock_response = MagicMock()
            mock_response.text = '{"result": "ok"}'
            mock_response.usage_metadata = None
            executor._client.aio.models.generate_content = AsyncMock(return_value=mock_response)

            result = await executor.start("sess-1", "Describe this exhibit")

        assert result["sessionId"] == "sess-1"
        assert result["checkpointId"] == "hg1_data_review"
        assert result["status"] == "awaiting_input"

        # Should have exactly 3 steps: S2, S1, HG1
        step_ids = [s["stepId"] for s in result["steps"]]
        assert step_ids == ["s2_ocr_parse", "s1_metadata_extract", "hg1_data_review"]
        assert result["steps"][0]["status"] == "FINISHED"
        assert result["steps"][1]["status"] == "FINISHED"
        assert result["steps"][2]["status"] == "STOPPED"

    @pytest.mark.asyncio
    async def test_start_creates_session(self, executor, mock_ss):
        with patch("agents.pipeline_agent.session_service", mock_ss):
            mock_response = MagicMock()
            mock_response.text = '{"data": 1}'
            mock_response.usage_metadata = None
            executor._client.aio.models.generate_content = AsyncMock(return_value=mock_response)

            await executor.start("sess-2", "test")

        mock_ss.create_session.assert_called_once()
        assert mock_ss.create_session.call_args[0][0] == "sess-2"

    @pytest.mark.asyncio
    async def test_start_idempotency_key_replays_cached_response(self, executor, mock_ss):
        with patch("agents.pipeline_agent.session_service", mock_ss):
            mock_response = MagicMock()
            mock_response.text = '{"result": "ok"}'
            mock_response.usage_metadata = None
            executor._client.aio.models.generate_content = AsyncMock(return_value=mock_response)

            first = await executor.start("sess-idem", "Describe this exhibit", idempotency_key="start-key-1")
            first_calls = executor._client.aio.models.generate_content.await_count

            second = await executor.start("sess-idem", "Describe this exhibit", idempotency_key="start-key-1")

        assert second == first
        assert executor._client.aio.models.generate_content.await_count == first_calls

    @pytest.mark.asyncio
    async def test_start_existing_session_without_idempotency_raises(self, executor, session_store, mock_ss):
        session_store["sess-existing"] = {
            "session_id": "sess-existing",
            "status": "running",
            "checkpoint_id": None,
            "question": "existing",
            "uploads": None,
            "steps": [],
            "outputs": {},
            "current_step": None,
            "step_attempts": {},
        }

        with patch("agents.pipeline_agent.session_service", mock_ss):
            with pytest.raises(SessionAlreadyExistsError):
                await executor.start("sess-existing", "Describe this exhibit")


# ── resume() tests ────────────────────────────────────────────────────────


class TestPipelineResume:
    @pytest.mark.asyncio
    async def test_approve_continues_pipeline(self, executor, session_store, mock_ss):
        """Approving HG1 should continue with S4."""
        # Manually set up a session that's paused at HG1
        session_store["sess-r1"] = {
            "session_id": "sess-r1",
            "status": "awaiting_input",
            "checkpoint_id": "hg1_data_review",
            "question": "describe this",
            "uploads": None,
            "steps": [
                {"step_id": "s2_ocr_parse", "label": "S2", "status": "FINISHED", "output": {"_content": "ocr text"}},
                {"step_id": "s1_metadata_extract", "label": "S1", "status": "FINISHED", "output": {"spots": []}},
                {"step_id": "hg1_data_review", "label": "HG1", "status": "STOPPED", "output": None},
            ],
            "outputs": {
                "s2_ocr_parse": {"_content": "ocr text"},
                "s1_metadata_extract": {"spots": []},
            },
            "current_step": "hg1_data_review",
        }

        with patch("agents.pipeline_agent.session_service", mock_ss):
            mock_response = MagicMock()
            mock_response.text = '{"scripts": []}'
            mock_response.usage_metadata = None
            executor._client.aio.models.generate_content = AsyncMock(return_value=mock_response)

            result = await executor.resume("sess-r1", "hg1_data_review", "approve")

        # Should have progressed past HG1
        step_ids = [s["stepId"] for s in result["steps"]]
        assert "s4_script_gen" in step_ids

    @pytest.mark.asyncio
    async def test_resume_idempotency_key_replays_cached_response(self, executor, session_store, mock_ss):
        session_store["sess-r1-idem"] = {
            "session_id": "sess-r1-idem",
            "status": "awaiting_input",
            "checkpoint_id": "hg1_data_review",
            "question": "describe this",
            "uploads": None,
            "steps": [
                {"step_id": "s2_ocr_parse", "label": "S2", "status": "FINISHED", "output": {"_content": "ocr text"}},
                {"step_id": "s1_metadata_extract", "label": "S1", "status": "FINISHED", "output": {"spots": []}},
                {"step_id": "hg1_data_review", "label": "HG1", "status": "STOPPED", "output": None},
            ],
            "outputs": {
                "s2_ocr_parse": {"_content": "ocr text"},
                "s1_metadata_extract": {"spots": []},
            },
            "current_step": "hg1_data_review",
            "step_attempts": {},
        }

        with patch("agents.pipeline_agent.session_service", mock_ss):
            mock_response = MagicMock()
            mock_response.text = '{"scripts": []}'
            mock_response.usage_metadata = None
            executor._client.aio.models.generate_content = AsyncMock(return_value=mock_response)

            first = await executor.resume(
                "sess-r1-idem",
                "hg1_data_review",
                "approve",
                idempotency_key="resume-key-1",
            )
            first_calls = executor._client.aio.models.generate_content.await_count

            second = await executor.resume(
                "sess-r1-idem",
                "hg1_data_review",
                "approve",
                idempotency_key="resume-key-1",
            )

        assert second == first
        assert executor._client.aio.models.generate_content.await_count == first_calls

    @pytest.mark.asyncio
    async def test_reject_reruns_stage(self, executor, session_store, mock_ss):
        """Rejecting HG1 should re-run from the start (S2)."""
        session_store["sess-r2"] = {
            "session_id": "sess-r2",
            "status": "awaiting_input",
            "checkpoint_id": "hg1_data_review",
            "question": "describe this",
            "uploads": None,
            "steps": [
                {"step_id": "s2_ocr_parse", "label": "S2", "status": "FINISHED", "output": {"_content": "text"}},
                {"step_id": "s1_metadata_extract", "label": "S1", "status": "FINISHED", "output": {"spots": []}},
                {"step_id": "hg1_data_review", "label": "HG1", "status": "STOPPED", "output": None},
            ],
            "outputs": {
                "s2_ocr_parse": {"_content": "text"},
                "s1_metadata_extract": {"spots": []},
            },
            "current_step": "hg1_data_review",
        }

        with patch("agents.pipeline_agent.session_service", mock_ss):
            mock_response = MagicMock()
            mock_response.text = '{"rerun": true}'
            mock_response.usage_metadata = None
            executor._client.aio.models.generate_content = AsyncMock(return_value=mock_response)

            result = await executor.resume("sess-r2", "hg1_data_review", "reject", "Please fix OCR errors")

        # Should re-run from s2_ocr_parse (start of stage) and stop at HG1 again
        new_step_ids = [s["stepId"] for s in result["steps"]]
        # The session should have original 3 steps + re-run steps
        # At minimum, s2_ocr_parse should appear again
        count_s2 = new_step_ids.count("s2_ocr_parse")
        assert count_s2 >= 2, f"Expected s2_ocr_parse to run twice, got {count_s2}"
        assert session_store["sess-r2"].get("step_attempts", {}).get("s2_ocr_parse", 0) >= 2

    @pytest.mark.asyncio
    async def test_resume_unknown_session_raises(self, executor, mock_ss):
        with patch("agents.pipeline_agent.session_service", mock_ss):
            with pytest.raises(ValueError, match="Session not found"):
                await executor.resume("nonexistent", "hg1_data_review", "approve")

    @pytest.mark.asyncio
    async def test_resume_checkpoint_mismatch_raises(self, executor, session_store, mock_ss):
        session_store["sess-m"] = {
            "session_id": "sess-m",
            "status": "awaiting_input",
            "checkpoint_id": "hg1_data_review",
            "question": "",
            "uploads": None,
            "steps": [],
            "outputs": {},
        }
        with patch("agents.pipeline_agent.session_service", mock_ss):
            with pytest.raises(ValueError, match="Checkpoint mismatch"):
                await executor.resume("sess-m", "hg3_script_review", "approve")

    @pytest.mark.asyncio
    async def test_resume_unknown_action_raises(self, executor, session_store, mock_ss):
        session_store["sess-a"] = {
            "session_id": "sess-a",
            "status": "awaiting_input",
            "checkpoint_id": "hg1_data_review",
            "question": "",
            "uploads": None,
            "steps": [],
            "outputs": {},
        }
        with patch("agents.pipeline_agent.session_service", mock_ss):
            with pytest.raises(ValueError, match="Unknown action"):
                await executor.resume("sess-a", "hg1_data_review", "skip")


class TestHumanGateEndToEnd:
    @pytest.mark.asyncio
    async def test_approve_flow_visits_all_human_gates_in_order(self, executor, mock_ss):
        with patch("agents.pipeline_agent.session_service", mock_ss):
            executor._client.aio.models.generate_content = AsyncMock(
                return_value=_make_llm_json_response()
            )

            result = await executor.start("sess-e2e-approve", "Describe this exhibit")
            visited_gates: list[str] = []

            while result.get("checkpointId"):
                checkpoint_id = result["checkpointId"]
                visited_gates.append(checkpoint_id)
                result = await executor.resume(
                    "sess-e2e-approve",
                    checkpoint_id,
                    "approve",
                    feedback=f"approved-{checkpoint_id}",
                )

        assert visited_gates == GATE_SEQUENCE
        assert result["status"] == "completed"
        assert result["checkpointId"] is None
        step_ids = [step["stepId"] for step in result["steps"]]
        assert "pipeline_complete" in step_ids

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        "target_gate",
        ["hg1_data_review", "hg3_script_review", "hg4_translation_review", "hg5_audio_review"],
    )
    async def test_reject_replays_current_stage_for_each_gate(self, executor, mock_ss, target_gate: str):
        session_id = f"sess-e2e-reject-{target_gate}"
        with patch("agents.pipeline_agent.session_service", mock_ss):
            executor._client.aio.models.generate_content = AsyncMock(
                return_value=_make_llm_json_response()
            )

            await _advance_to_gate(executor, session_id, target_gate)
            result = await executor.resume(
                session_id,
                target_gate,
                "reject",
                feedback=f"needs-fix-{target_gate}",
            )

        assert result["status"] == "awaiting_input"
        assert result["checkpointId"] == target_gate
        step_ids = [step["stepId"] for step in result["steps"]]
        assert step_ids.count(GATE_STAGE_START[target_gate]) >= 2

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        "target_gate",
        ["hg1_data_review", "hg3_script_review", "hg4_translation_review", "hg5_audio_review"],
    )
    async def test_approve_idempotency_replays_response_for_each_gate(self, executor, mock_ss, target_gate: str):
        session_id = f"sess-e2e-retry-{target_gate}"
        idempotency_key = f"retry-{target_gate}"
        with patch("agents.pipeline_agent.session_service", mock_ss):
            executor._client.aio.models.generate_content = AsyncMock(
                return_value=_make_llm_json_response()
            )

            await _advance_to_gate(executor, session_id, target_gate)
            first = await executor.resume(
                session_id,
                target_gate,
                "approve",
                feedback=f"approve-{target_gate}",
                idempotency_key=idempotency_key,
            )
            calls_after_first = executor._client.aio.models.generate_content.await_count

            second = await executor.resume(
                session_id,
                target_gate,
                "approve",
                feedback=f"approve-{target_gate}",
                idempotency_key=idempotency_key,
            )

        assert second == first
        assert executor._client.aio.models.generate_content.await_count == calls_after_first


# ── get_status() tests ────────────────────────────────────────────────────


class TestPipelineStatus:
    @pytest.mark.asyncio
    async def test_get_status_returns_session_data(self, executor, session_store, mock_ss):
        session_store["sess-s"] = {
            "session_id": "sess-s",
            "status": "awaiting_input",
            "checkpoint_id": "hg1_data_review",
            "steps": [
                {"step_id": "s2_ocr_parse", "status": "FINISHED", "output": {}},
            ],
            "outputs": {},
        }
        with patch("agents.pipeline_agent.session_service", mock_ss):
            result = await executor.get_status("sess-s")

        assert result["sessionId"] == "sess-s"
        assert result["checkpointId"] == "hg1_data_review"
        assert len(result["steps"]) == 1

    @pytest.mark.asyncio
    async def test_get_status_unknown_session_raises(self, executor, mock_ss):
        with patch("agents.pipeline_agent.session_service", mock_ss):
            with pytest.raises(ValueError, match="Session not found"):
                await executor.get_status("nope")


# ── _find_stage_start() tests ────────────────────────────────────────────


class TestFindStageStart:
    def test_first_stage_returns_zero(self, executor):
        # HG1 is at index 2 → previous gate search finds nothing → return 0
        hg1_idx = PIPELINE_STEPS.index("hg1_data_review")
        assert executor._find_stage_start(hg1_idx) == 0

    def test_second_stage_returns_after_hg1(self, executor):
        hg3_idx = PIPELINE_STEPS.index("hg3_script_review")
        hg1_idx = PIPELINE_STEPS.index("hg1_data_review")
        assert executor._find_stage_start(hg3_idx) == hg1_idx + 1

    def test_third_stage_returns_after_hg3(self, executor):
        hg4_idx = PIPELINE_STEPS.index("hg4_translation_review")
        hg3_idx = PIPELINE_STEPS.index("hg3_script_review")
        assert executor._find_stage_start(hg4_idx) == hg3_idx + 1


# ── _build_response() tests ──────────────────────────────────────────────


class TestBuildResponse:
    def test_response_format(self, executor):
        session = {
            "status": "running",
            "checkpoint_id": None,
            "steps": [
                {"step_id": "s2_ocr_parse", "label": "S2: OCR Parse (Gemini)", "status": "FINISHED", "output": {"data": 1}},
            ],
            "final_text": None,
        }
        resp = executor._build_response("sid-1", session)
        assert resp["sessionId"] == "sid-1"
        assert resp["checkpointId"] is None
        assert resp["status"] == "running"
        assert len(resp["steps"]) == 1
        assert resp["steps"][0]["stepId"] == "s2_ocr_parse"
        assert resp["steps"][0]["output"] == {"data": 1}

    def test_response_with_checkpoint(self, executor):
        session = {
            "status": "awaiting_input",
            "checkpoint_id": "hg1_data_review",
            "steps": [],
        }
        resp = executor._build_response("sid-2", session)
        assert resp["checkpointId"] == "hg1_data_review"
        assert resp["status"] == "awaiting_input"


# ── _get_model_for_step() tests ──────────────────────────────────────────


class TestModelSelection:
    def test_flash_steps(self, executor):
        flash_steps = ["s2_ocr_parse", "s1_metadata_extract", "s5_image_map", "s7_voice_recommend", "s8_director_note"]
        for step in flash_steps:
            assert "flash" in executor._get_model_for_step(step).lower() or "2.0" in executor._get_model_for_step(step)

    def test_high_throughput_steps_use_flash(self, executor):
        high_throughput_steps = ["s4_script_gen", "s6_translation"]
        for step in high_throughput_steps:
            assert "flash" in executor._get_model_for_step(step).lower()

    def test_tts_step(self, executor):
        assert "tts" in executor._get_model_for_step("s9_audio_gen").lower()


# ── Error handling ────────────────────────────────────────────────────────


class TestErrorHandling:
    @pytest.mark.asyncio
    async def test_step_error_stops_pipeline(self, executor, mock_ss):
        """If an LLM step throws, the pipeline should stop with ERROR status."""
        with patch("agents.pipeline_agent.session_service", mock_ss):
            executor._client.aio.models.generate_content = AsyncMock(
                side_effect=RuntimeError("API quota exceeded")
            )

            result = await executor.start("sess-err", "test")

        # First step should be ERROR
        assert result["steps"][0]["status"] == "ERROR"
        assert "API quota exceeded" in str(result["steps"][0]["output"])
        assert result["status"] == "error"


# ── Structured feedback tests (Issue #10) ─────────────────────────────────


class TestStructuredFeedback:
    @pytest.mark.asyncio
    async def test_approve_with_structured_feedback_parses_json(self, executor, session_store, mock_ss):
        """Structured JSON feedback should be parsed and stored under 'structured' key."""
        session_store["sess-sf"] = {
            "session_id": "sess-sf",
            "status": "awaiting_input",
            "checkpoint_id": "hg1_data_review",
            "question": "describe this",
            "uploads": None,
            "steps": [
                {"step_id": "s2_ocr_parse", "label": "S2", "status": "FINISHED", "output": {"_content": "text"}},
                {"step_id": "s1_metadata_extract", "label": "S1", "status": "FINISHED", "output": {"spots": [{"id": "s1", "title": "Spot 1"}]}},
                {"step_id": "hg1_data_review", "label": "HG1", "status": "STOPPED", "output": None},
            ],
            "outputs": {
                "s2_ocr_parse": {"_content": "text"},
                "s1_metadata_extract": {"spots": [{"id": "s1", "title": "Spot 1"}]},
            },
            "current_step": "hg1_data_review",
        }

        feedback_payload = json.dumps({
            "spots": [{"id": "s1", "title": "Edited Spot 1"}],
        })

        with patch("agents.pipeline_agent.session_service", mock_ss):
            mock_response = MagicMock()
            mock_response.text = '{"scripts": []}'
            mock_response.usage_metadata = None
            executor._client.aio.models.generate_content = AsyncMock(return_value=mock_response)

            result = await executor.resume("sess-sf", "hg1_data_review", "approve", feedback_payload)

        # Verify the gate output contains structured data
        gate_output = session_store["sess-sf"]["outputs"].get("hg1_data_review", {})
        assert gate_output.get("action") == "approve"
        assert "structured" in gate_output
        assert gate_output["structured"]["spots"][0]["title"] == "Edited Spot 1"

    @pytest.mark.asyncio
    async def test_script_edit_feedback_merges_into_s4(self, executor, session_store, mock_ss):
        """HG3 structured feedback with editedScripts should update s4_script_gen output."""
        session_store["sess-se"] = {
            "session_id": "sess-se",
            "status": "awaiting_input",
            "checkpoint_id": "hg3_script_review",
            "question": "describe this",
            "uploads": None,
            "steps": [
                {"step_id": "s4_script_gen", "label": "S4", "status": "FINISHED", "output": {"scripts": [
                    {"spotId": "s1", "scriptText": "Original text", "variants": {"professional": "Original text"}},
                ]}},
                {"step_id": "hg3_script_review", "label": "HG3", "status": "STOPPED", "output": None},
            ],
            "outputs": {
                "s4_script_gen": {"scripts": [
                    {"spotId": "s1", "scriptText": "Original text", "variants": {"professional": "Original text"}},
                ]},
            },
            "current_step": "hg3_script_review",
        }

        feedback_payload = json.dumps({
            "editedScripts": [{"spotId": "s1", "scriptText": "Human-edited text"}],
        })

        with patch("agents.pipeline_agent.session_service", mock_ss):
            mock_response = MagicMock()
            mock_response.text = '{"translations": []}'
            mock_response.usage_metadata = None
            executor._client.aio.models.generate_content = AsyncMock(return_value=mock_response)

            result = await executor.resume("sess-se", "hg3_script_review", "approve", feedback_payload)

        # Verify s4_script_gen was updated with human edits
        s4_output = session_store["sess-se"]["outputs"]["s4_script_gen"]
        assert s4_output["scripts"][0]["scriptText"] == "Human-edited text"
        assert s4_output["scripts"][0]["variants"]["professional"] == "Human-edited text"

    @pytest.mark.asyncio
    async def test_plain_text_feedback_not_parsed(self, executor, session_store, mock_ss):
        """Plain text feedback should be stored as-is without crashing."""
        session_store["sess-pt"] = {
            "session_id": "sess-pt",
            "status": "awaiting_input",
            "checkpoint_id": "hg1_data_review",
            "question": "describe this",
            "uploads": None,
            "steps": [
                {"step_id": "s2_ocr_parse", "label": "S2", "status": "FINISHED", "output": {"_content": "text"}},
                {"step_id": "s1_metadata_extract", "label": "S1", "status": "FINISHED", "output": {"spots": []}},
                {"step_id": "hg1_data_review", "label": "HG1", "status": "STOPPED", "output": None},
            ],
            "outputs": {
                "s2_ocr_parse": {"_content": "text"},
                "s1_metadata_extract": {"spots": []},
            },
            "current_step": "hg1_data_review",
        }

        with patch("agents.pipeline_agent.session_service", mock_ss):
            mock_response = MagicMock()
            mock_response.text = '{"scripts": []}'
            mock_response.usage_metadata = None
            executor._client.aio.models.generate_content = AsyncMock(return_value=mock_response)

            # Should not raise even with plain text feedback
            result = await executor.resume("sess-pt", "hg1_data_review", "approve", "Looks good, proceed")

        gate_output = session_store["sess-pt"]["outputs"].get("hg1_data_review", {})
        assert gate_output.get("action") == "approve"
        assert gate_output.get("feedback") == "Looks good, proceed"
        assert "structured" not in gate_output


class TestCharacterPassthrough:
    """Issue #12: Character selection should be passed from session context to n5_character_select."""

    @pytest.mark.asyncio
    async def test_character_id_from_session_context(self, executor, session_store, mock_ss):
        """n5_character_select should use selectedCharacterId from session context."""
        session_store["sess-ch"] = {
            "session_id": "sess-ch",
            "status": "awaiting_input",
            "checkpoint_id": "hg4_translation_review",
            "question": "generate audio guide",
            "uploads": None,
            "context": {"selectedCharacterId": "char-storyteller"},
            "steps": [
                {"step_id": "s4_script_gen", "label": "S4", "status": "FINISHED",
                 "output": {"scripts": [{"spotId": "s1", "scriptText": "Hello"}]}},
                {"step_id": "s5_image_map", "label": "S5", "status": "FINISHED", "output": {}},
                {"step_id": "hg3_script_review", "label": "HG3", "status": "FINISHED", "output": None},
                {"step_id": "s6_translation", "label": "S6", "status": "FINISHED", "output": {"translations": []}},
                {"step_id": "hg4_translation_review", "label": "HG4", "status": "STOPPED", "output": None},
            ],
            "outputs": {
                "s1_metadata_extract": {"spots": [{"id": "s1", "title": "Spot 1"}]},
                "s4_script_gen": {"scripts": [{"spotId": "s1", "scriptText": "Hello"}]},
                "s6_translation": {"translations": []},
            },
            "current_step": "hg4_translation_review",
        }

        with patch("agents.pipeline_agent.session_service", mock_ss):
            mock_response = MagicMock()
            mock_response.text = '{"suggested": "Aoede", "all": []}'
            mock_response.usage_metadata = None
            executor._client.aio.models.generate_content = AsyncMock(return_value=mock_response)

            result = await executor.resume("sess-ch", "hg4_translation_review", "approve", "Fine")

        # Verify n5_character_select received the character ID from context
        n5_output = session_store["sess-ch"]["outputs"].get("n5_character_select", {})
        assert n5_output.get("characterId") == "char-storyteller"

    @pytest.mark.asyncio
    async def test_character_id_none_when_no_context(self, executor, session_store, mock_ss):
        """n5_character_select defaults to None when session has no context."""
        session_store["sess-nc"] = {
            "session_id": "sess-nc",
            "status": "awaiting_input",
            "checkpoint_id": "hg4_translation_review",
            "question": "generate audio guide",
            "uploads": None,
            "steps": [
                {"step_id": "s4_script_gen", "label": "S4", "status": "FINISHED",
                 "output": {"scripts": [{"spotId": "s1", "scriptText": "Hello"}]}},
                {"step_id": "s5_image_map", "label": "S5", "status": "FINISHED", "output": {}},
                {"step_id": "hg3_script_review", "label": "HG3", "status": "FINISHED", "output": None},
                {"step_id": "s6_translation", "label": "S6", "status": "FINISHED", "output": {"translations": []}},
                {"step_id": "hg4_translation_review", "label": "HG4", "status": "STOPPED", "output": None},
            ],
            "outputs": {
                "s1_metadata_extract": {"spots": [{"id": "s1", "title": "Spot 1"}]},
                "s4_script_gen": {"scripts": [{"spotId": "s1", "scriptText": "Hello"}]},
                "s6_translation": {"translations": []},
            },
            "current_step": "hg4_translation_review",
        }

        with patch("agents.pipeline_agent.session_service", mock_ss):
            mock_response = MagicMock()
            mock_response.text = '{"suggested": "Aoede", "all": []}'
            mock_response.usage_metadata = None
            executor._client.aio.models.generate_content = AsyncMock(return_value=mock_response)

            result = await executor.resume("sess-nc", "hg4_translation_review", "approve", "OK")

        n5_output = session_store["sess-nc"]["outputs"].get("n5_character_select", {})
        assert n5_output.get("characterId") is None


class TestSrtDurationConsistency:
    """Issue #13: s10_srt_gen should use actual durations from S9 when available."""

    @pytest.mark.asyncio
    async def test_s10_uses_s9_srt_when_available(self, executor, session_store, mock_ss):
        """When S9 produced SRT files, s10_srt_gen should use them instead of rule-based."""
        s9_srt_entries = [
            {"index": 1, "startTime": "00:00:00,000", "endTime": "00:00:03,500", "text": "Hello world"},
        ]
        session_store["sess-srt"] = {
            "session_id": "sess-srt",
            "status": "awaiting_input",
            "checkpoint_id": "hg5_audio_review",
            "question": "generate guide",
            "uploads": None,
            "steps": [
                {"step_id": "hg5_audio_review", "label": "HG5", "status": "STOPPED", "output": None},
            ],
            "outputs": {
                "s4_script_gen": {"scripts": [{"spotId": "s1", "scriptText": "Hello world test text here"}]},
                "s6_translation": {"translations": []},
                "s9_audio_gen": {
                    "audioFiles": [
                        {"lang": "en", "spotId": "s1", "audioUrl": "http://a.wav", "durationMs": 3500},
                    ],
                    "srtFiles": [
                        {"lang": "en", "spotId": "s1", "entries": s9_srt_entries, "rawSrt": "1\n..."},
                    ],
                },
            },
            "current_step": "hg5_audio_review",
        }

        with patch("agents.pipeline_agent.session_service", mock_ss):
            result = await executor.resume("sess-srt", "hg5_audio_review", "approve", "Approved")

        # s10 should have used S9's SRT files
        s10_output = session_store["sess-srt"]["outputs"].get("s10_srt_gen", {})
        assert s10_output.get("success") is True
        srt_files = s10_output.get("srtFiles", [])
        # Should contain the S9-generated SRT entry
        en_srt = [s for s in srt_files if s.get("lang") == "en" and s.get("spotId") == "s1"]
        assert len(en_srt) == 1
        assert en_srt[0]["entries"] == s9_srt_entries

    @pytest.mark.asyncio
    async def test_s10_falls_back_to_rule_based_without_s9(self, executor, session_store, mock_ss):
        """When S9 has no SRT files, s10_srt_gen should fall back to rule-based generation."""
        session_store["sess-srt2"] = {
            "session_id": "sess-srt2",
            "status": "awaiting_input",
            "checkpoint_id": "hg5_audio_review",
            "question": "generate guide",
            "uploads": None,
            "steps": [
                {"step_id": "hg5_audio_review", "label": "HG5", "status": "STOPPED", "output": None},
            ],
            "outputs": {
                "s4_script_gen": {"scripts": [{"spotId": "s1", "scriptText": "Hello world test text from the museum guide"}]},
                "s6_translation": {"translations": []},
                "s9_audio_gen": {"audioFiles": [], "srtFiles": []},
            },
            "current_step": "hg5_audio_review",
        }

        with patch("agents.pipeline_agent.session_service", mock_ss):
            result = await executor.resume("sess-srt2", "hg5_audio_review", "approve", "Approved")

        s10_output = session_store["sess-srt2"]["outputs"].get("s10_srt_gen", {})
        assert s10_output.get("success") is True
        assert s10_output.get("totalFiles", 0) > 0

    @pytest.mark.asyncio
    async def test_s10_fail_closed_when_alignment_required_and_srt_missing(self, executor):
        outputs = {
            "s4_script_gen": {
                "scripts": [{"spotId": "s1", "scriptText": "Hello world"}],
            },
            "s6_translation": {"translations": []},
            "s9_audio_gen": {
                "alignmentRequired": True,
                "audioFiles": [
                    {"lang": "en", "spotId": "s1", "audioUrl": "http://a.wav", "durationMs": 2500},
                ],
                "srtFiles": [],
            },
        }

        with pytest.raises(RuntimeError, match="ALIGNMENT_FAILED"):
            await executor._execute_step("s10_srt_gen", None, None, outputs)


class TestAlgiebaTypo:
    """Issue #14: Backend S7 prompt should use 'Algieba' not 'Algeba'."""

    def test_s7_prompt_uses_algieba(self):
        """The s7_voice_recommend prompt should reference 'Algieba' not 'Algeba'."""
        from agents.pipeline_agent import load_prompt
        prompt = load_prompt("s7_voice_recommend")
        assert "Algieba" in prompt, "S7 prompt should use 'Algieba' (correct spelling)"
        assert "Algeba" not in prompt, "S7 prompt should NOT contain 'Algeba' (typo)"


class TestAiSegmentation:
    def test_build_ai_segmentation_prompt_for_cjk(self):
        prompt = PipelineExecutor._build_ai_segmentation_prompt(
            text="本圖以極為簡略的墨線描繪大黑天",
            language="zh-TW",
        )
        assert "Respect CJK sentence structure" in prompt
        assert "6-16 CJK characters" in prompt

    def test_build_ai_segmentation_prompt_for_non_cjk(self):
        prompt = PipelineExecutor._build_ai_segmentation_prompt(
            text="This sculpture represents prosperity and good fortune.",
            language="en",
        )
        assert "Respect sentence syntax for the target language" in prompt
        assert "3-12 words" in prompt

    def test_build_forced_break_positions_from_segments(self):
        breaks = PipelineExecutor._build_forced_break_positions_from_segments(
            reference_text="甲乙丙丁戊己",
            segments=["甲乙", "丙丁", "戊己"],
        )
        assert breaks == {1, 3}

    def test_build_forced_break_positions_returns_none_on_mismatch(self):
        breaks = PipelineExecutor._build_forced_break_positions_from_segments(
            reference_text="甲乙丙丁",
            segments=["甲乙", "丙丁外"],
        )
        assert breaks is None

    @pytest.mark.asyncio
    async def test_segment_text_with_gemini_returns_segments(self, executor):
        mock_response = MagicMock()
        mock_response.text = '{"segments":["甲乙","丙丁"]}'

        with patch("agents.pipeline_agent._retry_generate_content", new=AsyncMock(return_value=mock_response)):
            segments = await executor._segment_text_with_gemini(text="甲乙丙丁", language="zh")

        assert segments == ["甲乙", "丙丁"]

    @pytest.mark.asyncio
    async def test_segment_text_with_gemini_ignores_rewritten_text(self, executor):
        mock_response = MagicMock()
        mock_response.text = '{"segments":["甲乙","丙丁外"]}'

        with patch("agents.pipeline_agent._retry_generate_content", new=AsyncMock(return_value=mock_response)):
            segments = await executor._segment_text_with_gemini(text="甲乙丙丁", language="zh")

        assert segments is None

    @pytest.mark.asyncio
    async def test_generate_aligned_srt_entries_falls_back_when_stt_has_no_timestamps(self, executor):
        with patch.object(executor, "_segment_text_with_gemini", new=AsyncMock(return_value=None)):
            with patch(
                "agents.pipeline_agent.audio_alignment.transcribe_audio_word_timestamps",
                side_effect=audio_alignment.AlignmentError("Speech-to-Text returned no word timestamps"),
            ):
                entries = await executor._generate_aligned_srt_entries(
                    text="Hello world. This is a preview.",
                    audio_data=b"wav",
                    language="en",
                    duration_ms=2400,
                )

        assert len(entries) >= 1
        assert all("startTime" in entry and "endTime" in entry for entry in entries)
