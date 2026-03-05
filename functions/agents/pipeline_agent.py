# ---------------------------------------------------------------------------
# ADK Pipeline Agent — Laxy Guide Creation Pipeline
# ---------------------------------------------------------------------------
"""
Defines the sequential ADK agent pipeline for guide creation.

Pipeline structure:
  S2 (OCR Parse) → S1 (Metadata Extract) → HG1 (Data Review) →
  S4 (Script Gen) → S5 (Image Map) → HG3 (Script Review) →
  S6 (Translation) → HG4 (Translation Review) →
  N5 (Character Select) → S7 (Voice Recommend) → S8 (Director Note) →
  S9 (Audio Gen) → N6 (Audio QA) → HG5 (Audio Review) →
  N8 (Generation History) → S10 (SRT Gen)

Human gates (HG1, HG3, HG4, HG5) pause execution and wait for user input.
"""
from __future__ import annotations

import asyncio
import base64
import io
import json
import logging
import os
import wave
from pathlib import Path
from typing import Any

from google import genai
from google.genai import types as genai_types

import firebase_admin
from firebase_admin import storage as fb_storage

from . import session as session_service
from . import tools

logger = logging.getLogger(__name__)

# ── Retry configuration for Gemini API rate limits ──

MAX_RETRIES = 5
INITIAL_BACKOFF = 2.0   # seconds
MAX_BACKOFF = 60.0      # seconds
BACKOFF_FACTOR = 2.0    # exponential multiplier

_RETRYABLE_KEYWORDS = ("429", "RESOURCE_EXHAUSTED", "rate limit", "quota", "503", "overloaded")


def _is_retryable(exc: Exception) -> bool:
    """Check if an exception is a transient rate-limit / overload error."""
    msg = str(exc).lower()
    return any(kw.lower() in msg for kw in _RETRYABLE_KEYWORDS)


async def _retry_generate_content(
    client: genai.Client,
    **kwargs: Any,
) -> Any:
    """Call client.aio.models.generate_content with exponential backoff on 429."""
    backoff = INITIAL_BACKOFF
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            return await client.aio.models.generate_content(**kwargs)
        except Exception as exc:
            if attempt < MAX_RETRIES and _is_retryable(exc):
                jitter = backoff * (0.5 + 0.5 * (hash(str(attempt)) % 100) / 100)
                logger.warning(
                    "Gemini API rate-limited (attempt %d/%d). "
                    "Retrying in %.1fs… [%s]",
                    attempt, MAX_RETRIES, jitter, exc,
                )
                await asyncio.sleep(jitter)
                backoff = min(backoff * BACKOFF_FACTOR, MAX_BACKOFF)
            else:
                raise

# ── Prompt loading ──

PROMPTS_DIR = Path(__file__).parent / "prompts"


def load_prompt(name: str) -> str:
    """Load a system prompt from the prompts directory."""
    path = PROMPTS_DIR / f"{name}.txt"
    return path.read_text(encoding="utf-8").strip()


# ── Model configuration ──

MODELS = {
    "flash": "gemini-2.5-flash",
    "pro": "gemini-2.5-pro",
    "tts": "gemini-2.5-flash-preview-tts",
}

TEMPERATURES = {
    "s2_ocr_parse": 0.3,
    "s1_metadata_extract": 0.2,
    "s4_script_gen": 0.8,
    "s5_image_map": 0.3,
    "s6_translation": 0.5,
    "s7_voice_recommend": 0.5,
    "s8_director_note": 0.6,
}

# Maps step_id → display label for frontend compatibility
STEP_LABELS = {
    "s2_ocr_parse": "S2: OCR Parse (Gemini)",
    "s1_metadata_extract": "S1: Metadata Extract (Gemini)",
    "hg1_data_review": "HG1: Data Review",
    "s4_script_gen": "S4: Script Gen (Gemini Pro)",
    "s5_image_map": "S5: Image Map (Gemini)",
    "hg3_script_review": "HG3: Script Review",
    "s6_translation": "S6: Translation (Gemini Pro)",
    "hg4_translation_review": "HG4: Translation Review",
    "n5_character_select": "N5: Character Select",
    "s7_voice_recommend": "S7: Voice Recommend (Gemini)",
    "s8_director_note": "S8: Director Note (Gemini)",
    "s9_audio_gen": "S9: Audio Gen (Gemini TTS)",
    "n6_audio_qa": "N6: Audio Playback QA",
    "hg5_audio_review": "HG5: Audio Review",
    "n8_generation_history": "N8: Generation History",
    "s10_srt_gen": "S10: SRT Gen (rule-based)",
    "pipeline_complete": "Pipeline Complete",
}

# Ordered list of all steps
PIPELINE_STEPS = [
    "s2_ocr_parse",
    "s1_metadata_extract",
    "hg1_data_review",
    "s4_script_gen",
    "s5_image_map",
    "hg3_script_review",
    "s6_translation",
    "hg4_translation_review",
    "n5_character_select",
    "s7_voice_recommend",
    "s8_director_note",
    "s9_audio_gen",
    "n6_audio_qa",
    "hg5_audio_review",
    "n8_generation_history",
    "s10_srt_gen",
    "pipeline_complete",
]

HUMAN_GATES = {"hg1_data_review", "hg3_script_review", "hg4_translation_review", "hg5_audio_review"}

# ── Pipeline execution engine ──


class PipelineExecutor:
    """
    Orchestrates the sequential pipeline, executing LLM steps via ADK agents,
    tool steps via Python functions, and pausing at human gates.

    This is a stateful executor that persists progress to Firestore so the
    pipeline can be paused/resumed across HTTP requests.
    """

    def __init__(self, project_id: str | None = None, location: str = "us-central1"):
        self.project_id = project_id or os.environ.get("GCP_PROJECT", os.environ.get("GCLOUD_PROJECT", ""))
        self.location = location

        # Use Gemini API key if provided; otherwise fall back to Vertex AI
        api_key = os.environ.get("GEMINI_API_KEY")
        if api_key:
            logger.info("Using Gemini API key (google-genai direct mode)")
            self._client = genai.Client(api_key=api_key)
        else:
            logger.info("Using Vertex AI (project=%s, location=%s)", self.project_id, self.location)
            self._client = genai.Client(vertexai=True, project=self.project_id, location=self.location)

    async def start(
        self,
        session_id: str,
        question: str,
        uploads: list[dict[str, Any]] | None = None,
        context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """
        Start a new pipeline run. Executes steps sequentially until
        hitting a human gate or completing the pipeline.
        """
        # Create session in Firestore
        session_data = session_service.create_session(session_id, {
            "question": question,
            "uploads": uploads or [],
            "context": context or {},
        })

        # Run from the first step
        return await self._run_from(session_id, start_step_index=0, question=question, uploads=uploads)

    async def resume(
        self,
        session_id: str,
        checkpoint_id: str,
        action: str,
        feedback: str | None = None,
    ) -> dict[str, Any]:
        """
        Resume a pipeline from a human gate checkpoint.
        - action='approve': continue to next step
        - action='reject': re-run the steps before the gate
        
        The `feedback` parameter may contain a JSON-encoded structured payload
        with human edits (approved spots, edited scripts, translation corrections, etc.).
        Parsed edits are merged into session outputs so downstream steps consume
        the human-corrected data instead of the original AI output.
        """
        session = session_service.get_session(session_id)
        if not session:
            raise ValueError(f"Session not found: {session_id}")

        stored_checkpoint = session.get("checkpoint_id")
        if stored_checkpoint != checkpoint_id:
            # Allow retry: if the checkpoint was already cleared (None) by a
            # previous attempt that failed mid-execution, accept the request
            # as long as the gate is a valid pipeline step.
            if stored_checkpoint is None and checkpoint_id in HUMAN_GATES:
                logger.info(
                    "Checkpoint already cleared for %s — treating as retry for %s",
                    session_id, checkpoint_id,
                )
            else:
                raise ValueError(
                    f"Checkpoint mismatch: expected {stored_checkpoint}, got {checkpoint_id}"
                )

        # Clear the checkpoint (idempotent on retry)
        session_service.clear_checkpoint(session_id)

        # Parse structured feedback if provided
        structured_feedback = None
        if feedback:
            try:
                structured_feedback = json.loads(feedback)
            except (json.JSONDecodeError, ValueError):
                # Plain text feedback — store as-is
                structured_feedback = None

        # Find the gate's position in the pipeline
        gate_index = PIPELINE_STEPS.index(checkpoint_id) if checkpoint_id in PIPELINE_STEPS else -1
        if gate_index < 0:
            raise ValueError(f"Unknown checkpoint: {checkpoint_id}")

        if action == "approve":
            # Continue from the step after the gate
            next_index = gate_index + 1

            # Store the feedback/approval payload in session
            gate_output: dict[str, Any] = {"action": "approve"}
            if structured_feedback:
                gate_output["structured"] = structured_feedback
                # Merge human edits into upstream outputs so downstream steps use corrected data
                self._apply_structured_feedback(session_id, checkpoint_id, structured_feedback)
            elif feedback:
                gate_output["feedback"] = feedback

            session_service.update_session(session_id, {
                f"outputs.{checkpoint_id}": gate_output,
            })
        elif action == "reject":
            # Find the start of the current stage (first step after previous gate)
            next_index = self._find_stage_start(gate_index)

            gate_output_r: dict[str, Any] = {"action": "reject"}
            if structured_feedback:
                gate_output_r["structured"] = structured_feedback
            elif feedback:
                gate_output_r["feedback"] = feedback

            session_service.update_session(session_id, {
                f"outputs.{checkpoint_id}": gate_output_r,
            })
        else:
            raise ValueError(f"Unknown action: {action}")

        # Reload session to get latest outputs
        session = session_service.get_session(session_id)
        question = session.get("question", "")
        uploads = session.get("uploads")

        return await self._run_from(session_id, start_step_index=next_index, question=question, uploads=uploads)

    async def get_status(self, session_id: str) -> dict[str, Any]:
        """Get current pipeline status for a session."""
        session = session_service.get_session(session_id)
        if not session:
            raise ValueError(f"Session not found: {session_id}")

        return self._build_response(session_id, session)

    # ── Standalone per-language translation (called by /pipeline/translate) ──

    async def translate_language(
        self,
        scripts: list[dict[str, Any]],
        target_language: str,
        core_language: str,
    ) -> dict[str, Any]:
        """
        Translate scripts into a single target language using Gemini.

        Returns:
          { lang, label, spots: [{ spotId, spotNumber, title, originalText, translatedText }] }
        """
        prompt = load_prompt("s6_translation")
        model = MODELS["flash"]
        temperature = TEMPERATURES.get("s6_translation", 0.5)

        # Build per-language user message
        scripts_summary = "\n\n---\n\n".join(
            f'Spot #{s.get("spotNumber", i+1)} "{s.get("title", "")}":\n{s.get("scriptText", "")}'
            for i, s in enumerate(scripts)
        )

        lang_label = target_language  # will be enriched on the frontend
        user_message = (
            f"Translate the following {len(scripts)} approved script(s) "
            f"from {core_language} into {target_language}.\n"
            f"Return ONLY valid JSON with this structure:\n"
            f'{{"translations": [{{"spotId": "...", "translatedText": "..."}}]}}\n\n'
            f"Scripts:\n{scripts_summary}"
        )

        response = await _retry_generate_content(
            self._client,
            model=model,
            contents=user_message,
            config=genai.types.GenerateContentConfig(
                system_instruction=prompt,
                temperature=temperature,
            ),
        )

        text = response.text if response.text else ""

        # Parse JSON
        clean = text.strip()
        if clean.startswith("```"):
            clean = clean.split("\n", 1)[1] if "\n" in clean else clean[3:]
            if clean.endswith("```"):
                clean = clean[:-3]
            clean = clean.strip()

        try:
            parsed = json.loads(clean)
        except (json.JSONDecodeError, ValueError):
            # Fallback: wrap raw text as single-spot translation
            parsed = {
                "translations": [
                    {"spotId": s.get("spotId", f"spot-{i}"), "translatedText": clean}
                    for i, s in enumerate(scripts)
                ]
            }

        # Normalise output to language-first format
        raw_items = parsed.get("translations", [])
        spots = []
        for i, item in enumerate(raw_items):
            spot_id = item.get("spotId", scripts[i].get("spotId", f"spot-{i}") if i < len(scripts) else f"spot-{i}")
            spot_number = item.get("spotNumber", scripts[i].get("spotNumber", i + 1) if i < len(scripts) else i + 1)
            title = item.get("title", scripts[i].get("title", f"Spot {i + 1}") if i < len(scripts) else f"Spot {i + 1}")
            original = scripts[i].get("scriptText", "") if i < len(scripts) else ""
            translated = item.get("translatedText", item.get("text", ""))

            # Handle case where backend returns spot-first format with nested translations dict
            if not translated and isinstance(item.get("translations"), dict):
                translated = item["translations"].get(target_language, "")

            spots.append({
                "spotId": spot_id,
                "spotNumber": spot_number,
                "title": title,
                "originalText": original,
                "translatedText": translated,
            })

        return {
            "lang": target_language,
            "label": lang_label,
            "spots": spots,
            "approved": False,
        }

    # ── Standalone audio generation (called by /pipeline/audio-generate) ──

    async def generate_audio_for_language(
        self,
        session_id: str,
        scripts: list[dict[str, Any]],
        voice_id: str,
        language: str,
        director_note: dict[str, Any] | None = None,
        translations: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        """
        Generate TTS audio for every spot in a **single** language.

        Returns:
          { lang, audioFiles: [...], srtFiles: [...] }
        """
        audio_files: list[dict[str, Any]] = []
        srt_files: list[dict[str, Any]] = []
        bucket = fb_storage.bucket()

        # Build translation lookup for this language
        lang_translations: dict[str, str] = {}
        if translations:
            for t in translations:
                key = t.get("spotId", "")
                text = t.get("translatedText", "")
                if key and text:
                    lang_translations[key] = text

        for script in scripts:
            spot_id = script.get("spotId", f"spot_{script.get('spotNumber', 0):03d}")
            spot_number = script.get("spotNumber", 0)
            title = script.get("title", "")
            text = lang_translations.get(spot_id, "") or script.get("scriptText", "")
            if not text.strip():
                continue

            tts_text = text
            if director_note:
                env = director_note.get("vocalEnvironment", "")
                mission = director_note.get("mission", "")
                pacing = director_note.get("pacing", "")
                parts = []
                if env:
                    parts.append(f"Environment: {env}.")
                if mission:
                    parts.append(f"Mission: {mission}.")
                if pacing:
                    parts.append(f"Pacing: {pacing}.")
                if parts:
                    tts_text = " ".join(parts) + "\n\n" + text

            try:
                response = await _retry_generate_content(
                    self._client,
                    model=MODELS["tts"],
                    contents=tts_text,
                    config=genai_types.GenerateContentConfig(
                        response_modalities=["AUDIO"],
                        speech_config=genai_types.SpeechConfig(
                            voice_config=genai_types.VoiceConfig(
                                prebuilt_voice_config=genai_types.PrebuiltVoiceConfig(
                                    voice_name=voice_id,
                                )
                            )
                        ),
                    ),
                )

                audio_data: bytes | None = None
                mime_type = "audio/wav"
                for part in response.candidates[0].content.parts:
                    if part.inline_data and part.inline_data.data:
                        audio_data = part.inline_data.data
                        mime_type = part.inline_data.mime_type or "audio/wav"
                        break

                if not audio_data:
                    logger.warning(f"No audio data returned for {language}/{spot_id}")
                    continue

                if mime_type.startswith("audio/L16") or mime_type == "audio/pcm":
                    audio_data = self._pcm_to_wav(audio_data, sample_rate=24000)
                    mime_type = "audio/wav"

                duration_ms = self._estimate_duration_ms(audio_data, mime_type)

                storage_path = f"audio/{session_id}/{language}/{spot_id}.wav"
                blob = bucket.blob(storage_path)
                blob.upload_from_string(audio_data, content_type="audio/wav")

                storage_emulator = os.environ.get("FIREBASE_STORAGE_EMULATOR_HOST") or os.environ.get("STORAGE_EMULATOR_HOST")
                if storage_emulator:
                    host = storage_emulator if storage_emulator.startswith("http") else f"http://{storage_emulator}"
                    encoded_path = storage_path.replace("/", "%2F")
                    audio_url = f"{host}/v0/b/{bucket.name}/o/{encoded_path}?alt=media"
                else:
                    blob.make_public()
                    audio_url = blob.public_url

                logger.info(f"TTS generated: {language}/{spot_id} — {len(audio_data)} bytes, {duration_ms}ms")

                audio_files.append({
                    "lang": language,
                    "spotId": spot_id,
                    "spotNumber": spot_number,
                    "title": title,
                    "audioUrl": audio_url,
                    "durationMs": duration_ms,
                    "voiceId": voice_id,
                    "model": MODELS["tts"],
                })

                srt_entries = tools.srt_generate_for_text(text, duration_ms / 1000.0)
                raw_srt = tools.format_srt(srt_entries)
                srt_files.append({
                    "lang": language,
                    "spotId": spot_id,
                    "entries": srt_entries,
                    "rawSrt": raw_srt,
                })

            except Exception as e:
                logger.error(f"TTS failed for {language}/{spot_id}: {e}", exc_info=True)
                audio_files.append({
                    "lang": language,
                    "spotId": spot_id,
                    "spotNumber": spot_number,
                    "title": title,
                    "audioUrl": "",
                    "durationMs": 0,
                    "error": str(e),
                })

        return {
            "lang": language,
            "audioFiles": audio_files,
            "srtFiles": srt_files,
        }

    async def generate_audio(
        self,
        session_id: str,
        scripts: list[dict[str, Any]],
        voice_id: str,
        languages: list[str],
        director_note: dict[str, Any] | None = None,
        translations: dict[str, list[dict[str, Any]]] | None = None,
    ) -> dict[str, Any]:
        """
        Generate TTS audio for each spot × language using Gemini TTS.

        Returns a dict with:
          - audioFiles: list of {lang, spotId, audioUrl, durationMs}
          - srtFiles:   list of {lang, spotId, entries[], rawSrt}
        """
        audio_files: list[dict[str, Any]] = []
        srt_files: list[dict[str, Any]] = []

        bucket = fb_storage.bucket()

        for lang in languages:
            # Build a lookup of translated texts for this language
            lang_translations: dict[str, str] = {}
            if translations and lang in translations:
                for t in translations[lang]:
                    spot_id_key = t.get("spotId", "")
                    translated = t.get("translatedText", "")
                    if spot_id_key and translated:
                        lang_translations[spot_id_key] = translated

            for script in scripts:
                spot_id = script.get("spotId", f"spot_{script.get('spotNumber', 0):03d}")
                spot_number = script.get("spotNumber", 0)
                title = script.get("title", "")
                # Use translated text for this language if available,
                # otherwise fall back to the core-language scriptText
                text = lang_translations.get(spot_id, "") or script.get("scriptText", "")

                if not text.strip():
                    continue

                # Build TTS prompt with director note context
                tts_text = text
                if director_note:
                    env = director_note.get("vocalEnvironment", "")
                    mission = director_note.get("mission", "")
                    pacing = director_note.get("pacing", "")
                    style_prefix_parts = []
                    if env:
                        style_prefix_parts.append(f"Environment: {env}.")
                    if mission:
                        style_prefix_parts.append(f"Mission: {mission}.")
                    if pacing:
                        style_prefix_parts.append(f"Pacing: {pacing}.")
                    if style_prefix_parts:
                        tts_text = " ".join(style_prefix_parts) + "\n\n" + text

                try:
                    # Call Gemini TTS (with retry for rate limits)
                    response = await _retry_generate_content(
                        self._client,
                        model=MODELS["tts"],
                        contents=tts_text,
                        config=genai_types.GenerateContentConfig(
                            response_modalities=["AUDIO"],
                            speech_config=genai_types.SpeechConfig(
                                voice_config=genai_types.VoiceConfig(
                                    prebuilt_voice_config=genai_types.PrebuiltVoiceConfig(
                                        voice_name=voice_id,
                                    )
                                )
                            ),
                        ),
                    )

                    # Extract audio bytes from response
                    audio_data: bytes | None = None
                    mime_type = "audio/wav"
                    for part in response.candidates[0].content.parts:
                        if part.inline_data and part.inline_data.data:
                            audio_data = part.inline_data.data
                            mime_type = part.inline_data.mime_type or "audio/wav"
                            break

                    if not audio_data:
                        logger.warning(f"No audio data returned for {lang}/{spot_id}")
                        continue

                    # Convert raw PCM to WAV if needed
                    if mime_type.startswith("audio/L16") or mime_type == "audio/pcm":
                        audio_data = self._pcm_to_wav(audio_data, sample_rate=24000)
                        mime_type = "audio/wav"

                    # Compute duration from audio bytes
                    duration_ms = self._estimate_duration_ms(audio_data, mime_type)

                    # Upload to Firebase Storage
                    storage_path = f"audio/{session_id}/{lang}/{spot_id}.wav"
                    blob = bucket.blob(storage_path)
                    blob.upload_from_string(audio_data, content_type="audio/wav")

                    # Build a download URL that works in both emulator and production
                    storage_emulator = os.environ.get("FIREBASE_STORAGE_EMULATOR_HOST") or os.environ.get("STORAGE_EMULATOR_HOST")
                    if storage_emulator:
                        # Emulator: use the /v0 download endpoint
                        host = storage_emulator if storage_emulator.startswith("http") else f"http://{storage_emulator}"
                        encoded_path = storage_path.replace("/", "%2F")
                        audio_url = f"{host}/v0/b/{bucket.name}/o/{encoded_path}?alt=media"
                    else:
                        # Production: make public and use the GCS public URL
                        blob.make_public()
                        audio_url = blob.public_url

                    logger.info(
                        f"TTS generated: {lang}/{spot_id} — {len(audio_data)} bytes, "
                        f"{duration_ms}ms → {storage_path}"
                    )

                    audio_files.append({
                        "lang": lang,
                        "spotId": spot_id,
                        "spotNumber": spot_number,
                        "title": title,
                        "audioUrl": audio_url,
                        "durationMs": duration_ms,
                        "voiceId": voice_id,
                        "model": MODELS["tts"],
                    })

                    # Generate SRT for this spot+lang
                    srt_entries = tools.srt_generate_for_text(text, duration_ms / 1000.0)
                    raw_srt = tools.format_srt(srt_entries)
                    srt_files.append({
                        "lang": lang,
                        "spotId": spot_id,
                        "entries": srt_entries,
                        "rawSrt": raw_srt,
                    })

                except Exception as e:
                    logger.error(f"TTS failed for {lang}/{spot_id}: {e}", exc_info=True)
                    audio_files.append({
                        "lang": lang,
                        "spotId": spot_id,
                        "spotNumber": spot_number,
                        "title": title,
                        "audioUrl": "",
                        "durationMs": 0,
                        "error": str(e),
                    })

        return {
            "success": True,
            "audioFiles": audio_files,
            "srtFiles": srt_files,
            "totalAudioFiles": len([a for a in audio_files if a.get("audioUrl")]),
            "totalSrtFiles": len(srt_files),
        }

    @staticmethod
    def _pcm_to_wav(pcm_data: bytes, sample_rate: int = 24000, channels: int = 1, sample_width: int = 2) -> bytes:
        """Wrap raw PCM bytes in a WAV header."""
        buf = io.BytesIO()
        with wave.open(buf, "wb") as wf:
            wf.setnchannels(channels)
            wf.setsampwidth(sample_width)
            wf.setframerate(sample_rate)
            wf.writeframes(pcm_data)
        return buf.getvalue()

    @staticmethod
    def _estimate_duration_ms(audio_data: bytes, mime_type: str) -> int:
        """Estimate audio duration in ms from WAV data."""
        try:
            buf = io.BytesIO(audio_data)
            with wave.open(buf, "rb") as wf:
                frames = wf.getnframes()
                rate = wf.getframerate()
                if rate > 0:
                    return int((frames / rate) * 1000)
        except Exception:
            pass
        # Fallback: estimate from byte size (16-bit mono 24kHz)
        return int(len(audio_data) / (24000 * 2) * 1000)

    async def _run_from(
        self,
        session_id: str,
        start_step_index: int,
        question: str | None = None,
        uploads: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        """Execute pipeline steps starting from the given index."""
        session = session_service.get_session(session_id)
        if not session:
            raise ValueError(f"Session not found: {session_id}")

        outputs = session.get("outputs", {})
        # Make session context available to step executors via a reserved outputs key
        outputs["_context"] = session.get("context", {})

        for i in range(start_step_index, len(PIPELINE_STEPS)):
            step_id = PIPELINE_STEPS[i]

            # Human gates — pause execution
            if step_id in HUMAN_GATES:
                step_result = {
                    "step_id": step_id,
                    "label": STEP_LABELS[step_id],
                    "status": "STOPPED",
                    "output": None,
                }
                session_service.append_step(session_id, step_result)
                session_service.set_checkpoint(session_id, step_id)
                break

            # Pipeline complete marker
            if step_id == "pipeline_complete":
                step_result = {
                    "step_id": step_id,
                    "label": STEP_LABELS[step_id],
                    "status": "FINISHED",
                    "output": {"success": True, "message": "Pipeline completed successfully"},
                }
                session_service.append_step(session_id, step_result)
                session_service.complete_session(session_id)
                break

            # Execute the step
            try:
                output = await self._execute_step(step_id, question, uploads, outputs)
                step_result = {
                    "step_id": step_id,
                    "label": STEP_LABELS[step_id],
                    "status": "FINISHED",
                    "output": output,
                }
                outputs[step_id] = output
                session_service.append_step(session_id, step_result)
            except Exception as e:
                logger.error(f"Step {step_id} failed: {e}", exc_info=True)
                step_result = {
                    "step_id": step_id,
                    "label": STEP_LABELS[step_id],
                    "status": "ERROR",
                    "output": {"error": str(e)},
                }
                session_service.append_step(session_id, step_result)
                session_service.update_session(session_id, {"status": "error"})
                break

        # Reload session and build response
        session = session_service.get_session(session_id)
        return self._build_response(session_id, session)

    async def _execute_step(
        self,
        step_id: str,
        question: str | None,
        uploads: list[dict[str, Any]] | None,
        outputs: dict[str, Any],
    ) -> Any:
        """Execute a single pipeline step."""
        # Tool function steps
        if step_id == "n5_character_select":
            context = outputs.get("s4_script_gen", {})
            spots = outputs.get("s1_metadata_extract", {}).get("spots", [])
            # Read selectedCharacterId from session context (sent by the frontend wizard)
            session_context = outputs.get("_context", {})
            character_id = session_context.get("selectedCharacterId")
            return tools.character_select({
                "selectedCharacterId": character_id,
                "spots": spots,
                "scripts": context.get("scripts", []),
            })

        if step_id == "n6_audio_qa":
            audio_output = outputs.get("s9_audio_gen", {})
            audio_files = audio_output.get("audioFiles", [])
            return tools.audio_playback_qa(audio_files)

        if step_id == "n8_generation_history":
            return tools.generation_history(outputs)

        if step_id == "s10_srt_gen":
            scripts = outputs.get("s4_script_gen", {}).get("scripts", [])
            translations_out = outputs.get("s6_translation", {})
            raw_translations = translations_out.get("translations", [])

            # If S9 already generated SRT with actual audio durations, prefer those
            audio_output = outputs.get("s9_audio_gen", {})
            s9_srt_files = audio_output.get("srtFiles", [])
            s9_audio_files = audio_output.get("audioFiles", [])

            if s9_srt_files:
                # S9 produced duration-accurate SRT — build a lookup of covered (lang, spotId)
                covered = {(s.get("lang"), s.get("spotId")) for s in s9_srt_files}
                result_srt = list(s9_srt_files)  # start with S9's files

                # For any script/translation NOT covered by S9, fall back to rule-based
                # Build duration lookup from S9 audio files
                duration_lookup: dict[tuple[str, str], float] = {}
                for af in s9_audio_files:
                    key = (af.get("lang", ""), af.get("spotId", ""))
                    duration_lookup[key] = af.get("durationMs", 0) / 1000.0

                # Check core-language scripts
                for script in scripts:
                    spot_id = script.get("spotId", "")
                    if ("en", spot_id) not in covered:
                        text = script.get("scriptText", "")
                        if isinstance(script.get("variants"), dict):
                            text = script["variants"].get("professional", text)
                        dur = duration_lookup.get(("en", spot_id))
                        if dur and dur > 0:
                            entries = tools.srt_generate_for_text(text, dur)
                        else:
                            entries = tools._text_to_srt_entries(text)
                        result_srt.append({
                            "lang": "en",
                            "spotId": spot_id,
                            "entries": entries,
                            "totalEntries": len(entries),
                        })

                # Check translations
                if raw_translations and isinstance(raw_translations[0].get("translations"), dict):
                    for item in raw_translations:
                        sid = item.get("spotId", "")
                        for lang, text in item.get("translations", {}).items():
                            if (lang, sid) not in covered:
                                dur = duration_lookup.get((lang, sid))
                                if dur and dur > 0:
                                    entries = tools.srt_generate_for_text(str(text), dur)
                                else:
                                    entries = tools._text_to_srt_entries(str(text))
                                result_srt.append({
                                    "lang": lang,
                                    "spotId": sid,
                                    "entries": entries,
                                    "totalEntries": len(entries),
                                })

                return {
                    "success": True,
                    "srtFiles": result_srt,
                    "totalFiles": len(result_srt),
                }

            # No S9 SRT available — fall back to full rule-based generation
            # S6 returns spot-first: [{spotId, translations: {en, ja, ...}}]
            # srt_generate expects language-first: [{lang, spots: [{spotId, translatedText}]}]
            translations = raw_translations
            if raw_translations and isinstance(raw_translations[0].get("translations"), dict):
                lang_map: dict[str, list[dict[str, Any]]] = {}
                for item in raw_translations:
                    spot_id = item.get("spotId", "")
                    spot_num = item.get("spotNumber", 0)
                    title = item.get("title", "")
                    for lang, text in item.get("translations", {}).items():
                        if lang not in lang_map:
                            lang_map[lang] = []
                        lang_map[lang].append({
                            "spotId": spot_id,
                            "spotNumber": spot_num,
                            "title": title,
                            "translatedText": str(text),
                        })
                translations = [{"lang": lang, "spots": spots} for lang, spots in lang_map.items()]
            return tools.srt_generate(scripts, translations)

        # S9 Audio Gen uses the real TTS pipeline
        if step_id == "s9_audio_gen":
            voice_output = outputs.get("s7_voice_recommend", {})
            # S7 returns "suggested" not "voiceId"
            voice_id = voice_output.get("suggested", voice_output.get("voiceId", "Aoede"))
            script_output = outputs.get("s4_script_gen", {})
            raw_scripts = script_output.get("scripts", [])
            # S4 returns variants dict per script; flatten to scriptText for TTS
            scripts_list = []
            for s in raw_scripts:
                script = dict(s)
                if not script.get("scriptText") and isinstance(script.get("variants"), dict):
                    v = script["variants"]
                    script["scriptText"] = v.get("professional", v.get("academic", v.get("quick", "")))
                scripts_list.append(script)
            # S8 returns { directorNote: { missionOfSpeech, pacingAndEnergy, ... } }
            raw_director = outputs.get("s8_director_note", {})
            if "directorNote" in raw_director:
                raw_director = raw_director["directorNote"]
            director_note = {
                "vocalEnvironment": raw_director.get("vocalEnvironment", ""),
                "mission": raw_director.get("mission", raw_director.get("missionOfSpeech", "")),
                "pacing": raw_director.get("pacing", raw_director.get("pacingAndEnergy", "")),
            }
            session_id = f"pipeline-tts-{os.urandom(4).hex()}"
            return await self.generate_audio(
                session_id=session_id,
                scripts=scripts_list,
                voice_id=voice_id,
                languages=["en"],
                director_note=director_note,
            )

        # Other LLM steps
        return await self._run_llm_step(step_id, question, uploads, outputs)

    async def _run_llm_step(
        self,
        step_id: str,
        question: str | None,
        uploads: list[dict[str, Any]] | None,
        outputs: dict[str, Any],
    ) -> Any:
        """Run an LLM step using the Gemini API via google-genai."""
        prompt_text = load_prompt(step_id)
        model = self._get_model_for_step(step_id)
        temperature = TEMPERATURES.get(step_id, 0.5)

        # Build the user message based on step dependencies
        user_message = self._build_user_message(step_id, question, uploads, outputs)

        # Call Gemini via the genai client (with retry for rate limits)
        response = await _retry_generate_content(
            self._client,
            model=model,
            contents=user_message,
            config=genai.types.GenerateContentConfig(
                system_instruction=prompt_text,
                temperature=temperature,
            ),
        )

        # Extract text response
        text = response.text if response.text else ""

        # Try to parse as JSON
        try:
            # Strip markdown code fences if present
            clean = text.strip()
            if clean.startswith("```"):
                clean = clean.split("\n", 1)[1] if "\n" in clean else clean[3:]
                if clean.endswith("```"):
                    clean = clean[:-3]
                clean = clean.strip()
            parsed = json.loads(clean)

            # Attach usage metadata
            if hasattr(response, "usage_metadata") and response.usage_metadata:
                parsed["_meta"] = {
                    "type": "llm",
                    "model": model,
                    "usage": {
                        "input_tokens": getattr(response.usage_metadata, "prompt_token_count", 0),
                        "output_tokens": getattr(response.usage_metadata, "candidates_token_count", 0),
                        "total_tokens": getattr(response.usage_metadata, "total_token_count", 0),
                    },
                }
            return parsed

        except (json.JSONDecodeError, ValueError):
            # Return raw text with metadata
            result: dict[str, Any] = {"_content": text}
            if hasattr(response, "usage_metadata") and response.usage_metadata:
                result["_meta"] = {
                    "type": "llm",
                    "model": model,
                    "usage": {
                        "input_tokens": getattr(response.usage_metadata, "prompt_token_count", 0),
                        "output_tokens": getattr(response.usage_metadata, "candidates_token_count", 0),
                        "total_tokens": getattr(response.usage_metadata, "total_token_count", 0),
                    },
                }
            return result

    def _get_model_for_step(self, step_id: str) -> str:
        """Return the appropriate model for a given step."""
        if step_id == "s9_audio_gen":
            return MODELS["tts"]
        # Use Flash for all steps (Pro has much tighter rate limits at Tier 1)
        return MODELS["flash"]

    def _build_user_message(
        self,
        step_id: str,
        question: str | None,
        uploads: list[dict[str, Any]] | None,
        outputs: dict[str, Any],
    ) -> str | list:
        """Build the user message for an LLM step based on its upstream dependencies."""
        if step_id == "s2_ocr_parse":
            return self._build_ocr_message(question, uploads)

        if step_id == "s1_metadata_extract":
            ocr_output = outputs.get("s2_ocr_parse", {})
            ocr_text = ocr_output.get("_content", json.dumps(ocr_output, ensure_ascii=False))
            ctx = outputs.get("_context", {})
            core_lang = ctx.get("coreLanguage", "en")
            return (
                f"Extract structured metadata from the following parsed document text. "
                f"Write all text fields (title, description, etc.) in {core_lang} (the venue's core language). "
                f"Return ONLY valid JSON:\n\n{ocr_text}"
            )

        if step_id == "s4_script_gen":
            metadata = outputs.get("s1_metadata_extract", {})
            ctx = outputs.get("_context", {})
            core_lang = ctx.get("coreLanguage", "en")
            return (
                f"Generate audio guide scripts for all spots in the following approved metadata. "
                f"Write ALL scripts in {core_lang} (the venue's core language). "
                f"Create all 5 audience variants (kids, academic, quick, professional, brief) for each spot. "
                f"Return ONLY valid JSON:\n\n{json.dumps(metadata, ensure_ascii=False)}"
            )

        if step_id == "s5_image_map":
            scripts = outputs.get("s4_script_gen", {})
            return f"Assign images to spots based on the following scripts and available assets. Return ONLY valid JSON:\n\n{json.dumps(scripts, ensure_ascii=False)}"

        if step_id == "s6_translation":
            scripts = outputs.get("s4_script_gen", {})
            # Read target languages from entity config (session context)
            ctx = outputs.get("_context", {})
            target_langs = ctx.get("supportedLanguages", ["en"])
            core_lang = ctx.get("coreLanguage", "ja")
            # Ensure the core language is included in the list
            if core_lang not in target_langs:
                target_langs = [core_lang] + list(target_langs)
            lang_list_str = ", ".join(target_langs)
            return (
                f"Translate the following approved scripts into EXACTLY these target languages: {lang_list_str}.\n"
                f"Use the 'professional' variant as the base text. "
                f"Return ONLY valid JSON.\n\n{json.dumps(scripts, ensure_ascii=False)}"
            )

        if step_id == "s7_voice_recommend":
            char_output = outputs.get("n5_character_select", {})
            # Include the character ID so the LLM considers it when recommending a voice
            character_id = char_output.get("characterId")
            context_payload = dict(char_output)
            if character_id:
                context_payload["selectedCharacterId"] = character_id
            return f"Based on the selected character and content context below, recommend the best TTS voice. Return ONLY valid JSON:\n\n{json.dumps(context_payload, ensure_ascii=False)}"

        if step_id == "s8_director_note":
            voice_output = outputs.get("s7_voice_recommend", {})
            return f"Generate a director's note for the audio guide production based on this context. Consider the character, voice, and content type:\n\n{json.dumps(voice_output, ensure_ascii=False)}"

        return question or ""

    def _build_ocr_message(
        self,
        question: str | None,
        uploads: list[dict[str, Any]] | None,
    ) -> str | list:
        """
        Build a multimodal content list for OCR parsing.
        If uploads contain base64 file data, send them inline to Gemini
        so it can actually read the PDF/image content.
        """
        text_part = (
            "Please extract and parse ALL text content from the uploaded document(s). "
            "Organise by exhibit/item number and include all metadata fields you can identify. "
            "Return the extracted text faithfully — do NOT invent or hallucinate content.\n\n"
            f"{question or ''}"
        )

        if not uploads:
            return text_part

        # Build multimodal parts: inline file data + text instruction
        parts: list[Any] = []

        for upload in uploads:
            data_uri = upload.get("data", "")
            mime = upload.get("mime", "application/pdf")
            name = upload.get("name", "file")

            if data_uri and data_uri.startswith("data:"):
                # Parse data URI: "data:<mime>;base64,<b64data>"
                try:
                    header, b64data = data_uri.split(",", 1)
                    # Extract mime from header if present
                    if ";base64" in header:
                        mime_from_header = header.split(":", 1)[1].split(";", 1)[0]
                        if mime_from_header:
                            mime = mime_from_header
                    file_bytes = base64.b64decode(b64data)
                    parts.append(
                        genai.types.Part.from_bytes(data=file_bytes, mime_type=mime)
                    )
                    logger.info(f"Attached inline file: {name} ({mime}, {len(file_bytes)} bytes)")
                except Exception as e:
                    logger.warning(f"Failed to decode upload {name}: {e}")
                    parts.append(f"[File: {name} — could not decode]")
            else:
                # No inline data — just mention the file name
                parts.append(f"[File: {name} — no inline data available]")

        # Text instruction comes after the file parts so the model sees the document first
        parts.append(text_part)

        return parts

    def _apply_structured_feedback(
        self,
        session_id: str,
        checkpoint_id: str,
        feedback: dict[str, Any],
    ) -> None:
        """
        Merge human-edited data from structured gate feedback into session outputs.

        For example, HG3 (Script Review) feedback may contain editedScripts with
        user-corrected scriptText. These corrections are merged into the s4_script_gen
        output so that downstream steps (S6 Translation, S9 Audio Gen) use the
        human-corrected text instead of the original AI output.
        """
        updates: dict[str, Any] = {}

        if checkpoint_id == "hg1_data_review":
            # Merge edited spots into s1_metadata_extract
            if "spots" in feedback:
                updates["outputs.s1_metadata_extract"] = {"spots": feedback["spots"]}

        elif checkpoint_id == "hg3_script_review":
            # Merge edited scripts into s4_script_gen
            edited = feedback.get("editedScripts")
            if isinstance(edited, list) and edited:
                # Reload current s4 output and patch scriptText per spot
                session = session_service.get_session(session_id)
                s4_output = (session or {}).get("outputs", {}).get("s4_script_gen", {})
                scripts = s4_output.get("scripts", [])
                edits_by_spot = {e["spotId"]: e for e in edited if isinstance(e, dict) and "spotId" in e}
                for script in scripts:
                    sid = script.get("spotId", "")
                    if sid in edits_by_spot:
                        edit = edits_by_spot[sid]
                        if "scriptText" in edit:
                            script["scriptText"] = edit["scriptText"]
                        # If backend uses variants, also update the professional variant
                        if isinstance(script.get("variants"), dict) and "scriptText" in edit:
                            script["variants"]["professional"] = edit["scriptText"]
                s4_output["scripts"] = scripts
                updates["outputs.s4_script_gen"] = s4_output

        elif checkpoint_id == "hg4_translation_review":
            # Merge edited translations into s6_translation
            edited_translations = feedback.get("editedTranslations")
            if isinstance(edited_translations, list) and edited_translations:
                session = session_service.get_session(session_id)
                s6_output = (session or {}).get("outputs", {}).get("s6_translation", {})
                raw_translations = s6_output.get("translations", [])
                # Frontend sends language-first: [{lang, spots: [{spotId, translatedText}]}]
                # Backend stores spot-first: [{spotId, translations: {lang: text}}]
                if raw_translations and isinstance(raw_translations[0].get("translations"), dict):
                    # Spot-first format — apply edits
                    for lang_edit in edited_translations:
                        lang = lang_edit.get("lang", "")
                        for spot_edit in lang_edit.get("spots", []):
                            spot_id = spot_edit.get("spotId", "")
                            new_text = spot_edit.get("translatedText", "")
                            for item in raw_translations:
                                if item.get("spotId") == spot_id:
                                    trans = item.get("translations", {})
                                    if lang in trans:
                                        trans[lang] = new_text
                    s6_output["translations"] = raw_translations
                    updates["outputs.s6_translation"] = s6_output

        elif checkpoint_id == "hg5_audio_review":
            # Store audio review feedback (character preferences, pronunciation markers)
            if "characterId" in feedback or "voiceId" in feedback or "directorNote" in feedback:
                updates[f"outputs.{checkpoint_id}_preferences"] = {
                    "characterId": feedback.get("characterId"),
                    "voiceId": feedback.get("voiceId"),
                    "directorNote": feedback.get("directorNote"),
                    "pronunciationMarkers": feedback.get("pronunciationMarkers", []),
                }

        if updates:
            session_service.update_session(session_id, updates)

    def _find_stage_start(self, gate_index: int) -> int:
        """Find the first step index for the stage containing the given gate."""
        # Walk backwards from the gate to find the previous gate (or start)
        for i in range(gate_index - 1, -1, -1):
            if PIPELINE_STEPS[i] in HUMAN_GATES:
                return i + 1  # Start after the previous gate
        return 0  # Start of pipeline

    def _build_response(self, session_id: str, session: dict[str, Any]) -> dict[str, Any]:
        """Build the API response from session state."""
        steps = session.get("steps", [])
        status = session.get("status", "running")
        checkpoint_id = session.get("checkpoint_id")

        # Map steps to response format
        response_steps = []
        for step in steps:
            response_steps.append({
                "stepId": step["step_id"],
                "label": step.get("label", STEP_LABELS.get(step["step_id"], step["step_id"])),
                "status": step.get("status", "FINISHED"),
                "output": step.get("output"),
            })

        return {
            "sessionId": session_id,
            "checkpointId": checkpoint_id,
            "steps": response_steps,
            "finalText": session.get("final_text"),
            "status": status,
        }
