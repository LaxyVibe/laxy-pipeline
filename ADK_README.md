# ADK Pipeline Backend — Reference

> Documents the **as-built** state of the backend pipeline in `functions/`.  
> Last reviewed: 2026-03-04

---

## Overview

The backend is a set of Firebase Functions (2nd gen, Python) that expose the Laxy guide-creation pipeline over HTTP. It replaced Flowise entirely. There is no ADK `SequentialAgent` abstraction in use — instead, a custom `PipelineExecutor` class (`pipeline_agent.py`) owns the full orchestration loop, calling `google-genai` directly and persisting state to Firestore between human gates.

---

## Architecture

```
laxy-studio (React/Vite)
        │
        │  POST /pipeline-start
        │  POST /pipeline-resume
        │  GET  /pipeline-status
        │  POST /audio-generate
        │  POST /audio-generate-language
        │  POST /translate-language
        ▼
Firebase Functions (2nd gen, Python, 2 GB RAM, 1800 s timeout)
        │
        ├── PipelineExecutor           (pipeline_agent.py)
        │     ├── Calls google-genai client (gemini-2.5-flash / -pro / -flash-tts)
        │     ├── Persists state to Firestore (session_service.py)
        │     └── Uploads WAV audio to Firebase Storage
        │
        └── Firestore
              collection: pipeline_sessions/{sessionId}
```

### Thread / event-loop model

Firebase Functions runs synchronous WSGI handlers. To call the async `google-genai` client (which uses `httpx`/`anyio` internally), the module keeps a **single background thread** with its own `asyncio` event loop. Each HTTP request submits a coroutine via `asyncio.run_coroutine_threadsafe()` and blocks until the future resolves. This avoids `nest_asyncio` loop-nesting issues.

---

## HTTP Endpoints

All functions live in `functions/main.py` and are deployed as separate Cloud Run services (`memory=GB_2, timeout_sec=1800, region=us-central1`).

All responses share CORS headers (`Access-Control-Allow-Origin: *`). Preflight `OPTIONS` requests return `204`.

### `POST /pipeline-start`

Start a new pipeline session.

**Request**
```json
{
  "sessionId": "studio-abc123",
  "question": "Process museum exhibits...",
  "uploads": [
    { "data": "data:application/pdf;base64,...", "name": "catalog.pdf", "mime": "application/pdf" }
  ],
  "context": {
    "venueName": "Tokyo National Museum",
    "coreLanguage": "ja",
    "supportedLanguages": ["en", "zh-TW"],
    "enabledModules": ["guide"],
    "selectedLayout": "classic",
    "selectedCharacterId": "friendly-guide"
  }
}
```

**Response** — `PipelineResponse` (see below)

Creates a Firestore session document and runs steps from `s2_ocr_parse` until the first human gate or pipeline completion. File uploads are decoded from data URIs and sent inline to Gemini as `Part.from_bytes`.

---

### `POST /pipeline-resume`

Resume a pipeline from a human gate checkpoint.

**Request**
```json
{
  "sessionId": "studio-abc123",
  "checkpointId": "hg1_data_review",
  "action": "approve",
  "feedback": "{\"spots\": [...]}"
}
```

`action` must be `"approve"` or `"reject"`. `"reject"` re-runs the entire stage (from the step after the previous gate). Structured JSON in `feedback` is parsed and merged into session outputs via `_apply_structured_feedback()` before execution resumes. On guard retry (checkpoint already cleared), the request is accepted idempotently if the gate ID is valid.

---

### `GET /pipeline-status?sessionId=...`

Poll current session state. Used by `usePipelinePolling` for long-running reconnection. Returns the same `PipelineResponse` shape built from Firestore.

---

### `POST /audio-generate`

Batch TTS generation — all spots × all languages in one call.

**Request**
```json
{
  "sessionId": "audio-abc123",
  "scripts": [{ "spotId": "spot_001", "spotNumber": 1, "title": "Cloud Dragon", "scriptText": "..." }],
  "voiceId": "Aoede",
  "languages": ["en", "ja"],
  "directorNote": { "vocalEnvironment": "...", "mission": "...", "pacing": "..." },
  "translations": { "ja": [{ "spotId": "spot_001", "translatedText": "..." }] }
}
```

Calls `generate_audio()` — iterates `languages × scripts`, calls Gemini TTS per spot, converts raw PCM (`audio/L16`) to WAV, uploads to Firebase Storage at `audio/{sessionId}/{lang}/{spotId}.wav`, and returns public URLs. SRT files are generated from the actual audio duration.

---

### `POST /audio-generate-language`

Per-language TTS generation. Called by `AudioProductionStep` (one request per language, in sequence).

**Request**
```json
{
  "sessionId": "audio-abc123",
  "scripts": [...],
  "voiceId": "Aoede",
  "language": "ja",
  "directorNote": { "vocalEnvironment": "...", "mission": "...", "pacing": "..." },
  "translations": [{ "spotId": "spot_001", "translatedText": "..." }]
}
```

**Response**: `{ "lang": "ja", "audioFiles": [...], "srtFiles": [...] }`

---

### `POST /translate-language`

Standalone per-language translation using Gemini. Called directly by `TranslationReviewStep` (one request per language, in parallel).

**Request**
```json
{ "scripts": [...], "targetLanguage": "zh-TW", "coreLanguage": "en" }
```

**Response**: `{ "lang": "zh-TW", "label": "zh-TW", "spots": [{ "spotId": "...", "translatedText": "..." }], "approved": false }`

Returns normalized language-first format regardless of Gemini's raw JSON shape.

---

## Pipeline Response Shape

```json
{
  "sessionId": "studio-abc123",
  "checkpointId": "hg1_data_review",
  "steps": [
    { "stepId": "s2_ocr_parse",        "label": "S2: OCR Parse (Gemini)",       "status": "FINISHED", "output": { ... } },
    { "stepId": "s1_metadata_extract", "label": "S1: Metadata Extract (Gemini)", "status": "FINISHED", "output": { ... } },
    { "stepId": "hg1_data_review",     "label": "HG1: Data Review",              "status": "STOPPED",  "output": null }
  ],
  "finalText": null,
  "status": "awaiting_input"
}
```

`status` values: `"running"` | `"awaiting_input"` | `"completed"` | `"error"`

---

## Pipeline Steps

### Step order

```
s2_ocr_parse  →  s1_metadata_extract  →  [HG1]  →
s4_script_gen  →  s5_image_map  →  [HG3]  →
s6_translation  →  [HG4]  →
n5_character_select  →  s7_voice_recommend  →  s8_director_note  →
s9_audio_gen  →  n6_audio_qa  →  [HG5]  →
n8_generation_history  →  s10_srt_gen  →  pipeline_complete
```

Human gates: `hg1_data_review`, `hg3_script_review`, `hg4_translation_review`, `hg5_audio_review`

### Step details

| Step ID | Type | Model | Description |
|---|---|---|---|
| `s2_ocr_parse` | LLM | `gemini-2.5-flash` (temp 0.3) | Parse raw text + metadata from uploaded documents. Sends files as inline `Part.from_bytes` for multimodal input. |
| `s1_metadata_extract` | LLM | `gemini-2.5-flash` (temp 0.2) | Extract structured spot metadata from OCR output. Writes fields in `coreLanguage` from session context. |
| `hg1_data_review` | Gate | — | Pause. Frontend shows `MetadataEditor`. Approved with `spots[]` in feedback. |
| `s4_script_gen` | LLM | `gemini-2.5-flash` (temp 0.8) | Generate 5 audience variants (kids, academic, quick, professional, brief) per spot in `coreLanguage`. |
| `s5_image_map` | LLM | `gemini-2.5-flash` (temp 0.3) | AI auto-assigns assets to spots. |
| `hg3_script_review` | Gate | — | Pause. Frontend shows `ScriptReviewStep`. Approved with `editedScripts[]` — merged into `s4_script_gen` output. |
| `s6_translation` | LLM | `gemini-2.5-flash` (temp 0.5) | Translate all approved scripts into `supportedLanguages` from session context. Also available standalone via `/translate-language`. |
| `hg4_translation_review` | Gate | — | Pause. Frontend shows `TranslationReviewStep`. Approved with `editedTranslations[]` — merged into `s6_translation` output. |
| `n5_character_select` | Tool | — | Validates `selectedCharacterId` from session context; builds content summary for S7. |
| `s7_voice_recommend` | LLM | `gemini-2.5-flash` (temp 0.5) | Recommends a Gemini TTS voice (`suggested` field) given character + content context. |
| `s8_director_note` | LLM | `gemini-2.5-flash` (temp 0.6) | Generates director notes: `vocalEnvironment`, `mission`, `pacing`. Normalizes field name variants. |
| `s9_audio_gen` | TTS | `gemini-2.5-flash-preview-tts` | Generates WAV audio for all spots (English only in pipeline). PCM (`audio/L16`) auto-converted to WAV via `wave`. Duration estimated from WAV headers. Files uploaded to `audio/{sessionId}/en/{spotId}.wav`. |
| `n6_audio_qa` | Tool | — | Validates audio files (language code, URL presence, duration). Adds `qaStatus: "pass"\|"warning"` per file. |
| `hg5_audio_review` | Gate | — | Pause. Frontend shows `AudioProductionStep`. Approved with `characterId`, `voiceId`, `directorNote`, `pronunciationMarkers`. |
| `n8_generation_history` | Tool | — | Compiles audit log of all completed generation steps with token usage. |
| `s10_srt_gen` | Tool | — | Prefers duration-accurate SRT from S9 audio. Falls back to rule-based (8 words/segment, 5 s/segment) for uncovered spots or languages. |

### Model configuration

```python
MODELS = {
    "flash": "gemini-2.5-flash",
    "pro":   "gemini-2.5-pro",
    "tts":   "gemini-2.5-flash-preview-tts",
}
```

> All LLM steps use `flash` — `pro` is defined but not currently assigned to any step due to tighter rate limits at Tier 1.

---

## Gemini Client Initialisation

`PipelineExecutor.__init__` checks for `GEMINI_API_KEY` first. If set, the `google-genai` client is created in direct API key mode. Otherwise it falls back to Vertex AI using Application Default Credentials (`vertexai=True, project=..., location=...`).

```python
api_key = os.environ.get("GEMINI_API_KEY")
if api_key:
    self._client = genai.Client(api_key=api_key)
else:
    self._client = genai.Client(vertexai=True, project=self.project_id, location=self.location)
```

Relevant env vars: `GEMINI_API_KEY`, `GCP_PROJECT` (or `GCLOUD_PROJECT`), `GCP_REGION` (default `us-central1`).

---

## Retry Logic

All Gemini API calls go through `_retry_generate_content()`. It retries up to 5 times with exponential backoff (start 2 s, max 60 s, factor 2.0, ±50% jitter) on any exception whose message contains `429`, `RESOURCE_EXHAUSTED`, `rate limit`, `quota`, `503`, or `overloaded`.

---

## Structured Feedback Merging

When the user approves a human gate with edited data, `_apply_structured_feedback()` patches the relevant upstream outputs in Firestore so that downstream steps consume human-corrected data.

| Gate | Feedback field | Merged into |
|---|---|---|
| `hg1_data_review` | `spots[]` | `outputs.s1_metadata_extract.spots` |
| `hg3_script_review` | `editedScripts[]` | `outputs.s4_script_gen.scripts[].scriptText` and `variants.professional` |
| `hg4_translation_review` | `editedTranslations[]` | `outputs.s6_translation.translations[].translations[lang]` |
| `hg5_audio_review` | `characterId`, `voiceId`, `directorNote`, `pronunciationMarkers` | `outputs.hg5_audio_review_preferences` |

On `"reject"`, `_find_stage_start()` walks backwards from the gate to find the previous gate and re-runs from the stage start (`start_step_index` = previous gate + 1).

---

## Firestore Session Schema

**Collection:** `pipeline_sessions`  
**Document ID:** `{sessionId}` (generated by the frontend)

```
{
  session_id:      string,
  status:          "running" | "awaiting_input" | "completed" | "error",
  current_step:    string | null,
  checkpoint_id:   string | null,
  steps:           StepRecord[],   // ArrayUnion grows with each completed step
  outputs:         { [step_id]: output_data },   // flat map for fast reads
  question:        string,
  uploads:         UploadRecord[],
  context:         { venueName, coreLanguage, supportedLanguages, … },
  created_at:      ServerTimestamp,
  updated_at:      ServerTimestamp,
}
```

**Session service functions** (`agents/session.py`):

| Function | Description |
|---|---|
| `create_session(id, data)` | Creates a new document with `status: "running"`. |
| `get_session(id)` | Reads the document; returns `None` if not found. |
| `update_session(id, updates)` | Partial update; auto-sets `updated_at`. |
| `append_step(id, step)` | `ArrayUnion` on `steps`; also sets `outputs.{step_id}` and `current_step`. |
| `set_checkpoint(id, checkpoint_id)` | Sets `status: "awaiting_input"` and `checkpoint_id`. |
| `clear_checkpoint(id)` | Sets `status: "running"` and `checkpoint_id: null`. |
| `complete_session(id)` | Sets `status: "completed"`. |

---

## Non-LLM Tool Functions (`agents/tools.py`)

| Function | Step | Description |
|---|---|---|
| `character_select(context)` | N5 | Validates `selectedCharacterId` from session context; builds `contentSummary` for S7. |
| `audio_playback_qa(audio_files)` | N6 | Checks each file for valid lang code, non-empty URL, positive duration. Returns `qaStatus: "pass"\|"warning"` per file. |
| `generation_history(session_outputs)` | N8 | Compiles a step-by-step audit log with token usage from `_meta.usage` fields. |
| `srt_generate(scripts, translations)` | S10 (fallback) | Rule-based SRT: 8 words / segment, 5 s / segment for both core-language and translated scripts. |
| `srt_generate_for_text(text, duration_s)` | Helper | Duration-proportional SRT using actual audio length from S9. |
| `format_srt(entries)` | Helper | Serialises SRT entries to the `.srt` text format. |

---

## System Prompts (`agents/prompts/`)

One `.txt` file per LLM step. Loaded at import time and passed as `system_instruction` to `GenerateContentConfig`.

| File | Step |
|---|---|
| `s2_ocr_parse.txt` | S2 |
| `s1_metadata_extract.txt` | S1 |
| `s4_script_gen.txt` | S4 |
| `s5_image_map.txt` | S5 |
| `s6_translation.txt` | S6 |
| `s7_voice_recommend.txt` | S7 |
| `s8_director_note.txt` | S8 |
| `s9_audio_gen.txt` | S9 (not used for TTS — used only for context; TTS calls suppress instruction) |

---

## Firebase Storage Layout

Audio files are uploaded by `PipelineExecutor.generate_audio_for_language()` / `generate_audio()`:

```
audio/
└── {sessionId}/
    └── {language}/
        └── {spotId}.wav
```

In production, blobs are made public (`blob.make_public()`). When `FIREBASE_STORAGE_EMULATOR_HOST` or `STORAGE_EMULATOR_HOST` is set, the emulator's `/v0/b/{bucket}/o/{path}?alt=media` URL is returned instead.

---

## Dependencies (`functions/requirements.txt`)

```
google-adk>=1.0.0
google-cloud-aiplatform>=1.60.0
google-cloud-storage>=2.14.0
firebase-functions>=0.4.0
firebase-admin>=6.5.0
google-cloud-firestore>=2.16.0
pytest>=8.0.0
pytest-asyncio>=0.23.0
```

> `google-adk` is listed as a dependency but the `PipelineExecutor` does not use ADK's `SequentialAgent`/`LlmAgent` classes — it calls `google.genai.Client` directly. The ADK package is kept to remain compatible with `adk web` tooling for local development.

---

## File Map

```
functions/
├── main.py                         HTTP function endpoints (6 functions)
├── requirements.txt
├── __init__.py
└── agents/
    ├── __init__.py
    ├── pipeline_agent.py           PipelineExecutor — full orchestration loop
    │                               (1246 lines: steps, LLM calls, audio gen, feedback merge)
    ├── session.py                  Firestore session CRUD helpers
    ├── tools.py                    Non-LLM tool functions (N5, N6, N8, S10)
    └── prompts/
        ├── s1_metadata_extract.txt
        ├── s2_ocr_parse.txt
        ├── s4_script_gen.txt
        ├── s5_image_map.txt
        ├── s6_translation.txt
        ├── s7_voice_recommend.txt
        ├── s8_director_note.txt
        └── s9_audio_gen.txt
```

---

## Local Development

The Firebase Emulator Suite runs `pipeline-start`, `pipeline-resume`, `pipeline-status`, `audio-generate`, `audio-generate-language`, and `translate-language` locally.

```bash
cd functions
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt

# Start emulators (from project root)
firebase emulators:start --only functions,firestore,storage
```

The frontend proxies `/pipeline/*` to the emulator via `vite.config.ts`:

```ts
proxy: {
  '/pipeline': {
    target: 'http://127.0.0.1:5001/{PROJECT_ID}/us-central1',
    rewrite: (path) => path.replace(/^\/pipeline/, ''),
    changeOrigin: true,
  }
}
```

When `VITE_FUNCTIONS_HOST` is set, the frontend calls Cloud Run directly (bypasses Firebase Hosting's 60 s proxy timeout for long pipeline runs).

---

## Deployment

```bash
# Deploy all 6 functions
firebase deploy --only functions --project=laxy-studio-dev

# Or deploy a single function
firebase deploy --only functions:pipeline_start --project=laxy-studio-dev
```

For Vertex AI mode, ensure the Cloud Functions service account has `roles/aiplatform.user`:

```bash
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$PROJECT_ID@appspot.gserviceaccount.com" \
  --role="roles/aiplatform.user"
```

---

## Known Issues / TODOs

- `s9_audio_gen` inside the main pipeline only generates English audio. Multi-language audio is produced by the standalone `audio-generate-language` endpoint called directly from the frontend wizard.
- `s6_translation` in the pipeline context builds a full batch translation prompt; the standalone `/translate-language` endpoint translates per-language using the same underlying `translate_language()` method — these are functionally equivalent but have slightly different JSON output normalisation paths.
- Pronunciation markers stored in `hg5_audio_review_preferences` are not yet fed back into a re-generation pass.
- `_apply_structured_feedback` for `hg4_translation_review` only handles the spot-first storage format; if the session was created before the spot-first format was standardised it may silently no-op.
