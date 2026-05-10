# Observability Runbook (Step 9)

## Scope
This runbook defines the minimum telemetry, dashboards, and alerts for the ADK pipeline runtime.

## Emitted telemetry events

### Backend HTTP events (`functions/main.py`)
- `http.request.start`
  - fields: `endpoint`, `method`, `path`, `request_id`, `correlation_id`, `tenant_id?`, `actor_id?`
- `http.request.finish`
  - fields: all start fields + `session_id?`, `checkpoint_id?`, `publish_id?`, `target_language?`, `http_status`, `duration_ms`, `success`, `error_code?`

### Pipeline execution events (`functions/agents/pipeline_agent.py`)
- `pipeline.step.start`
  - fields: `session_id`, `run_id`, `step_id`, `attempt`, `status=RUNNING`, `timeout_seconds`, `correlation_id?`, `tenant_id?`, `actor_id?`
- `pipeline.step.finish`
  - fields: `session_id`, `run_id`, `step_id`, `attempt`, `status`, `duration_ms`, `retries`, `llm_attempts`, `timeout_seconds`, `error_code?`, `correlation_id?`, `tenant_id?`, `actor_id?`
- `pipeline.failure_hotspot`
  - fields: `session_id`, `run_id`, `step_id`, `failure_count`, `threshold`, `error_code`, `correlation_id?`, `tenant_id?`, `actor_id?`

### Frontend API + wizard events (`laxy-studio/src/api.ts`, `WizardShell.tsx`)
- API events logged via `console.info/error` with shared `traceSessionId`:
  - `http.request.start`
  - `http.request.finish`
  - `http.request.error`
- Wizard events:
  - `wizard.session.start`
  - `wizard.step.view`

## Minimum dashboard set

### Dashboard 1: API health
- Request rate by endpoint (`http.request.finish` count)
- Error rate by endpoint (`success=false` percentage)
- p50/p95 duration by endpoint (`duration_ms`)
- 5xx count by endpoint (`http_status >= 500`)

### Dashboard 2: Pipeline step reliability
- Step execution count (`pipeline.step.finish`)
- Step error count by `step_id` + `error_code`
- p50/p95 step duration by `step_id`
- Retry pressure by `step_id` (sum of `retries`)

### Dashboard 3: Hotspots and tenancy slices
- `pipeline.failure_hotspot` count by `step_id`
- Error count grouped by `tenant_id` (when present)
- Error count grouped by `actor_id` (when present)
- Correlation drill-down: `correlation_id` view across API + step events

## Minimum alert set

1. **API 5xx surge**
   - Condition: `http.request.finish` with `http_status >= 500` > 5/min for 5 consecutive minutes (per endpoint)
   - Severity: High

2. **Step timeout spike**
   - Condition: `pipeline.step.finish` with `error_code=STEP_TIMEOUT` > 3 in 10 minutes (per step)
   - Severity: High

3. **Failure hotspot raised**
   - Condition: any `pipeline.failure_hotspot` event
   - Severity: Medium (High for `s2_ocr_parse`, `s4_script_gen`, `s9_audio_gen`)

4. **Retry pressure anomaly**
   - Condition: average `retries` per `pipeline.step.finish` > 1.5 for 15 minutes (per step)
   - Severity: Medium

## Operational notes
- Tune hotspot threshold with `PIPELINE_FAILURE_HOTSPOT_THRESHOLD` (default: `3`).
- Correlation IDs are returned in response headers (`X-Correlation-Id`) and should be used for incident triage.
- Tenant/actor fields are best-effort and only present when claims/context are available.
