# Flowise → Google ADK Migration Plan

> **Decision:** Replace Flowise entirely with Google ADK (Agent Development Kit) + Vertex AI, hosted on Firebase Functions (2nd gen, Python). Clean replacement — no incremental Flowise fallback.

---

## Architecture Overview

### Current State (Flowise)

```
┌─────────────┐        POST /api/v1/prediction/{flowId}        ┌──────────────────┐
│  laxy-studio │ ─────────────────────────────────────────────► │  Flowise Docker  │
│  (React/Vite)│ ◄───────────────────────────────────────────── │  (localhost:3000) │
└─────────────┘   PredictionResponse { agentFlowExecutedData }  │  SQLite DB       │
                                                                 │  18-node agentflow│
                                                                 └──────────────────┘
```

- Frontend talks directly to hosted Flowise via HTTP prediction API
- No custom backend — Flowise is the only server
- Pipeline: 18-node linear agentflow with 4 human gates
- Session tracked by `chatId` + `stoppedNodeId`
- Build scripts (`build_phase1a.py`, `build_phase1b.py`) deploy agentflow JSON to Flowise SQLite via Docker exec

### Target State (Google ADK + Vertex AI)

```
┌─────────────┐     POST /pipeline/start          ┌──────────────────────────┐
│  laxy-studio │     POST /pipeline/resume         │  Firebase Functions (2G) │
│  (React/Vite)│ ────────────────────────────────► │  Python runtime          │
│              │ ◄──────────────────────────────── │                          │
└─────────────┘   PipelineResponse { steps[] }     │  ┌────────────────────┐  │
                                                    │  │  ADK Sequential    │  │
                                                    │  │  Agent Pipeline    │  │──► Vertex AI Gemini
                                                    │  │  (google-adk)      │  │    (2.0-flash, 2.5-pro)
                                                    │  └────────────────────┘  │
                                                    │  ┌────────────────────┐  │
                                                    │  │  Firestore Session │  │──► Firestore
                                                    │  │  Service           │  │
                                                    │  └────────────────────┘  │
                                                    └──────────────────────────┘
```

- ADK agent pipeline runs inside Firebase Functions (2nd gen, Python)
- Gemini models accessed via Vertex AI (ADC credentials, no API keys)
- Session state persisted in Firestore (replaces Flowise `chatId`)
- Human gates use ADK's human-in-the-loop callback mechanism
- Frontend calls new `/pipeline/*` endpoints instead of Flowise prediction API

---

## Pipeline Node Mapping

| # | Flowise Node | Label | ADK Implementation | Model |
|---|-------------|-------|-------------------|-------|
| 1 | CustomFunction → LLM | `S2: OCR Parse` | `LlmAgent` | Gemini 2.0 Flash |
| 2 | CustomFunction → LLM | `S1: Metadata Extract` | `LlmAgent` | Gemini 2.0 Flash |
| 3 | HumanInput | `HG1: Data Review` | Human-in-the-loop callback | — |
| 4 | CustomFunction → LLM | `S4: Script Gen` | `LlmAgent` | Gemini 2.5 Pro |
| 5 | CustomFunction → LLM | `S5: Image Map` | `LlmAgent` | Gemini 2.0 Flash |
| 6 | HumanInput | `HG3: Script Review` | Human-in-the-loop callback | — |
| 7 | CustomFunction → LLM | `S6: Translation` | `LlmAgent` | Gemini 2.5 Pro |
| 8 | HumanInput | `HG4: Translation Review` | Human-in-the-loop callback | — |
| 9 | CustomFunction | `N5: Character Select` | Tool function (passthrough) | — |
| 10 | CustomFunction → LLM | `S7: Voice Recommend` | `LlmAgent` | Gemini 2.0 Flash |
| 11 | CustomFunction → LLM | `S8: Director Note` | `LlmAgent` | Gemini 2.0 Flash |
| 12 | CustomFunction → LLM | `S9: Audio Gen` | `LlmAgent` | Gemini TTS |
| 13 | CustomFunction | `N6: Audio Playback QA` | Tool function | — |
| 14 | HumanInput | `HG5: Audio Review` | Human-in-the-loop callback | — |
| 15 | CustomFunction | `N8: Generation History` | Tool function | — |
| 16 | CustomFunction | `S10: SRT Gen` | Tool function (rule-based) | — |

---

## Files Affected

### Flowise-Coupled Files (Must Change)

| File | Current Role | Migration Action |
|------|-------------|-----------------|
| `laxy-studio/src/api.ts` | Flowise prediction API client | Rewrite to call `/pipeline/start` and `/pipeline/resume` |
| `laxy-studio/src/store.ts` | Pipeline debug store with Flowise node labels | Update API calls; preserve `PIPELINE_STAGES` labels |
| `laxy-studio/src/guidesStore.ts` | `applyFlowiseData()` switch-case router | Rename to `applyStepData()`; keep switch-case structure |
| `laxy-studio/src/hooks/useFlowiseSync.ts` | Bridges Flowise responses → wizard store | Rename to `usePipelineSync.ts`; update types |
| `laxy-studio/src/components/wizard/IngestionStep.tsx` | Calls `startPipeline()` | Update API call + response parsing |
| `laxy-studio/src/components/wizard/ScriptReviewStep.tsx` | Calls `startPipeline()` + `sendHumanInput()` | Update API calls |
| `laxy-studio/src/components/wizard/TranslationReviewStep.tsx` | Calls `startPipeline()` + `sendHumanInput()` | Update API calls |
| `laxy-studio/src/components/wizard/AudioProductionStep.tsx` | Calls `startPipeline()` + `sendHumanInput()` | Update API calls |
| `laxy-studio/src/components/wizard/PublishStep.tsx` | Calls `startPipeline()` | Update API call |
| `laxy-studio/src/pages/PipelineDebugPage.tsx` | Renders raw Flowise response | Update to render ADK step data |
| `laxy-studio/src/components/NodeOutputCard.tsx` | Renders single Flowise node output | Update for ADK step output shape |
| `laxy-studio/src/types/script.ts` | Flowise request/response types | Update to ADK data contracts |
| `laxy-studio/vite.config.ts` | Proxies `/api` → `localhost:3000` (Flowise) | Change proxy to Firebase emulator |

### Files to Delete

| File | Reason |
|------|--------|
| `build_phase1a.py` | Flowise agentflow builder (replaced by ADK agent definitions) |
| `build_phase1b.py` | Flowise LLM node upgrader (replaced by ADK agent definitions) |
| `test_phase1a.py` | Flowise integration tests |
| `test_phase1b.py` | Flowise integration tests |
| `README_AGENTFLOW_UPDATE.md` | Flowise SQLite update guide |
| `PHASE1_FLOWISE_TASKS.md` | Flowise phase plan |

### New Files to Create

| File | Purpose |
|------|---------|
| `functions/requirements.txt` | Python deps: `google-adk`, `google-cloud-aiplatform`, `firebase-functions`, `firebase-admin` |
| `functions/main.py` | Firebase Function endpoints (`/pipeline/start`, `/pipeline/resume`, `/pipeline/status`) |
| `functions/agents/pipeline_agent.py` | ADK `SequentialAgent` definition — the full 16-step pipeline |
| `functions/agents/prompts/*.txt` | System prompts extracted from `build_phase1b.py` (one per LLM node) |
| `functions/agents/tools.py` | Tool functions for non-LLM nodes (N5, N6, N8, S10) |
| `functions/agents/session.py` | Firestore session service configuration |
| `functions/tests/test_pipeline.py` | ADK agent integration tests |
| `functions/tests/test_steps.py` | Individual step unit tests |

---

## Phase 0 — Backend Scaffolding

### 0.1 Initialize Firebase Functions (Python)

Create `functions/` directory at project root. Initialize with Python runtime for Firebase Functions 2nd gen.

```
functions/
├── main.py                  # HTTP endpoints
├── requirements.txt         # Python dependencies
├── agents/
│   ├── __init__.py
│   ├── pipeline_agent.py    # SequentialAgent definition
│   ├── tools.py             # Non-LLM tool functions
│   ├── session.py           # FirestoreSessionService config
│   └── prompts/
│       ├── s1_metadata_extract.txt
│       ├── s2_ocr_parse.txt
│       ├── s4_script_gen.txt
│       ├── s5_image_map.txt
│       ├── s6_translation.txt
│       ├── s7_voice_recommend.txt
│       ├── s8_director_note.txt
│       └── s9_audio_gen.txt
└── tests/
    ├── test_pipeline.py
    └── test_steps.py
```

**`requirements.txt`:**
```
google-adk>=1.0.0
google-cloud-aiplatform>=1.60.0
firebase-functions>=0.4.0
firebase-admin>=6.5.0
```

### 0.2 Define the ADK Agent Pipeline

In `functions/agents/pipeline_agent.py`, create a `SequentialAgent` that chains all 16 steps:

```python
from google.adk.agents import SequentialAgent, LlmAgent
from google.adk.models import Gemini

pipeline = SequentialAgent(
    name="laxy_guide_pipeline",
    sub_agents=[
        LlmAgent(name="s2_ocr_parse",       model="gemini-2.0-flash",        instruction=load_prompt("s2_ocr_parse")),
        LlmAgent(name="s1_metadata_extract", model="gemini-2.0-flash",        instruction=load_prompt("s1_metadata_extract")),
        # HG1: Data Review — human-in-the-loop checkpoint
        LlmAgent(name="s4_script_gen",       model="gemini-2.5-pro-preview",  instruction=load_prompt("s4_script_gen")),
        LlmAgent(name="s5_image_map",        model="gemini-2.0-flash",        instruction=load_prompt("s5_image_map")),
        # HG3: Script Review — human-in-the-loop checkpoint
        LlmAgent(name="s6_translation",      model="gemini-2.5-pro-preview",  instruction=load_prompt("s6_translation")),
        # HG4: Translation Review — human-in-the-loop checkpoint
        # N5: Character Select — tool function
        LlmAgent(name="s7_voice_recommend",  model="gemini-2.0-flash",        instruction=load_prompt("s7_voice_recommend")),
        LlmAgent(name="s8_director_note",    model="gemini-2.0-flash",        instruction=load_prompt("s8_director_note")),
        LlmAgent(name="s9_audio_gen",        model="gemini-2.0-flash",        instruction=load_prompt("s9_audio_gen")),
        # N6: Audio QA — tool function
        # HG5: Audio Review — human-in-the-loop checkpoint
        # N8: Generation History — tool function
        # S10: SRT Gen — tool function (rule-based)
    ],
)
```

> **Note:** The exact ADK human-in-the-loop API may use `HumanInTheLoopCallback`, `AgentCallback`, or a checkpoint/resume pattern depending on the ADK version at implementation time. The pseudocode above shows the sequential structure; gate implementation will follow ADK's documented callback pattern.

### 0.3 Extract System Prompts

Extract all Gemini system prompts from `build_phase1b.py` into `functions/agents/prompts/`. Each prompt file contains the full system instruction for one LLM node. These become the `instruction` field on each `LlmAgent`.

### 0.4 Implement Session Persistence

Use ADK's built-in `FirestoreSessionService` (or implement a custom `SessionService`) to persist pipeline state in Firestore under `sessions/{sessionId}`. Session state includes:
- Current pipeline position (which step is active)
- All intermediate outputs from completed steps  
- The `checkpointId` when paused at a human gate
- File uploads and metadata

This replaces Flowise's `chatId`-based session tracking.

### 0.5 Implement Human-in-the-Loop Gates

When the pipeline reaches a gate (HG1, HG3, HG4, HG5), the agent:
1. Saves current state to the Firestore session
2. Returns a response with `status: 'awaiting_input'` and `checkpointId`
3. The frontend displays the gate UI (already built)
4. User approves/rejects → frontend calls `POST /pipeline/resume`
5. The agent loads session state and continues (or re-runs previous step on reject)

### 0.6 Create Firebase Function Endpoints

**`functions/main.py`:**

```python
from firebase_functions import https_fn

@https_fn.on_request(memory=512, timeout_sec=540, region="us-central1")
def pipeline_start(req: https_fn.Request) -> https_fn.Response:
    """Start a new pipeline run. Accepts question, sessionId, and optional file uploads."""
    # Creates ADK session, runs pipeline until first gate or completion
    # Returns: { sessionId, checkpointId?, steps[], finalText? }

@https_fn.on_request(memory=512, timeout_sec=540, region="us-central1")
def pipeline_resume(req: https_fn.Request) -> https_fn.Response:
    """Resume pipeline from a human gate checkpoint."""
    # Accepts: { sessionId, checkpointId, action: 'approve'|'reject', feedback? }
    # Loads session, resumes agent, runs until next gate or completion
    # Returns: { sessionId, checkpointId?, steps[], finalText? }

@https_fn.on_request(memory=256, timeout_sec=60, region="us-central1")
def pipeline_status(req: https_fn.Request) -> https_fn.Response:
    """Get current pipeline state (for reconnection/polling)."""
    # Returns: { sessionId, currentStep, status, steps[] }
```

**Response shape:**
```json
{
  "sessionId": "abc-123",
  "checkpointId": "hg1_data_review",
  "steps": [
    { "stepId": "s2_ocr_parse", "label": "S2: OCR Parse", "status": "FINISHED", "output": { ... } },
    { "stepId": "s1_metadata_extract", "label": "S1: Metadata Extract", "status": "FINISHED", "output": { ... } },
    { "stepId": "hg1_data_review", "label": "HG1: Data Review", "status": "STOPPED", "output": null }
  ],
  "finalText": null
}
```

### 0.7 Configure Vertex AI

- Enable Vertex AI API on the Firebase/GCP project
- Grant the Firebase Functions service account `roles/aiplatform.user`
- No API keys needed — uses Application Default Credentials (ADC)
- Set environment variables: `GCP_PROJECT`, `GCP_REGION`

---

## Phase 1 — Frontend API Adapter

### 1.1 Replace `api.ts`

Remove all Flowise-specific code. New API layer:

```typescript
// --- Constants ---
const PIPELINE_BASE = '/pipeline';

// --- Types ---
export interface PipelineStep {
  stepId: string;
  label: string;
  status: 'FINISHED' | 'STOPPED' | 'RUNNING' | 'ERROR';
  output?: Record<string, unknown>;
}

export interface PipelineResponse {
  sessionId: string;
  checkpointId?: string;
  steps: PipelineStep[];
  finalText?: string;
}

// --- Helper functions (same signatures, new internals) ---
export function getExecutedNodes(res: PipelineResponse): string[] {
  return res.steps.map(s => s.label);
}
export function getLastStatus(res: PipelineResponse): string {
  return res.steps[res.steps.length - 1]?.status ?? 'FINISHED';
}
export function getStoppedNodeId(res: PipelineResponse): string | undefined {
  return res.checkpointId;
}
export function getNodeOutput(res: PipelineResponse, label: string): unknown {
  return res.steps.find(s => s.label === label)?.output;
}

// --- API functions ---
export async function startPipeline(question: string, sessionId: string, files?: File[]): Promise<PipelineResponse> {
  // POST /pipeline/start with { question, sessionId, uploads }
}
export async function sendHumanInput(
  sessionId: string, action: 'approve' | 'reject', checkpointId: string, feedback?: string
): Promise<PipelineResponse> {
  // POST /pipeline/resume with { sessionId, checkpointId, action, feedback }
}
```

**Key change:** `sendHumanInput()` now takes `sessionId` + `checkpointId` instead of `chatId` + `startNodeId`. The `type` field changes from `'proceed'`/`'reject'` to `'approve'`/`'reject'`.

### 1.2 Rename `useFlowiseSync.ts` → `usePipelineSync.ts`

Update imports and type references. Core logic stays the same:
- `applyResponse(res: PipelineResponse)` — walks `res.steps`, calls `applyStepData(label, output)` for each
- `buildGatePayload()` — unchanged (reads wizard state)
- `markLocalChanges()` — unchanged

### 1.3 Update `guidesStore.ts`

- Rename `applyFlowiseData()` → `applyStepData()`
- Rename state fields:
  - `pipelineChatId` → `pipelineSessionId`
  - `pipelineStoppedNodeId` → `pipelineCheckpointId`
  - `lastFlowiseResponseAt` → `lastPipelineResponseAt`
- Keep the switch-case with same node labels (S1, S4, S5, S6, S7, S8, S9, S10)
- The ADK backend will use the same label strings for compatibility

### 1.4 Update `store.ts`

- `PIPELINE_STAGES` — no changes needed (labels preserved)
- `start()` — calls updated `startPipeline()`
- `approve(feedback)` / `reject(feedback)` — calls updated `sendHumanInput()` with `sessionId` + `checkpointId` instead of `chatId` + `stoppedNodeId`
- `deriveStages()` — works unchanged since step labels match

### 1.5 Update Wizard Step Components

All 5 step components follow the same pattern:

1. Replace `import { startPipeline, sendHumanInput } from '../api'` (already correct after api.ts rewrite)
2. Update response handling: `PredictionResponse` → `PipelineResponse`
3. Update gate calls: `sendHumanInput(chatId, 'proceed', stoppedNodeId, feedback)` → `sendHumanInput(sessionId, 'approve', checkpointId, feedback)`
4. Keep existing fallback/sample data paths (still needed for offline dev)

### 1.6 Update `vite.config.ts`

```typescript
server: {
  port: 5173,
  proxy: {
    '/pipeline': {
      target: 'http://127.0.0.1:5001/{PROJECT_ID}/us-central1',
      changeOrigin: true,
    }
  }
}
```

### 1.7 Update Debug UI

- `PipelineDebugPage.tsx` — update raw response viewer to render `PipelineResponse` shape
- `NodeOutputCard.tsx` — update to render `PipelineStep.output` instead of `ExecutedNode.data.output`

---

## Phase 2 — Remove Flowise Artifacts

### 2.1 Delete Files

```
rm build_phase1a.py build_phase1b.py test_phase1a.py test_phase1b.py
rm README_AGENTFLOW_UPDATE.md PHASE1_FLOWISE_TASKS.md
```

> **Before deleting `build_phase1b.py`:** extract all system prompts into `functions/agents/prompts/` (Phase 0.3).

### 2.2 Update Documentation

- Update `FIRECMS_DEVELOPMENT_PLAN.md` — replace Flowise references with ADK
- Update `GUIDE_WIZARD_FRONTEND_PLAN.md` — replace Flowise references with ADK
- Create new `README.md` section documenting the ADK pipeline architecture

### 2.3 Clean Up Types

Update `laxy-studio/src/types/script.ts`:
- Remove or rename `ScriptGenerationRequest`, `TranslationRequest` if they referenced Flowise-specific fields
- Ensure all types align with the ADK response shapes

### 2.4 Remove Docker/Flowise References

- Remove any docker-compose service definitions for `flowise`
- Remove any `.env` variables referencing Flowise URLs or agentflow IDs
- Remove the Flowise SQLite database path references

---

## Phase 3 — Testing & Deployment

### 3.1 Backend Tests

```
functions/tests/
├── test_steps.py      # Unit test each LlmAgent/tool with InMemorySessionService
└── test_pipeline.py   # Integration test: full pipeline with mock Gemini responses
```

- Use ADK's `InMemorySessionService` for unit tests (no Firestore needed)
- Mock Vertex AI responses for deterministic testing
- Test human gate checkpoint/resume flow

### 3.2 Frontend Tests

- Verify API adapter correctly maps `PipelineResponse` → wizard state
- Test human gate flow: start → pause at gate → approve/reject → resume
- Test session persistence: start pipeline, refresh browser, reconnect
- Verify fallback paths when ADK backend is unreachable

### 3.3 Deploy

```bash
# Enable Vertex AI API
gcloud services enable aiplatform.googleapis.com

# Grant IAM role
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$PROJECT_ID@appspot.gserviceaccount.com" \
  --role="roles/aiplatform.user"

# Deploy functions
firebase deploy --only functions
```

### 3.4 Update CI/CD

- Remove Flowise Docker container build step
- Add Firebase Functions deploy step
- Add Python linting (`ruff`) and testing (`pytest`) for `functions/`
- Add environment variable configuration for staging/production

---

## Verification Checklist

- [ ] `firebase emulators:start` runs the ADK pipeline functions locally
- [ ] Frontend can start a pipeline via `POST /pipeline/start`
- [ ] Each human gate (HG1, HG3, HG4, HG5) pauses the pipeline and returns `checkpointId`
- [ ] Approve/reject at each gate resumes the pipeline correctly
- [ ] All wizard steps receive correctly shaped data:
  - [ ] IngestionStep: spots array from S1
  - [ ] ScriptReviewStep: scripts + imageMappings from S4/S5
  - [ ] TranslationReviewStep: translations from S6
  - [ ] AudioProductionStep: voiceId from S7, directorNote from S8, audioFiles from S9
  - [ ] PublishStep: srtFiles from S10
- [ ] Session persists across browser refreshes (Firestore-backed)
- [ ] Fallback/sample data still works when backend is unreachable
- [ ] `pytest functions/tests/` passes
- [ ] No remaining references to `flowise`, `AGENTFLOW_ID`, or `localhost:3000` in codebase
- [ ] PipelineDebugPage renders ADK step data correctly

---

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Hosting | Firebase Functions (2nd gen, Python) | Stays in Firebase ecosystem; simpler deployment than Cloud Run; 540s timeout per invocation is sufficient since human gates segment execution into short bursts |
| Model access | Vertex AI (via ADK) | Managed Gemini endpoints; ADC credentials (no API keys); GCP IAM integration |
| Migration strategy | Clean replacement | Flowise integration is well-contained (2 API functions, 1 switch-case router, 5 step components); maintaining two backends is higher risk |
| Node labels | Preserve existing (S1–S10, HG1–HG5) | Minimizes frontend changes; `applyStepData()` switch-case and `PIPELINE_STAGES` work without modification |
| Agent pattern | ADK `SequentialAgent` | Pipeline is linear with gates; maps cleanly to sequential with human-in-the-loop callbacks |
| Session persistence | Firestore via `FirestoreSessionService` | Already using Firebase; natural fit for session state; enables cross-device resume |

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Firebase Functions 540s timeout too short for long LLM chains | Human gates naturally segment pipeline into short bursts (2–4 LLM calls per segment). If needed, split into separate function invocations per segment. |
| ADK human-in-the-loop API differs from plan | The ADK callback API is abstracted behind `sendHumanInput()` in `api.ts` — only one function needs to adapt to the actual ADK API |
| Cold starts on Firebase Functions | Use `min_instances=1` for the pipeline functions to keep one instance warm |
| Gemini rate limits | Already handled in current Flowise setup; same models/quotas apply. ADK adds built-in retry logic. |
| System prompts lost during migration | Extract prompts from `build_phase1b.py` BEFORE deleting it (Phase 0.3) |
| Frontend fallbacks break | Existing fallback paths are independent of Flowise/ADK — they generate sample data locally and remain functional |
