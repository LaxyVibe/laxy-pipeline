# Laxy Studio — Guide Wizard Frontend Implementation Plan

> **⚠️ HISTORICAL DOCUMENT** — This plan was written for the original Flowise-based architecture.
> Flowise has been replaced by Google ADK + Vertex AI (see `ADK_MIGRATION_PLAN.md`).
> All references to "Flowise", "agentflow", and the Flowise prediction API are superseded.
> The audited/corrected version is in `GUIDE_WIZARD_FRONTEND_PLAN.md`.

> Generated: 2026-02-28
> Source: TS-Laxy Studio Function List-280226-010434.pdf
> Scope: Phase 1 MVP — "Handle in Studio App (Wizard)" items only

---

## Current State

The existing `laxy-studio` React app is a **raw pipeline executor**. It sends a single message to the Flowise agentflow API end-to-end and renders JSON responses. There is no wizard step UI, no file upload, no inline editing, no audio player, and no per-spot review.

### What Exists Today

| Component | What it does |
|---|---|
| `App.tsx` | Root layout with Wizard / Pipeline Debug toggle |
| `store.ts` | Zustand store mapping 5 stages to Flowise node labels |
| `guidesStore.ts` | Zustand store for wizard state, entity config, step navigation |
| `api.ts` | Flowise prediction API client (start, human-input) |
| `types/entity.ts` | TypeScript types for EntityConfig, OperatingHours, ItemFieldDef, languages, modules |
| `wizard/WizardShell.tsx` | Horizontal stepper wizard layout with Back/Next/Save navigation |
| `wizard/EntityConfigForm.tsx` | ✅ Full entity setup form — 7 accordion sections (Basic Info, Location, Media, Hours, Languages, Modules, Item Fields) |
| `PipelineStepper.tsx` | MUI vertical stepper showing stage progress |
| `HumanGatePanel.tsx` | Approve / Reject buttons with a single feedback textarea |
| `NodeOutputCard.tsx` | Collapsible card rendering raw JSON output |
| `StageDetail.tsx` | Lists NodeOutputCards for a given stage |
| `HistoryDrawer.tsx` | Timeline of all API round-trips |

### Architectural Gap

The current flow is **linear & non-interactive**: `Start → wait → approve/reject → wait → ...`
The target wizard requires **per-item editing, rich media controls, multi-tab reviews**, and **pre-population of forms from AI output** that the user corrects before approving.

---

## Feature Breakdown by Wizard Step

Below, each feature is tagged:

- ✅ **Done** — already implemented
- 🔧 **Partial** — logic exists but UI is too basic
- ❌ **Missing** — not implemented at all
- 📌 **Phase 2+** — explicitly deferred per the feature list

---

### Pre-Wizard: Entity & Asset Setup

These are **top-level setup screens** the user completes _before_ entering the Guide wizard.

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| PW-1 | **Entity Configuration** — venue name, address, GPS, map image, cover image, operating hours, website, phone, supported languages, core language, enabled modules, item field config | ✅ Done | Implemented in `EntityConfigForm.tsx`. 7 accordion sections: Basic Info, Location & GPS, Media, Operating Hours, Languages (core + multi-select), Modules, Item Field Config (dynamic add/remove). Backed by `guidesStore.ts` + `types/entity.ts`. Wired into App via `WizardShell` with Wizard/Pipeline toggle. |
| PW-2 | **Layout Style Selection** — select from pre-designed Player UI templates, live preview | ✅ Done | Implemented in `LayoutPicker.tsx`. 4 templates (Classic, Modern Card, Storyteller, Compact) with phone-frame preview mocks, selection card grid, full-screen preview dialog. Selection saved to `entityConfig.selectedLayout`. Wired into WizardShell at the `layout` step. |
| PW-3 | **Asset Upload** — drag & drop (PDF, image), bulk upload with progress indicator, URL / raw text input | ✅ Done | Implemented in `AssetUploader.tsx`. Three input modes (File Upload / URL / Raw Text) via tabs. Drag-and-drop dropzone accepting PDF, JPG, PNG, WebP (max 100 MB). Bulk upload with per-file progress bars. URL import with type inference. Raw text input with optional label. File list with thumbnail preview, status chips, remove/clear actions. Backed by `AssetFile` types in `entity.ts` + `assets` state in `guidesStore.ts` (add, remove, update, clear). Simulated upload progress — ready for Firebase Storage integration. Wired into WizardShell at the `assets` step. |
| PW-4 | **Asset Library** — browse, search, preview assets, delete/replace, storage usage indicator | ✅ Done | Implemented in `AssetLibrary.tsx`. Grid/list toggle view with thumbnail previews (images) and type icons (PDF/text). Search by name, filter chips (All/Images/PDFs/Text with counts), sort by date/name/size. Preview dialog with metadata chips. Delete with confirmation dialog. Replace via file picker. Storage usage bar with quota display (500 MB simulated — ready for Firebase). Assets step refactored into `AssetsStep.tsx` with Upload + Library tabs (badge shows asset count). Wired into WizardShell. |
| PW-5 | **Function/Module Selection** — Guide module enabled (Phase 1) | ✅ Done | Implemented in `ModuleSelect.tsx`. Rich card-based selection with icon, description, phase badge, and enabled/available status per module. Audio Guide (Phase 1) is selectable; Q&A Chatbot (Phase 2) and Stamp Hunt (Phase 3) shown as locked/greyed. Toggle to enable/disable, summary bar showing enabled modules. `AVAILABLE_MODULES` enriched with `description`, `phase`, and `icon` fields. Added `modules` wizard step to `guidesStore.ts`. Wired into WizardShell between Assets and Ingestion steps. |

#### Implementation Plan — Pre-Wizard

1. **New route/page**: `/guides/new` or `/guides/:id/edit` — the wizard entry point
2. **EntityConfigForm component** (`src/components/wizard/EntityConfigForm.tsx`)
   - Sections: Basic Info, Location, Media, Languages, Item Fields
   - Fields: venue name (text), address (text), GPS (lat/lng inputs + map picker), map image (upload), cover image (upload), operating hours (schedule grid), website (url), phone (tel), supported languages (multi-select from ISO list), core language (select), item field config (dynamic field list)
   - Save to Firestore `entities/{entityId}` doc
   - Validation: required fields = name, core language, at least 1 supported language
3. **LayoutPicker component** (`src/components/wizard/LayoutPicker.tsx`)
   - Grid of template thumbnails (hardcode 3-4 templates for Phase 1)
   - Click to select, shows live preview in an iframe or mock
4. **AssetUploader component** (`src/components/wizard/AssetUploader.tsx`)
   - React-dropzone for drag & drop
   - Accept: `.pdf`, `.jpg`, `.jpeg`, `.png`, `.webp`
   - Bulk upload with per-file progress bars
   - Alt input: URL field or raw text textarea
   - Upload to Firebase Storage `assets/{entityId}/{filename}`
   - Save metadata to Firestore `assets/{entityId}/files/{fileId}`
5. **AssetLibrary component** (`src/components/wizard/AssetLibrary.tsx`)
   - Grid/list toggle view
   - Thumbnail preview (images) and PDF icon (PDFs)
   - Search text input, filters
   - Delete button with confirm dialog
   - Storage usage bar: `used / quota`
6. **ModuleSelect component** — simple card with "Guide" checked, others greyed (Phase 2/3)

**Dependencies**: Firebase SDK (Storage, Firestore), react-dropzone, a map component (e.g. react-leaflet or @react-google-maps/api for GPS picker)

---

### Step 1: Ingestion

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| S1-1 | **Content Upload UI** — select files from Asset Data Lake OR upload new files, or provide basic entity info manually, select core language | ✅ Done | Implemented in `ContentSelector.tsx`. Displays ready assets from Asset Library with multi-select checkboxes, select all/deselect all, asset count chip, file type icons, and core language badge pulled from entity config. Wired into `IngestionStep.tsx` sub-step 1. |
| S1-2 | **Trigger OCR + Metadata Extraction** — send selected files to Flowise S2/S1 nodes | ✅ Done | `IngestionStep.tsx` builds a structured question string with selected asset names/types + core language, calls `startPipeline()`, then parses S1 (Metadata Extract) and S2 (OCR Parse) node outputs. Falls back to sample data (3 spots) if Flowise is unavailable. `api.ts` updated with `getExecutedNodes()`, `getLastStatus()`, `getStoppedNodeId()`, `getNodeOutput()` helpers. |
| S1-3 | **AI Metadata Table** — display extracted metadata (title, artist, period, material, dimensions, highlight, cultural designation) in an editable table | ✅ Done | Implemented in `MetadataEditor.tsx`. Structured table with inline `<TextField>` editing for all 7 metadata fields. Compact view shows Title/Artist/Period; expand chevron reveals Material, Dimensions, Highlight, Cultural Designation, and source OCR text. Add/Delete spot actions. Backed by `SpotMetadata` type in `entity.ts` + full CRUD in `guidesStore.ts`. |
| S1-4 | **Item Numbering** — add spot numbers to items | ✅ Done | Each row shows `spotNumber` as a `<Chip>` in the `#` column. Auto-incremented on add. Renumbered on reorder/delete via `reorderSpots()` in `guidesStore.ts`. |
| S1-5 | **Drag-and-Drop Reorder** — reorder items by dragging | ✅ Done | Implemented using `@dnd-kit/core` + `@dnd-kit/sortable` with `verticalListSortingStrategy`. Drag handle icon per row, pointer + keyboard sensors, `arrayMove` on drag end → `reorderSpots()` store action. |
| S1-6 | **Human Gate 1 — Data Review** — inline correction + approve | ✅ Done | `IngestionStep.tsx` renders MetadataEditor above Human Gate 1 panel when status is `review`. Styled warning panel with Approve & Continue (success) and Start Over (reset) buttons. Loading spinner during approval. Full 3-sub-step progress stepper (Select Content → AI Processing → Review & Approve). `IngestionStatus` type in `entity.ts` with `idle | selecting | processing | review | approved | error` states. |

#### Implementation Plan — Step 1

1. **IngestionStep component** (`src/components/wizard/steps/IngestionStep.tsx`)
   - Substeps: (a) Select/Upload Content → (b) AI Processing → (c) Review
2. **ContentSelector subcomponent**
   - Two tabs: "From Asset Library" (browse & select) | "Upload New"
   - Asset library: reuse AssetLibrary with multi-select mode
   - Upload: reuse AssetUploader
   - Core language dropdown (pulled from entity config)
   - "Start Processing" button → calls modified `startPipeline()` passing file refs
3. **Modify `api.ts`**
   - `startPipeline()` must accept `{ files: string[], coreLanguage: string, entityId: string }` in `overrideConfig`
   - The Flowise S2 node's `{{ question }}` should receive structured input (or the files should be uploaded to a URL the LLM can access)
4. **MetadataEditor component** (`src/components/wizard/MetadataEditor.tsx`)
   - Parse S1 (Metadata Extract) JSON output into a structured table
   - Columns: `#`, `Title`, `Artist`, `Period`, `Material`, `Dimensions`, `Highlight`, `Cultural Designation`
   - Each cell is an editable `<TextField>` pre-populated with AI values
   - Row drag-and-drop via `@dnd-kit/core` or `react-beautiful-dnd`
   - Number column auto-increments, or user can type
   - "Add Row" and "Delete Row" buttons
   - Edited values are serialized back when approving
5. **Update HumanGatePanel** for Step 1
   - When stage === 'ingest' and gate is active, render MetadataEditor above the approve/reject buttons
   - On approve, serialize the edited metadata into the feedback string (or a structured JSON the Flowise human input node can parse)
6. **Loading state**
   - Show a progress spinner with "Gemini is extracting metadata..." text during OCR/extraction
   - Optionally show a streaming indicator if Flowise supports SSE

**Dependencies**: `@dnd-kit/core` + `@dnd-kit/sortable` (for drag-and-drop reorder)

---

### Step 2: Deep Research — 📌 Phase 2 (Skip)

---

### Step 3: Script Generation

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| S3-1 | **AI Script Generation display** — show generated script per spot | ✅ Done | Implemented in `ScriptReviewStep.tsx`. Per-spot expandable cards with spot number chip, title, and editable `<TextField multiline>` for script text. Calls Flowise `S4: Script Generation` node via `startPipeline()`, parses output into `SpotScript[]`. Falls back to rich sample scripts if Flowise unavailable. Backed by `SpotScript` type in `entity.ts` + full CRUD in `guidesStore.ts` (`scripts`, `setScripts`, `updateScript`). 2-sub-step progress stepper (Generate Scripts → Review & Approve). |
| S3-2 | **Image-Spot Mapping** — assign images/videos to each spot from asset library, AI auto-suggests, manual override | ✅ Done | Implemented in `ImageSpotMapper.tsx`. Per-spot media panel embedded in each script card. Shows AI-suggested images with ⭐ "AI Suggested" chip. Manual override via dialog with asset library multi-select (image assets only). Remove individual images, swap button. AI output parsed from `S5: Image-Spot Mapping` node. Fallback: round-robin assignment from available image assets. Backed by `SpotImageMapping` type + `imageMappings` state + `updateImageMapping` action in `guidesStore.ts`. |
| S3-3 | **Human Gate 3 — Script Review** — review per spot, approve individually or in bulk | ✅ Done | Per-spot Approve/Un-approve button on each script card with green/warning border indicator. Bulk actions bar with "Approve All" / "Un-approve All" buttons + approved count display. Human Gate 3 panel with styled warning card, sends approval payload (approved spots, rejected spots, fast-track spots, edited scripts) via `sendHumanInput()` to Flowise. Backed by `approveScript`, `rejectScript`, `approveAllScripts`, `rejectAllScripts` actions. |
| S3-4 | **Fast Track** — bypass gate for trusted/simple items | ✅ Done | Per-spot "Fast Track — skip review" checkbox with ⚡ bolt icon on each script card. Fast-tracked spots shown with "Fast Track" chip badge. Count displayed in bulk actions bar. Fast-track IDs included in gate approval payload for Flowise. Backed by `toggleFastTrack` action in `guidesStore.ts`. |
| S3-5 | Multiple audience variants (Kids, Academic, Quick, etc.) | 📌 Phase 2 | — |

#### Implementation Plan — Step 3

1. **ScriptReviewStep component** (`src/components/wizard/steps/ScriptReviewStep.tsx`)
   - Parse S4 (Script Gen) output into per-spot script objects
   - Each spot rendered as an expandable card: spot number, title, script text
   - Script text in an editable `<TextField multiline>` so client can tweak wording
   - Per-spot approve/reject toggle (checkbox or chip)
   - "Approve All" / "Reject All" bulk buttons at top
2. **ImageSpotMapper component** (`src/components/wizard/ImageSpotMapper.tsx`)
   - For each spot, show AI-suggested images (from S5: Image Map output) as thumbnails
   - "Change" button opens Asset Library in a dialog for manual override
   - Drag to reorder images within a spot
   - Badge: ⭐ "AI Suggested" on auto-assigned images
3. **Fast Track toggle**
   - Checkbox per spot: "Fast Track — skip review for this item"
   - Pass fast-tracked item IDs in the gate approval payload so Flowise can skip downstream gates for those items
4. **Gate override**
   - When gate is active for `script` stage, show ScriptReviewStep + ImageSpotMapper instead of raw JSON
   - Serialize per-spot approval statuses + edited scripts into the human input call

---

### Step 4: Translation

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| S4-1 | **Translation display** — show translated script per language in tabs | ✅ Done | Implemented in `TranslationReviewStep.tsx`. Language tabs with side-by-side original (read-only) + translated (editable `<TextField multiline>`) table per language. Tab bar with scrollable language tabs showing approval checkmarks. Spot number chips, title labels. Calls Flowise `S6: Translation` node via `startPipeline()`, parses output into `LanguageTranslation[]`. Falls back to stub translations (prefixed copy of base text) if Flowise unavailable. Backed by `LanguageTranslation`, `SpotTranslation`, `TranslationStatus` types in `entity.ts` + full CRUD in `guidesStore.ts` (`translations`, `setTranslations`, `updateTranslation`). 2-sub-step progress stepper (Generate Translations → Review & Approve). |
| S4-2 | **Human Gate 4 — Translation Review** — approve per language | ✅ Done | Per-language Approve/Un-approve button on each language tab. Bulk actions bar with "Approve All Languages" / "Un-approve All" buttons + approved count display. Human Gate 4 panel with styled warning card, sends approval payload (approved languages, rejected languages, edited translations) via `sendHumanInput()` to Flowise. Backed by `approveLanguage`, `rejectLanguage`, `approveAllLanguages`, `rejectAllLanguages` actions in `guidesStore.ts`. |
| S4-3 | Export to Excel for external translators | 📌 Phase 2 | — |

#### Implementation Plan — Step 4

1. **TranslationReviewStep component** (`src/components/wizard/steps/TranslationReviewStep.tsx`)
   - Parse S6 (Translation) output: `{ lang: string, spots: { id, original, translated }[] }[]`
   - Tab bar for each language (EN, JP, KR, ZH-TW, ZH-CN, FR, etc.)
   - Per language tab: table with columns: `Spot #`, `Original Script`, `Translated Script`
   - Translated script cells are editable `<TextField>`
   - Per-language approve checkbox
   - "Approve All Languages" bulk button
2. **Side-by-side view**
   - Optional split-pane: original (read-only left) | translated (editable right)
   - Highlight differences or AI-uncertain phrases (if the LLM provides confidence)
3. **Gate override**
   - When gate is active for `translation` stage, render TranslationReviewStep

---

### Step 5: Audio Production

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| S5-1 | **Character Selection** — select from Character Library (voice persona: name, role, avatar, personality, speech patterns) | ✅ Done | `CharacterPicker.tsx` — 5 persona cards with avatar, name, role, personality, speech patterns. Click to select. AI-recommended badge. |
| S5-2 | **Voice Selection** — filter by All / Female / Male, list of available voices (Aoede, Algieba, etc.), AI recommends based on entity config | ✅ Done | `VoicePicker.tsx` — 8 TTS voices with gender filter toggle, AI suggestion badge, play preview button (disabled Phase 1). |
| S5-3 | **Context / Director Note** — optional directive, AI generates Vocal Environment, Mission of Speech, Pacing & Energy, admin can edit | ✅ Done | `DirectorNoteEditor.tsx` — 3 editable TextFields: Vocal Environment, Mission, Pacing. AI-populated with helper text. |
| S5-4 | **Audio Generation** — generate per language or all, token estimate shown, progress bar | ✅ Done | `AudioGenerationPanel.tsx` — language chip selector, token estimate, generate button, LinearProgress bar during generation. |
| S5-5 | **Audio Playback & QA** — audio player per language tab (play, pause, skip ±15s), admin download .mp3 | ✅ Done | `AudioPlayer.tsx` — HTML5 audio with Play/Pause, ±15s skip, progress slider, time display, language tabs, download .mp3. |
| S5-6 | **Human Gate 5 — Audio Review** — listen per language, approve | ✅ Done | `AudioProductionStep.tsx` — per-language approve in AudioPlayer + bulk approve/reject + Human Gate 5 panel with Flowise `sendHumanInput`. |
| S5-7 | **Audio Pronunciation Fix** — mark timestamp + text comment describing voice issue | ✅ Done | `PronunciationMarker.tsx` — capture timestamp from player, add comment, sorted marker list with delete. |
| S5-8 | **Generation History** — every run saved (timestamp, languages, character, context, token count), click to retrieve/rollback | ✅ Done | `GenerationHistory.tsx` — expandable list of past runs with timestamp, languages, voice, character, tokens, director note. |
| S5-9 | **SRT Generation** — auto-generate subtitle files synced to audio timing | ✅ Done | `SRTViewer.tsx` — language tabs, table view (index, timing, text), download .srt button. Stub SRT from scripts. |
| S5-10 | Script Enhancement toggle (performance cues) | 📌 Phase 2 | — |
| S5-11 | AI re-generates only that audio segment (pronunciation fix) | 📌 Phase 2 | — |

#### Implementation Plan — Step 5

1. **CharacterPicker component** (`src/components/wizard/audio/CharacterPicker.tsx`)
   - Grid of character cards: avatar image, name, role, personality summary
   - Click to select. Selected card highlighted.
   - Phase 1: hardcode 3-5 character presets from Firestore `characters` collection
   - If AI recommendation exists (from S7: Voice Recommend), show ⭐ badge
2. **VoicePicker component** (`src/components/wizard/audio/VoicePicker.tsx`)
   - List/grid of available TTS voices
   - Filter chips: All | Female | Male
   - Each voice card: name, gender icon, 5-sec sample play button
   - Available Phase 1 voices: Aoede, Algieba, Algenib, Despina, Laomedeia, Pulcherrima, Sadaltager, Sulafat
   - AI-recommended voice has ⭐ "Suggested" badge
   - Store selection in wizard state
3. **DirectorNoteEditor component** (`src/components/wizard/audio/DirectorNoteEditor.tsx`)
   - Parse S8 (Director Note) output into structured fields:
     - Vocal Environment (textarea)
     - Mission of Speech (textarea)
     - Pacing & Energy (textarea / slider / chips)
   - Pre-populated with AI-generated values, fully editable
   - "Regenerate" button to re-call AI with edited context
4. **AudioGenerationPanel component** (`src/components/wizard/audio/AudioGenerationPanel.tsx`)
   - Language checkboxes: select which languages to generate (pre-check all configured)
   - Token/cost estimate display (from LLM usage metadata or a pre-flight estimate API)
   - "Generate Audio" button
   - Progress: per-language progress bar or spinner
   - Japanese Kanji→Hiragana and Chinese pronunciation handled server-side (transparent)
5. **AudioPlayer component** (`src/components/wizard/audio/AudioPlayer.tsx`)
   - HTML5 `<audio>` element with custom MUI controls
   - Play / Pause / Skip -15s / Skip +15s buttons
   - Progress slider showing current time / total time
   - Language tabs to switch between language audio files
   - Download button (.mp3)
   - Waveform visualization (optional, use `wavesurfer.js` or simple progress bar)
6. **PronunciationMarker component** (`src/components/wizard/audio/PronunciationMarker.tsx`)
   - While audio is playing, user can click "Mark Issue" at current timestamp
   - Opens a small form: timestamp (auto-filled), text comment describing the issue
   - Issues listed below the player as a timeline of markers
   - Phase 1: collect markers only (no AI re-gen). Phase 2: trigger segment re-generation
7. **GenerationHistory component** (`src/components/wizard/audio/GenerationHistory.tsx`)
   - List of past generation runs (from Firestore or from Flowise execution history)
   - Each entry: timestamp, languages generated, character used, voice, context summary, token count
   - "Load" button to restore that generation's scripts and audio
   - "Compare" to diff two generations side-by-side
8. **SRTViewer component** (`src/components/wizard/audio/SRTViewer.tsx`)
   - Parse S10 (SRT Gen) output
   - Display subtitle entries in a table: `#`, `Timecode`, `Text`
   - "Download .srt" button per language
   - Preview: play audio with subtitles below
9. **Gate override — Audio Review**
   - When gate is active for `audio` stage, render:
     - AudioPlayer (per language tab)
     - PronunciationMarker
     - Approve / Reject per language or bulk

**Dependencies**: `wavesurfer.js` (optional, for waveform), Firebase Storage URLs for audio files

---

### Step 6: Publishing

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| S6-1 | **Slideshow Builder (TTML)** — select images/videos per spot, multi-image, visual timeline editor, image order & sync timing | ✅ Done | `publish/SlideshowBuilder.tsx` — per-spot image timeline, drag reorder, duration sliders, add from asset library. |
| S6-2 | **CMS Publishing** — final content check, bundle approved content (audio, scripts, images, SRT), push to Firebase CDN | ✅ Done | `publish/PublishChecklist.tsx` — 6-item readiness checklist with Fix buttons + Flowise publish integration in `PublishStep.tsx`. |
| S6-3 | **Preview** — preview final Player experience, select/confirm Player template | ✅ Done | `publish/GuidePreview.tsx` — device frame preview (mobile/tablet/desktop), template selector, mock guide content. |
| S6-4 | **Final Approval & Publish** — mobile preview, final review all content | ✅ Done | `publish/FinalApproval.tsx` — summary stats, spot table, Approve & Publish button with loading state. |
| S6-5 | **QR Code Generation** — auto-generate QR on publish, downloadable PNG | ✅ Done | `publish/QRCodeCard.tsx` — canvas-based QR placeholder, download PNG, post-publish display. |
| S6-6 | **Shortlink/URL** — generate branded short URL (laxy.click), custom slug option | ✅ Done | `publish/QRCodeCard.tsx` — custom slug input, copy-to-clipboard, short URL display. |
| S6-7 | AI auto-generates slideshow | 📌 Phase 2 | — |

#### Implementation Plan — Step 6

1. **SlideshowBuilder component** (`src/components/wizard/publish/SlideshowBuilder.tsx`)
   - Per-spot image/video selector from Asset Library
   - Multi-image selection per spot
   - Visual timeline: horizontal track with draggable image thumbnails synced to audio duration
   - Drag to reorder images, drag edges to adjust timing
   - Library: use a timeline component (e.g. `react-chrono` adapted, or custom SVG/canvas)
2. **PublishChecklist component** (`src/components/wizard/publish/PublishChecklist.tsx`)
   - Checklist of all content items:
     - ☑ Metadata reviewed
     - ☑ Scripts approved (N/M spots)
     - ☑ Translations approved (N/M languages)
     - ☑ Audio generated & reviewed (N/M languages)
     - ☑ SRT files generated
     - ☑ Slideshow configured
   - Each item links back to its wizard step for fixes
   - "Publish" button only enabled when all items checked
3. **GuidePreview component** (`src/components/wizard/publish/GuidePreview.tsx`)
   - Embedded iframe loading the Player app (`guide.laxy.travel/{guideId}`) in preview mode
   - Device frame toggle: mobile (375px) / tablet (768px) / desktop
   - Template selector dropdown to switch Player template
4. **FinalApproval component** (`src/components/wizard/publish/FinalApproval.tsx`)
   - Summary page: all spots listed with script snippet, audio duration, image count per spot
   - Mobile-frame preview side by side
   - "Approve & Publish" button → triggers Firebase CDN deployment
   - Post-publish: show success with QR code and shortlink
5. **QRCodeCard component** (`src/components/wizard/publish/QRCodeCard.tsx`)
   - Generate QR code from the guide URL using `qrcode.react`
   - Download as PNG button
   - Short URL display with copy button
6. **ShortlinkService**
   - API module to create/manage short URLs (`laxy.click/{slug}`)
   - Custom slug input with availability check
   - Integration point TBD (Firebase Dynamic Links deprecated → use custom service or Bitly API)

**Dependencies**: `qrcode.react`, shortlink service, Player app iframe URL

---

## Cross-Cutting Concerns

### Wizard Shell & Navigation

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| CC-1 | **Wizard Shell** — step-by-step navigation (stepper + step content area) | ✅ Done | Interactive horizontal stepper with click-to-navigate, step completion icons (checkmark/error/active), step accessibility guards, responsive vertical layout on small screens. Guide ID + progress counter bar. Implemented in `WizardShell.tsx`. |
| CC-2 | **Save & Resume** — persist wizard state so user can leave and return | ✅ Done | Zustand `persist` middleware with `localStorage`. Auto-generates `guideId` on first save. Rehydrates full wizard state on page reload. `saveDraft()` action + "Save Draft" button. Non-serializable data (File objects, blob URLs) stripped via `partialize`. Implemented in `guidesStore.ts`. |
| CC-3 | **Auto-save** — automatically save edits as user types | ✅ Done | `useAutosave` hook subscribes to `isDirty` flag and debounces saves (2 s). Auto-save toggle in top bar. "Saved HH:MM:SS" indicator in bottom nav bar. Implemented in `hooks/useAutosave.ts` + `WizardShell.tsx`. |
| CC-4 | **Wizard state vs Flowise state sync** — keep local edits in sync with pipeline execution | ✅ Done | `useFlowiseSync` hook provides `applyResponse()` to parse Flowise `PredictionResponse` node outputs into wizard store, `buildGatePayload()` to serialize current wizard edits for human gate approval, and `markLocalChanges()` for conflict tracking. `syncStatus` indicator (synced/local-changes/syncing/conflict) shown in top bar. `applyFlowiseData()` store action handles all node labels (S1–S10). Implemented in `hooks/useFlowiseSync.ts` + `guidesStore.ts`. |

#### Implementation Plan

1. **WizardShell component** (`src/components/wizard/WizardShell.tsx`)
   - Replace the current `App.tsx` pipeline view with a full wizard layout
   - Top: horizontal stepper (Setup → Ingest → Script → Translation → Audio → Publish)
   - Left sidebar: PipelineStepper (Flowise execution tracker) — retained for backend status
   - Center: current step's content component
   - Bottom: navigation bar (Back | Save Draft | Next / Start Processing)
   - Steps are navigable by clicking (for completed steps, to review)
2. **Persist wizard state** to Firestore `guides/{guideId}/wizard` doc
   - On every step change or explicit save, write current state
   - On app load, hydrate from Firestore if guide exists
   - Add `guidesStore` (Zustand + Firestore sync) separate from `pipelineStore`
3. **WizardContext** — React context providing:
   - `currentStep`, `goToStep()`, `nextStep()`, `prevStep()`
   - `guideId`, `entityId`
   - `wizardData` (aggregated state from all steps)
   - `isDirty`, `save()`, `isSaving`

### Data Flow: Wizard ↔ Flowise

```
┌──────────────────────────────────────────────────────────────────┐
│  Wizard UI (React)                                               │
│                                                                  │
│  [EntityConfig] → [ContentUpload] → [MetadataEditor] → ...      │
│       │                │                   ▲                     │
│       │                │                   │ parse output        │
│       ▼                ▼                   │                     │
│  ┌─────────────── api.ts ──────────────────┘                    │
│  │  startPipeline({ files, lang, entity })                      │
│  │  sendHumanInput(chatId, 'proceed', nodeId, editedJSON)       │
│  └──────────────────────────────────────────────────────────────│
│                        │                   ▲                     │
└────────────────────────┼───────────────────┼─────────────────────┘
                         ▼                   │
                   ┌───────────┐       ┌───────────┐
                   │  Flowise  │──────▶│  Flowise  │
                   │  (start)  │       │ (response) │
                   └───────────┘       └───────────┘
```

Key pattern: **AI outputs pre-populate wizard forms → user edits → edited data sent as gate approval payload → Flowise continues with corrected data**.

### Authentication & Authorization

| # | Feature | Notes |
|---|---------|-------|
| AA-1 | Social login (Google, Apple) | Firebase Auth |
| AA-2 | Email & password login | Firebase Auth |
| AA-3 | Email OTP verification | Firebase Auth |
| AA-4 | Forget password (reset via email) | Firebase Auth |
| AA-5 | Registration (tenant sign-up, onboarding walkthrough) | Custom form + Firestore |
| AA-6 | Role-based access (Client Admin / Client Editor) | Firestore user doc + React route guards |

These are handled separately from the wizard but are prerequisites. The wizard should be behind auth and check the user's tenant + role before allowing access.

---

## Proposed File Structure

```
src/
├── api.ts                          # Flowise API client (existing, extend)
├── store.ts                        # Pipeline execution store (existing, keep)
├── guidesStore.ts                  # NEW — Wizard state (Firestore-synced)
├── authStore.ts                    # NEW — Firebase Auth state
├── App.tsx                         # Root router (existing, refactor)
├── theme.ts                        # MUI theme (existing)
├── firebase.ts                     # NEW — Firebase init (Auth, Firestore, Storage)
├── types/
│   ├── entity.ts                   # Entity config types
│   ├── guide.ts                    # Guide/wizard data types
│   ├── asset.ts                    # Asset metadata types
│   ├── character.ts                # Character & voice types
│   └── script.ts                   # Script, translation types
├── components/
│   ├── HistoryDrawer.tsx           # (existing)
│   ├── HumanGatePanel.tsx          # (existing, extend for per-step gates)
│   ├── NodeOutputCard.tsx          # (existing, used in debug/advanced view)
│   ├── PipelineStepper.tsx         # (existing, used as backend status sidebar)
│   ├── StageDetail.tsx             # (existing, used in debug/advanced view)
│   └── wizard/
│       ├── WizardShell.tsx         # Main wizard layout + navigation
│       ├── EntityConfigForm.tsx    # Pre-wizard entity setup
│       ├── LayoutPicker.tsx        # Player template selection
│       ├── AssetUploader.tsx       # Drag & drop file upload
│       ├── AssetLibrary.tsx        # Asset browser with search
│       ├── MetadataEditor.tsx      # Editable metadata table with DnD
│       ├── steps/
│       │   ├── IngestionStep.tsx   # Step 1
│       │   ├── ScriptReviewStep.tsx # Step 3
│       │   ├── TranslationReviewStep.tsx # Step 4
│       │   ├── AudioStep.tsx       # Step 5 (orchestrator)
│       │   └── PublishStep.tsx     # Step 6 (orchestrator)
│       ├── audio/
│       │   ├── CharacterPicker.tsx
│       │   ├── VoicePicker.tsx
│       │   ├── DirectorNoteEditor.tsx
│       │   ├── AudioGenerationPanel.tsx
│       │   ├── AudioPlayer.tsx
│       │   ├── PronunciationMarker.tsx
│       │   ├── GenerationHistory.tsx
│       │   └── SRTViewer.tsx
│       └── publish/
│           ├── SlideshowBuilder.tsx
│           ├── PublishChecklist.tsx
│           ├── GuidePreview.tsx
│           ├── FinalApproval.tsx
│           └── QRCodeCard.tsx
├── pages/
│   ├── LoginPage.tsx
│   ├── DashboardPage.tsx           # Guide list + "New Guide" button
│   ├── GuidePage.tsx               # Wizard host page
│   └── PipelineDebugPage.tsx       # Current raw pipeline view (keep for dev)
└── hooks/
    ├── useFirestore.ts             # Generic Firestore CRUD hook
    ├── useUpload.ts                # Firebase Storage upload hook
    └── useAudioPlayer.ts           # Audio playback controls hook
```

---

## Implementation Phases (Recommended Order)

### Phase A — Foundation (est. 3-5 days)

| Task | Description |
|------|-------------|
| A1 | Add `react-router-dom`, set up routes: `/login`, `/dashboard`, `/guides/:id`, `/debug` |
| A2 | Add Firebase SDK (`firebase`, `reactfire` or manual init) — Auth, Firestore, Storage |
| A3 | Create `authStore.ts` (Firebase Auth listener, login/logout, current user/tenant) |
| A4 | Create `guidesStore.ts` (guide CRUD, wizard state persistence) |
| A5 | Create `WizardShell.tsx` with horizontal stepper + step content slot + nav bar |
| A6 | Create `types/` — TypeScript interfaces for entity, guide, asset, character, script |
| A7 | Move current pipeline view to `/debug` route (PipelineDebugPage) |

### Phase B — Pre-Wizard Setup (est. 3-4 days)

| Task | Description |
|------|-------------|
| B1 | `EntityConfigForm` — full entity setup form |
| B2 | `LayoutPicker` — template gallery (hardcode 3-4 templates) |
| B3 | `AssetUploader` — drag & drop with progress |
| B4 | `AssetLibrary` — browse, search, delete |
| B5 | Dashboard page — list existing guides, "New Guide" button |

### Phase C — Ingestion Step (est. 3-4 days)

| Task | Description |
|------|-------------|
| C1 | `IngestionStep` — content selector + upload + language picker |
| C2 | Modify `api.ts` — pass structured input to Flowise (file refs, language) |
| C3 | `MetadataEditor` — editable table with DnD reorder |
| C4 | Integrate MetadataEditor into HumanGatePanel for ingest stage |
| C5 | Serialize edited metadata back into gate approval payload |

### Phase D — Script & Translation Steps (est. 3-4 days)

| Task | Description |
|------|-------------|
| D1 | `ScriptReviewStep` — per-spot script cards with editing |
| D2 | `ImageSpotMapper` — image assignment per spot with AI suggestions |
| D3 | Per-spot and bulk approve/reject for scripts |
| D4 | `TranslationReviewStep` — language tabs, side-by-side, editable |
| D5 | Per-language and bulk approve/reject for translations |

### Phase E — Audio Production Step (est. 5-7 days)

| Task | Description |
|------|-------------|
| E1 | `CharacterPicker` — character card gallery |
| E2 | `VoicePicker` — voice list with gender filter + sample playback |
| E3 | `DirectorNoteEditor` — structured editable director note |
| E4 | `AudioGenerationPanel` — language selector, token estimate, progress bar |
| E5 | `AudioPlayer` — HTML5 audio with custom controls, language tabs, download |
| E6 | `PronunciationMarker` — timestamp marking + comment on audio player |
| E7 | `GenerationHistory` — list past runs, load/compare |
| E8 | `SRTViewer` — subtitle table + download |

### Phase F — Publishing Step (est. 4-5 days)

| Task | Description |
|------|-------------|
| F1 | `SlideshowBuilder` — per-spot image selector + timeline editor |
| F2 | `PublishChecklist` — content readiness checklist |
| F3 | `GuidePreview` — iframe Player preview with device frames |
| F4 | `FinalApproval` — summary + mobile preview + publish button |
| F5 | `QRCodeCard` — QR generation + shortlink display |
| F6 | CMS publish action — bundle & push to Firebase CDN |

### Phase G — Polish & Integration (est. 2-3 days)

| Task | Description |
|------|-------------|
| G1 | End-to-end test: full wizard flow from entity setup to publish |
| G2 | Error handling: network errors, Flowise timeouts, validation |
| G3 | Loading states: skeleton loaders for each step |
| G4 | Responsive design: ensure wizard works on tablet-width |
| G5 | Auto-save / draft persistence |

**Total estimated effort: ~23-32 days for one frontend developer**

---

## New Dependencies to Add

```json
{
  "dependencies": {
    "react-router-dom": "^7.x",
    "firebase": "^11.x",
    "@dnd-kit/core": "^6.x",
    "@dnd-kit/sortable": "^8.x",
    "react-dropzone": "^14.x",
    "qrcode.react": "^4.x",
    "wavesurfer.js": "^7.x"
  }
}
```

---

## Key Decisions Needed

| # | Decision | Options | Impact |
|---|----------|---------|--------|
| 1 | **Firestore schema** — how to structure guide/entity/asset docs | Flat vs nested collections | Affects queries, security rules, and wizard state shape |
| 2 | **File delivery to Flowise** — how uploaded PDFs/images reach the LLM | (a) Upload to GCS, pass signed URL in `question` (b) Base64 in overrideConfig (c) Flowise file upload API | Determines upload UX and Flowise pipeline changes |
| 3 | **Edited metadata passback** — how user-edited data flows back through Flowise gates | (a) JSON in `feedback` field of human input (b) Write to Firestore, Flowise reads from there (c) Override next node's input | Determines gate UX and Flowise loop behavior |
| 4 | **Slideshow builder approach** — timeline editor library | (a) Custom canvas/SVG (b) Existing react timeline library (c) Simple grid without timeline | Scope of Phase 1 publishing step |
| 5 | **Audio file storage** — where TTS audio files are stored | (a) Flowise container local (b) Firebase Storage (c) GCS bucket | Affects audio player, download, and CDN publish |
| 6 | **Shortlink service** — provider for `laxy.click` short URLs | (a) Custom Cloud Function (b) Bitly API (c) Firebase Hosting rewrites | Cost and branding |

---

## Summary Scorecard

| Wizard Area | Features in Spec | Done | Partial | Missing | Phase 2+ |
|-------------|:---:|:---:|:---:|:---:|:---:|
| Pre-Wizard Setup | 5 | 1 | 0 | 4 | 0 |
| Step 1: Ingestion | 6 | 0 | 2 | 4 | 0 |
| Step 2: Deep Research | — | — | — | — | All Phase 2 |
| Step 3: Script Generation | 5 | 0 | 1 | 3 | 1 |
| Step 4: Translation | 3 | 0 | 1 | 1 | 1 |
| Step 5: Audio Production | 11 | 0 | 1 | 8 | 2 |
| Step 6: Publishing | 7 | 0 | 0 | 6 | 1 |
| Cross-Cutting (wizard nav, save, auth) | 4+ | 0 | 1 | 3+ | 0 |
| **Totals** | **~41** | **1** | **6** | **~29** | **~5** |

> **Bottom line**: PW-1 (Entity Configuration) is complete. The current app now has a Wizard/Pipeline toggle in the header. The wizard shell with horizontal stepper and EntityConfigForm are live. The remaining 29 missing items need purpose-built review/editing components. The 6 "partial" items are the Flowise integration + basic approve/reject, which are a solid foundation to build on.
