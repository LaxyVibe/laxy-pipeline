# Getting Started — Laxy Pipeline (Local Dev)

## Prerequisites

| Tool | Install |
|------|---------|
| **Node.js** ≥ 18 | [nodejs.org](https://nodejs.org) |
| **Python** 3.12 | `brew install python@3.12` |
| **Firebase CLI** | `npm install -g firebase-tools` |
| **Google Cloud SDK** | [cloud.google.com/sdk](https://cloud.google.com/sdk/docs/install) |

---

## 1. Install Dependencies

```bash
# Frontend
cd laxy-studio
npm install

# Backend
cd ../functions
pip install -r requirements.txt
```

---

## 2. Authenticate

```bash
# Login to Firebase
firebase login

# Set up Application Default Credentials (needed for Vertex AI / Gemini)
gcloud auth application-default login
```

---

## 3. Configure Your GCP Project

The pipeline calls **Vertex AI (Gemini)** and stores sessions in **Firestore**. You need a real GCP project with these APIs enabled:

```bash
# Enable required APIs
gcloud services enable \
  aiplatform.googleapis.com \
  firestore.googleapis.com \
  cloudfunctions.googleapis.com \
  --project YOUR_PROJECT_ID
```

> **Note:** If you use `demo-laxy` (Firebase offline demo mode), Firestore works locally but Vertex AI calls will fail — a real GCP project is required for LLM steps.

---

## 4. Start the Backend (Firebase Emulators)

```bash
cd /path/to/laxy-pipeline

# Start Functions + Firestore emulators
firebase emulators:start --only functions,firestore --project YOUR_PROJECT_ID
```

This starts:

| Service | Port | URL |
|---------|------|-----|
| Functions emulator | 5001 | `http://127.0.0.1:5001` |
| Firestore emulator | 8080 | `http://127.0.0.1:8080` |
| Emulator UI | 4000 | `http://localhost:4000` |

---

## 5. Start the Frontend (Vite Dev Server)

In a **separate terminal**:

```bash
cd laxy-studio

# Set your GCP project ID (must match the emulator --project flag)
export VITE_GCP_PROJECT="YOUR_PROJECT_ID"

npm run dev
```

The Vite dev server starts at **http://localhost:5173** and proxies `/pipeline/*` requests to the Functions emulator automatically.

---

## 6. Verify Everything Works

1. Open **http://localhost:5173** — the Laxy Studio UI should load.
2. Open **http://localhost:4000** — the Firebase Emulator UI lets you monitor function invocations and Firestore documents.
3. Try starting a pipeline run from the wizard — you should see:
   - A `POST /pipeline/start` request proxied to the emulator
   - A new document in the `pipeline_sessions` Firestore collection
   - The pipeline executing steps until it hits the first human gate (`hg1_data_review`)

---

## Environment Variables

### Frontend (`laxy-studio/`)

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_GCP_PROJECT` | `demo-laxy` | GCP project ID (used to build emulator proxy path) |
| `VITE_GCP_REGION` | `us-central1` | GCP region |

### Backend (`functions/`)

| Variable | Default | Description |
|----------|---------|-------------|
| `GCP_PROJECT` / `GCLOUD_PROJECT` | *(auto-detected)* | GCP project ID |
| `GCP_REGION` | `us-central1` | Vertex AI region |

---

## Running Tests

```bash
# Backend tests (113 tests)
cd functions
python -m pytest tests/ -v

# Frontend tests (22 tests)
cd laxy-studio
npm test
```

---

## Troubleshooting

### `POST /pipeline/start` returns 500

- **Backend not running:** Make sure `firebase emulators:start` is running in another terminal.
- **Wrong project ID:** The `VITE_GCP_PROJECT` env var must match the `--project` flag used with the emulator.
- **Vertex AI auth missing:** Run `gcloud auth application-default login`.

### `Could not load the default credentials`

```bash
gcloud auth application-default login
```

### Firestore emulator has no data

The emulator starts with an empty database — session documents are created when you start a pipeline run.

### `ModuleNotFoundError: No module named 'google.adk'`

```bash
cd functions
pip install -r requirements.txt
```

---

## Architecture Overview

```
Browser (localhost:5173)
  │
  ├── POST /pipeline/start ──► Vite proxy ──► Functions emulator (port 5001)
  │                                              │
  │                                              ├── PipelineExecutor
  │                                              │     ├── Gemini (Vertex AI)
  │                                              │     └── Firestore sessions
  │                                              │
  └── POST /pipeline/resume ─► Vite proxy ──► Functions emulator (port 5001)
```

The pipeline runs 17 steps sequentially (8 LLM agents, 4 tool functions, 4 human gates, 1 completion marker), pausing at each human gate for user approval before continuing.
