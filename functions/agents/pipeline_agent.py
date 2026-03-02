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

import json
import logging
import os
from pathlib import Path
from typing import Any

from google.adk.agents import Agent
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google import genai

from . import session as session_service
from . import tools

logger = logging.getLogger(__name__)

# ── Prompt loading ──

PROMPTS_DIR = Path(__file__).parent / "prompts"


def load_prompt(name: str) -> str:
    """Load a system prompt from the prompts directory."""
    path = PROMPTS_DIR / f"{name}.txt"
    return path.read_text(encoding="utf-8").strip()


# ── Model configuration ──

MODELS = {
    "flash": "gemini-2.0-flash",
    "pro": "gemini-2.5-pro-preview-05-06",
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
    "s9_audio_gen": 0.3,
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
        """
        session = session_service.get_session(session_id)
        if not session:
            raise ValueError(f"Session not found: {session_id}")

        if session.get("checkpoint_id") != checkpoint_id:
            raise ValueError(f"Checkpoint mismatch: expected {session.get('checkpoint_id')}, got {checkpoint_id}")

        # Clear the checkpoint
        session_service.clear_checkpoint(session_id)

        # Find the gate's position in the pipeline
        gate_index = PIPELINE_STEPS.index(checkpoint_id) if checkpoint_id in PIPELINE_STEPS else -1
        if gate_index < 0:
            raise ValueError(f"Unknown checkpoint: {checkpoint_id}")

        if action == "approve":
            # Continue from the step after the gate
            next_index = gate_index + 1
            # Store the feedback/approval payload in session
            if feedback:
                session_service.update_session(session_id, {
                    f"outputs.{checkpoint_id}": {
                        "action": "approve",
                        "feedback": feedback,
                    }
                })
        elif action == "reject":
            # Find the start of the current stage (first step after previous gate)
            next_index = self._find_stage_start(gate_index)
            if feedback:
                session_service.update_session(session_id, {
                    f"outputs.{checkpoint_id}": {
                        "action": "reject",
                        "feedback": feedback,
                    }
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
            return tools.character_select({
                "selectedCharacterId": None,  # Will be set by user context
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
            translations = translations_out.get("translations", [])
            return tools.srt_generate(scripts, translations)

        # LLM steps
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

        # Call Gemini via the genai client
        response = await self._client.aio.models.generate_content(
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
        pro_steps = {"s4_script_gen", "s6_translation"}
        if step_id in pro_steps:
            return MODELS["pro"]
        if step_id == "s9_audio_gen":
            return MODELS["tts"]
        return MODELS["flash"]

    def _build_user_message(
        self,
        step_id: str,
        question: str | None,
        uploads: list[dict[str, Any]] | None,
        outputs: dict[str, Any],
    ) -> str:
        """Build the user message for an LLM step based on its upstream dependencies."""
        if step_id == "s2_ocr_parse":
            msg = f"Please extract and parse all text content from the following input. Organise by exhibit/item number and include all metadata fields you can identify:\n\n{question or ''}"
            if uploads:
                msg += "\n\n[Uploaded files: " + ", ".join(u.get("name", "file") for u in uploads) + "]"
            return msg

        if step_id == "s1_metadata_extract":
            ocr_output = outputs.get("s2_ocr_parse", {})
            ocr_text = ocr_output.get("_content", json.dumps(ocr_output, ensure_ascii=False))
            return f"Extract structured metadata from the following parsed document text. Return ONLY valid JSON:\n\n{ocr_text}"

        if step_id == "s4_script_gen":
            metadata = outputs.get("s1_metadata_extract", {})
            return f"Generate audio guide scripts for all spots in the following approved metadata. Create all 5 audience variants (kids, academic, quick, professional, brief) for each spot. Return ONLY valid JSON:\n\n{json.dumps(metadata, ensure_ascii=False)}"

        if step_id == "s5_image_map":
            scripts = outputs.get("s4_script_gen", {})
            return f"Assign images to spots based on the following scripts and available assets. Return ONLY valid JSON:\n\n{json.dumps(scripts, ensure_ascii=False)}"

        if step_id == "s6_translation":
            scripts = outputs.get("s4_script_gen", {})
            return f"Translate the following approved scripts into all target languages (en, ja, ko, zh-TW, zh-CN, fr). Use the 'professional' variant as the base text. Return ONLY valid JSON:\n\n{json.dumps(scripts, ensure_ascii=False)}"

        if step_id == "s7_voice_recommend":
            char_output = outputs.get("n5_character_select", {})
            return f"Based on the selected character and content context below, recommend the best TTS voice. Return ONLY valid JSON:\n\n{json.dumps(char_output, ensure_ascii=False)}"

        if step_id == "s8_director_note":
            voice_output = outputs.get("s7_voice_recommend", {})
            return f"Generate a director's note for the audio guide production based on this context. Consider the character, voice, and content type:\n\n{json.dumps(voice_output, ensure_ascii=False)}"

        if step_id == "s9_audio_gen":
            director_output = outputs.get("s8_director_note", {})
            scripts = outputs.get("s4_script_gen", {})
            voice_output = outputs.get("s7_voice_recommend", {})
            context = {
                "directorNote": director_output,
                "scripts": scripts,
                "voice": voice_output,
            }
            return f"Generate TTS audio for the following scripts using the specified voice and director note guidance. Return ONLY valid JSON:\n\n{json.dumps(context, ensure_ascii=False)}"

        return question or ""

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
