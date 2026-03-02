# Laxy Studio — Guide Wizard Frontend: Audit Report

> Audited: 2026-03-01
> Based on: `GUIDE_WIZARD_FRONTEND_PLAN_ORIGINAL.md` (2026-02-28)
> Method: Full source code review of all files in `laxy-studio/src/`

---

## Executive Summary

All 40+ UI components listed in the plan **exist as real `.tsx` files** with substantial code. The Zustand stores, type system (586 lines, 40+ types), hooks, and wizard shell are fully built. The plan's ✅ Done markers are **accurate for the UI layer**.

However, the app is a **local-only demo** — there is no Firebase backend, no routing, and all ADK pipeline steps silently fall back to hardcoded sample data. The "✅ Done" status is **misleading for actual end-to-end functionality**.

---

## Gap 1: No Real Backend Integration

Affects almost every feature. None of the planned backend services exist.

| Area | What's Missing |
|------|---------------|
| **Firebase SDK** | Not installed. No `firebase` in `package.json`. No `firebase.ts` config file. |
| **Firebase Auth** | Not implemented. No `authStore.ts`, no login page, no route guards. (AA-1 through AA-6 all missing) |
| **Firebase Storage** | `AssetUploader.tsx` uses `simulateUpload()` — a fake timer that increments progress. No real file upload. Comment: *"replace with real Firebase upload"* |
| **Firestore** | No Firestore reads/writes anywhere. Wizard state persists only to `localStorage` via Zustand `persist`. |
| **react-router-dom** | Not installed. No routing — the app is a single page with a manual "wizard/pipeline" toggle. No `/login`, `/dashboard`, `/guides/:id` routes. |

---

## Gap 2: Pipeline Fallbacks Are the Default Path

Every step that calls the ADK pipeline **falls back to hardcoded sample data** when the pipeline backend is unavailable (which is always in standalone mode):

| Component | Fallback Behavior |
|-----------|-------------------|
| `IngestionStep.tsx` | `createSampleSpots()` — 3 hardcoded Japanese artworks (Great Wave, Wind God, Pine Trees) |
| `ScriptReviewStep.tsx` | `createSampleScripts()` — pre-written script text + `createRoundRobinImageMappings()` |
| `TranslationReviewStep.tsx` | `createStubTranslations()` — just prefixes `[JA]`, `[FR]`, etc. to identical English text |
| `AudioProductionStep.tsx` | `createSampleAudioFiles()` — empty `audioUrl`, random duration; `createSampleSrtFiles()` — sentence-split placeholder SRT |

Human gate approvals in all steps are **local-only** — they update Zustand state but the `sendHumanInput()` call to the ADK pipeline only fires if a real pipeline session exists.

---

## Gap 3: Features Claimed ✅ That Are Actually Stubs/Mocks

| # | Feature (Plan says ✅ Done) | Actual State | File |
|---|---------------------------|--------------|------|
| PW-3 | Asset Upload to Firebase Storage | **Fake** — `simulateUpload()` with timer | `AssetUploader.tsx` |
| PW-4 | Asset Library storage usage | **Fake** — hardcoded 500 MB quota | `AssetLibrary.tsx` |
| PW-1 | Entity Config — media upload | **Partial** — says "paste URL for now", no file picker for map/cover images | `EntityConfigForm.tsx` |
| PW-1 | Entity Config — GPS map picker | **Partial** — plain lat/lng text fields, comment: "map picker in future update" | `EntityConfigForm.tsx` |
| S1-2 | Trigger OCR + Metadata Extraction | **Stub** — falls back to 3 hardcoded spots | `IngestionStep.tsx` |
| S3-1 | AI Script Generation display | **Stub** — falls back to sample scripts | `ScriptReviewStep.tsx` |
| S4-1 | Translation display | **Stub** — falls back to `[LANG]` prefix copies | `TranslationReviewStep.tsx` |
| S5-2 | Voice preview playback | **Disabled** — play button says "coming soon" | `VoicePicker.tsx` |
| S5-4 | Audio Generation | **Stub** — simulates progress, produces empty audio URLs | `AudioGenerationPanel.tsx` |
| S5-5 | Audio Playback & QA | **Stub** — shows "Placeholder audio (Phase 1A)" chip when `audioUrl` is empty (always) | `AudioPlayer.tsx` |
| S5-9 | SRT Generation | **Stub** — sentence-split from scripts, not real timing | `SRTViewer.tsx` |
| S6-2 | CMS Publishing | **Mock** — generates fake URLs, no Firebase CDN deployment | `PublishStep.tsx` |
| S6-3 | Guide Preview | **Mock** — CSS-drawn mock, not real Player iframe. Says *"Mock preview — actual Player app preview will be available after Firebase integration"* | `GuidePreview.tsx` |
| S6-5 | QR Code Generation | **Fake** — draws random pattern on canvas. Comment: *"use `qrcode.react` in production"* | `QRCodeCard.tsx` |
| S6-6 | Short URL Generation | **Mock** — generates fake `laxy.click/{slug}` URLs, no shortlink service | `QRCodeCard.tsx` |

---

## Gap 4: ~~Missing npm Dependencies~~ ✅ DONE (2026-03-01)

All previously missing dependencies have been installed.

| Dependency | Plan Says | Actually Installed? |
|------------|-----------|:-------------------:|
| `react-router-dom` | Phase A foundation | ✅ Yes (^7.13.1) |
| `firebase` | Phase A foundation | ✅ Yes (^12.10.0) |
| `react-dropzone` | Asset upload | ✅ Yes (^15.0.0) |
| `qrcode.react` | QR code generation | ✅ Yes (^4.2.0) |
| `wavesurfer.js` | Audio waveform | ✅ Yes (^7.12.1) |
| `@dnd-kit/core` | Drag-and-drop | ✅ Yes |
| `@dnd-kit/sortable` | Drag-and-drop | ✅ Yes |

---

## Gap 5: Missing Files from Planned Architecture ✅ DONE

All 13 files from the plan's "Proposed File Structure" have been created and pass TypeScript compilation:

| Planned File | Purpose | Status |
|-------------|---------|:------:|
| `src/firebase.ts` | Firebase init (Auth, Firestore, Storage) with emulator support | ✅ |
| `src/authStore.ts` | Zustand store for Firebase Auth (sign-in, sign-up, reset, listener) | ✅ |
| `src/pages/LoginPage.tsx` | Login / Register / Password-reset screen | ✅ |
| `src/pages/DashboardPage.tsx` | Guide list with New / Duplicate / Delete actions | ✅ |
| `src/pages/GuidePage.tsx` | Wizard host page with auto-save | ✅ |
| `src/pages/PipelineDebugPage.tsx` | Raw pipeline view extracted as a standalone route | ✅ |
| `src/hooks/useFirestore.ts` | Generic Firestore CRUD hook (list, get, create, update, delete, real-time) | ✅ |
| `src/hooks/useUpload.ts` | Firebase Storage upload with progress tracking & cancel | ✅ |
| `src/hooks/useAudioPlayer.ts` | HTML5 audio playback controls (play, pause, seek, skip, rate) | ✅ |
| `src/types/guide.ts` | Guide list/summary types + re-exports from entity.ts | ✅ |
| `src/types/asset.ts` | Asset record / storage types + re-exports from entity.ts | ✅ |
| `src/types/character.ts` | Character / voice / TTS types + re-exports from entity.ts | ✅ |
| `src/types/script.ts` | Script / translation / version types + re-exports from entity.ts | ✅ |

Note: The type files re-export core types from `types/entity.ts` and add domain-specific types for Firestore persistence, API requests/responses, and versioning.

---

## What IS Genuinely Implemented

These work as real, functional UI with local state:

| Area | What Works |
|------|-----------|
| **Type system** | 586 lines, 40+ types/interfaces in `entity.ts` |
| **Zustand stores** | `guidesStore.ts` (829 lines) with persist middleware, dirty tracking, full CRUD for all wizard entities |
| **Wizard Shell** | 9-step horizontal stepper with completion tracking, click-to-navigate, responsive layout |
| **Entity Config** | 7 accordion sections, all fields editable, validation |
| **Layout Picker** | 4 templates with CSS phone-frame previews, preview dialog |
| **Asset Upload UX** | 3 input modes (drag-drop, URL, text), file list with thumbnails, status chips |
| **Asset Library UX** | Search, filter, sort, grid/list toggle, preview dialog, delete/replace |
| **Module Select** | 3 module cards with phase badges and lock states |
| **Content Selector** | Multi-select asset list with core language badge |
| **Metadata Editor** | DnD-sortable table with inline editing, expand/collapse, add/remove |
| **Image-Spot Mapper** | AI-suggested badge, manual override dialog, per-spot image management |
| **Script Review** | Per-spot cards, editable text, approve/reject/fastTrack, bulk actions |
| **Translation Review** | Language tabs, side-by-side original/translated, per-language approve, bulk actions |
| **Audio Production** | Full sub-step flow: character → voice → director note → generate → review |
| **Character Picker** | 5 preset personas with avatar, role, personality, AI-recommended badge |
| **Voice Picker** | 8 voices, gender filter, AI suggestion badge |
| **Director Note Editor** | 3 editable fields with AI-populated helper text |
| **Audio Generation Panel** | Language chips, token estimate, progress bar |
| **Audio Player** | HTML5 controls, ±15s skip, progress slider, language tabs, download |
| **Pronunciation Marker** | Timestamp capture, comment form, sortable marker list |
| **Generation History** | Expandable run list with full metadata |
| **SRT Viewer** | Language tabs, entries table, .srt download |
| **Slideshow Builder** | Per-spot image timeline, duration sliders, add from library |
| **Publish Checklist** | 6 readiness items with "Fix" buttons linking to wizard steps |
| **Final Approval** | Summary stats, spot table, publish button with loading state |
| **QR Code Card** | Custom slug input, copy-to-clipboard, download PNG |
| **Auto-save** | `useAutosave` hook with debounce, toggle, timestamp indicator |
| **Pipeline Sync** | `usePipelineSync` hook with `applyResponse`, `buildGatePayload`, sync status |
| **Pipeline Debug** | Vertical stepper, gate panel, node output viewer, history drawer |

---

## Corrected Scorecard

The original plan's scorecard (at bottom of the document) is **outdated** — it was written before the UI components were built. Here is the corrected assessment:

| Wizard Area | Features | UI Built | Fully Working E2E | Stubs/Mocks | Phase 2+ |
|-------------|:---:|:---:|:---:|:---:|:---:|
| Pre-Wizard Setup | 5 | 5 | 2 (EntityConfig, Layout) | 3 (upload, library quota, media/GPS) | 0 |
| Step 1: Ingestion | 6 | 6 | 4 (UI + local state) | 2 (ADK OCR, real metadata) | 0 |
| Step 3: Script Generation | 4 | 4 | 3 (UI + local state) | 1 (ADK script gen) | 1 |
| Step 4: Translation | 2 | 2 | 1 (UI + local state) | 1 (ADK translation) | 1 |
| Step 5: Audio Production | 9 | 9 | 6 (UI + local state) | 3 (real audio, voice preview, SRT timing) | 2 |
| Step 6: Publishing | 6 | 6 | 2 (slideshow, checklist) | 4 (QR, preview, publish, shortlink) | 1 |
| Cross-Cutting | 4 | 4 | 3 (shell, save, autosave) | 1 (Firestore sync — localStorage only) | 0 |
| Auth & Routing | 8 | 0 | 0 | 0 (not started) | 0 |
| **Totals** | **44** | **36** | **21** | **15** | **5** |

### Bottom Line

- **36 of 44 features have UI components built** (the plan's ✅ marks are correct at UI level)
- **Only ~21 are fully functional** (working with local state, no backend needed)
- **15 are stubs/mocks** needing Firebase, ADK pipeline, or real service integration
- **8 auth/routing features** haven't been started at all
- **5 features** are explicitly Phase 2+

### Remaining Work to Production-Ready

1. **Firebase integration** — Auth, Firestore, Storage (~5-7 days)
2. **Routing** — react-router-dom with pages (~1-2 days)
3. **Real ADK pipeline integration testing** — replace all fallbacks with error handling (~3-4 days)
4. **QR code library** — swap canvas placeholder for `qrcode.react` (~0.5 day)
5. **Voice preview audio** — provide sample .mp3 files (~1 day)
6. **Guide Preview** — integrate real Player app iframe (~1-2 days)
7. **Shortlink service** — implement or integrate (~1-2 days)
8. **Auth pages** — Login, Register, Password Reset (~3-4 days)

**Estimated remaining effort: ~16-22 days**
