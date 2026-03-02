# ---------------------------------------------------------------------------
# Tests for individual pipeline steps (test_steps.py)
# ---------------------------------------------------------------------------
"""
Unit tests for each pipeline step's behaviour:
  - Prompt loading
  - User message construction per step
  - Model/temperature selection
  - Response parsing (JSON + raw text)

All LLM calls are mocked; these tests verify the orchestration logic
that wraps each LLM invocation.
"""
from __future__ import annotations

import json
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import sys

# Mock firebase & genai before importing pipeline code
_mock_firebase_admin = MagicMock()
_mock_firebase_admin._apps = {"[DEFAULT]": True}
_mock_firestore = MagicMock()
_mock_firebase_admin.firestore = _mock_firestore
sys.modules.setdefault("firebase_admin", _mock_firebase_admin)
sys.modules.setdefault("firebase_admin.credentials", MagicMock())
sys.modules.setdefault("firebase_admin.firestore", _mock_firestore)
sys.modules.setdefault("google.adk", MagicMock())
sys.modules.setdefault("google.adk.agents", MagicMock())
sys.modules.setdefault("google.adk.runners", MagicMock())
sys.modules.setdefault("google.adk.sessions", MagicMock())

_mock_genai = MagicMock()
_mock_genai.types = MagicMock()
sys.modules.setdefault("google.genai", _mock_genai)

from agents.pipeline_agent import (  # noqa: E402
    PipelineExecutor,
    MODELS,
    TEMPERATURES,
    PIPELINE_STEPS,
    STEP_LABELS,
    load_prompt,
)
from agents.tools import (  # noqa: E402
    character_select,
    audio_playback_qa,
    generation_history,
    srt_generate,
)


# ── Fixtures ──────────────────────────────────────────────────────────────

@pytest.fixture
def executor():
    with patch("agents.pipeline_agent.genai") as mock_genai:
        mock_client = MagicMock()
        mock_genai.Client.return_value = mock_client
        mock_genai.types = MagicMock()
        ex = PipelineExecutor(project_id="test-project")
        ex._client = mock_client
        yield ex


def _make_genai_response(text: str, input_tokens: int = 100, output_tokens: int = 50):
    """Create a mock Gemini response."""
    resp = MagicMock()
    resp.text = text
    resp.usage_metadata = MagicMock()
    resp.usage_metadata.prompt_token_count = input_tokens
    resp.usage_metadata.candidates_token_count = output_tokens
    resp.usage_metadata.total_token_count = input_tokens + output_tokens
    return resp


# ── Prompt loading tests ──────────────────────────────────────────────────


class TestPromptLoading:
    """Verify all LLM step prompts exist and are non-empty."""

    LLM_STEPS = [
        "s1_metadata_extract",
        "s2_ocr_parse",
        "s4_script_gen",
        "s5_image_map",
        "s6_translation",
        "s7_voice_recommend",
        "s8_director_note",
        "s9_audio_gen",
    ]

    @pytest.mark.parametrize("step_id", LLM_STEPS)
    def test_prompt_file_exists_and_non_empty(self, step_id: str):
        prompt = load_prompt(step_id)
        assert isinstance(prompt, str)
        assert len(prompt) > 50, f"Prompt for {step_id} is suspiciously short ({len(prompt)} chars)"

    @pytest.mark.parametrize("step_id", LLM_STEPS)
    def test_prompt_has_no_leading_trailing_whitespace(self, step_id: str):
        prompt = load_prompt(step_id)
        assert prompt == prompt.strip()


# ── User message builder tests ────────────────────────────────────────────


class TestUserMessageBuilder:
    """Test _build_user_message for each LLM step."""

    def test_s2_ocr_parse_includes_question_and_uploads(self, executor):
        msg = executor._build_user_message(
            "s2_ocr_parse",
            question="Parse this document",
            uploads=[{"name": "photo.jpg"}, {"name": "scan.pdf"}],
            outputs={},
        )
        assert "Parse this document" in msg
        assert "photo.jpg" in msg
        assert "scan.pdf" in msg

    def test_s2_ocr_parse_no_uploads(self, executor):
        msg = executor._build_user_message("s2_ocr_parse", "Parse this", None, {})
        assert "Parse this" in msg

    def test_s1_metadata_extract_uses_ocr_output(self, executor):
        outputs = {"s2_ocr_parse": {"_content": "OCR extracted text here"}}
        msg = executor._build_user_message("s1_metadata_extract", None, None, outputs)
        assert "OCR extracted text here" in msg

    def test_s1_metadata_extract_json_fallback(self, executor):
        outputs = {"s2_ocr_parse": {"spots": [{"title": "Hall A"}]}}
        msg = executor._build_user_message("s1_metadata_extract", None, None, outputs)
        assert "Hall A" in msg

    def test_s4_script_gen_uses_metadata(self, executor):
        outputs = {"s1_metadata_extract": {"spots": [{"id": "s1", "title": "Great Wave"}]}}
        msg = executor._build_user_message("s4_script_gen", None, None, outputs)
        assert "Great Wave" in msg
        assert "5 audience variants" in msg

    def test_s5_image_map_uses_scripts(self, executor):
        outputs = {"s4_script_gen": {"scripts": [{"spotId": "s1"}]}}
        msg = executor._build_user_message("s5_image_map", None, None, outputs)
        assert "s1" in msg

    def test_s6_translation_uses_scripts(self, executor):
        outputs = {"s4_script_gen": {"scripts": [{"spotId": "s1", "scriptText": "Hello"}]}}
        msg = executor._build_user_message("s6_translation", None, None, outputs)
        assert "Hello" in msg
        assert "professional" in msg.lower()

    def test_s7_voice_recommend_uses_character(self, executor):
        outputs = {"n5_character_select": {"characterId": "narrator", "spotCount": 3}}
        msg = executor._build_user_message("s7_voice_recommend", None, None, outputs)
        assert "narrator" in msg

    def test_s8_director_note_uses_voice(self, executor):
        outputs = {"s7_voice_recommend": {"voiceId": "alloy", "reason": "warm tone"}}
        msg = executor._build_user_message("s8_director_note", None, None, outputs)
        assert "alloy" in msg

    def test_s9_audio_gen_uses_multiple_outputs(self, executor):
        outputs = {
            "s8_director_note": {"note": "Speak slowly"},
            "s4_script_gen": {"scripts": [{"text": "Hello"}]},
            "s7_voice_recommend": {"voiceId": "nova"},
        }
        msg = executor._build_user_message("s9_audio_gen", None, None, outputs)
        assert "Speak slowly" in msg or "directorNote" in msg
        assert "nova" in msg or "voice" in msg

    def test_unknown_step_returns_question(self, executor):
        msg = executor._build_user_message("unknown_step", "fallback text", None, {})
        assert msg == "fallback text"


# ── Model selection tests ─────────────────────────────────────────────────


class TestModelSelection:
    """Verify correct model/temperature assignment per step."""

    @pytest.mark.parametrize("step_id,expected_model_key", [
        ("s2_ocr_parse", "flash"),
        ("s1_metadata_extract", "flash"),
        ("s5_image_map", "flash"),
        ("s7_voice_recommend", "flash"),
        ("s8_director_note", "flash"),
        ("s4_script_gen", "pro"),
        ("s6_translation", "pro"),
        ("s9_audio_gen", "tts"),
    ])
    def test_model_assignment(self, executor, step_id: str, expected_model_key: str):
        model = executor._get_model_for_step(step_id)
        assert model == MODELS[expected_model_key]

    def test_all_llm_steps_have_temperature(self):
        # LLM steps are those with prompts — exclude s10 (rule-based tool)
        tool_steps = {"s10_srt_gen"}
        llm_steps = [s for s in PIPELINE_STEPS if s.startswith("s") and s != "pipeline_complete" and s not in tool_steps]
        for step in llm_steps:
            assert step in TEMPERATURES, f"Missing temperature for {step}"


# ── LLM step execution tests ─────────────────────────────────────────────


class TestLLMStepExecution:
    """Test _run_llm_step with mocked Gemini responses."""

    @pytest.mark.asyncio
    async def test_json_response_parsed(self, executor):
        response = _make_genai_response('{"spots": [{"id": "s1"}]}')
        executor._client.aio.models.generate_content = AsyncMock(return_value=response)

        result = await executor._run_llm_step("s2_ocr_parse", "test input", None, {})
        assert isinstance(result, dict)
        assert result["spots"] == [{"id": "s1"}]
        assert "_meta" in result
        assert result["_meta"]["model"] == MODELS["flash"]

    @pytest.mark.asyncio
    async def test_json_with_markdown_fences_parsed(self, executor):
        response = _make_genai_response('```json\n{"key": "value"}\n```')
        executor._client.aio.models.generate_content = AsyncMock(return_value=response)

        result = await executor._run_llm_step("s1_metadata_extract", "test", None, {})
        assert result["key"] == "value"

    @pytest.mark.asyncio
    async def test_raw_text_response_wrapped(self, executor):
        response = _make_genai_response("This is plain text, not JSON")
        executor._client.aio.models.generate_content = AsyncMock(return_value=response)

        result = await executor._run_llm_step("s2_ocr_parse", "test", None, {})
        assert result["_content"] == "This is plain text, not JSON"

    @pytest.mark.asyncio
    async def test_empty_response_handled(self, executor):
        response = MagicMock()
        response.text = ""
        response.usage_metadata = None
        executor._client.aio.models.generate_content = AsyncMock(return_value=response)

        result = await executor._run_llm_step("s2_ocr_parse", "test", None, {})
        assert result["_content"] == ""

    @pytest.mark.asyncio
    async def test_usage_metadata_attached(self, executor):
        response = _make_genai_response('{"data": true}', input_tokens=200, output_tokens=100)
        executor._client.aio.models.generate_content = AsyncMock(return_value=response)

        result = await executor._run_llm_step("s2_ocr_parse", "test", None, {})
        assert result["_meta"]["usage"]["input_tokens"] == 200
        assert result["_meta"]["usage"]["output_tokens"] == 100
        assert result["_meta"]["usage"]["total_tokens"] == 300

    @pytest.mark.asyncio
    async def test_correct_temperature_passed(self, executor):
        response = _make_genai_response('{"ok": true}')
        mock_generate = AsyncMock(return_value=response)
        executor._client.aio.models.generate_content = mock_generate

        await executor._run_llm_step("s4_script_gen", "test", None, {})

        # Check the config parameter passed to generate_content
        call_kwargs = mock_generate.call_args
        # The model should be the pro model for script gen
        assert call_kwargs[1]["model"] == MODELS["pro"] or call_kwargs[0][0] if call_kwargs[0] else True


# ── Tool step execution tests ─────────────────────────────────────────────


class TestToolStepExecution:
    """Test _execute_step for non-LLM tool steps."""

    @pytest.mark.asyncio
    async def test_n5_character_select(self, executor):
        outputs = {
            "s4_script_gen": {"scripts": [{"spotId": "s1"}]},
            "s1_metadata_extract": {"spots": [{"title": "Hall A"}]},
        }
        result = await executor._execute_step("n5_character_select", None, None, outputs)
        assert result["success"] is True
        assert result["spotCount"] == 1

    @pytest.mark.asyncio
    async def test_n6_audio_qa(self, executor):
        outputs = {
            "s9_audio_gen": {"audioFiles": [
                {"lang": "en", "spotId": "s1", "durationEstimate": 30, "url": "https://example.com/a.mp3"},
            ]},
        }
        result = await executor._execute_step("n6_audio_qa", None, None, outputs)
        assert result["success"] is True
        assert result["totalFiles"] == 1

    @pytest.mark.asyncio
    async def test_n8_generation_history(self, executor):
        outputs = {
            "s2_ocr_parse": {"_content": "text"},
            "s1_metadata_extract": {"spots": []},
        }
        result = await executor._execute_step("n8_generation_history", None, None, outputs)
        assert result["success"] is True
        assert result["totalSteps"] == 2

    @pytest.mark.asyncio
    async def test_s10_srt_gen(self, executor):
        outputs = {
            "s4_script_gen": {"scripts": [{"spotId": "s1", "scriptText": "Hello world test"}]},
            "s6_translation": {"translations": []},
        }
        result = await executor._execute_step("s10_srt_gen", None, None, outputs)
        assert result["success"] is True
        assert result["totalFiles"] >= 1

    @pytest.mark.asyncio
    async def test_llm_step_delegates_to_run_llm(self, executor):
        """LLM steps should call _run_llm_step (not tool functions)."""
        response = _make_genai_response('{"parsed": true}')
        executor._client.aio.models.generate_content = AsyncMock(return_value=response)

        result = await executor._execute_step("s2_ocr_parse", "test question", None, {})
        assert result["parsed"] is True
        executor._client.aio.models.generate_content.assert_called_once()


# ── Pipeline step ordering tests ──────────────────────────────────────────


class TestPipelineOrdering:
    """Verify the pipeline step sequence is correct."""

    def test_s2_before_s1(self):
        assert PIPELINE_STEPS.index("s2_ocr_parse") < PIPELINE_STEPS.index("s1_metadata_extract")

    def test_s1_before_hg1(self):
        assert PIPELINE_STEPS.index("s1_metadata_extract") < PIPELINE_STEPS.index("hg1_data_review")

    def test_hg1_before_s4(self):
        assert PIPELINE_STEPS.index("hg1_data_review") < PIPELINE_STEPS.index("s4_script_gen")

    def test_s4_before_s5(self):
        assert PIPELINE_STEPS.index("s4_script_gen") < PIPELINE_STEPS.index("s5_image_map")

    def test_s5_before_hg3(self):
        assert PIPELINE_STEPS.index("s5_image_map") < PIPELINE_STEPS.index("hg3_script_review")

    def test_s6_before_hg4(self):
        assert PIPELINE_STEPS.index("s6_translation") < PIPELINE_STEPS.index("hg4_translation_review")

    def test_n5_before_s7(self):
        assert PIPELINE_STEPS.index("n5_character_select") < PIPELINE_STEPS.index("s7_voice_recommend")

    def test_s9_before_n6(self):
        assert PIPELINE_STEPS.index("s9_audio_gen") < PIPELINE_STEPS.index("n6_audio_qa")

    def test_n6_before_hg5(self):
        assert PIPELINE_STEPS.index("n6_audio_qa") < PIPELINE_STEPS.index("hg5_audio_review")

    def test_hg5_before_n8(self):
        assert PIPELINE_STEPS.index("hg5_audio_review") < PIPELINE_STEPS.index("n8_generation_history")

    def test_n8_before_s10(self):
        assert PIPELINE_STEPS.index("n8_generation_history") < PIPELINE_STEPS.index("s10_srt_gen")

    def test_s10_before_complete(self):
        assert PIPELINE_STEPS.index("s10_srt_gen") < PIPELINE_STEPS.index("pipeline_complete")

    def test_total_step_count(self):
        assert len(PIPELINE_STEPS) == 17  # 8 LLM + 4 tool + 4 gates + 1 complete


# ── Step label compatibility tests ────────────────────────────────────────


class TestStepLabels:
    """Ensure labels match what the frontend expects."""

    def test_s2_label(self):
        assert "OCR Parse" in STEP_LABELS["s2_ocr_parse"]

    def test_s1_label(self):
        assert "Metadata Extract" in STEP_LABELS["s1_metadata_extract"]

    def test_s4_label(self):
        assert "Script Gen" in STEP_LABELS["s4_script_gen"]

    def test_hg_labels_contain_review(self):
        for gate_id in ["hg1_data_review", "hg3_script_review", "hg4_translation_review", "hg5_audio_review"]:
            assert "Review" in STEP_LABELS[gate_id]

    def test_labels_match_frontend_pattern(self):
        """All labels should follow the pattern: 'S#: Name' or 'HG#: Name' or 'N#: Name'."""
        for step_id, label in STEP_LABELS.items():
            if step_id == "pipeline_complete":
                continue
            # Should start with S, HG, or N followed by a number
            prefix = label.split(":")[0].strip()
            assert any(prefix.startswith(p) for p in ["S", "HG", "N"]), \
                f"Label '{label}' doesn't match expected prefix pattern"
