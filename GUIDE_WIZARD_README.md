# Guide Wizard — Frontend Reference

> Documents the **as-built** state of the Guide creation wizard in `laxy-studio/`.  
> Last reviewed: 2026-03-04

---

## Overview

The Guide Wizard is a 9-step, wizard-style UI that walks a venue operator through creating a multi-language audio guide. It lives at the route `/wizard/:step` (hosted by `GuidePage`) and is orchestrated by `WizardShell`.

All wizard state is held in a single Zustand store (`guidesStore`) that is persisted to `localStorage` for draft recovery. Writes are debounced and saved automatically via `useAutosave`. State is also kept in sync with the ADK pipeline backend via `usePipelineSync`.

---

## Architecture

```
GuidePage  (/guides/:id  or  /wizard/:step)
└── WizardShell
    ├── MUI Stepper (non-linear, URL-synced)
    ├── SyncStatusBadge  — synced / local-changes / syncing / conflict
    ├── LastSavedLabel
    ├── AutoSave toggle
    ├── StepContent  → one of the 9 step components
    └── Prev / Next navigation + Save / Clear-All actions
```

### State management

| File | Purpose |
|---|---|
| `guidesStore.ts` | Central Zustand store (1100+ lines). Holds all wizard data and every action. Persisted via `zustand/middleware/persist` to `localStorage`. |
| `types/entity.ts` | All domain types: `EntityConfig`, `SpotMetadata`, `SpotScript`, `LanguageTranslation`, `LanguageAudio`, `SpotSlideshow`, `PublishedGuide`, etc. |
| `types/guide.ts` | Guide list / summary types (`GuideListItem`, `GuideDocument`, `GuideStatus`). Re-exports entity types. |
| `types/translation.ts` | `TranslateLanguageRequest`, `LanguageTranslation` – used by `translateLanguage` API call. |

### Hooks

| Hook | Purpose |
|---|---|
| `useAutosave(delayMs?)` | Watches `isDirty` flag; calls `saveDraft()` after 2 s of inactivity. |
| `usePipelineSync` | Parses ADK `PipelineResponse` → pushes data into store; builds the `buildGatePayload()` body for human-gate approval. |
| `usePipelinePolling(intervalMs?)` | Polls `GET /pipeline/status` every 5 s while a run is active. Auto-stops on `STOPPED` / `FINISHED` / `ERROR`. Bails out after 5 consecutive errors. |
| `useFeatureFlags` | Real-time Firestore subscription to `_platform/featureFlags`. Exposes `isEnabled(flagName, tenantId?)` with tenant-override support. |
| `useFirestore` | Generic Firestore CRUD helpers. |
| `useTenantScope` | Scopes Firestore queries to the current tenant. |
| `useUpload` | Firebase Storage upload with progress tracking. |

---

## API Client (`api.ts`)

All calls target either a relative `/pipeline/*` path (Firebase Hosting rewrites) or a direct Cloud Run URL when `VITE_FUNCTIONS_HOST` is set.

| Function | Method | Endpoint | Description |
|---|---|---|---|
| `startPipeline` | POST | `pipeline-start` | Start a new ADK session, optionally with file uploads (base64) and a `context` payload. |
| `sendHumanInput` | POST | `pipeline-resume` | Resume from a checkpoint (approve / reject / proceed). |
| `fetchPipelineStatus` | GET | `pipeline-status` | Poll session status for long-running workflows. |
| `generateAudio` | POST | `audio-generate` | Batch TTS generation (all languages, all spots). |
| `generateAudioForLanguage` | POST | `audio-generate-language` | Per-language TTS generation with optional translated scripts. |
| `translateLanguage` | POST | `translate-language` | Translate scripts for a single language. |
| `uploadAssetToStorage` | — | Firebase Storage | Upload a file to `assets/{assetId}/{filename}` with progress callback. |

### Pipeline response model

```ts
interface PipelineResponse {
  sessionId: string;
  checkpointId?: string | null;   // set when awaiting human gate
  steps: PipelineStep[];          // executed nodes with outputs
  finalText?: string | null;
  status?: 'running' | 'awaiting_input' | 'completed' | 'error';
}
```

Helper functions: `getExecutedNodes`, `getNodeOutput`, `getStoppedNodeId`, `getLastStatus`, `normalizeSessionStatus`.

---

## Wizard Steps

### Step 1 — Entity Setup (`EntityConfigForm`)

Collects all venue-level configuration before any pipeline work starts.

**Sections (rendered as MUI Accordions)**

| Section | Fields |
|---|---|
| Basic Info | Venue Name (required), Address, Website, Phone |
| Location | GPS Coordinates (lat / lng) |
| Media | Cover Image URL, Gallery Image URLs |
| Operating Hours | Per-day open/close/closed toggles |
| Languages | Core language (required), Supported languages (multi-select from 16 languages) |
| Modules | Module selector (see below) |
| Item Field Config | Dynamic custom fields (text / number / date / select) with add/remove |

**Supported languages (16):** English, Japanese, Korean, Chinese Traditional, Chinese Simplified, French, German, Spanish, Italian, Portuguese, Thai, Vietnamese, Indonesian, Malay, Arabic, Russian.

**Step completion:** Requires `venueName` to be non-empty and `coreLanguage` to be set.

---

### Step 2 — Layout (`LayoutPicker`)

Selects a visual layout template for the published guide.

- Displays layout cards with name, description, accent colour, and tags.
- Selection is stored in `entityConfig.selectedLayout`.

---

### Step 3 — Assets (`AssetsStep`)

Two-tab view: **Upload** and **Library**.

- **Upload tab** (`AssetUploader`): Drag-and-drop or file-picker upload to Firebase Storage. Shows upload progress per file. Each uploaded file becomes an `AssetFile` record in the store (`assets[]`).
- **Library tab** (`AssetLibrary`): Grid/list view of all uploaded assets. Supports preview, tagging, and removal. Library badge shows total asset count.

**Asset types:** Image (JPG, PNG, WebP, GIF), PDF, Video (MP4, MOV).

---

### Step 4 — Modules (`ModuleSelect`)

Selects which product modules are enabled for this guide.

| Module | Phase | Status |
|---|---|---|
| Audio Guide 🎧 | 1 | Available |
| Q&A Chatbot 💬 | 2 | Coming soon |
| Stamp Hunt 🏅 | 3 | Coming soon |

---

### Step 5 — Ingestion (`IngestionStep`)

Three internal sub-steps rendered as a nested MUI `Stepper`:

1. **Select Content** (`ContentSelector`) — choose which uploaded assets to feed into the pipeline. Asset IDs are saved as `selectedAssetIds`.
2. **AI Processing** — calls `startPipeline(...)` with selected files + entity context. Shows a `ProcessingOverlay` with animated spinner and step chips (OCR Parse → Metadata Extraction → Spot Detection).
3. **Review & Approve** (`MetadataEditor` + Human Gate 1) — editable list of extracted `SpotMetadata` items. User can edit, reorder, add, or remove spots. Approving sends `sendHumanInput(..., 'approve', ...)` with the edited spots serialised as JSON feedback.

**Store state:** `ingestionStatus` (`idle` / `selecting` / `processing` / `review` / `approved` / `error`), `spots[]`, `selectedAssetIds`, `pipelineSessionId`, `pipelineCheckpointId`.

---

### Step 6 — Script Review (`ScriptReviewStep`)

Two internal sub-steps:

1. **Generate Scripts** — triggers the pipeline (resumes from ingestion checkpoint or starts a new script-generation run). Per-step status chips animate while running.
2. **Review & Approve** (Human Gate 3) — one collapsible `Card` per spot showing:
   - AI-generated `scriptText` (editable `TextField`)
   - Image-Spot Mapper (`ImageSpotMapper`) — shows asset thumbnails; user drags/clicks to assign images to spots
   - Per-spot approve ✅ / reject ❌ toggle
   - **Fast-Track** switch — marks a spot to skip downstream human gates (translation & audio review)
   - Bulk approve all / reject all actions

**Store state:** `scripts[]` (with `approved`, `fastTrack` flags), `imageMappings[]`, `scriptStatus`.

---

### Step 7 — Translation Review (`TranslationReviewStep`)

Two internal sub-steps:

1. **Generate Translations** — calls `translateLanguage(...)` per enabled language (parallel requests, one per language). Shows per-language progress as `Chip` status indicators.
2. **Review & Approve** (Human Gate 4) — language tabs with a side-by-side table:
   - Left column: original script text
   - Right column: `TextField` for the translated text (editable)
   - Per-language approve / reject toggle
   - Bulk approve all / reject all

**Store state:** `translations[]` (`LanguageTranslation[]`), `translationStatus`.

---

### Step 8 — Audio Production (`AudioProductionStep`)

Three internal sub-steps:

1. **Configure**
   - `CharacterPicker` — select a TTS character preset (e.g. Friendly Guide, Academic Expert). Character presets define a `voiceId` default and persona description.
   - `VoicePicker` — override or pick a specific Gemini TTS voice from `AVAILABLE_VOICES`.
   - `DirectorNoteEditor` — three free-text fields: Vocal Environment, Mission, Pacing. Sent as `directorNote` in the generation request.

2. **Generate Audio** (`AudioGenerationPanel`)
   - Calls `generateAudioForLanguage(...)` per enabled language sequentially.
   - `ProcessingOverlay` shows per-language progress (`pending` / `generating` / `done` / `error`).
   - Sends approved translated scripts and the director note.

3. **Review & Approve** (Human Gate 5)
   - `AudioPlayer` — plays back each generated audio file by spot and language.
   - `PronunciationMarker` — UI to mark specific words/phrases with pronunciation corrections.
   - `SRTViewer` — displays timestamped subtitle entries from the generated SRT file.
   - `GenerationHistory` — shows previous generation runs with timestamps and voice settings.
   - Per-language approve / reject; bulk approve all / reject all.

**Store state:** `selectedCharacterId`, `selectedVoiceId`, `directorNote`, `audioFiles[]`, `pronunciationMarkers[]`, `generationHistory[]`, `srtFiles[]`, `audioStatus`.

---

### Step 9 — Publish (`PublishStep`)

Three internal sub-steps:

1. **Slideshow** (`SlideshowBuilder`) — configure per-spot image slideshows (TTML-compatible). Drag-and-drop ordering of `SlideshowImage` entries per spot with duration settings.

2. **Preview & Check**
   - `GuidePreview` — renders a device-frame preview (mobile / tablet / desktop selector via `previewDevice`).
   - `PublishChecklist` — readiness checklist that validates: entity config complete, all scripts approved, translations approved, audio approved, at least one slideshow configured.

3. **Approve & Publish** (`FinalApproval`)
   - `FinalApproval` — final confirmation form before CMS push. Triggers the pipeline publish node.
   - `QRCodeCard` — displays QR code and a short URL / custom slug for the published guide.

**Store state:** `slideshows[]`, `publishStatus` (`idle` / `previewing` / `publishing` / `published` / `error`), `previewDevice`, `customSlug`, `publishedGuide`.

---

## Step Completion Logic

`getStepCompletionStatus(step)` in the store returns `'completed' | 'incomplete' | 'error'`.

| Step | Completed when |
|---|---|
| entity-config | `venueName` non-empty AND `coreLanguage` set |
| layout | `selectedLayout` set |
| assets | At least 1 asset uploaded |
| modules | At least 1 module enabled |
| ingest | `ingestionStatus === 'approved'` |
| script | `scriptStatus === 'approved'` |
| translation | `translationStatus === 'approved'` |
| audio | `audioStatus === 'approved'` |
| publish | `publishStatus === 'published'` |

The **Next** button in `WizardShell` is gated on the current step being `'completed'` (or `isEntityConfigValid()` for step 1). Steps are non-linear — any accessible step can be jumped to directly via the stepper.

`isStepAccessible(step)` returns `true` once all preceding steps are `'completed'`.

---

## Sync Status Model

```
synced          ← store matches last pipeline response
local-changes   ← user has edited AI-generated data
syncing         ← awaiting pipeline response
conflict        ← local edits diverged from a completed pipeline run
```

Displayed in `WizardShell` as a `SyncStatusBadge` Chip.

---

## Key Store Actions

### Cascading reset
`resetDownstreamFrom(step)` resets the given step **and all steps after it** — e.g., resetting `ingest` also clears scripts, translations, audio, and publish data. Used when the user restarts a pipeline step.

### Full reset
`clearAll()` wipes all wizard state and generates a new `guideId`.

### Pipeline ID tracking
`setPipelineIds(sessionId, checkpointId)` stores the active pipeline session for subsequent `sendHumanInput` calls.

### applyStepData
`applyStepData(nodeLabel, output)` — dispatched by `usePipelineSync.applyResponse()` to hydrate store slices from pipeline node output.

---

## File Map

```
laxy-studio/src/
├── pages/
│   └── GuidePage.tsx               Route host; activates useAutosave
├── guidesStore.ts                  Zustand store — all wizard state + actions
├── api.ts                          ADK pipeline + Firebase Storage client
├── types/
│   ├── entity.ts                   Domain types (EntityConfig, SpotMetadata, …)
│   ├── guide.ts                    Guide list/document types
│   └── translation.ts              Translation request/response types
├── hooks/
│   ├── useAutosave.ts              Debounced localStorage save
│   ├── usePipelineSync.ts          ADK response → store reconciliation
│   ├── usePipelinePolling.ts       Polling for long-running pipeline runs
│   ├── useFeatureFlags.ts          Real-time Firestore feature flag subscription
│   ├── useFirestore.ts             Generic Firestore CRUD
│   ├── useTenantScope.ts           Tenant-scoped Firestore queries
│   └── useUpload.ts                Firebase Storage upload with progress
└── components/wizard/
    ├── WizardShell.tsx             Stepper layout, nav, sync badge, autosave toggle
    ├── EntityConfigForm.tsx        Step 1 — venue config (accordion sections)
    ├── LayoutPicker.tsx            Step 2 — template picker
    ├── AssetsStep.tsx              Step 3 — upload + library tabs
    ├── AssetUploader.tsx           Drag-and-drop uploader
    ├── AssetLibrary.tsx            Uploaded asset grid/list manager
    ├── ModuleSelect.tsx            Step 4 — module toggle cards
    ├── IngestionStep.tsx           Step 5 — content select → AI process → review
    ├── ContentSelector.tsx         Asset picker for ingestion
    ├── MetadataEditor.tsx          Spot metadata edit/reorder table
    ├── ScriptReviewStep.tsx        Step 6 — script generate → review/approve
    ├── ImageSpotMapper.tsx         Assign images to spots
    ├── TranslationReviewStep.tsx   Step 7 — translate → side-by-side review
    ├── AudioProductionStep.tsx     Step 8 — configure → generate → review
    ├── audio/
    │   ├── CharacterPicker.tsx     TTS character preset selector
    │   ├── VoicePicker.tsx         Gemini TTS voice picker
    │   ├── DirectorNoteEditor.tsx  Director note (3-field form)
    │   ├── AudioGenerationPanel.tsx Per-language generation trigger + progress
    │   ├── AudioPlayer.tsx         Audio playback per spot/language
    │   ├── PronunciationMarker.tsx Pronunciation correction UI
    │   ├── SRTViewer.tsx           Timestamped subtitle viewer
    │   └── GenerationHistory.tsx   Previous generation run history
    ├── PublishStep.tsx             Step 9 — slideshow → preview/check → publish
    └── publish/
        ├── SlideshowBuilder.tsx    Per-spot image timeline editor
        ├── GuidePreview.tsx        Device-frame guide preview
        ├── PublishChecklist.tsx    Readiness checklist
        ├── FinalApproval.tsx       Final CMS publish trigger
        └── QRCodeCard.tsx          QR code + short URL display
```

---

## Known Gaps / TODOs

- `GuidePage` stub: loading a guide by Firestore ID is not yet implemented (only the latest `localStorage` draft is available).
- `clearAll` generates a new `guideId` but does not yet create a Firestore document.
- `applyStepData` hydration from pipeline node labels is partially wired — node label ↔ store slice mapping should be validated against the backend ADK agent step IDs.
- `useTenantScope` and multi-tenant Firestore paths are scaffolded but not integrated into `GuidePage`.
