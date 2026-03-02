# ---------------------------------------------------------------------------
# Tests for non-LLM tool functions (tools.py)
# ---------------------------------------------------------------------------
"""
Unit tests for the deterministic pipeline helper functions:
  N5 – character_select
  N6 – audio_playback_qa
  N8 – generation_history
  S10 – srt_generate + helpers
"""
from __future__ import annotations

import pytest

from agents.tools import (
    character_select,
    audio_playback_qa,
    generation_history,
    srt_generate,
    _text_to_srt_entries,
    _format_srt_time,
    _build_content_summary,
)


# ── N5: character_select ──────────────────────────────────────────────────


class TestCharacterSelect:
    def test_basic_passthrough(self):
        result = character_select({
            "selectedCharacterId": "char-1",
            "spots": [{"title": "Hall A"}, {"title": "Hall B"}],
            "scripts": [{"spotId": "1"}, {"spotId": "2"}, {"spotId": "3"}],
        })
        assert result["success"] is True
        assert result["characterId"] == "char-1"
        assert result["spotCount"] == 2
        assert result["scriptCount"] == 3

    def test_empty_context(self):
        result = character_select({})
        assert result["success"] is True
        assert result["characterId"] is None
        assert result["spotCount"] == 0
        assert result["scriptCount"] == 0

    def test_content_summary_included(self):
        spots = [{"title": f"Spot {i}"} for i in range(7)]
        result = character_select({"spots": spots, "scripts": []})
        assert "7 spots" in result["contentSummary"]
        # Should mention the first 5 titles and indicate +2 more
        assert "+2 more" in result["contentSummary"]


# ── N6: audio_playback_qa ─────────────────────────────────────────────────


class TestAudioPlaybackQA:
    def test_all_pass(self):
        files = [
            {"lang": "en", "spotId": "s1", "durationEstimate": 30, "url": "https://example.com/a.mp3"},
            {"lang": "ja", "spotId": "s2", "durationEstimate": 25, "url": "https://example.com/b.mp3"},
        ]
        result = audio_playback_qa(files)
        assert result["success"] is True
        assert result["totalFiles"] == 2
        assert result["passCount"] == 2
        assert result["warningCount"] == 0
        assert len(result["issues"]) == 0

    def test_missing_lang_warns(self):
        files = [{"spotId": "s1", "durationEstimate": 10, "url": "https://example.com/a.mp3"}]
        result = audio_playback_qa(files)
        assert result["warningCount"] == 1
        assert any("Missing language code" in i for i in result["issues"])

    def test_invalid_duration_warns(self):
        files = [{"lang": "en", "spotId": "s1", "durationEstimate": 0, "url": "https://example.com/a.mp3"}]
        result = audio_playback_qa(files)
        assert result["warningCount"] == 1
        assert any("Invalid duration" in i for i in result["issues"])

    def test_no_audio_data_warns(self):
        files = [{"lang": "en", "spotId": "s1", "durationEstimate": 10}]
        result = audio_playback_qa(files)
        assert result["warningCount"] == 1
        assert any("No audio URL" in i for i in result["issues"])

    def test_multiple_issues_per_file(self):
        files = [{"spotId": "s1"}]
        result = audio_playback_qa(files)
        # Missing lang, invalid duration, no URL
        assert len(result["audioFiles"][0]["qaIssues"]) == 3

    def test_empty_list(self):
        result = audio_playback_qa([])
        assert result["success"] is True
        assert result["totalFiles"] == 0


# ── N8: generation_history ────────────────────────────────────────────────


class TestGenerationHistory:
    def test_full_pipeline(self):
        outputs = {
            "s2_ocr_parse": {"_content": "text"},
            "s1_metadata_extract": {"spots": []},
            "s4_script_gen": {"scripts": []},
            "s5_image_map": {"images": []},
            "s6_translation": {"translations": []},
            "s7_voice_recommend": {"voice": "alloy"},
            "s8_director_note": {"note": "..."},
            "s9_audio_gen": {"audioFiles": []},
        }
        result = generation_history(outputs)
        assert result["success"] is True
        assert result["totalSteps"] == 8
        assert result["pipelineStatus"] == "complete"

    def test_partial_pipeline(self):
        outputs = {
            "s2_ocr_parse": {"_content": "text"},
            "s1_metadata_extract": {"spots": []},
        }
        result = generation_history(outputs)
        assert result["totalSteps"] == 2
        assert result["pipelineStatus"] == "partial"

    def test_token_usage_extracted(self):
        outputs = {
            "s2_ocr_parse": {
                "_content": "text",
                "_meta": {"usage": {"input_tokens": 100, "output_tokens": 50, "total_tokens": 150}},
            },
        }
        result = generation_history(outputs)
        entry = result["history"][0]
        assert entry["tokenUsage"]["input_tokens"] == 100

    def test_empty_outputs(self):
        result = generation_history({})
        assert result["totalSteps"] == 0
        assert result["pipelineStatus"] == "partial"


# ── S10: srt_generate ─────────────────────────────────────────────────────


class TestSrtGenerate:
    def test_basic_generation(self):
        scripts = [
            {"spotId": "s1", "scriptText": "Hello world this is a test script for SRT generation output."}
        ]
        result = srt_generate(scripts)
        assert result["success"] is True
        assert result["totalFiles"] == 1
        assert result["srtFiles"][0]["lang"] == "en"
        assert result["srtFiles"][0]["spotId"] == "s1"
        assert len(result["srtFiles"][0]["entries"]) > 0

    def test_uses_professional_variant(self):
        scripts = [
            {
                "spotId": "s1",
                "scriptText": "fallback text",
                "variants": {"professional": "This is the professional variant text for the guide."},
            }
        ]
        result = srt_generate(scripts)
        entry_text = " ".join(e["text"] for e in result["srtFiles"][0]["entries"])
        assert "professional variant" in entry_text

    def test_with_translations(self):
        scripts = [{"spotId": "s1", "scriptText": "Hello world"}]
        translations = [
            {
                "lang": "ja",
                "spots": [{"spotId": "s1", "translatedText": "こんにちは 世界 テスト テキスト"}],
            },
            {
                "lang": "ko",
                "spots": [{"spotId": "s1", "translatedText": "안녕하세요 세계"}],
            },
        ]
        result = srt_generate(scripts, translations)
        # 1 English + 1 Japanese + 1 Korean = 3
        assert result["totalFiles"] == 3
        langs = {f["lang"] for f in result["srtFiles"]}
        assert langs == {"en", "ja", "ko"}

    def test_empty_scripts(self):
        result = srt_generate([])
        assert result["success"] is True
        assert result["totalFiles"] == 0


# ── SRT helpers ───────────────────────────────────────────────────────────


class TestSrtHelpers:
    def test_format_srt_time_zero(self):
        assert _format_srt_time(0.0) == "00:00:00,000"

    def test_format_srt_time_normal(self):
        assert _format_srt_time(5.0) == "00:00:05,000"

    def test_format_srt_time_with_millis(self):
        assert _format_srt_time(65.5) == "00:01:05,500"

    def test_format_srt_time_hours(self):
        assert _format_srt_time(3661.25) == "01:01:01,250"

    def test_text_to_srt_entries_segmentation(self):
        text = " ".join(f"word{i}" for i in range(20))
        entries = _text_to_srt_entries(text, words_per_segment=8, seconds_per_segment=5.0)
        # 20 words / 8 per segment = 3 segments (8, 8, 4)
        assert len(entries) == 3
        assert entries[0]["index"] == 1
        assert entries[0]["startSeconds"] == 0.0
        assert entries[0]["endSeconds"] == 5.0
        assert entries[1]["startSeconds"] == 5.0
        assert entries[2]["startSeconds"] == 10.0

    def test_text_to_srt_entries_empty(self):
        # Empty string should return empty entries (split produces [''])
        entries = _text_to_srt_entries("")
        # ''.split() returns [] so no entries
        assert len(entries) == 0

    def test_build_content_summary_short(self):
        spots = [{"title": "A"}, {"title": "B"}]
        summary = _build_content_summary(spots, [])
        assert "2 spots" in summary
        assert "A" in summary
        assert "B" in summary

    def test_build_content_summary_truncates(self):
        spots = [{"title": f"S{i}"} for i in range(10)]
        summary = _build_content_summary(spots, [])
        assert "+5 more" in summary
