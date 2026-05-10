from __future__ import annotations

from dataclasses import dataclass
from difflib import SequenceMatcher
import re
from typing import Any, TypedDict
import unicodedata


class AlignmentError(RuntimeError):
    """Raised when word/character alignment cannot be produced."""


class WordTiming(TypedDict):
    word: str
    startSeconds: float
    endSeconds: float


@dataclass(frozen=True)
class _TimedChar:
    char: str
    start: float
    end: float
    source_index: int


_CJK_PUNCT_BREAKS = set("，,、；;：:。！？!?")
_DEFAULT_MAX_CJK_CHARS = 12
_DEFAULT_MAX_LATIN_CHARS = 22
_DEFAULT_MIN_CUE_SECONDS = 1.0
_DEFAULT_MAX_CUE_SECONDS = 4.0
_DEFAULT_MIN_CUE_CHARS = 3
_DEFAULT_MAX_CHARS_PER_SECOND = 7.5
_DEFAULT_MAX_INTER_CUE_GAP_SECONDS = 0.6
_MIN_CHAR_SECONDS = 0.02
_CJK_STICKY_BIGRAMS = {
    "七福",
    "福神",
    "江戶",
    "戶時",
    "時代",
}

_PERFORMANCE_TAG_RE = re.compile(r"\[[^[\]]+\]")
_SPACE_BEFORE_PUNCT_RE = re.compile(r"\s+([,.;:!?，。！？、；：）】」』])")
_SPACE_AFTER_OPEN_PUNCT_RE = re.compile(r"([（【「『])\s+")


def _format_srt_time(seconds: float) -> str:
    total_ms = max(0, int(round(seconds * 1000)))
    hours, remainder = divmod(total_ms, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    secs, millis = divmod(remainder, 1_000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"


def _duration_to_seconds(duration_obj: Any) -> float:
    if duration_obj is None:
        return 0.0
    seconds = float(getattr(duration_obj, "seconds", 0) or 0)
    nanos = float(getattr(duration_obj, "nanos", 0) or 0)
    return seconds + (nanos / 1_000_000_000.0)


def strip_performance_tags(text: str) -> str:
    without_tags = _PERFORMANCE_TAG_RE.sub(" ", text or "")
    normalized = " ".join(without_tags.split())
    normalized = _SPACE_BEFORE_PUNCT_RE.sub(r"\1", normalized)
    normalized = _SPACE_AFTER_OPEN_PUNCT_RE.sub(r"\1", normalized)
    return normalized.strip()


def _map_language_code(language: str) -> str:
    normalized = (language or "").strip()
    if not normalized:
        return "en-US"

    aliases = {
        "en": "en-US",
        "ja": "ja-JP",
        "ko": "ko-KR",
        "zh": "cmn-Hans-CN",
        "zh-cn": "cmn-Hans-CN",
        "zh-tw": "cmn-Hant-TW",
        "fr": "fr-FR",
        "de": "de-DE",
        "es": "es-ES",
        "it": "it-IT",
        "pt": "pt-PT",
    }

    lowered = normalized.lower()
    if lowered in aliases:
        return aliases[lowered]

    if "-" in normalized:
        return normalized

    return aliases.get(lowered, "en-US")


def transcribe_audio_word_timestamps(
    audio_data: bytes,
    language: str,
    *,
    timeout_seconds: float = 30.0,
) -> list[WordTiming]:
    """Run speech recognition and return word-level timestamps."""
    try:
        from google.cloud import speech  # type: ignore[import-not-found]
    except Exception as exc:  # pragma: no cover - import availability is env-dependent
        raise AlignmentError(
            "Speech-to-Text dependency is missing; install google-cloud-speech"
        ) from exc

    client = speech.SpeechClient()
    config = speech.RecognitionConfig(
        language_code=_map_language_code(language),
        enable_word_time_offsets=True,
        enable_automatic_punctuation=True,
        model="latest_long",
        encoding=speech.RecognitionConfig.AudioEncoding.LINEAR16,
        sample_rate_hertz=24000,
    )
    audio = speech.RecognitionAudio(content=audio_data)

    try:
        response = client.recognize(config=config, audio=audio, timeout=timeout_seconds)
    except Exception as exc:  # pragma: no cover - network/API failures are integration-tested
        raise AlignmentError(f"Speech-to-Text request failed: {exc}") from exc

    words: list[WordTiming] = []
    for result in getattr(response, "results", []):
        alternatives = getattr(result, "alternatives", [])
        if not alternatives:
            continue
        primary = alternatives[0]
        for item in getattr(primary, "words", []):
            token = (getattr(item, "word", "") or "").strip()
            if not token:
                continue
            start = _duration_to_seconds(getattr(item, "start_time", None))
            end = _duration_to_seconds(getattr(item, "end_time", None))
            if end <= start:
                end = start + _MIN_CHAR_SECONDS
            words.append({
                "word": token,
                "startSeconds": start,
                "endSeconds": end,
            })

    if not words:
        raise AlignmentError("Speech-to-Text returned no word timestamps")

    return words


def _is_cjk(char: str) -> bool:
    code = ord(char)
    return (
        0x3400 <= code <= 0x4DBF
        or 0x4E00 <= code <= 0x9FFF
        or 0x3040 <= code <= 0x30FF
        or 0x31F0 <= code <= 0x31FF
        or 0xAC00 <= code <= 0xD7AF
    )


def _expand_word_timestamps_to_chars(word_timestamps: list[WordTiming], duration_sec: float) -> list[_TimedChar]:
    chars: list[_TimedChar] = []
    source_index = 0

    for token in word_timestamps:
        word = token.get("word", "")
        start = float(token.get("startSeconds", 0.0) or 0.0)
        end = float(token.get("endSeconds", start) or start)
        cleaned = [char for char in word if not char.isspace()]
        if not cleaned:
            continue

        start = max(0.0, min(start, duration_sec))
        end = max(start + _MIN_CHAR_SECONDS, min(end, duration_sec))
        span = max(_MIN_CHAR_SECONDS, end - start)

        for idx, char in enumerate(cleaned):
            char_start = start + (span * idx / len(cleaned))
            char_end = start + (span * (idx + 1) / len(cleaned))
            chars.append(_TimedChar(
                char=char,
                start=char_start,
                end=max(char_start + _MIN_CHAR_SECONDS, char_end),
                source_index=source_index,
            ))
            source_index += 1

    if not chars:
        raise AlignmentError("No character timings could be expanded from word timestamps")

    return chars


def _interpolate_missing_spans(
    spans: list[tuple[float, float] | None],
    duration_sec: float,
) -> list[tuple[float, float]]:
    result = list(spans)
    idx = 0
    total = len(result)

    while idx < total:
        if result[idx] is not None:
            idx += 1
            continue

        run_start = idx
        while idx < total and result[idx] is None:
            idx += 1
        run_end = idx

        prev_span = result[run_start - 1] if run_start > 0 else None
        next_span = result[run_end] if run_end < total else None

        start_anchor = prev_span[1] if prev_span else 0.0
        end_anchor = next_span[0] if next_span else duration_sec
        if end_anchor < start_anchor:
            end_anchor = start_anchor

        run_len = run_end - run_start
        step = (end_anchor - start_anchor) / max(run_len, 1)
        for offset in range(run_len):
            start = start_anchor + (step * offset)
            end = start_anchor + (step * (offset + 1))
            result[run_start + offset] = (start, max(start + _MIN_CHAR_SECONDS, end))

    return [span if span is not None else (0.0, _MIN_CHAR_SECONDS) for span in result]


def _align_reference_chars(
    reference_text: str,
    asr_chars: list[_TimedChar],
    duration_sec: float,
) -> list[_TimedChar]:
    reference = [(idx, char) for idx, char in enumerate(reference_text) if not char.isspace()]
    if not reference:
        raise AlignmentError("Reference text is empty after removing whitespace")

    asr_str = "".join(item.char for item in asr_chars)
    ref_str = "".join(char for _, char in reference)
    if not asr_str:
        raise AlignmentError("ASR transcript is empty after token expansion")

    spans: list[tuple[float, float] | None] = [None] * len(reference)
    matcher = SequenceMatcher(a=asr_str, b=ref_str, autojunk=False)

    for tag, a1, a2, b1, b2 in matcher.get_opcodes():
        if tag != "equal":
            continue
        matched_len = min(a2 - a1, b2 - b1)
        for offset in range(matched_len):
            asr_char = asr_chars[a1 + offset]
            spans[b1 + offset] = (asr_char.start, asr_char.end)

    completed = _interpolate_missing_spans(spans, duration_sec)
    aligned: list[_TimedChar] = []
    for idx, (orig_index, char) in enumerate(reference):
        start, end = completed[idx]
        aligned.append(_TimedChar(
            char=char,
            start=max(0.0, min(start, duration_sec)),
            end=max(start + _MIN_CHAR_SECONDS, min(end, duration_sec)),
            source_index=orig_index,
        ))

    return aligned


def _find_preferred_break(aligned_chars: list[_TimedChar], start: int, end: int) -> int | None:
    for idx in range(end, start, -1):
        if _is_punctuation(aligned_chars[idx].char):
            return idx
    return None


def _is_sticky_cjk_boundary(aligned_chars: list[_TimedChar], boundary_idx: int) -> bool:
    if boundary_idx < 0 or boundary_idx >= len(aligned_chars) - 1:
        return False

    left = aligned_chars[boundary_idx].char
    right = aligned_chars[boundary_idx + 1].char
    if not (_is_cjk(left) and _is_cjk(right)):
        return False
    if _is_punctuation(left) or _is_punctuation(right):
        return False
    return (left + right) in _CJK_STICKY_BIGRAMS


def _protect_cjk_boundary(
    aligned_chars: list[_TimedChar],
    *,
    start: int,
    proposed_end: int,
    hard_end: int,
) -> int:
    final_end = proposed_end
    if not _is_sticky_cjk_boundary(aligned_chars, final_end):
        return final_end

    # Prefer extending one char so sticky bigrams stay in the same cue.
    if final_end + 1 <= hard_end:
        return final_end + 1
    if final_end - 1 >= start:
        return final_end - 1
    return final_end


def _is_punctuation(char: str) -> bool:
    return bool(char) and unicodedata.category(char).startswith("P")


def _group_text(aligned_chars: list[_TimedChar], start: int, end: int) -> str:
    return "".join(aligned_chars[idx].char for idx in range(start, end + 1)).strip()


def _group_char_count(aligned_chars: list[_TimedChar], start: int, end: int) -> int:
    text = _group_text(aligned_chars, start, end)
    return sum(1 for char in text if not char.isspace())


def _group_duration(aligned_chars: list[_TimedChar], start: int, end: int) -> float:
    return max(_MIN_CHAR_SECONDS, aligned_chars[end].end - aligned_chars[start].start)


def _group_chars_per_second(aligned_chars: list[_TimedChar], start: int, end: int) -> float:
    return _group_char_count(aligned_chars, start, end) / _group_duration(aligned_chars, start, end)


def _group_is_orphan_text(aligned_chars: list[_TimedChar], start: int, end: int, *, min_cue_chars: int) -> bool:
    text = _group_text(aligned_chars, start, end)
    visible = [char for char in text if not char.isspace()]
    if not visible:
        return True
    if len(visible) < min_cue_chars:
        return True
    return all(_is_punctuation(char) for char in visible)


def _group_ends_with_punctuation(aligned_chars: list[_TimedChar], start: int, end: int) -> bool:
    _ = start
    return _is_punctuation(aligned_chars[end].char)


def _fix_leading_punctuation_groups(
    groups: list[tuple[int, int]],
    aligned_chars: list[_TimedChar],
) -> list[tuple[int, int]]:
    if len(groups) <= 1:
        return groups

    adjusted = list(groups)
    for idx in range(1, len(adjusted)):
        prev_start, prev_end = adjusted[idx - 1]
        cur_start, cur_end = adjusted[idx]

        while cur_start <= cur_end and _is_punctuation(aligned_chars[cur_start].char):
            prev_end = cur_start
            cur_start += 1

        adjusted[idx - 1] = (prev_start, prev_end)
        adjusted[idx] = (cur_start, cur_end)

    return [group for group in adjusted if group[0] <= group[1]]


def _strip_punctuation_for_output(text: str) -> str:
    without_punct = "".join(char for char in text if not _is_punctuation(char))
    return " ".join(without_punct.split())


def _build_cue_groups(
    aligned_chars: list[_TimedChar],
    *,
    max_cjk_chars: int,
    max_latin_chars: int,
    max_cue_seconds: float,
    forced_break_positions: set[int] | None = None,
) -> list[tuple[int, int]]:
    def split_by_punctuation() -> list[tuple[int, int]]:
        spans: list[tuple[int, int]] = []
        start = 0
        for idx, item in enumerate(aligned_chars):
            if not _is_punctuation(item.char):
                continue
            if start <= idx:
                spans.append((start, idx))
            start = idx + 1
        if start < len(aligned_chars):
            spans.append((start, len(aligned_chars) - 1))
        return spans

    def split_by_forced_breaks() -> list[tuple[int, int]]:
        spans: list[tuple[int, int]] = []
        start = 0
        breaks = forced_break_positions or set()
        for idx in range(len(aligned_chars)):
            if idx not in breaks:
                continue
            if start <= idx:
                spans.append((start, idx))
            start = idx + 1
        if start < len(aligned_chars):
            spans.append((start, len(aligned_chars) - 1))
        return spans

    def split_long_span(start: int, end: int) -> list[tuple[int, int]]:
        span_groups: list[tuple[int, int]] = []
        cursor = start
        while cursor <= end:
            cjk_count = 0
            latin_count = 0
            first_start = aligned_chars[cursor].start
            probe = cursor

            while probe <= end:
                char = aligned_chars[probe].char
                if _is_cjk(char):
                    cjk_count += 1
                elif char.isalnum():
                    latin_count += 1

                duration = aligned_chars[probe].end - first_start
                exceeds_limits = (
                    cjk_count > max_cjk_chars
                    or latin_count > max_latin_chars
                    or duration > max_cue_seconds
                )
                if exceeds_limits and probe > cursor:
                    break
                probe += 1

            final_end = max(cursor, probe - 1)
            final_end = _protect_cjk_boundary(
                aligned_chars,
                start=cursor,
                proposed_end=final_end,
                hard_end=end,
            )
            span_groups.append((cursor, final_end))
            cursor = final_end + 1

        return span_groups

    groups: list[tuple[int, int]] = []
    base_spans = split_by_forced_breaks() if forced_break_positions else split_by_punctuation()
    for span_start, span_end in base_spans:
        groups.extend(split_long_span(span_start, span_end))
    return groups


def _merge_short_groups(
    groups: list[tuple[int, int]],
    aligned_chars: list[_TimedChar],
    *,
    min_cue_seconds: float,
) -> list[tuple[int, int]]:
    if len(groups) <= 1:
        return groups

    merged = list(groups)
    idx = 0
    while idx < len(merged) - 1:
        start, end = merged[idx]
        duration = aligned_chars[end].end - aligned_chars[start].start
        if duration >= min_cue_seconds:
            idx += 1
            continue
        if _group_ends_with_punctuation(aligned_chars, start, end):
            idx += 1
            continue

        next_start, next_end = merged[idx + 1]
        merged[idx] = (start, next_end)
        del merged[idx + 1]

    return merged


def _merge_orphan_groups(
    groups: list[tuple[int, int]],
    aligned_chars: list[_TimedChar],
    *,
    min_cue_chars: int,
) -> list[tuple[int, int]]:
    if len(groups) <= 1:
        return groups

    merged = list(groups)
    idx = 0
    while idx < len(merged):
        start, end = merged[idx]
        if not _group_is_orphan_text(aligned_chars, start, end, min_cue_chars=min_cue_chars):
            idx += 1
            continue

        if len(merged) == 1:
            break
        if idx == 0:
            _, next_end = merged[idx + 1]
            merged[idx] = (start, next_end)
            del merged[idx + 1]
            continue
        if idx == len(merged) - 1:
            prev_start, _ = merged[idx - 1]
            merged[idx - 1] = (prev_start, end)
            del merged[idx]
            idx = max(0, idx - 1)
            continue

        prev_start, prev_end = merged[idx - 1]
        _, next_end = merged[idx + 1]
        prev_duration = _group_duration(aligned_chars, prev_start, prev_end)
        next_duration = _group_duration(aligned_chars, merged[idx + 1][0], next_end)
        if prev_duration <= next_duration:
            merged[idx - 1] = (prev_start, end)
            del merged[idx]
            idx = max(0, idx - 1)
        else:
            merged[idx] = (start, next_end)
            del merged[idx + 1]

    return merged


def _rebalance_dense_groups(
    groups: list[tuple[int, int]],
    aligned_chars: list[_TimedChar],
    *,
    max_chars_per_second: float,
) -> list[tuple[int, int]]:
    if len(groups) <= 1:
        return groups

    rebalanced = list(groups)
    idx = 0
    while idx < len(rebalanced):
        start, end = rebalanced[idx]
        cps = _group_chars_per_second(aligned_chars, start, end)
        if cps <= max_chars_per_second:
            idx += 1
            continue

        if idx < len(rebalanced) - 1:
            _, next_end = rebalanced[idx + 1]
            rebalanced[idx] = (start, next_end)
            del rebalanced[idx + 1]
            continue

        if idx > 0:
            prev_start, _ = rebalanced[idx - 1]
            rebalanced[idx - 1] = (prev_start, end)
            del rebalanced[idx]
            idx = max(0, idx - 1)
            continue

        idx += 1

    return rebalanced


def build_aligned_srt_entries(
    reference_text: str,
    duration_sec: float,
    word_timestamps: list[WordTiming],
    *,
    max_cjk_chars: int = _DEFAULT_MAX_CJK_CHARS,
    max_latin_chars: int = _DEFAULT_MAX_LATIN_CHARS,
    min_cue_seconds: float = _DEFAULT_MIN_CUE_SECONDS,
    max_cue_seconds: float = _DEFAULT_MAX_CUE_SECONDS,
    min_cue_chars: int = _DEFAULT_MIN_CUE_CHARS,
    max_chars_per_second: float = _DEFAULT_MAX_CHARS_PER_SECOND,
    max_inter_cue_gap_seconds: float = _DEFAULT_MAX_INTER_CUE_GAP_SECONDS,
    forced_break_positions: set[int] | None = None,
) -> list[dict[str, Any]]:
    """Build SRT entries using AI-derived word timestamps and character alignment."""
    if duration_sec <= 0:
        raise AlignmentError("Audio duration must be positive for alignment")

    expanded_chars = _expand_word_timestamps_to_chars(word_timestamps, duration_sec)
    aligned_chars = _align_reference_chars(reference_text, expanded_chars, duration_sec)
    groups = _build_cue_groups(
        aligned_chars,
        max_cjk_chars=max_cjk_chars,
        max_latin_chars=max_latin_chars,
        max_cue_seconds=max_cue_seconds,
        forced_break_positions=forced_break_positions,
    )
    groups = _merge_short_groups(groups, aligned_chars, min_cue_seconds=min_cue_seconds)
    groups = _merge_orphan_groups(groups, aligned_chars, min_cue_chars=min_cue_chars)
    groups = _rebalance_dense_groups(groups, aligned_chars, max_chars_per_second=max_chars_per_second)
    groups = _merge_short_groups(groups, aligned_chars, min_cue_seconds=min_cue_seconds)
    groups = _merge_orphan_groups(groups, aligned_chars, min_cue_chars=min_cue_chars)
    groups = _fix_leading_punctuation_groups(groups, aligned_chars)
    groups = _merge_orphan_groups(groups, aligned_chars, min_cue_chars=min_cue_chars)

    entries: list[dict[str, Any]] = []
    prev_end = 0.0
    for idx, (start_idx, end_idx) in enumerate(groups):
        first = aligned_chars[start_idx]
        last = aligned_chars[end_idx]

        start = max(prev_end, first.start)
        if start > prev_end and (start - prev_end) <= max_inter_cue_gap_seconds:
            start = prev_end
        end = max(start + _MIN_CHAR_SECONDS, last.end)
        if idx == len(groups) - 1:
            end = max(end, duration_sec)

        text_start = first.source_index
        text_end = last.source_index + 1
        text = _strip_punctuation_for_output(reference_text[text_start:text_end])
        if not text:
            prev_end = end
            continue

        entries.append({
            "index": len(entries) + 1,
            "startTime": _format_srt_time(start),
            "endTime": _format_srt_time(end),
            "startSeconds": round(start, 3),
            "endSeconds": round(end, 3),
            "text": text,
        })
        prev_end = end

    if not entries:
        raise AlignmentError("Aligned SRT generation produced no entries")

    return entries
