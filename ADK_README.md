# Backend Reference

This file used to duplicate backend architecture, API, and deployment notes that now live in the canonical project docs.

## Use These Instead

- [README.md](/Users/sun/Documents/GitHub/laxy-pipeline/README.md)
  - Product overview, architecture snapshot, deploy commands
- [GETTING_STARTED.md](/Users/sun/Documents/GitHub/laxy-pipeline/GETTING_STARTED.md)
  - Local setup, emulator flow, test commands
- [OBSERVABILITY_RUNBOOK.md](/Users/sun/Documents/GitHub/laxy-pipeline/OBSERVABILITY_RUNBOOK.md)
  - Telemetry and alerts

## Backend Code Map

- [functions/main.py](/Users/sun/Documents/GitHub/laxy-pipeline/functions/main.py)
  - Firebase HTTP entrypoints
- [functions/agents/pipeline_agent.py](/Users/sun/Documents/GitHub/laxy-pipeline/functions/agents/pipeline_agent.py)
  - Pipeline orchestration and standalone audio helpers
- [functions/contracts/pipeline_contract.py](/Users/sun/Documents/GitHub/laxy-pipeline/functions/contracts/pipeline_contract.py)
  - Request and response validation models
- [functions/tests](/Users/sun/Documents/GitHub/laxy-pipeline/functions/tests)
  - Backend regression coverage

This stub stays intentionally short to avoid documentation drift.
