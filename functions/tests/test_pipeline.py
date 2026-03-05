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
from agents.pipeline_agent import (  # noqa: E402
    HUMAN_GATES,
    PIPELINE_STEPS,
    STEP_LABELS,
    PipelineExecutor,
)


# ── Fixtures ──────────────────────────────────────────────────────────────

def _make_in_memory_sessions() -> dict[str, dict[str, Any]]:
    """Simple in-memory session store for testing."""
    return {}


def _make_mock_session_service(store: dict[str, dict[str, Any]]):
    """Create mock functions that back onto a dict store."""

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

    def test_pro_steps(self, executor):
        pro_steps = ["s4_script_gen", "s6_translation"]
        for step in pro_steps:
            assert "pro" in executor._get_model_for_step(step).lower()

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


class TestAlgiebaTypo:
    """Issue #14: Backend S7 prompt should use 'Algieba' not 'Algeba'."""

    def test_s7_prompt_uses_algieba(self):
        """The s7_voice_recommend prompt should reference 'Algieba' not 'Algeba'."""
        from agents.pipeline_agent import load_prompt
        prompt = load_prompt("s7_voice_recommend")
        assert "Algieba" in prompt, "S7 prompt should use 'Algieba' (correct spelling)"
        assert "Algeba" not in prompt, "S7 prompt should NOT contain 'Algeba' (typo)"
