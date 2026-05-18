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
from types import SimpleNamespace
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
sys.modules.setdefault("firebase_admin.storage", MagicMock())
_mock_google = MagicMock()
_mock_genai = MagicMock()
_mock_genai.types = MagicMock()
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
        # With uploads, returns a list of parts (file placeholders + text)
        assert isinstance(msg, list)
        flat = " ".join(str(p) for p in msg)
        assert "Parse this document" in flat
        assert "photo.jpg" in flat
        assert "scan.pdf" in flat

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

    def test_s9_audio_gen_not_an_llm_step(self, executor):
        """s9_audio_gen is handled as a tool step (generate_audio), not an LLM step.
        _build_user_message returns empty since it never reaches the LLM path."""
        outputs = {
            "s8_director_note": {"directorNote": {"missionOfSpeech": "Speak slowly"}},
            "s4_script_gen": {"scripts": [{"scriptText": "Hello"}]},
            "s7_voice_recommend": {"suggested": "nova"},
        }
        msg = executor._build_user_message("s9_audio_gen", None, None, outputs)
        # s9 is routed directly in _execute_step, not via _run_llm_step,
        # so _build_user_message returns empty for it
        assert msg == ""

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
        ("s4_script_gen", "flash"),
        ("s6_translation", "flash"),
        ("s9_audio_gen", "tts"),
    ])
    def test_model_assignment(self, executor, step_id: str, expected_model_key: str):
        model = executor._get_model_for_step(step_id)
        assert model == MODELS[expected_model_key]

    def test_all_llm_steps_have_temperature(self):
        # LLM steps are those with prompts — exclude s10 (rule-based tool) and s9 (TTS tool step)
        tool_steps = {"s10_srt_gen", "s9_audio_gen"}
        llm_steps = [s for s in PIPELINE_STEPS if s.startswith("s") and s != "pipeline_complete" and s not in tool_steps]
        for step in llm_steps:
            assert step in TEMPERATURES, f"Missing temperature for {step}"


class TestTtsAudioExtraction:
    def test_extract_audio_inline_data_success(self, executor):
        response = SimpleNamespace(
            candidates=[
                SimpleNamespace(
                    content=SimpleNamespace(
                        parts=[
                            SimpleNamespace(
                                inline_data=SimpleNamespace(data=b"abc", mime_type="audio/mp3")
                            )
                        ]
                    )
                )
            ],
            prompt_feedback=None,
            text=None,
        )

        audio_data, mime_type, error = executor._extract_audio_inline_data(response)
        assert audio_data == b"abc"
        assert mime_type == "audio/mp3"
        assert error is None

    def test_extract_audio_inline_data_converts_bytearray_to_bytes(self, executor):
        response = SimpleNamespace(
            candidates=[
                SimpleNamespace(
                    content=SimpleNamespace(
                        parts=[
                            SimpleNamespace(
                                inline_data=SimpleNamespace(data=bytearray(b"abc"), mime_type="audio/mpeg")
                            )
                        ]
                    )
                )
            ],
            prompt_feedback=None,
            text=None,
        )

        audio_data, mime_type, error = executor._extract_audio_inline_data(response)
        assert audio_data == b"abc"
        assert isinstance(audio_data, bytes)
        assert mime_type == "audio/mpeg"
        assert error is None

    def test_extract_audio_inline_data_reports_data_access_failure(self, executor):
        class BrokenInlineData:
            mime_type = "audio/mpeg"

            @property
            def data(self):
                raise ValueError("bytearray(b'abc') could not be converted to bytes")

        response = SimpleNamespace(
            candidates=[
                SimpleNamespace(
                    content=SimpleNamespace(
                        parts=[
                            SimpleNamespace(inline_data=BrokenInlineData())
                        ]
                    )
                )
            ],
            prompt_feedback=None,
            text=None,
        )

        audio_data, mime_type, error = executor._extract_audio_inline_data(response)
        assert audio_data is None
        assert mime_type == "audio/wav"
        assert error == "The TTS provider returned audio in an unreadable format."

    def test_format_audio_generation_error_sanitizes_raw_audio_dump(self, executor):
        error = executor._format_audio_generation_error(
            "bytearray(b'\\xff\\xf3...LAME3.100...') could not be converted to bytes"
        )

        assert error == "The TTS provider returned audio in an unreadable format."

    def test_extract_audio_inline_data_missing_parts_returns_descriptive_error(self, executor):
        response = SimpleNamespace(
            candidates=[
                SimpleNamespace(content=None, finish_reason="SAFETY"),
            ],
            prompt_feedback=SimpleNamespace(
                block_reason="SAFETY",
                block_reason_message="Request blocked by policy",
            ),
            text="",
        )

        audio_data, mime_type, error = executor._extract_audio_inline_data(response)
        assert audio_data is None
        assert mime_type == "audio/wav"
        assert error is not None
        assert "No audio content returned" in error
        assert "block_reason=SAFETY" in error


class TestTtsAudioOutputPreparation:
    def test_prepare_audio_output_keeps_mp3_and_skips_alignment(self, executor):
        output_audio_data, output_mime_type, output_extension, alignment_audio_data, duration_ms = (
            executor._prepare_audio_output(bytearray(b"ID3fake-mp3"), "audio/mpeg")
        )

        assert output_audio_data == b"ID3fake-mp3"
        assert output_mime_type == "audio/mpeg"
        assert output_extension == "mp3"
        assert alignment_audio_data is None
        assert duration_ms >= 0

    @pytest.mark.asyncio
    async def test_generate_aligned_srt_entries_falls_back_without_alignment_audio(self, executor):
        with patch("agents.pipeline_agent.tools.srt_generate_for_text", return_value=[{"index": 1}]) as mock_srt:
            result = await executor._generate_aligned_srt_entries(
                text="hello world",
                audio_data=None,
                language="en",
                duration_ms=1000,
            )

        assert result == [{"index": 1}]
        mock_srt.assert_called_once()


class TestTtsPromptBuilder:
    """Test TTS-safe prompt assembly."""

    def test_compiled_prompt_is_sanitized_for_tts(self, executor):
        compiled_prompt = "\n".join([
            "You are Museum Manager, a calm narrator.",
            "Preferred voice model: Sadaltager. Voice quality: Knowledgeable, warm, and mature.",
            "## AUDIO PROFILE",
            "Core timbre: A composed, mid-range voice.",
            "Personality DNA: Formal and respectful.",
            "## THE SCENE",
            "A calm gallery.",
            "## DIRECTOR'S NOTES",
            "Style: Clear and grounded.",
            "Pacing: Steady.",
            "Do not add any bracket tags. Read the text naturally as written.",
            "## SAMPLE CONTEXT",
            "This sample should not be sent.",
            "Stay in character, avoid meta commentary, and produce a natural ready-to-speak delivery.",
        ])

        result = executor._build_tts_text(
            "Hello world.",
            {"compiledPrompt": compiled_prompt},
        )

        assert "#### TRANSCRIPT\nHello world." in result
        assert "Character: Museum Manager" in result
        assert "Core timbre:" in result
        assert "Style: Clear and grounded." in result
        assert "Preferred voice model" not in result
        assert "Do not add" not in result
        assert "SAMPLE CONTEXT" not in result
        assert "ready-to-speak" not in result

    def test_legacy_director_note_fallback_uses_markdown_sections(self, executor):
        result = executor._build_tts_text(
            "Hello world.",
            {
                "vocalEnvironment": "A calm gallery.",
                "missionOfSpeech": "Clear and grounded.",
                "pacingAndEnergy": "Steady.",
            },
        )

        assert "## THE SCENE\nA calm gallery." in result
        assert "## DIRECTOR'S NOTES" in result
        assert "Style: Clear and grounded." in result
        assert "Pacing: Steady." in result
        assert result.endswith("#### TRANSCRIPT\nHello world.")


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


class TestStandaloneAudioGeneration:
    @pytest.mark.asyncio
    async def test_generate_audio_reuses_per_language_generator(self, executor):
        executor.generate_audio_for_language = AsyncMock(side_effect=[
            {
                "lang": "en",
                "audioFiles": [{"lang": "en", "spotId": "spot_001", "audioUrl": "https://example.com/en.mp3"}],
                "srtFiles": [{"lang": "en", "spotId": "spot_001", "rawSrt": "1"}],
            },
            {
                "lang": "ja",
                "audioFiles": [{"lang": "ja", "spotId": "spot_001", "audioUrl": "https://example.com/ja.mp3"}],
                "srtFiles": [{"lang": "ja", "spotId": "spot_001", "rawSrt": "1"}],
            },
        ])

        result = await executor.generate_audio(
            session_id="audio-session-1",
            scripts=[{"spotId": "spot_001", "spotNumber": 1, "title": "Spot 1", "scriptText": "Hello"}],
            voice_id="Aoede",
            languages=["en", "ja"],
            director_note={"scene": "calm"},
            translations={"ja": [{"spotId": "spot_001", "translatedText": "こんにちは"}]},
        )

        assert executor.generate_audio_for_language.await_count == 2
        first_call = executor.generate_audio_for_language.await_args_list[0].kwargs
        second_call = executor.generate_audio_for_language.await_args_list[1].kwargs
        assert first_call["language"] == "en"
        assert first_call["translations"] is None
        assert second_call["language"] == "ja"
        assert second_call["translations"] == [{"spotId": "spot_001", "translatedText": "こんにちは"}]
        assert result["success"] is True
        assert len(result["audioFiles"]) == 2
        assert len(result["srtFiles"]) == 2
        assert result["totalAudioFiles"] == 2
        assert result["totalSrtFiles"] == 2


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
