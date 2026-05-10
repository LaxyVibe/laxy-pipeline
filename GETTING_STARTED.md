# Getting Started — Laxy Pipeline (Local Dev)

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| **Node.js** | >= 18 | [nodejs.org](https://nodejs.org) |
| **Python** | 3.12 | `brew install python@3.12` |
| **Firebase CLI** | latest | `npm install -g firebase-tools` |
| **Google Cloud SDK** | latest | [cloud.google.com/sdk](https://cloud.google.com/sdk/docs/install) |

---

## 1. Install Dependencies

```bash
# Frontend
cd laxy-studio
npm install

# Backend
cd ../functions
python3.12 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

---

## 2. Authenticate

```bash
firebase login
```

For LLM steps, choose **one** of:

```bash
# Option A — Gemini API key (easiest for local dev, no GCP project needed)
echo 'GEMINI_API_KEY=your-key-here' >> functions/.env

# Option B — Vertex AI via Application Default Credentials
gcloud auth application-default login
```

> `GEMINI_API_KEY` in `functions/.env` takes priority over ADC when both are present.

---

## 3. Configure GCP (Vertex AI mode only)

Skip this step if you're using a `GEMINI_API_KEY`.

```bash
gcloud services enable \
  aiplatform.googleapis.com \
  firestore.googleapis.com \
  cloudfunctions.googleapis.com \
  --project YOUR_PROJECT_ID
```

---

## 4. Start the Backend (Firebase Emulators)

```bash
# From the project root (recommended local flow)
firebase emulators:start --only auth,functions,firestore,storage --project laxy-studio-dev
```

If you also need Hosting emulator:

```bash
firebase emulators:start --project laxy-studio-dev
```

All emulators defined in `firebase.json` start automatically:

| Service | Port | URL |
|---------|------|-----|
| Functions | 5001 | `http://127.0.0.1:5001` |
| Firestore | 8080 | `http://127.0.0.1:8080` |
| Storage | 9199 | `http://127.0.0.1:9199` |
| Hosting (optional) | 5005 | `http://localhost:5005` |
| Emulator UI | 4000 | `http://localhost:4000` |

> The `--project` value must match `VITE_GCP_PROJECT` in your frontend `.env.local`.

---

## 5. Start the Frontend (Vite Dev Server)

In a **separate terminal**:

```bash
cd laxy-studio

# Create .env.local (edit values to match your setup)
cat > .env.local <<EOF
VITE_GCP_PROJECT=laxy-studio-dev
VITE_GCP_REGION=us-central1
EOF

npm run dev    # -> http://localhost:5173
```

`vite.config.ts` sets up dedicated proxy routes for all 7 pipeline endpoints:

| Frontend path | Emulator function |
|---|---|
| `POST /pipeline/start` | `pipeline_start` |
| `POST /pipeline/resume` | `pipeline_resume` |
| `GET  /pipeline/status` | `pipeline_status` |
| `POST /pipeline/audio-session-bootstrap` | `audio_session_bootstrap` |
| `POST /pipeline/audio-generate-language` | `audio_generate_language` |
| `POST /pipeline/audio-generate` | `audio_generate` |
| `POST /pipeline/translate-language` | `translate_language` |

---

## 6. Verify Everything Works

1. Open **http://localhost:5173** — the Laxy Studio UI should load.
2. Open **http://localhost:4000** — the Firebase Emulator UI shows function logs and Firestore documents.
3. Start a guide in the wizard. You should see:
   - `POST /pipeline/start` proxied to the emulator
   - A new session document under `pipeline_sessions/{sessionId}` in Firestore
   - Steps `s2_ocr_parse` and `s1_metadata_extract` complete, then the pipeline pauses at `hg1_data_review`
   - The wizard shows the Metadata Review UI (Human Gate 1)

---

## Environment Variables

### Frontend (`laxy-studio/.env.local`)

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_GCP_PROJECT` | `laxy-pipeline-dev` | Must match the `--project` flag in `firebase emulators:start` |
| `VITE_GCP_REGION` | `us-central1` | Used to build emulator proxy paths |
| `VITE_FUNCTIONS_HOST` | *(unset)* | Set to a Cloud Run host to call functions directly (bypasses Hosting 60 s timeout in production) |

### Backend (`functions/.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `GEMINI_API_KEY` | *(unset)* | Google AI Studio key — takes priority over Vertex AI ADC |
| `GCP_PROJECT` / `GCLOUD_PROJECT` | *(auto-detected)* | GCP project ID (Vertex AI mode) |
| `GEMINI_LOCATION` / `VERTEX_LOCATION` | `global` | Gemini / Vertex AI model location |
| `TTS_MODEL` | `gemini-2.5-flash-preview-tts` | Gemini TTS model, e.g. `gemini-3.1-flash-tts-preview` |
| `PIPELINE_AUDIO_E2E_STUB` | `false` | Return deterministic per-language audio/SRT payloads for E2E stability |

---

## Running Tests

```bash
# Backend — 100 tests (31 pipeline + 44 steps + 25 tools)
cd functions
source venv/bin/activate
python -m pytest tests/ -v

# Frontend — 40 tests
cd laxy-studio
npm run test

# Audio MVP E2E browser prerequisites
npm run test:e2e:install

# Audio MVP API E2E (backend endpoint flow)
cd ..
PIPELINE_AUDIO_E2E_STUB=true npx --yes firebase-tools --config firebase.json emulators:exec --project laxy-studio-dev --only auth,functions,firestore,storage "cd functions && RUN_AUDIO_MVP_E2E=1 E2E_FIREBASE_PROJECT=laxy-studio-dev python -m pytest tests_e2e/test_audio_mvp_api_e2e.py -v"

# Audio MVP browser smoke E2E
PIPELINE_AUDIO_E2E_STUB=true npx --yes firebase-tools --config firebase.json emulators:exec --project laxy-studio-dev --only auth,functions,firestore,storage "cd laxy-studio && E2E_FIREBASE_PROJECT=laxy-studio-dev E2E_ADMIN_EMAIL=audio-mvp-e2e-admin@example.com E2E_ADMIN_PASSWORD=Passw0rd123 E2E_ADMIN_TENANT=tenant-e2e E2E_PYTHON_CMD=python3 npm run test:e2e:smoke"
```

---

## Troubleshooting

### `POST /pipeline/start` returns 500

- **Backend not running:** Make sure `firebase emulators:start` is running in another terminal.
- **Wrong project ID:** `VITE_GCP_PROJECT` in `.env.local` must match the `--project` flag used with the emulator.
- **No credentials:** Set `GEMINI_API_KEY` in `functions/.env`, or run `gcloud auth application-default login`.

### `Could not load the default credentials`

```bash
gcloud auth application-default login
# or: echo 'GEMINI_API_KEY=your-key' >> functions/.env
```

### Firestore emulator has no data

The emulator starts empty — session documents are created the first time you start a pipeline run.

### `ModuleNotFoundError: No module named 'google.adk'`

```bash
cd functions && source venv/bin/activate && pip install -r requirements.txt
```

### Audio URLs are broken after generation

The Storage emulator must be running (it starts with `firebase emulators:start`). Generated audio uses the `http://127.0.0.1:9199/...` URL format when `FIREBASE_STORAGE_EMULATOR_HOST` is detected.

---

## Architecture Overview

```
Browser (localhost:5173)
  |
  +-- POST /pipeline/start
  +-- POST /pipeline/resume        Vite proxy (vite.config.ts) -> Functions emulator :5001
  +-- POST /pipeline/audio-session-bootstrap                        |
  +-- POST /pipeline/audio-generate-language                        |
  +-- POST /pipeline/translate-language                             v
                                                               PipelineExecutor
                                                                 +-- Gemini API / Vertex AI
                                                                 +-- Firestore :8080  (sessions)
                                                                 +-- Storage  :9199  (audio WAV)
```

The pipeline runs **17 steps**: 8 LLM steps, 4 tool functions, 4 human gates, and 1 completion marker.
Execution pauses at each human gate and resumes only after the user approves or rejects from the wizard UI.
