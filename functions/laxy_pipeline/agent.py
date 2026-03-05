# ---------------------------------------------------------------------------
# ADK Web Debug Agent — Laxy Guide Creation Pipeline
# ---------------------------------------------------------------------------
"""
Wraps the Laxy pipeline steps as proper ADK agents so they can be
explored and debugged via `adk web`.

Launch with:
    cd functions && adk web .

Then open http://localhost:8000 and select "laxy_pipeline".
"""
from __future__ import annotations

from pathlib import Path

from google.adk.agents import LlmAgent, SequentialAgent
from google.genai import types as genai_types

# ── Prompt loading ──

PROMPTS_DIR = Path(__file__).resolve().parent.parent / "agents" / "prompts"


def _load_prompt(name: str) -> str:
    path = PROMPTS_DIR / f"{name}.txt"
    return path.read_text(encoding="utf-8").strip()


# ── Model aliases (same as pipeline_agent.py) ──

MODEL_FLASH = "gemini-2.5-flash"
MODEL_PRO = "gemini-2.5-pro"

# ── Individual LLM step agents ──

s2_ocr_parse = LlmAgent(
    name="s2_ocr_parse",
    description="S2: OCR Parse — extracts text from uploaded documents/images",
    model=MODEL_FLASH,
    instruction=_load_prompt("s2_ocr_parse"),
    generate_content_config=genai_types.GenerateContentConfig(
        temperature=0.3,
    ),
    output_key="ocr_text",
)

s1_metadata_extract = LlmAgent(
    name="s1_metadata_extract",
    description="S1: Metadata Extract — structures exhibit metadata from parsed text",
    model=MODEL_FLASH,
    instruction=_load_prompt("s1_metadata_extract"),
    generate_content_config=genai_types.GenerateContentConfig(
        temperature=0.2,
    ),
    output_key="metadata",
)

s4_script_gen = LlmAgent(
    name="s4_script_gen",
    description="S4: Script Gen — generates audio guide scripts in 5 audience variants",
    model=MODEL_PRO,
    instruction=_load_prompt("s4_script_gen"),
    generate_content_config=genai_types.GenerateContentConfig(
        temperature=0.8,
    ),
    output_key="scripts",
)

s5_image_map = LlmAgent(
    name="s5_image_map",
    description="S5: Image Map — maps images to exhibit spots",
    model=MODEL_FLASH,
    instruction=_load_prompt("s5_image_map"),
    generate_content_config=genai_types.GenerateContentConfig(
        temperature=0.3,
    ),
    output_key="image_map",
)

s6_translation = LlmAgent(
    name="s6_translation",
    description="S6: Translation — translates scripts into target languages",
    model=MODEL_PRO,
    instruction=_load_prompt("s6_translation"),
    generate_content_config=genai_types.GenerateContentConfig(
        temperature=0.5,
    ),
    output_key="translations",
)

s7_voice_recommend = LlmAgent(
    name="s7_voice_recommend",
    description="S7: Voice Recommend — recommends TTS voices for characters",
    model=MODEL_FLASH,
    instruction=_load_prompt("s7_voice_recommend"),
    generate_content_config=genai_types.GenerateContentConfig(
        temperature=0.5,
    ),
    output_key="voice_recommendations",
)

s8_director_note = LlmAgent(
    name="s8_director_note",
    description="S8: Director Note — generates speech direction/SSML annotations",
    model=MODEL_FLASH,
    instruction=_load_prompt("s8_director_note"),
    generate_content_config=genai_types.GenerateContentConfig(
        temperature=0.6,
    ),
    output_key="director_notes",
)

# ── Root agent: sequential pipeline of all LLM steps ──

root_agent = SequentialAgent(
    name="laxy_pipeline",
    description=(
        "Laxy Guide Creation Pipeline — sequential agent that processes "
        "museum/cultural-site content through OCR, metadata extraction, "
        "script generation, image mapping, translation, voice recommendation, "
        "and director note generation."
    ),
    sub_agents=[
        s2_ocr_parse,
        s1_metadata_extract,
        s4_script_gen,
        s5_image_map,
        s6_translation,
        s7_voice_recommend,
        s8_director_note,
    ],
)
