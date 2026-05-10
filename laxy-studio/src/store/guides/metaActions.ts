import { DEFAULT_ENTITY_CONFIG } from '../../types/entity';
import type { GuidesStore, WizardStep } from '../../guidesStore';

type GuidesStoreSetter = (
  partial:
    | Partial<GuidesStore>
    | ((state: GuidesStore) => Partial<GuidesStore>),
) => void;

type GuidesStoreGetter = () => GuidesStore;

interface WizardStepDef {
  id: WizardStep;
  label: string;
}

export function createMetaActions(
  set: GuidesStoreSetter,
  get: GuidesStoreGetter,
  wizardSteps: WizardStepDef[],
): Partial<GuidesStore> {
  return {
    resetDownstreamFrom: (step: WizardStep) => {
      const idx = wizardSteps.findIndex((wizardStep) => wizardStep.id === step);
      if (idx < 0) return;

      const resetActions: Partial<Record<WizardStep, () => void>> = {
        ingest: () =>
          set({
            spots: [],
            ingestionStatus: 'idle',
            ingestionError: null,
            selectedAssetIds: [],
          }),
        script: () =>
          set({
            scripts: [],
            imageMappings: [],
            scriptStatus: 'idle',
            scriptError: null,
          }),
        translation: () =>
          set({
            translations: [],
            translationStatus: 'idle',
            translationError: null,
          }),
        audio: () =>
          set({
            selectedCharacterId: null,
            selectedVoiceId: null,
            directorNote: { scene: '', style: '', pacing: '' },
            audioFiles: [],
            pronunciationMarkers: [],
            srtFiles: [],
            audioStatus: 'idle',
            audioError: null,
          }),
        publish: () =>
          set({
            slideshows: [],
            publishStatus: 'idle',
            publishError: null,
            customSlug: '',
            publishJobId: null,
            publishedGuide: null,
          }),
      };

      for (let i = idx; i < wizardSteps.length; i++) {
        const stepId = wizardSteps[i].id;
        resetActions[stepId]?.();
      }

      set({ pipelineSessionId: null, pipelineCheckpointId: null, isDirty: true });
    },

    clearAll: () => {
      set({
        guideId: null,
        entityConfig: { ...DEFAULT_ENTITY_CONFIG, selectedLayout: null, enabledModules: [] },
        currentStep: 'entity-config' as WizardStep,
        isDirty: false,
        assets: [],
        spots: [],
        ingestionStatus: 'idle',
        ingestionError: null,
        selectedAssetIds: [],
        pipelineSessionId: null,
        pipelineCheckpointId: null,
        scripts: [],
        imageMappings: [],
        scriptStatus: 'idle',
        scriptError: null,
        translations: [],
        translationStatus: 'idle',
        translationError: null,
        selectedCharacterId: null,
        selectedVoiceId: null,
        directorNote: { scene: '', style: '', pacing: '' },
        audioFiles: [],
        pronunciationMarkers: [],
        generationHistory: [],
        srtFiles: [],
        audioStatus: 'idle',
        audioError: null,
        slideshows: [],
        publishStatus: 'idle',
        publishError: null,
        previewDevice: 'mobile',
        customSlug: '',
        publishJobId: null,
        publishedGuide: null,
        lastSavedAt: null,
        syncStatus: 'synced' as const,
        lastPipelineResponseAt: null,
      });
    },

    goToStep: (step) => set({ currentStep: step }),

    nextStep: () => {
      const { currentStep } = get();
      const idx = wizardSteps.findIndex((wizardStep) => wizardStep.id === currentStep);
      if (idx < wizardSteps.length - 1) {
        set({ currentStep: wizardSteps[idx + 1].id });
      }
    },

    prevStep: () => {
      const { currentStep } = get();
      const idx = wizardSteps.findIndex((wizardStep) => wizardStep.id === currentStep);
      if (idx > 0) {
        set({ currentStep: wizardSteps[idx - 1].id });
      }
    },

    isEntityConfigValid: () => {
      const { entityConfig } = get();
      return (
        entityConfig.venueName.trim().length > 0
        && entityConfig.coreLanguage.length > 0
        && entityConfig.supportedLanguages.length > 0
        && entityConfig.supportedLanguages.includes(entityConfig.coreLanguage)
      );
    },

    getStepCompletionStatus: (step: WizardStep) => {
      const state = get();
      switch (step) {
        case 'entity-config':
          return state.isEntityConfigValid() ? 'completed' : 'incomplete';
        case 'layout':
          return state.entityConfig.selectedLayout ? 'completed' : 'incomplete';
        case 'assets':
          return state.assets.length > 0 ? 'completed' : 'incomplete';
        case 'modules':
          return state.entityConfig.enabledModules.length > 0 ? 'completed' : 'incomplete';
        case 'ingest':
          return state.ingestionStatus === 'approved'
            ? 'completed'
            : state.ingestionStatus === 'error'
              ? 'error'
              : 'incomplete';
        case 'script':
          return state.scriptStatus === 'approved'
            ? 'completed'
            : state.scriptStatus === 'error'
              ? 'error'
              : 'incomplete';
        case 'translation':
          return state.translationStatus === 'approved'
            ? 'completed'
            : state.translationStatus === 'error'
              ? 'error'
              : 'incomplete';
        case 'audio':
          return state.audioStatus === 'approved'
            ? 'completed'
            : state.audioStatus === 'error'
              ? 'error'
              : 'incomplete';
        case 'publish':
          return state.publishStatus === 'published'
            ? 'completed'
            : state.publishStatus === 'error'
              ? 'error'
              : 'incomplete';
        default:
          return 'incomplete';
      }
    },

    isStepAccessible: (step: WizardStep) => {
      const state = get();
      const idx = wizardSteps.findIndex((wizardStep) => wizardStep.id === step);
      if (idx === 0) return true;

      for (let i = 0; i < idx; i++) {
        const prevStatus = state.getStepCompletionStatus(wizardSteps[i].id);
        if (prevStatus === 'incomplete' || prevStatus === 'error') {
          return idx <= i + 1;
        }
      }
      return true;
    },

    saveDraft: () => {
      const state = get();
      set({ isSaving: true });
      if (!state.guideId) {
        set({ guideId: crypto.randomUUID() });
      }
      const now = Date.now();
      set({ isDirty: false, isSaving: false, lastSavedAt: now });
    },

    setAutoSaveEnabled: (enabled) => set({ autoSaveEnabled: enabled }),

    markClean: () => set({ isDirty: false, lastSavedAt: Date.now() }),
  };
}
