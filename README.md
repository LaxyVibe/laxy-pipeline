# Laxy Pipeline — Google ADK + Vertex AI

Audio guide creation pipeline powered by Google ADK (Agent Development Kit) and Vertex AI Gemini models, hosted on Firebase Functions.

## Architecture

```
┌─────────────┐     POST /pipeline/start          ┌──────────────────────────┐
│  laxy-studio │     POST /pipeline/resume         │  Firebase Functions (2G) │
│  (React/Vite)│ ────────────────────────────────► │  Python 3.12 runtime     │
│              │ ◄──────────────────────────────── │                          │
└─────────────┘   PipelineResponse { steps[] }     │  ┌────────────────────┐  │
                                                    │  │  ADK Sequential    │  │
                                                    │  │  Pipeline Agent    │──┼──► Vertex AI Gemini
                                                    │  └────────────────────┘  │    (Flash, Pro, TTS)
                                                    │  ┌────────────────────┐  │
                                                    │  │  Firestore Session │──┼──► Cloud Firestore
                                                    │  └────────────────────┘  │
                                                    └──────────────────────────┘
```

## Pipeline Steps

| # | Step ID | Label | Type | Model |
|---|---------|-------|------|-------|
| 1 | `s2_ocr_parse` | S2: OCR Parse | LLM | Gemini 2.0 Flash |
| 2 | `s1_metadata_extract` | S1: Metadata Extract | LLM | Gemini 2.0 Flash |
| 3 | `hg1_data_review` | HG1: Data Review | Human Gate | — |
| 4 | `s4_script_gen` | S4: Script Gen | LLM | Gemini 2.5 Pro |
| 5 | `s5_image_map` | S5: Image Map | LLM | Gemini 2.0 Flash |
| 6 | `hg3_script_review` | HG3: Script Review | Human Gate | — |
| 7 | `s6_translation` | S6: Translation | LLM | Gemini 2.5 Pro |
| 8 | `hg4_translation_review` | HG4: Translation Review | Human Gate | — |
| 9 | `n5_character_select` | N5: Character Select | Tool | — |
| 10 | `s7_voice_recommend` | S7: Voice Recommend | LLM | Gemini 2.0 Flash |
| 11 | `s8_director_note` | S8: Director Note | LLM | Gemini 2.0 Flash |
| 12 | `s9_audio_gen` | S9: Audio Gen | LLM | Gemini TTS |
| 13 | `n6_audio_qa` | N6: Audio Playback QA | Tool | — |
| 14 | `hg5_audio_review` | HG5: Audio Review | Human Gate | — |
| 15 | `n8_generation_history` | N8: Generation History | Tool | — |
| 16 | `s10_srt_gen` | S10: SRT Gen | Tool (rule-based) | — |

Human gates (HG1, HG3, HG4, HG5) pause execution and return a `checkpointId`. The frontend displays a review UI and sends `approve` or `reject` via `POST /pipeline/resume`.

## Project Structure

```
laxy-pipeline/
├── firebase.json              # Firebase config (functions + hosting + emulators)
├── deploy.sh                  # Deployment script
├── .github/workflows/ci.yml   # CI/CD pipeline
│
├── functions/                 # ADK pipeline backend (Python)
│   ├── main.py                # Firebase Function HTTP endpoints
│   ├── requirements.txt       # Python dependencies
│   ├── agents/
│   │   ├── pipeline_agent.py  # Pipeline orchestrator (PipelineExecutor)
│   │   ├── session.py         # Firestore session persistence
│   │   ├── tools.py           # Non-LLM tool functions (N5, N6, N8, S10)
│   │   └── prompts/           # System prompts (one .txt per LLM step)
│   └── tests/
│       ├── test_pipeline.py   # Pipeline orchestration tests (23 tests)
│       ├── test_steps.py      # Individual step tests (65 tests)
│       └── test_tools.py      # Tool function tests (25 tests)
│
├── laxy-studio/               # Frontend (React + Vite + MUI + Zustand)
│   ├── src/
│   │   ├── api.ts             # Pipeline API client
│   │   ├── api.test.ts        # API adapter tests (22 tests)
│   │   ├── store.ts           # Pipeline debug store
│   │   ├── guidesStore.ts     # Wizard state store (929 lines)
│   │   ├── hooks/
│   │   │   └── usePipelineSync.ts  # Pipeline response ↔ wizard state bridge
│   │   ├── components/wizard/ # 9-step wizard UI
│   │   └── pages/             # Dashboard, Guide, Login, PipelineDebug
│   └── package.json
│
├── ADK_MIGRATION_PLAN.md      # Full migration plan (Flowise → ADK)
├── FIRECMS_DEVELOPMENT_PLAN.md
└── GUIDE_WIZARD_FRONTEND_PLAN.md
```

## Quick Start

### Prerequisites

- Node.js 20+
- Python 3.12+
- Firebase CLI (`npm install -g firebase-tools`)
- GCP project with Vertex AI API enabled

### Development

```bash
# Frontend
cd laxy-studio
npm install
npm run dev          # Starts Vite dev server on :5173

# Backend (with Firebase emulators)
firebase emulators:start

# Run all tests
cd functions && python -m pytest tests/ -v
cd laxy-studio && npm test
```

### First-Time GCP Setup

```bash
export GCP_PROJECT=your-project-id
./deploy.sh setup    # Enables APIs + grants IAM roles
```

### Deploy

```bash
./deploy.sh              # Deploy everything
./deploy.sh functions    # Deploy only Cloud Functions
./deploy.sh hosting      # Deploy only frontend
```

## API Endpoints

### `POST /pipeline/start`

Start a new pipeline run.

```json
{
  "question": "Create an audio guide for this museum exhibit",
  "sessionId": "uuid-v4",
  "uploads": [{ "data": "base64...", "name": "photo.jpg", "mime": "image/jpeg" }]
}
```

### `POST /pipeline/resume`

Resume from a human gate.

```json
{
  "sessionId": "uuid-v4",
  "checkpointId": "hg1_data_review",
  "action": "approve",
  "feedback": "Looks good, proceed"
}
```

### Response Shape

```json
{
  "sessionId": "uuid-v4",
  "checkpointId": "hg1_data_review",
  "steps": [
    { "stepId": "s2_ocr_parse", "label": "S2: OCR Parse (Gemini)", "status": "FINISHED", "output": {} },
    { "stepId": "hg1_data_review", "label": "HG1: Data Review", "status": "STOPPED", "output": null }
  ],
  "finalText": null,
  "status": "awaiting_input"
}
```

### `GET /pipeline/status?sessionId=uuid-v4`

Poll current pipeline state (for reconnection after browser refresh).

## Test Summary

| Suite | Tests | Coverage |
|-------|:-----:|----------|
| Backend: `test_pipeline.py` | 23 | Pipeline orchestration, human gates, error handling |
| Backend: `test_steps.py` | 65 | Prompts, message builders, models, response parsing, step ordering |
| Backend: `test_tools.py` | 25 | Character select, audio QA, generation history, SRT gen |
| Frontend: `api.test.ts` | 22 | API helpers, type shapes, gate mapping, label compatibility |
| **Total** | **135** | |

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `GCP_PROJECT` | Google Cloud project ID | `laxy-studio-dev` |
| `GCP_REGION` | Cloud Functions region | `us-central1` |
| `VITE_FIREBASE_*` | Firebase web config | See `.env.local.example` |
