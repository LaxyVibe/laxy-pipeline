# ---------------------------------------------------------------------------
# Non-LLM tool functions for the ADK pipeline
# ---------------------------------------------------------------------------
"""
Tool functions for pipeline steps that don't require LLM inference.

These correspond to deterministic pipeline steps that perform
deterministic logic (N5, N6, N8, S10).
"""
from __future__ import annotations

import json
import re
from typing import Any


def character_select(context: dict[str, Any]) -> dict[str, Any]:
    """
    N5: Character Select — passthrough that validates character selection
    and prepares context for voice recommendation.

    Input context should contain:
    - selectedCharacterId: str | None
    - spots: list of spot metadata
    - scripts: list of spot scripts
    """
    character_id = context.get("selectedCharacterId")
    spots = context.get("spots", [])
    scripts = context.get("scripts", [])

    return {
        "success": True,
        "characterId": character_id,
        "spotCount": len(spots),
        "scriptCount": len(scripts),
        "contentSummary": _build_content_summary(spots, scripts),
    }


def audio_playback_qa(audio_files: list[dict[str, Any]]) -> dict[str, Any]:
    """
    N6: Audio Playback QA — validates generated audio files
    and prepares them for human review.

    Checks each audio file for:
    - Valid language code
    - Non-empty URL or data
    - Duration estimate within range
    """
    issues: list[str] = []
    validated: list[dict[str, Any]] = []

    for af in audio_files:
        lang = af.get("lang", "")
        spot_id = af.get("spotId", "")
        duration = af.get("durationEstimate", 0)
        url = af.get("url", "")

        file_issues: list[str] = []
        if not lang:
            file_issues.append("Missing language code")
        if duration <= 0:
            file_issues.append("Invalid duration estimate")
        if not url and not af.get("data"):
            file_issues.append("No audio URL or data")

        validated.append({
            **af,
            "qaStatus": "pass" if not file_issues else "warning",
            "qaIssues": file_issues,
        })
        issues.extend(f"[{lang}/{spot_id}] {issue}" for issue in file_issues)

    return {
        "success": True,
        "audioFiles": validated,
        "totalFiles": len(validated),
        "passCount": sum(1 for v in validated if v["qaStatus"] == "pass"),
        "warningCount": sum(1 for v in validated if v["qaStatus"] == "warning"),
        "issues": issues,
    }


def generation_history(session_outputs: dict[str, Any]) -> dict[str, Any]:
    """
    N8: Generation History — compiles a summary of all pipeline
    generation steps for audit/logging purposes.
    """
    history_entries: list[dict[str, Any]] = []

    step_labels = {
        "s2_ocr_parse": "OCR Parse",
        "s1_metadata_extract": "Metadata Extraction",
        "s4_script_gen": "Script Generation",
        "s5_image_map": "Image Mapping",
        "s6_translation": "Translation",
        "s7_voice_recommend": "Voice Recommendation",
        "s8_director_note": "Director Note",
        "s9_audio_gen": "Audio Generation",
    }

    for step_id, label in step_labels.items():
        output = session_outputs.get(step_id)
        if output:
            entry = {
                "stepId": step_id,
                "label": label,
                "status": "completed",
                "hasOutput": True,
            }
            # Extract token usage if available
            if isinstance(output, dict):
                meta = output.get("_meta", {})
                if meta.get("usage"):
                    entry["tokenUsage"] = meta["usage"]
            history_entries.append(entry)

    return {
        "success": True,
        "history": history_entries,
        "totalSteps": len(history_entries),
        "pipelineStatus": "complete" if len(history_entries) == len(step_labels) else "partial",
    }


def srt_generate(scripts: list[dict[str, Any]], translations: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    """
    S10: SRT Generation — rule-based subtitle file generation.

    Splits script text into segments of ~8 words, assigns 5-second
    durations per segment, and formats as SRT entries.
    """
    srt_files: list[dict[str, Any]] = []

    # Generate SRT for core language scripts
    for script in scripts:
        spot_id = script.get("spotId", "")
        # Use 'professional' variant if available, otherwise raw scriptText
        text = script.get("scriptText", "")
        if isinstance(script.get("variants"), dict):
            text = script["variants"].get("professional", text)

        entries = _text_to_srt_entries(text)
        srt_files.append({
            "lang": "en",
            "spotId": spot_id,
            "entries": entries,
            "totalEntries": len(entries),
        })

    # Generate SRT for each translated language
    if translations:
        for translation in translations:
            lang = translation.get("lang", "")
            for spot_t in translation.get("spots", []):
                spot_id = spot_t.get("spotId", "")
                text = spot_t.get("translatedText", "")
                entries = _text_to_srt_entries(text)
                srt_files.append({
                    "lang": lang,
                    "spotId": spot_id,
                    "entries": entries,
                    "totalEntries": len(entries),
                })

    return {
        "success": True,
        "srtFiles": srt_files,
        "totalFiles": len(srt_files),
    }


# ── Internal helpers ──


def _text_to_srt_entries(text: str, words_per_segment: int = 8, seconds_per_segment: float = 5.0) -> list[dict[str, Any]]:
    """Split text into timed SRT entries."""
    words = text.split()
    entries: list[dict[str, Any]] = []
    segment_index = 0

    for i in range(0, len(words), words_per_segment):
        segment_words = words[i : i + words_per_segment]
        start_time = segment_index * seconds_per_segment
        end_time = start_time + seconds_per_segment

        entries.append({
            "index": segment_index + 1,
            "startTime": _format_srt_time(start_time),
            "endTime": _format_srt_time(end_time),
            "startSeconds": start_time,
            "endSeconds": end_time,
            "text": " ".join(segment_words),
        })
        segment_index += 1

    return entries


def _format_srt_time(seconds: float) -> str:
    """Format seconds as SRT timestamp: HH:MM:SS,mmm"""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millis = int((seconds % 1) * 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"


def _build_content_summary(spots: list[dict[str, Any]], scripts: list[dict[str, Any]]) -> str:
    """Build a brief content summary for voice recommendation context."""
    titles = [s.get("title", "Untitled") for s in spots[:5]]
    summary = f"{len(spots)} spots"
    if titles:
        summary += f": {', '.join(titles)}"
    if len(spots) > 5:
        summary += f" (+{len(spots) - 5} more)"
    return summary
