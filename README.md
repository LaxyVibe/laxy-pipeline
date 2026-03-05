# Laxy Pipeline — ADK + Vertex AI / Gemini

Audio guide creation pipeline powered by a custom `PipelineExecutor` calling Gemini models via `google-genai`, hosted on Firebase Functions (2nd gen, Python 3.12). Session state is persisted in Firestore; generated audio is stored in Firebase Storage.

## Architecture

```
laxy-studio (React/Vite)
  POST /pipeline/start
  POST /pipeline/resume             Firebase Functions (2G, Python 3.12)
  GET  /pipeline/status    ──────►  2 GB RAM · 1800 s timeout
  POST /pipeline/audio-generate     PipelineExecutor (pipeline_agent.py)
  POST /audio-generate-language     gemini-2.5-flash / flash-preview-tts
  POST /translate-language          Firestore (sessions) + Storage (audio)
```

## Pipeline Steps

| # | Step ID | Label | Type | Model |
|---|---------|-------|------|-------|
| 1 | `s2_ocr_parse` | S2: OCR Parse | LLM | `gemini-2.5-flash` |
| 2 | `s1_metadata_extract` | S1: Metadata Extract | LLM | `gemini-2.5-flash` |
| 3 | `hg1_data_review` | HG1: Data Review | **Human Gate** | — |
| 4 | `s4_script_gen` | S4: Script Gen (5 variants) | LLM | `gemini-2.5-flash` |
| 5 | `s5_image_map` | S5: Image Map | LLM | `gemini-2.5-flash` |
| 6 | `hg3_script_review` | HG3: Script Review | **Human Gate** | — |
| 7 | `s6_translation` | S6: Translation | LLM | `gemini-2.5-flash` |
| 8 | `hg4_translation_review` | HG4: Translation Review | **Human Gate** | — |
| 9 | `n5_character_select` | N5: Character Select | Tool | — |
| 10 | `s7_voice_recommend` | S7: Voice Recommend | LLM | `gemini-2.5-flash` |
| 11 | `s8_director_note` | S8: Director Note | LLM | `gemini-2.5-flash` |
| 12 | `s9_audio_gen` | S9: Audio Gen | TTS | `gemini-2.5-flash-preview-tts` |
| 13 | `n6_audio_qa` | N6: Audio Playback QA | Tool | — |
| 14 | `hg5_audio_review` | HG5: Audio Review | **Human Gate** | — |
| 15 | `n8_generation_history` | N8: Generation History | Tool | — |
| 16 | `s10_srt_gen` | S10: SRT Gen | Tool (rule-based) | — |
| 17 | `pipeline_complete` | Pipeline Complete | Marker | — |

Human gates (HG1, HG3, HG4, HG5) pause execution and return a `checkpointId`. The frontend displays a review UI and sends `approve` or `reject` via `POST /pipeline/resume`. Structured JSON in `feedback` is merged back into upstream outputs before execution resumes.

## Project Structure

```
laxy-pipeline/
├── firebase.json              # Firebase config (functions + hosting + emulators)
├── deploy.sh                  # Deployment script (setup / functions / hosting)
├── firestore.rules
├── storage.rules
│
├── functions/                 # Backend (Python 3.12)
│   ├── main.py                # 6 Firebase Function HTTP endpoints
│   ├── requirements.txt
│   └── agents/
│       ├── pipeline_agent.py  # PipelineExecutor — full orchestration (1246 lines)
│       ├── session.py         # Firestore session CRUD helpers
│       ├── tools.py           # Non-LLM tool functions (N5, N6, N8, S10)
│       └── prompts/           # System prompts — one .txt per LLM step
│
├── laxy-studio/               # Frontend (React + Vite + MUI + Zustand)
│   └── src/
│       ├── api.ts             # Pipeline API client (6 endpoints + Firebase Storage upload)
│       ├── guidesStore.ts     # Wizard state store (1116 lines, Zustand + persist)
│       ├── hooks/
│       │   ├── usePipelineSync.ts     # ADK response <-> wizard state bridge
│       │   ├── usePipelinePolling.ts  # 5 s polling for long-running runs
│       │   ├── useAutosave.ts         # Debounced localStorage auto-save
│       │   └── useFeatureFlags.ts     # Real-time Firestore feature flags
│       ├── components/wizard/ # 9-step wizard UI
│       └── pages/             # Dashboard, Guide, Login, PipelineDebug
│
├── ADK_README.md              # Backend pipeline reference (as-built)
├── GUIDE_WIZARD_README.md     # Frontend wizard reference (as-built)
└── FIRECMS_DEVELOPMENT_PLAN.md
```

## Quick Start

### Prerequisites

- Node.js >= 18
- Python 3.12
- Firebase CLI: `npm install -g firebase-tools`
- A GCP project with Vertex AI enabled **or** a `GEMINI_API_KEY` from [Google AI Studio](https://aistudio.google.com)

### Development

```bash
# Frontend
cd laxy-studio && npm install && npm run dev   # Vite dev server -> http://localhost:5173

# Backend — start emulators (functions + Firestore + Storage)
firebase emulators:start --project laxy-studio-dev

# Tests
cd functions && python -m pytest tests/ -v   # 100 backend tests
cd laxy-studio && npm run test               # 40 frontend tests
```

See [GETTING_STARTED.md](GETTING_STARTED.md) for a full step-by-step setup guide.

### First-Time GCP Setup

```bash
export GCP_PROJECT=your-project-id
./deploy.sh setup    # Enables APIs + grants IAM roles
```

### Deploy

```bash
./deploy.sh              # Deploy everything (functions + hosting)
./deploy.sh functions    # Deploy only Cloud Functions
./deploy.sh hosting      # Deploy only frontend
```

## API Endpoints

All endpoints are Firebase Functions (`region=us-central1`, `memory=GB_2`, `timeout_sec=1800`). Firebase Hosting rewrites in `firebase.json` map the `/pipeline/*` paths. When `VITE_FUNCTIONS_HOST` is set, the frontend calls Cloud Run directly, bypassing the Hosting 60 s proxy timeout.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/pipeline/start` | Start new session; runs until first gate or completion |
| POST | `/pipeline/resume` | Resume from gate (`approve`/`reject` + optional structured feedback) |
| GET | `/pipeline/status` | Poll current session state for reconnection |
| POST | `/pipeline/audio-generate` | Batch TTS — all spots x all languages |
| POST | `/pipeline/audio-generate-language` | TTS for a single language (called per-language by the wizard) |
| POST | `/pipeline/translate-language` | Translate scripts into one target language |

### Response shape

```json
{
  "sessionId": "studio-abc123",
  "checkpointId": "hg1_data_review",
  "steps": [
    { "stepId": "s2_ocr_parse",    "label": "S2: OCR Parse (Gemini)",  "status": "FINISHED", "output": {} },
    { "stepId": "hg1_data_review", "label": "HG1: Data Review",         "status": "STOPPED",  "output": null }
  ],
  "finalText": null,
  "status": "awaiting_input"
}
```

## Test Summary

| Suite | Tests | What's covered |
|-------|:-----:|----------------|
| `test_pipeline.py` | 31 | Pipeline orchestration, human gates, approve/reject, error handling, response building |
| `test_steps.py` | 44 | System prompts, message builders, model selection, step ordering, retry logic |
| `test_tools.py` | 25 | character_select, audio_playback_qa, generation_history, SRT generation |
| `api.test.ts` | 40 | API helpers, PipelineResponse shape, gate mapping, label compatibility |
| **Total** | **140** | |

## Environment Variables

### Backend (`functions/.env`)

| Variable | Description | Default |
|----------|-------------|---------|
| `GEMINI_API_KEY` | Google AI Studio key — takes priority over Vertex AI ADC | *(unset -> uses ADC)* |
| `GCP_PROJECT` / `GCLOUD_PROJECT` | GCP project ID | Auto-detected by Cloud Run |
| `GCP_REGION` | Vertex AI / Cloud Run region | `us-central1` |

### Frontend (`laxy-studio/.env.local`)

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_GCP_PROJECT` | Used to build emulator proxy paths | `laxy-pipeline-dev` |
| `VITE_GCP_REGION` | Used to build emulator proxy paths | `us-central1` |
| `VITE_FUNCTIONS_HOST` | Cloud Run host for direct calls (skips Hosting proxy timeout) | *(unset -> Hosting rewrites)* |
| `VITE_FIREBASE_*` | Firebase web SDK config | See `.env.local.example` |
