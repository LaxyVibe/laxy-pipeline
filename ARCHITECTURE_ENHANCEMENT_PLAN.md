# Laxy Platform Architecture Enhancement Plan

Date: 2026-03-18  
Scope: Full platform (`laxy-studio` frontend + `functions` backend + admin)  
Horizon: Strategic (quarter+)  
Primary Priority: Reliability and correctness

---

## 1) Goals

- Stabilize frontend-backend contracts to prevent workflow breakage.
- Increase pipeline execution reliability across retries, resumes, and long-running steps.
- Reduce architecture coupling by separating UI rendering from orchestration logic.
- Enforce tenant-safe security boundaries for Firestore/Storage/admin access.
- Improve observability and test coverage for production confidence.

### Reliability-focused library baseline (agreed)
- Keep existing stack and avoid framework rewrites.
- Frontend: add `zod` for runtime API contract validation.
- Backend: add `pydantic` for strict request/response schema validation.
- Introduce broader libraries incrementally in later steps (`openapi-typescript`, `@tanstack/react-query`, `@firebase/rules-unit-testing`, `msw`, `playwright`, structured logging).

---

## 2) Current Architecture Snapshot

### Product behavior
- Wizard-driven creation flow: entity setup → layout → assets → modules → ingestion → script → translation → audio → publish.
- Admin app is mounted at `/admin` using FireCMS.
- Pipeline debug view exists for session inspection.

### Core architecture patterns
- Frontend state is heavily centralized in a large persisted Zustand store (`guidesStore.ts`).
- Wizard stage components contain both UI and orchestration/API logic.
- Backend pipeline executor orchestrates ordered steps + human gates with Firestore persistence.
- API integration depends on step display labels in several places.

### Key risk themes
- Contract fragility (label-based matching, loose runtime validation).
- Orchestration logic duplication across UI components.
- Route/app-shell inconsistencies and some orphaned modules/hooks.
- Security hardening gaps (notably permissive storage rules, path/policy alignment).

---

## 3) Execution Roadmap (Start Here, One by One)

## Step 1 — Versioned API contract + canonical step identity
**Status:** Completed  
**Objective:** Remove label-based fragility by using stable `stepId` contract everywhere.

**Progress update (2026-03-18)**
- ✅ Frontend contract schema + parser added (`zod`) with `apiVersion` defaulting.
- ✅ Backend contract schema + request validation added (`pydantic`) for start/resume/status.
- ✅ Backend response now includes `apiVersion` and is validated before returning.
- ✅ Wizard sync path now applies step data by strict `stepId`.
- ✅ Ingestion/Script/Publish key parsing paths migrated to `stepId`-first helpers.
- ✅ Pipeline debug/store stage resolution migrated to `stepId`-first matching.
- ✅ `guidesStore` pipeline step application switched to stepId-only handlers.
- ✅ Contract tests expanded to cover canonical step IDs plus explicit label-only helper behavior.

**Work items**
1. Define and document contract schema (`PipelineResponse`, gate payloads, error envelope) with explicit version field.
2. Standardize frontend parsing on `stepId` (retain temporary backward compatibility for labels).
3. Ensure backend response always includes stable IDs and compatible labels.
4. Add contract tests for both frontend and backend.

**Primary targets**
- `laxy-studio/src/api.ts`
- `laxy-studio/src/store.ts`
- `functions/main.py`
- `functions/agents/pipeline_agent.py`

**Risk level:** Medium  
**Expected payoff:** High (core reliability across releases)

---

## Step 2 — Runtime validation + unified error envelope
**Status:** Completed  
**Objective:** Fail safely and predictably on malformed payloads/responses.

**Progress update (2026-03-18)**
- ✅ Backend endpoints now return a unified error envelope: `error.code`, `error.message`, `error.details`, `error.retryable`.
- ✅ Frontend API layer now normalizes error payloads into `ApiRequestError` across all endpoints.
- ✅ Frontend pipeline APIs now map malformed success payloads to explicit `INVALID_RESPONSE_SCHEMA` errors.
- ✅ Added focused tests for structured error envelope parsing and fallback behavior.
- ✅ Audio and translation success payloads now use runtime schema validation before returning typed data.
- ✅ Backend audio/translation endpoints now validate request bodies with strict `pydantic` models.
- ✅ Backend contract tests expanded to cover new request model defaults and required-field validation.

**Work items**
1. Add runtime request validation in backend handlers.
2. Add runtime response validation in frontend API layer before store mutation.
3. Define consistent error envelope (`code`, `message`, `details`, `retryable`).
4. Normalize all endpoint error paths.

**Primary targets**
- `functions/main.py`
- `laxy-studio/src/api.ts`
- `laxy-studio/src/components/wizard/*Step.tsx`

**Risk level:** Low-Medium  
**Expected payoff:** High

---

## Step 3 — Move workflow orchestration out of UI components
**Status:** Completed  
**Objective:** Separate presentation from domain workflow logic.

**Progress update (2026-03-18)**
- ✅ Added dedicated workflow service modules for ingestion and script stages (`src/workflows/ingestionWorkflow.ts`, `src/workflows/scriptWorkflow.ts`).
- ✅ Moved question building, response parsing, and gate payload shaping logic out of `IngestionStep.tsx` and `ScriptReviewStep.tsx`.
- ✅ Kept UI behavior unchanged while reducing component orchestration complexity.
- ✅ Added focused unit tests for new workflow helpers and verified existing API/contract tests remain green.
- ✅ Added workflow services for translation and audio stages (`src/workflows/translationWorkflow.ts`, `src/workflows/audioWorkflow.ts`).
- ✅ Moved translation/audio parallel generation orchestration and gate payload shaping out of `TranslationReviewStep.tsx` and `AudioProductionStep.tsx`.
- ✅ Expanded workflow test coverage across ingestion/script/translation/audio helpers with all focused frontend tests passing.
- ✅ Added publish workflow service (`src/workflows/publishWorkflow.ts`) for slideshow initialization, readiness checks, prompt assembly, publish result parsing, and slug/session derivation.
- ✅ Refactored `PublishStep.tsx` to consume workflow helpers and keep publish UI focused on rendering + interaction.
- ✅ Added publish workflow unit tests; focused frontend suite now passes with workflow + API/contract coverage.

**Work items**
1. Extract per-stage workflow services (`ingestionWorkflow`, `scriptWorkflow`, etc.).
2. Keep UI components focused on rendering + user interaction.
3. Move response parsing/mapping into shared domain mappers.
4. Reduce duplicated gate approval logic.

**Primary targets**
- `laxy-studio/src/components/wizard/IngestionStep.tsx`
- `laxy-studio/src/components/wizard/ScriptReviewStep.tsx`
- `laxy-studio/src/components/wizard/TranslationReviewStep.tsx`
- `laxy-studio/src/components/wizard/AudioProductionStep.tsx`
- `laxy-studio/src/components/wizard/PublishStep.tsx`

**Risk level:** Medium  
**Expected payoff:** High

---

## Step 4 — Split monolithic store into domain slices
**Status:** Completed  
**Objective:** Improve maintainability and reduce side-effect coupling.

**Progress update (2026-03-18)**
- ✅ Extracted domain initial state blocks into dedicated modules (`src/store/guides/initialState.ts`).
- ✅ Extracted pipeline response reconciliation into a dedicated module (`src/store/guides/pipelineSync.ts`).
- ✅ Extracted core domain actions (entity/assets/ingestion/script/translation/audio/publish) into `src/store/guides/domainActions.ts`.
- ✅ Extracted cross-cutting meta actions (navigation, completion/access checks, save/resume, cascading resets) into `src/store/guides/metaActions.ts`.
- ✅ `guidesStore` now composes extracted modules while preserving existing `useGuidesStore` selectors/actions API.
- ✅ Persist middleware now excludes transient runtime fields (pipeline session/checkpoint, sync runtime, ephemeral error messages) so stored drafts remain stable.
- ✅ Added explicit store ownership contract module (`src/store/storeOwnership.ts`) defining `useGuidesStore` (wizard-authoring) vs `usePipelineStore` (debug-runtime) boundaries.
- ✅ Focused frontend regression suite remains green after store decomposition changes.

**Work items**
1. Split `guidesStore` into logical slices (entity/assets/ingestion/script/translation/audio/publish).
2. Separate persisted draft state from transient execution state.
3. Clarify ownership between wizard store and pipeline debug store.
4. Keep selectors stable to avoid unnecessary rerenders.

**Primary targets**
- `laxy-studio/src/guidesStore.ts`
- `laxy-studio/src/store.ts`
- `laxy-studio/src/pages/PipelineDebugPage.tsx`

**Risk level:** Medium  
**Expected payoff:** High

---

## Step 5 — Unify routing and app shell boundaries
**Status:** Completed  
**Objective:** Remove route drift and make product flows explicit.

**Progress update (2026-03-18)**
- ✅ Added canonical route helper module (`src/routes.ts`) with `ROUTES` constants and `guidePath(...)` path builder.
- ✅ Refactored app shell routing in `src/App.tsx` to include explicit login, protected layout, dashboard, guide, debug routes, and root redirect behavior.
- ✅ Added legacy wizard route redirects so old `/wizard/*` paths forward to canonical guide URLs.
- ✅ Updated dashboard navigation to use canonical helper paths instead of hardcoded strings.
- ✅ Updated guide page route handling to support `:id/:step` and normalize invalid/missing steps.
- ✅ Updated wizard URL synchronization (`WizardShell`) to navigate using canonical guide routes.
- ✅ Aligned admin bootstrap/base paths to canonical route constants (`/admin`, `/admin/c`) via shared `ROUTES` usage.
- ✅ Post-change validation passed (`npm test`: 86/86, `npm run build`: success).

**Work items**
1. Define canonical route map for dashboard, guide wizard, login, debug, admin.
2. Align navigation paths with registered routes.
3. Integrate auth gating where required.
4. Remove or wire currently orphaned pages/hooks.

**Primary targets**
- `laxy-studio/src/main.tsx`
- `laxy-studio/src/App.tsx`
- `laxy-studio/src/pages/DashboardPage.tsx`
- `laxy-studio/src/pages/GuidePage.tsx`
- `laxy-studio/src/pages/LoginPage.tsx`

**Risk level:** Medium  
**Expected payoff:** Medium-High

---

## Step 6 — Redesign publish workflow as dedicated backend capability
**Status:** Completed  
**Objective:** Make publish deterministic and contract-driven.

**Progress update (2026-03-19)**
- ✅ Added dedicated backend publish endpoint `POST /pipeline/publish` with strict request validation (`PublishGuideRequest`) and unified error envelope behavior.
- ✅ Added explicit publish response contract (`PublishGuideResponse`) with deterministic outputs: `publishId`, `status`, `guideUrl`, `shortUrl`, `slug`, `qrDataUrl`, `publishedAt`, `retryable`.
- ✅ Frontend API now calls dedicated `publishGuide(...)` with runtime schema validation, replacing generic `startPipeline(...)` publish parsing.
- ✅ `PublishStep.tsx` now consumes backend publish contract directly for URLs/slug/QR and no longer parses ad-hoc pipeline publish outputs.
- ✅ Hosting rewrites updated for `/pipeline/publish` and contract tests expanded on both frontend and backend.
- ✅ Added persistent Firestore-backed publish job state (`publish_jobs`) with lifecycle metadata (`status`, `attempts`, `max_attempts`, timestamps, retryability).
- ✅ Added dedicated publish polling endpoint `GET /pipeline/publish-status` and hosting rewrite, with deterministic `processing -> published` lifecycle transition.
- ✅ Added retry semantics on publish API (`retry` + `publishId`) with max-attempt enforcement and typed attempt counters in contract response.
- ✅ Frontend publish UX now persists `publishJobId`, polls publish status until terminal state, and routes retry actions through the retry-aware publish contract.
- ✅ QR card now prioritizes backend-provided `qrDataUrl` (with safe fallback generation for legacy/local cases).
- ✅ Validation green: frontend (`npm test -- src/contracts/pipeline.test.ts src/api.test.ts`, `npm run build`) and backend (`python -m pytest tests/test_contracts.py`).

**Work items**
1. Introduce dedicated publish endpoint/job contract.
2. Replace ad-hoc publish parsing from generic pipeline start path.
3. Move QR/shortlink generation to backend output contract.
4. Add publish status lifecycle with recoverable retries.

**Primary targets**
- `laxy-studio/src/components/wizard/PublishStep.tsx`
- `functions/main.py`
- `functions/agents/pipeline_agent.py`

**Risk level:** Medium-High  
**Expected payoff:** High

---

## Step 7 — Backend execution reliability and idempotency hardening
**Status:** Completed  
**Objective:** Ensure safe retries and consistent session progression.

**Progress update (2026-03-19)**
- ✅ Added optional `idempotencyKey` to start/resume request contracts and handler wiring.
- ✅ Added persistent idempotency request records for start/resume with replay, in-progress, and conflict protection.
- ✅ Hardened start behavior to reject duplicate non-idempotent session creation.
- ✅ Added step attempt tracking (`step_attempts`) and run metadata on appended steps (`run_id`, `attempt`, timestamps).
- ✅ Added compatibility fallback so attempt counting derives from historical `steps` when legacy sessions lack `step_attempts`.
- ✅ Added per-step execution timeout controls with configurable policy boundaries and explicit timeout error codes.
- ✅ Added cancellation-safe error persistence so interrupted runs leave consistent session/idempotency state.
- ✅ Added structured retry observability logs (attempt/backoff/elapsed with session/run/step context).
- ✅ Expanded backend tests for idempotent replay and retry behavior; backend contract + pipeline suite now passes.

**Work items**
1. Add idempotency keys for start/resume actions.
2. Harden step append semantics and attempt tracking.
3. Improve timeout/cancellation behavior for long-running calls.
4. Add explicit retry policy boundaries and observability around retries.

**Primary targets**
- `functions/main.py`
- `functions/agents/session.py`
- `functions/agents/pipeline_agent.py`

**Risk level:** High  
**Expected payoff:** High

---

## Step 8 — Security and tenancy enforcement end-to-end
**Status:** Completed  
**Objective:** Enforce least-privilege data and storage access.

**Progress update (2026-03-19)**
- ✅ Firestore rules now enforce role + tenant scoped access for admin collections and align platform collection paths with valid scoped schema (`_platform/system/*`).
- ✅ Added tenant-scoped read/write controls for `tenants/{tenantId}` and nested `tenants/{tenantId}/users/{userId}`.
- ✅ Tightened Storage rules from public read/write to authenticated path-scoped access with admin-only write paths for admin assets.
- ✅ Admin authenticator now requires recognised role claims, enforces tenant claim for tenant-scoped roles, and maps claims to FireCMS roles.
- ✅ Permissions resolver no longer grants implicit dev super-admin fallback when roles are missing.
- ✅ Frontend validation passed after changes (`npm run build`).
- ✅ Added emulator-backed security rules tests for Firestore + Storage tenant/role scenarios (`npm run test:rules`).
- ✅ Aligned FireCMS admin collection paths to `_platform/system/*` to match security rules and valid Firestore collection hierarchy.

**Work items**
1. Tighten Storage rules (remove public write/read defaults).
2. Align Firestore collection paths between admin schema and security rules.
3. Enforce tenant scoping in all non-super-admin data access.
4. Ensure admin authenticator + permissions are correctly applied.

**Primary targets**
- `firestore.rules`
- `storage.rules`
- `laxy-studio/src/admin/auth/authenticator.ts`
- `laxy-studio/src/admin/auth/permissions.ts`
- `laxy-studio/src/admin/collections/*.ts`

**Risk level:** High  
**Expected payoff:** Very High

---

## Step 9 — Observability and traceability standards
**Status:** Completed  
**Objective:** Enable fast diagnosis and operational confidence.

**Progress update (2026-03-19)**
- ✅ Added request-scoped correlation/request/session telemetry in backend HTTP handlers with response headers (`X-Correlation-Id`, `X-Request-Id`).
- ✅ Added structured frontend API request telemetry with shared trace-session IDs and propagated correlation headers.
- ✅ Added structured step-level telemetry in pipeline execution loop (`pipeline.step.start`, `pipeline.step.finish`) including duration, status, retries, and timeout policy dimensions.
- ✅ Added tenant/actor/correlation propagation through runtime context where available and included these dimensions in retry and step telemetry.
- ✅ Added failure-hotspot emission (`pipeline.failure_hotspot`) with configurable threshold (`PIPELINE_FAILURE_HOTSPOT_THRESHOLD`).
- ✅ Added operational runbook for minimal dashboards + alerts tied to emitted telemetry events.

**Work items**
1. Add correlation/request/session IDs across frontend-backend logs.
2. Emit structured step-level telemetry (start, stop, duration, status, retries).
3. Log tenant and actor dimensions where applicable.
4. Define minimal dashboards/alerts for failure hotspots.

**Primary targets**
- `functions/main.py`
- `functions/agents/pipeline_agent.py`
- `laxy-studio/src/components/wizard/WizardShell.tsx`

**Risk level:** Medium  
**Expected payoff:** High

---

## Step 10 — Test strategy expansion around contracts, workflows, and security
**Status:** Completed  
**Objective:** Detect regressions before release.

**Progress update (2026-03-19)**
- ✅ `laxy-studio/src/api.test.ts` now exercises real exported API helper functions (`getExecuted*`, `getNodeOutput*`, status helpers) instead of duplicated local implementations.
- ✅ Added backend human-gate end-to-end coverage in `functions/tests/test_pipeline.py` for approve, reject, and idempotent retry flows across all gates (`hg1`, `hg3`, `hg4`, `hg5`).
- ✅ Security-rules test path validated for both local default runs (graceful emulator-aware skip) and emulator-backed execution (`npm run test:rules`) covering Firestore + Storage role/tenant scenarios.
- ✅ Added CI quality gates via `.github/workflows/ci.yml` for backend reliability tests, frontend tests/build, and emulator-backed security rules tests.
- ✅ Validation green after Step 10 changes:
	- Backend: `pytest tests/test_pipeline.py tests/test_steps.py tests/test_tools.py tests/test_contracts.py` (146 passed)
	- Frontend: `npm test` (91 passed, 7 skipped), `npm run build` (success)
	- Security: `npm run test:rules` (7 passed)

**Work items**
1. Add API contract tests that use real exported helpers (avoid duplicated test-only helper logic).
2. Add end-to-end workflow tests across all human gates (approve/reject/retry).
3. Add security-rule tests (Firestore + Storage) for role and tenant scenarios.
4. Add CI quality gates for reliability-sensitive paths.

**Primary targets**
- `laxy-studio/src/api.test.ts`
- `functions/tests/test_pipeline.py`
- `functions/tests/test_steps.py`
- `functions/tests/test_tools.py`
- `laxy-studio/src/security/rules.test.ts`
- `.github/workflows/ci.yml`

**Risk level:** Low-Medium  
**Expected payoff:** High

---

## 4) Suggested Sequence and Milestones

### Milestone A (Foundation)
- Step 1 + Step 2

### Milestone B (Frontend architecture)
- Step 3 + Step 4 + Step 5

### Milestone C (Backend reliability + publish)
- Step 6 + Step 7

### Milestone D (Security + operations)
- Step 8 + Step 9 + Step 10

---

## 5) Definition of Done (Per Step)

A step is done only when:
1. Code changes are merged for all declared targets.
2. Related tests pass locally and in CI.
3. Backward-compatibility/migration notes are documented.
4. Operational rollout risk is assessed (and mitigations documented).

---

## 6) Current Posture (All Steps Complete)

- ✅ Steps 1 through 10 are completed and validated as of 2026-03-19.
- ✅ Frontend, backend, and emulator-backed security test gates are in place and passing.
- ✅ The architecture enhancement roadmap scope in this document is closed.

Recommended next cycle focus (outside this completed plan):
- production rollout checklist + SLO baselines,
- cost/performance optimization for high-throughput stages,
- periodic dependency/rules/CI maintenance cadence.
