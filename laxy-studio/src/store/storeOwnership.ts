// ---------------------------------------------------------------------------
// Store ownership boundaries
// ---------------------------------------------------------------------------
// `useGuidesStore` owns authoring/wizard draft state and is the source of truth
// for guide content that should persist between sessions.
//
// `usePipelineStore` owns pipeline-debug runtime visualization state used by
// the debug UI (stage timelines, gate status, transient request history).
// It is intentionally non-persisted and must not be used as wizard draft data.

import type { WizardStep } from '../guidesStore';

export const GUIDES_STORE_OWNERSHIP = {
  role: 'wizard-authoring',
  owns: [
    'entityConfig',
    'assets',
    'ingestion/script/translation/audio/publish wizard data',
    'persisted draft + autosave metadata',
    'pipeline sync application into wizard state',
  ],
  doesNotOwn: [
    'pipeline debug stage timeline',
    'debug request history',
    'debug-only session controls',
  ],
} as const;

export const PIPELINE_DEBUG_STORE_OWNERSHIP = {
  role: 'pipeline-debug-runtime',
  owns: [
    'stage timeline state',
    'checkpoint debug controls',
    'transient run history',
    'debug status/error for pipeline playground',
  ],
  doesNotOwn: [
    'wizard draft content',
    'autosave/persisted guide data',
    'entity/assets/scripts/translations/audio/publish content edits',
  ],
} as const;

const WIZARD_STEP_TO_DEBUG_STAGE: Record<WizardStep, string> = {
  'entity-config': 'ingest',
  layout: 'ingest',
  assets: 'ingest',
  modules: 'ingest',
  ingest: 'ingest',
  script: 'script',
  translation: 'translation',
  audio: 'audio',
  publish: 'publish',
};

export function mapWizardStepToDebugStage(step: WizardStep): string {
  return WIZARD_STEP_TO_DEBUG_STAGE[step];
}
