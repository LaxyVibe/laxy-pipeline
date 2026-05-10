from __future__ import annotations

import pytest

from agents.audio_alignment import AlignmentError, build_aligned_srt_entries, strip_performance_tags


def _timings_from_visible_chars(text: str, duration_sec: float):
    chars = [char for char in text if not char.isspace()]
    step = duration_sec / max(len(chars), 1)
    timings = []
    for idx, char in enumerate(chars):
        timings.append({
            "word": char,
            "startSeconds": idx * step,
            "endSeconds": (idx + 1) * step,
        })
    return timings


def test_build_aligned_srt_entries_splits_long_cjk_text():
    text = (
        "本圖以極為簡略的墨線描繪大黑天，呈現出宛如兒童塗鴉般純真無邪的趣味。"
        "大黑天隨密教傳入日本，最初作為軍神受到信仰。"
    )
    duration_sec = 12.0
    entries = build_aligned_srt_entries(
        text,
        duration_sec,
        _timings_from_visible_chars(text, duration_sec),
        max_cjk_chars=10,
        max_latin_chars=16,
        min_cue_seconds=0.8,
        max_cue_seconds=3.0,
    )

    assert len(entries) >= 2
    assert entries[0]["startSeconds"] == pytest.approx(0.0, abs=0.15)
    assert entries[-1]["endSeconds"] == pytest.approx(duration_sec, abs=0.15)

    for prev, current in zip(entries, entries[1:]):
        assert prev["endSeconds"] <= current["startSeconds"] + 0.02


def test_build_aligned_srt_entries_handles_asr_mismatch_with_reference_text():
    reference_text = "仙厓創作了許多以七福神為題材的作品，反映了其對民眾生活的關懷與親近。"
    # Simulate ASR omissions and replacements.
    asr_like_timings = _timings_from_visible_chars("仙厓創作了許多七福神題材作品反映民眾生活關懷", 8.0)

    entries = build_aligned_srt_entries(
        reference_text,
        8.0,
        asr_like_timings,
        max_cjk_chars=12,
        max_latin_chars=22,
        min_cue_seconds=0.8,
        max_cue_seconds=3.0,
    )

    rendered = "".join(entry["text"] for entry in entries).replace(" ", "")
    assert "仙厓創作了許多" in rendered
    assert "關懷與親近" in rendered


def test_build_aligned_srt_entries_raises_without_word_timestamps():
    with pytest.raises(AlignmentError, match="word"):
        build_aligned_srt_entries("Hello", 2.0, [])


def test_build_aligned_srt_entries_merges_orphan_cues():
    text = "黑天神像守護眾生"
    entries = build_aligned_srt_entries(
        text,
        6.0,
        _timings_from_visible_chars(text, 6.0),
        max_cjk_chars=1,
        max_latin_chars=8,
        min_cue_seconds=0.2,
        max_cue_seconds=6.0,
        min_cue_chars=3,
    )

    assert entries
    assert all(len(entry["text"].strip()) >= 3 for entry in entries)


def test_build_aligned_srt_entries_rebalances_high_char_rate_cues():
    text = "大黑天在江戶時代逐漸成為民間信仰核心"
    fast_part = text[:14]
    slow_part = text[14:]
    timings = _timings_from_visible_chars(fast_part, 1.0) + [
        {
            "word": char,
            "startSeconds": 1.0 + (idx * (5.0 / max(len(slow_part), 1))),
            "endSeconds": 1.0 + ((idx + 1) * (5.0 / max(len(slow_part), 1))),
        }
        for idx, char in enumerate(slow_part)
    ]

    entries = build_aligned_srt_entries(
        text,
        6.0,
        timings,
        max_cjk_chars=14,
        max_latin_chars=30,
        min_cue_seconds=0.2,
        max_cue_seconds=3.0,
        max_chars_per_second=6.5,
    )

    for entry in entries:
        duration = max(0.02, entry["endSeconds"] - entry["startSeconds"])
        rate = len(entry["text"].replace(" ", "")) / duration
        assert rate <= 6.6


def test_build_aligned_srt_entries_avoids_leading_punctuation_cues():
    text = "甲乙丙丁，戊己庚辛壬癸"
    timings = [
        {"word": "甲乙丙丁", "startSeconds": 0.0, "endSeconds": 3.9},
        {"word": "，", "startSeconds": 4.5, "endSeconds": 4.6},
        {"word": "戊己庚辛壬癸", "startSeconds": 4.6, "endSeconds": 8.0},
    ]

    entries = build_aligned_srt_entries(
        text,
        8.0,
        timings,
        max_cjk_chars=20,
        max_latin_chars=30,
        min_cue_seconds=0.2,
        max_cue_seconds=4.0,
    )

    assert entries
    assert all(not entry["text"].startswith("，") for entry in entries)


def test_build_aligned_srt_entries_protects_sticky_cjk_boundaries():
    text = "亦自江戶時代起定型，成為掌管食物與財福的七福神之一。"
    entries = build_aligned_srt_entries(
        text,
        10.0,
        _timings_from_visible_chars(text, 10.0),
        max_cjk_chars=12,
        max_latin_chars=20,
        min_cue_seconds=0.2,
        max_cue_seconds=3.0,
        min_cue_chars=1,
    )

    for prev, current in zip(entries, entries[1:]):
        assert not (prev["text"].endswith("江") and current["text"].startswith("戶"))
        assert not (prev["text"].endswith("七福") and current["text"].startswith("神"))


def test_build_aligned_srt_entries_smooths_small_inter_cue_gaps():
    text = "天地玄黃宇宙洪荒"
    entries = build_aligned_srt_entries(
        text,
        4.0,
        [
            {"word": "天地玄黃", "startSeconds": 0.01, "endSeconds": 2.0},
            {"word": "宇宙", "startSeconds": 2.4, "endSeconds": 3.0},
            {"word": "洪荒", "startSeconds": 3.0, "endSeconds": 4.0},
        ],
        max_cjk_chars=4,
        max_latin_chars=20,
        min_cue_seconds=0.2,
        max_cue_seconds=2.5,
        max_inter_cue_gap_seconds=0.6,
    )

    assert len(entries) >= 2
    assert entries[0]["startSeconds"] == pytest.approx(0.0, abs=0.01)
    for prev, current in zip(entries, entries[1:]):
        assert current["startSeconds"] - prev["endSeconds"] <= 0.01


def test_build_aligned_srt_entries_removes_punctuation_from_output_text():
    text = "黑天神像（江戶時代），守護眾生！"
    entries = build_aligned_srt_entries(
        text,
        6.0,
        _timings_from_visible_chars(text, 6.0),
        max_cjk_chars=6,
        max_latin_chars=20,
        min_cue_seconds=0.2,
        max_cue_seconds=2.5,
    )

    rendered = "".join(entry["text"] for entry in entries)
    for punct in ("（", "）", "，", "！", "。", "、"):
        assert punct not in rendered
    assert "黑天神像" in rendered
    assert "江戶時代" in rendered


def test_build_aligned_srt_entries_splits_by_punctuation_before_long_split():
    text = "甲乙，丙丁戊己庚辛壬癸子丑寅卯辰巳。"
    entries = build_aligned_srt_entries(
        text,
        12.0,
        _timings_from_visible_chars(text, 12.0),
        max_cjk_chars=6,
        max_latin_chars=20,
        min_cue_seconds=2.0,
        max_cue_seconds=4.0,
    )

    assert len(entries) >= 3
    assert entries[0]["text"] == "甲乙"
    assert entries[1]["text"].startswith("丙丁")


def test_build_aligned_srt_entries_respects_forced_break_positions():
    text = "甲乙丙丁戊己庚辛"
    entries = build_aligned_srt_entries(
        text,
        8.0,
        _timings_from_visible_chars(text, 8.0),
        max_cjk_chars=20,
        max_latin_chars=20,
        min_cue_seconds=0.2,
        max_cue_seconds=8.0,
        min_cue_chars=1,
        forced_break_positions={1, 3},
    )

    assert [entry["text"] for entry in entries] == ["甲乙", "丙丁", "戊己庚辛"]


def test_strip_performance_tags_removes_cues_without_leaving_spacing_artifacts():
    text = "[whispering] Hello [short pause], world. [laughing]真的嗎？"

    stripped = strip_performance_tags(text)

    assert stripped == "Hello, world. 真的嗎？"
