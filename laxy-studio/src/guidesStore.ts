// ---------------------------------------------------------------------------
// Guides Store — wizard state for guide creation / editing
// ---------------------------------------------------------------------------
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  EntityConfig,
  DEFAULT_ENTITY_CONFIG,
  langLabel,
  type AssetFile,
  type SpotMetadata,
  type IngestionStatus,
  type SpotScript,
  type SpotImageMapping,
  type ScriptStatus,
  type LanguageTranslation,
  type TranslationStatus,
  type DirectorNote,
  type LanguageAudio,
  type PronunciationMarker,
  type AudioGenerationRun,
  type LanguageSRT,
  type AudioStatus,
  type SpotSlideshow,
  type SlideshowImage,
  type PublishStatus,
  type PublishedGuide,
  type PreviewDevice,
} from './types/entity';

export type WizardStep =
  | 'entity-config'
  | 'layout'
  | 'assets'
  | 'modules'
  | 'ingest'
  | 'script'
  | 'translation'
  | 'audio'
  | 'publish';

export const WIZARD_STEPS: { id: WizardStep; label: string }[] = [
  { id: 'entity-config', label: 'Entity Setup' },
  { id: 'layout', label: 'Layout' },
  { id: 'assets', label: 'Assets' },
  { id: 'modules', label: 'Modules' },
  { id: 'ingest', label: 'Ingestion' },
  { id: 'script', label: 'Script' },
  { id: 'translation', label: 'Translation' },
  { id: 'audio', label: 'Audio' },
  { id: 'publish', label: 'Publish' },
];

export interface GuidesStore {
  // Current guide
  guideId: string | null;
  entityConfig: EntityConfig;
  currentStep: WizardStep;
  isDirty: boolean;

  // Assets
  assets: AssetFile[];

  // Ingestion
  spots: SpotMetadata[];
  ingestionStatus: IngestionStatus;
  ingestionError: string | null;
  /** Asset IDs the user selected for ingestion */
  selectedAssetIds: string[];
  /** ADK pipeline sessionId for the running pipeline session */
  pipelineSessionId: string | null;
  /** ADK pipeline checkpointId when a human gate is reached */
  pipelineCheckpointId: string | null;

  // Script Generation (Step 3)
  scripts: SpotScript[];
  imageMappings: SpotImageMapping[];
  scriptStatus: ScriptStatus;
  scriptError: string | null;

  // Translation (Step 4)
  translations: LanguageTranslation[];
  translationStatus: TranslationStatus;
  translationError: string | null;

  // Audio Production (Step 5)
  selectedCharacterId: string | null;
  selectedVoiceId: string | null;
  directorNote: DirectorNote;
  audioFiles: LanguageAudio[];
  pronunciationMarkers: PronunciationMarker[];
  generationHistory: AudioGenerationRun[];
  srtFiles: LanguageSRT[];
  audioStatus: AudioStatus;
  audioError: string | null;

  // Publishing (Step 6)
  slideshows: SpotSlideshow[];
  publishStatus: PublishStatus;
  publishError: string | null;
  previewDevice: PreviewDevice;
  customSlug: string;
  publishedGuide: PublishedGuide | null;

  // Entity config actions
  setEntityField: <K extends keyof EntityConfig>(key: K, value: EntityConfig[K]) => void;
  setEntityConfig: (config: Partial<EntityConfig>) => void;
  resetEntityConfig: () => void;

  // Asset actions
  addAssets: (files: AssetFile[]) => void;
  removeAsset: (id: string) => void;
  updateAsset: (id: string, patch: Partial<AssetFile>) => void;
  clearAssets: () => void;

  // Ingestion actions
  setSelectedAssetIds: (ids: string[]) => void;
  setIngestionStatus: (status: IngestionStatus) => void;
  setIngestionError: (error: string | null) => void;
  setSpots: (spots: SpotMetadata[]) => void;
  updateSpot: (id: string, patch: Partial<SpotMetadata>) => void;
  removeSpot: (id: string) => void;
  addSpot: (spot: SpotMetadata) => void;
  reorderSpots: (spotIds: string[]) => void;
  setPipelineIds: (sessionId: string | null, checkpointId: string | null) => void;
  resetIngestion: () => void;

  // Script Generation actions
  setScripts: (scripts: SpotScript[]) => void;
  updateScript: (spotId: string, patch: Partial<SpotScript>) => void;
  setScriptStatus: (status: ScriptStatus) => void;
  setScriptError: (error: string | null) => void;
  approveScript: (spotId: string) => void;
  rejectScript: (spotId: string) => void;
  approveAllScripts: () => void;
  rejectAllScripts: () => void;
  toggleFastTrack: (spotId: string) => void;
  setImageMappings: (mappings: SpotImageMapping[]) => void;
  updateImageMapping: (spotId: string, assetIds: string[]) => void;
  resetScripts: () => void;

  // Translation actions
  setTranslations: (translations: LanguageTranslation[]) => void;
  updateTranslation: (lang: string, spotId: string, translatedText: string) => void;
  setTranslationStatus: (status: TranslationStatus) => void;
  setTranslationError: (error: string | null) => void;
  approveLanguage: (lang: string) => void;
  rejectLanguage: (lang: string) => void;
  approveAllLanguages: () => void;
  rejectAllLanguages: () => void;
  resetTranslations: () => void;

  // Audio Production actions
  setSelectedCharacterId: (id: string | null) => void;
  setSelectedVoiceId: (id: string | null) => void;
  setDirectorNote: (note: Partial<DirectorNote>) => void;
  setAudioFiles: (files: LanguageAudio[]) => void;
  approveAudioLang: (lang: string) => void;
  rejectAudioLang: (lang: string) => void;
  approveAllAudio: () => void;
  rejectAllAudio: () => void;
  addPronunciationMarker: (marker: PronunciationMarker) => void;
  removePronunciationMarker: (id: string) => void;
  addGenerationRun: (run: AudioGenerationRun) => void;
  setSrtFiles: (files: LanguageSRT[]) => void;
  setAudioStatus: (status: AudioStatus) => void;
  setAudioError: (error: string | null) => void;
  resetAudio: () => void;

  // Publishing actions
  setSlideshows: (slideshows: SpotSlideshow[]) => void;
  updateSlideshow: (spotId: string, images: SlideshowImage[]) => void;
  setPublishStatus: (status: PublishStatus) => void;
  setPublishError: (error: string | null) => void;
  setPreviewDevice: (device: PreviewDevice) => void;
  setCustomSlug: (slug: string) => void;
  setPublishedGuide: (guide: PublishedGuide | null) => void;
  resetPublish: () => void;

  // Cascading reset — resets the given step AND all downstream steps
  resetDownstreamFrom: (step: WizardStep) => void;

  // Full reset — clear everything and start a new guide
  clearAll: () => void;

  // Step completion
  getStepCompletionStatus: (step: WizardStep) => 'completed' | 'incomplete' | 'error';
  isStepAccessible: (step: WizardStep) => boolean;

  // Save & Resume
  lastSavedAt: number | null;
  isSaving: boolean;
  autoSaveEnabled: boolean;
  saveDraft: () => void;
  setAutoSaveEnabled: (enabled: boolean) => void;
  markClean: () => void;

  // Pipeline sync
  syncStatus: 'synced' | 'local-changes' | 'syncing' | 'conflict';
  lastPipelineResponseAt: number | null;
  setSyncStatus: (status: 'synced' | 'local-changes' | 'syncing' | 'conflict') => void;
  applyStepData: (nodeLabel: string, data: unknown) => void;

  // Wizard navigation
  goToStep: (step: WizardStep) => void;
  nextStep: () => void;
  prevStep: () => void;

  // Validation
  isEntityConfigValid: () => boolean;
}

export const useGuidesStore = create<GuidesStore>()(
  persist(
    (set, get) => ({
  guideId: null,
  entityConfig: { ...DEFAULT_ENTITY_CONFIG },
  currentStep: 'entity-config' as WizardStep,
  isDirty: false,
  assets: [],

  // Save & Resume state
  lastSavedAt: null,
  isSaving: false,
  autoSaveEnabled: true,

  // Pipeline sync state
  syncStatus: 'synced' as const,
  lastPipelineResponseAt: null,

  // Ingestion initial state
  spots: [],
  ingestionStatus: 'idle',
  ingestionError: null,
  selectedAssetIds: [],
  pipelineSessionId: null,
  pipelineCheckpointId: null,

  // Script initial state
  scripts: [],
  imageMappings: [],
  scriptStatus: 'idle',
  scriptError: null,

  // Translation initial state
  translations: [],
  translationStatus: 'idle',
  translationError: null,

  // Audio initial state
  selectedCharacterId: null,
  selectedVoiceId: null,
  directorNote: { vocalEnvironment: '', mission: '', pacing: '' },
  audioFiles: [],
  pronunciationMarkers: [],
  generationHistory: [],
  srtFiles: [],
  audioStatus: 'idle',
  audioError: null,

  // Publish initial state
  slideshows: [],
  publishStatus: 'idle',
  publishError: null,
  previewDevice: 'mobile',
  customSlug: '',
  publishedGuide: null,

  setEntityField: (key, value) => {
    set((s) => ({
      entityConfig: { ...s.entityConfig, [key]: value },
      isDirty: true,
    }));
  },

  setEntityConfig: (config) => {
    set((s) => {
      const patch: Partial<GuidesStore> = {
        entityConfig: { ...s.entityConfig, ...config },
        isDirty: true,
      };

      // If supportedLanguages changed and we have translations, reset translation
      // status so stale languages from a previous config don't remain "approved".
      if (config.supportedLanguages && s.translations.length > 0) {
        const newTarget = config.supportedLanguages.filter(
          (l) => l !== (config.coreLanguage ?? s.entityConfig.coreLanguage),
        );
        const oldLangs = s.translations.map((t) => t.lang);
        const changed =
          newTarget.length !== oldLangs.length ||
          !newTarget.every((l) => oldLangs.includes(l));
        if (changed && s.translationStatus === 'approved') {
          patch.translationStatus = 'review';
        }
      }

      return patch;
    });
  },

  resetEntityConfig: () => {
    set({ entityConfig: { ...DEFAULT_ENTITY_CONFIG }, isDirty: false });
  },

  addAssets: (files) => {
    set((s) => ({ assets: [...s.assets, ...files], isDirty: true }));
  },

  removeAsset: (id) => {
    set((s) => {
      const asset = s.assets.find((a) => a.id === id);
      if (asset?.previewUrl) URL.revokeObjectURL(asset.previewUrl);
      return { assets: s.assets.filter((a) => a.id !== id), isDirty: true };
    });
  },

  updateAsset: (id, patch) => {
    set((s) => ({
      assets: s.assets.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    }));
  },

  clearAssets: () => {
    set((s) => {
      s.assets.forEach((a) => { if (a.previewUrl) URL.revokeObjectURL(a.previewUrl); });
      return { assets: [], isDirty: true };
    });
  },

  // ── Ingestion actions ──
  setSelectedAssetIds: (ids) => set({ selectedAssetIds: ids }),

  setIngestionStatus: (status) => set({ ingestionStatus: status }),

  setIngestionError: (error) => set({ ingestionError: error }),

  setSpots: (spots) => set({ spots, isDirty: true }),

  updateSpot: (id, patch) => {
    set((s) => ({
      spots: s.spots.map((sp) => (sp.id === id ? { ...sp, ...patch } : sp)),
      isDirty: true,
    }));
  },

  removeSpot: (id) => {
    set((s) => {
      const filtered = s.spots.filter((sp) => sp.id !== id);
      // Re-number remaining spots
      const renumbered = filtered.map((sp, idx) => ({ ...sp, spotNumber: idx + 1 }));
      return { spots: renumbered, isDirty: true };
    });
  },

  addSpot: (spot) => {
    set((s) => ({ spots: [...s.spots, spot], isDirty: true }));
  },

  reorderSpots: (spotIds) => {
    set((s) => {
      const byId = new Map(s.spots.map((sp) => [sp.id, sp]));
      const reordered = spotIds
        .map((id) => byId.get(id))
        .filter(Boolean) as SpotMetadata[];
      // Re-number after reorder
      const renumbered = reordered.map((sp, idx) => ({ ...sp, spotNumber: idx + 1 }));
      return { spots: renumbered, isDirty: true };
    });
  },

  setPipelineIds: (sessionId, checkpointId) =>
    set({ pipelineSessionId: sessionId, pipelineCheckpointId: checkpointId }),

  resetIngestion: () =>
    set({
      spots: [],
      ingestionStatus: 'idle',
      ingestionError: null,
      selectedAssetIds: [],
      pipelineSessionId: null,
      pipelineCheckpointId: null,
    }),

  // ── Script Generation actions ──
  setScripts: (scripts) => set({ scripts, isDirty: true }),

  updateScript: (spotId, patch) => {
    set((s) => ({
      scripts: s.scripts.map((sc) => (sc.spotId === spotId ? { ...sc, ...patch } : sc)),
      isDirty: true,
    }));
  },

  setScriptStatus: (status) => set({ scriptStatus: status }),

  setScriptError: (error) => set({ scriptError: error }),

  approveScript: (spotId) => {
    set((s) => ({
      scripts: s.scripts.map((sc) =>
        sc.spotId === spotId ? { ...sc, approved: true } : sc
      ),
      isDirty: true,
    }));
  },

  rejectScript: (spotId) => {
    set((s) => ({
      scripts: s.scripts.map((sc) =>
        sc.spotId === spotId ? { ...sc, approved: false } : sc
      ),
      isDirty: true,
    }));
  },

  approveAllScripts: () => {
    set((s) => ({
      scripts: s.scripts.map((sc) => ({ ...sc, approved: true })),
      isDirty: true,
    }));
  },

  rejectAllScripts: () => {
    set((s) => ({
      scripts: s.scripts.map((sc) => ({ ...sc, approved: false })),
      isDirty: true,
    }));
  },

  toggleFastTrack: (spotId) => {
    set((s) => ({
      scripts: s.scripts.map((sc) =>
        sc.spotId === spotId ? { ...sc, fastTrack: !sc.fastTrack } : sc
      ),
      isDirty: true,
    }));
  },

  setImageMappings: (mappings) => set({ imageMappings: mappings, isDirty: true }),

  updateImageMapping: (spotId, assetIds) => {
    set((s) => ({
      imageMappings: s.imageMappings.map((m) =>
        m.spotId === spotId ? { ...m, assignedAssetIds: assetIds, aiSuggested: false } : m
      ),
      isDirty: true,
    }));
  },

  resetScripts: () =>
    set({
      scripts: [],
      imageMappings: [],
      scriptStatus: 'idle',
      scriptError: null,
    }),

  // ── Translation actions ──
  setTranslations: (translations) => set({ translations, isDirty: true }),

  updateTranslation: (lang, spotId, translatedText) => {
    set((s) => ({
      translations: s.translations.map((lt) =>
        lt.lang === lang
          ? {
              ...lt,
              spots: lt.spots.map((sp) =>
                sp.spotId === spotId ? { ...sp, translatedText } : sp
              ),
            }
          : lt
      ),
      isDirty: true,
    }));
  },

  setTranslationStatus: (status) => set({ translationStatus: status }),

  setTranslationError: (error) => set({ translationError: error }),

  approveLanguage: (lang) => {
    set((s) => ({
      translations: s.translations.map((lt) =>
        lt.lang === lang ? { ...lt, approved: true } : lt
      ),
      isDirty: true,
    }));
  },

  rejectLanguage: (lang) => {
    set((s) => ({
      translations: s.translations.map((lt) =>
        lt.lang === lang ? { ...lt, approved: false } : lt
      ),
      isDirty: true,
    }));
  },

  approveAllLanguages: () => {
    set((s) => ({
      translations: s.translations.map((lt) => ({ ...lt, approved: true })),
      isDirty: true,
    }));
  },

  rejectAllLanguages: () => {
    set((s) => ({
      translations: s.translations.map((lt) => ({ ...lt, approved: false })),
      isDirty: true,
    }));
  },

  resetTranslations: () =>
    set({
      translations: [],
      translationStatus: 'idle',
      translationError: null,
    }),

  // ── Audio Production actions ──
  setSelectedCharacterId: (id) => set({ selectedCharacterId: id, isDirty: true }),

  setSelectedVoiceId: (id) => set({ selectedVoiceId: id, isDirty: true }),

  setDirectorNote: (note) => {
    set((s) => ({
      directorNote: { ...s.directorNote, ...note },
      isDirty: true,
    }));
  },

  setAudioFiles: (files) => set({ audioFiles: files, isDirty: true }),

  approveAudioLang: (lang) => {
    set((s) => ({
      audioFiles: s.audioFiles.map((af) =>
        af.lang === lang ? { ...af, approved: true } : af
      ),
      isDirty: true,
    }));
  },

  rejectAudioLang: (lang) => {
    set((s) => ({
      audioFiles: s.audioFiles.map((af) =>
        af.lang === lang ? { ...af, approved: false } : af
      ),
      isDirty: true,
    }));
  },

  approveAllAudio: () => {
    set((s) => ({
      audioFiles: s.audioFiles.map((af) => ({ ...af, approved: true })),
      isDirty: true,
    }));
  },

  rejectAllAudio: () => {
    set((s) => ({
      audioFiles: s.audioFiles.map((af) => ({ ...af, approved: false })),
      isDirty: true,
    }));
  },

  addPronunciationMarker: (marker) => {
    set((s) => ({
      pronunciationMarkers: [...s.pronunciationMarkers, marker],
      isDirty: true,
    }));
  },

  removePronunciationMarker: (id) => {
    set((s) => ({
      pronunciationMarkers: s.pronunciationMarkers.filter((m) => m.id !== id),
      isDirty: true,
    }));
  },

  addGenerationRun: (run) => {
    set((s) => ({
      generationHistory: [run, ...s.generationHistory],
      isDirty: true,
    }));
  },

  setSrtFiles: (files) => set({ srtFiles: files, isDirty: true }),

  setAudioStatus: (status) => set({ audioStatus: status }),

  setAudioError: (error) => set({ audioError: error }),

  resetAudio: () =>
    set({
      selectedCharacterId: null,
      selectedVoiceId: null,
      directorNote: { vocalEnvironment: '', mission: '', pacing: '' },
      audioFiles: [],
      pronunciationMarkers: [],
      srtFiles: [],
      audioStatus: 'idle',
      audioError: null,
    }),

  // ── Publishing actions ──
  setSlideshows: (slideshows) => set({ slideshows, isDirty: true }),

  updateSlideshow: (spotId, images) => {
    set((s) => ({
      slideshows: s.slideshows.map((ss) =>
        ss.spotId === spotId ? { ...ss, images } : ss
      ),
      isDirty: true,
    }));
  },

  setPublishStatus: (status) => set({ publishStatus: status }),

  setPublishError: (error) => set({ publishError: error }),

  setPreviewDevice: (device) => set({ previewDevice: device }),

  setCustomSlug: (slug) => set({ customSlug: slug, isDirty: true }),

  setPublishedGuide: (guide) => set({ publishedGuide: guide }),

  resetPublish: () =>
    set({
      slideshows: [],
      publishStatus: 'idle',
      publishError: null,
      customSlug: '',
      publishedGuide: null,
    }),

  // ── Cascading reset ──
  // Resets the given step and ALL steps that come after it in the wizard.
  // Also clears shared pipeline IDs since they become stale.
  resetDownstreamFrom: (step: WizardStep) => {
    const idx = WIZARD_STEPS.findIndex((ws) => ws.id === step);
    if (idx < 0) return;

    const resetActions: Record<string, () => void> = {
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
          directorNote: { vocalEnvironment: '', mission: '', pacing: '' },
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
          publishedGuide: null,
        }),
    };

    // Run reset for each step from `step` onwards
    for (let i = idx; i < WIZARD_STEPS.length; i++) {
      const stepId = WIZARD_STEPS[i].id;
      resetActions[stepId]?.();
    }

    // Always clear shared pipeline IDs — they're bound to the old session
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
      directorNote: { vocalEnvironment: '', mission: '', pacing: '' },
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
      publishedGuide: null,
      lastSavedAt: null,
      syncStatus: 'synced' as const,
      lastPipelineResponseAt: null,
    });
  },

  goToStep: (step) => set({ currentStep: step }),

  nextStep: () => {
    const { currentStep } = get();
    const idx = WIZARD_STEPS.findIndex((s) => s.id === currentStep);
    if (idx < WIZARD_STEPS.length - 1) {
      set({ currentStep: WIZARD_STEPS[idx + 1].id });
    }
  },

  prevStep: () => {
    const { currentStep } = get();
    const idx = WIZARD_STEPS.findIndex((s) => s.id === currentStep);
    if (idx > 0) {
      set({ currentStep: WIZARD_STEPS[idx - 1].id });
    }
  },

  isEntityConfigValid: () => {
    const { entityConfig } = get();
    return (
      entityConfig.venueName.trim().length > 0 &&
      entityConfig.coreLanguage.length > 0 &&
      entityConfig.supportedLanguages.length > 0 &&
      entityConfig.supportedLanguages.includes(entityConfig.coreLanguage)
    );
  },

  // ── Step completion ──
  getStepCompletionStatus: (step: WizardStep) => {
    const s = get();
    switch (step) {
      case 'entity-config':
        return s.isEntityConfigValid() ? 'completed' : 'incomplete';
      case 'layout':
        return s.entityConfig.selectedLayout ? 'completed' : 'incomplete';
      case 'assets':
        return s.assets.length > 0 ? 'completed' : 'incomplete';
      case 'modules':
        return s.entityConfig.enabledModules.length > 0 ? 'completed' : 'incomplete';
      case 'ingest':
        return s.ingestionStatus === 'approved'
          ? 'completed'
          : s.ingestionStatus === 'error'
            ? 'error'
            : 'incomplete';
      case 'script':
        return s.scriptStatus === 'approved'
          ? 'completed'
          : s.scriptStatus === 'error'
            ? 'error'
            : 'incomplete';
      case 'translation':
        return s.translationStatus === 'approved'
          ? 'completed'
          : s.translationStatus === 'error'
            ? 'error'
            : 'incomplete';
      case 'audio':
        return s.audioStatus === 'approved'
          ? 'completed'
          : s.audioStatus === 'error'
            ? 'error'
            : 'incomplete';
      case 'publish':
        return s.publishStatus === 'published'
          ? 'completed'
          : s.publishStatus === 'error'
            ? 'error'
            : 'incomplete';
      default:
        return 'incomplete';
    }
  },

  isStepAccessible: (step: WizardStep) => {
    const s = get();
    const idx = WIZARD_STEPS.findIndex((ws) => ws.id === step);
    if (idx === 0) return true;
    // Allow access to any completed step, plus the first incomplete step.
    // Once an incomplete step is found, nothing beyond it is accessible.
    for (let i = 0; i < idx; i++) {
      const prevStatus = s.getStepCompletionStatus(WIZARD_STEPS[i].id);
      if (prevStatus === 'incomplete' || prevStatus === 'error') {
        // Only allow the step immediately after this incomplete one
        return idx <= i + 1;
      }
    }
    return true;
  },

  // ── Save & Resume ──
  saveDraft: () => {
    const s = get();
    set({ isSaving: true });
    // Generate guideId if not set
    if (!s.guideId) {
      set({ guideId: crypto.randomUUID() });
    }
    // Persist is handled by zustand/persist middleware — this marks clean + timestamp
    const now = Date.now();
    set({ isDirty: false, isSaving: false, lastSavedAt: now });
  },

  setAutoSaveEnabled: (enabled) => set({ autoSaveEnabled: enabled }),

  markClean: () => set({ isDirty: false, lastSavedAt: Date.now() }),

  // ── Pipeline sync ──
  setSyncStatus: (status) => set({ syncStatus: status }),

  applyStepData: (nodeLabel: string, data: unknown) => {
    const parsed = data as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return;

    set({ lastPipelineResponseAt: Date.now(), syncStatus: 'synced' });

    switch (nodeLabel) {
      case 'S1: Metadata Extract (Gemini)':
      case 'S1: Metadata Extract': {
        const spots = (parsed as { spots?: SpotMetadata[] }).spots;
        if (Array.isArray(spots)) {
          // Only move to 'review' if not already approved — avoid regressing status
          // when a later pipeline call re-returns earlier step data.
          const patch: Record<string, unknown> = { spots, isDirty: true };
          if (get().ingestionStatus !== 'approved') {
            patch.ingestionStatus = 'review';
          }
          set(patch as Partial<GuidesStore>);
        }
        break;
      }
      case 'S4: Script Gen (Gemini Pro)':
      case 'S4: Script Gen': {
        const rawScripts = (parsed as { scripts?: Record<string, unknown>[] }).scripts;
        if (Array.isArray(rawScripts)) {
          // Backend may return variants: { kids, academic, quick, professional, brief }
          // Transform to flat scriptText by picking 'professional' variant as default
          const mapped: SpotScript[] = rawScripts.map((raw, idx) => {
            let text = (raw.scriptText as string) ?? '';
            if (!text && typeof raw.variants === 'object' && raw.variants !== null) {
              const v = raw.variants as Record<string, string>;
              text = v.professional ?? v.academic ?? v.quick ?? v.kids ?? v.brief ?? '';
            }
            return {
              spotId: (raw.spotId as string) ?? `spot-${idx}`,
              spotNumber: (raw.spotNumber as number) ?? idx + 1,
              title: (raw.title as string) ?? `Spot ${idx + 1}`,
              scriptText: text,
              approved: false,
              fastTrack: false,
            };
          });
          // Only move to 'review' if not already approved — avoid regressing status
          const patch: Record<string, unknown> = { scripts: mapped, isDirty: true };
          if (get().scriptStatus !== 'approved') {
            patch.scriptStatus = 'review';
          }
          set(patch as Partial<GuidesStore>);
        }
        break;
      }
      case 'S5: Image Map (Gemini)':
      case 'S5: Image Map': {
        const mappings = parsed as { mappings?: SpotImageMapping[] };
        if (Array.isArray(mappings.mappings)) {
          set({ imageMappings: mappings.mappings, isDirty: true });
        }
        break;
      }
      case 'S6: Translation (Gemini Pro)':
      case 'S6: Translation': {
        const rawTranslations = (parsed as { translations?: Record<string, unknown>[] }).translations;
        if (Array.isArray(rawTranslations)) {
          // Backend returns per-spot: [{ spotId, translations: { en, ja, ko, ... } }]
          // Frontend needs per-language: [{ lang, label, spots: [{ spotId, translatedText }] }]
          const firstItem = rawTranslations[0];
          const isSpotFirst = firstItem && typeof firstItem.translations === 'object' && !Array.isArray(firstItem.translations) && !firstItem.lang;
          if (isSpotFirst) {
            // Pivot from spot-first to language-first
            // Build a lookup of original script text keyed by spotId so we can
            // populate the "Original Script" column in the translation review table.
            const scriptsBySpotId = new Map<string, string>(
              get().scripts.map((sc) => [sc.spotId, sc.scriptText]),
            );
            const langMap = new Map<string, { spotId: string; spotNumber: number; title: string; originalText: string; translatedText: string }[]>();
            rawTranslations.forEach((item, idx) => {
              const spotId = (item.spotId as string) ?? `spot-${idx}`;
              const spotNumber = (item.spotNumber as number) ?? idx + 1;
              const title = (item.title as string) ?? `Spot ${idx + 1}`;
              const originalText = scriptsBySpotId.get(spotId) ?? '';
              const trans = item.translations as Record<string, string> | undefined;
              if (trans && typeof trans === 'object') {
                for (const [lang, text] of Object.entries(trans)) {
                  if (!langMap.has(lang)) langMap.set(lang, []);
                  langMap.get(lang)!.push({ spotId, spotNumber, title, originalText, translatedText: String(text) });
                }
              }
            });
            const pivoted: LanguageTranslation[] = Array.from(langMap.entries()).map(([lang, spots]) => ({
              lang,
              label: langLabel(lang),
              spots,
              approved: false,
            }));
            // Only move to 'review' if not already approved — avoid regressing status
            const patch1: Record<string, unknown> = { translations: pivoted, isDirty: true };
            if (get().translationStatus !== 'approved') {
              patch1.translationStatus = 'review';
            }
            set(patch1 as Partial<GuidesStore>);
          } else {
            // Already in language-first format
            const patch2: Record<string, unknown> = { translations: rawTranslations as unknown as LanguageTranslation[], isDirty: true };
            if (get().translationStatus !== 'approved') {
              patch2.translationStatus = 'review';
            }
            set(patch2 as Partial<GuidesStore>);
          }
        }
        break;
      }
      case 'S7: Voice Recommend (Gemini)':
      case 'S7: Voice Recommend': {
        const rec = parsed as { suggested?: string };
        if (rec.suggested) {
          set({ selectedVoiceId: rec.suggested, isDirty: true });
        }
        break;
      }
      case 'S8: Director Note (Gemini)':
      case 'S8: Director Note': {
        // Backend may wrap in { directorNote: {...} } and use different field names
        const wrapper = parsed as { directorNote?: Record<string, unknown> };
        const raw = (wrapper.directorNote && typeof wrapper.directorNote === 'object')
          ? wrapper.directorNote
          : parsed as Record<string, unknown>;
        const mapped: Partial<DirectorNote> = {
          vocalEnvironment: (raw.vocalEnvironment as string) ?? '',
          mission: (raw.mission as string) ?? (raw.missionOfSpeech as string) ?? '',
          pacing: (raw.pacing as string) ?? (raw.pacingAndEnergy as string) ?? '',
        };
        if (mapped.vocalEnvironment || mapped.mission || mapped.pacing) {
          set((s) => ({
            directorNote: { ...s.directorNote, ...mapped },
            isDirty: true,
          }));
        }
        break;
      }
      case 'S9: Audio Gen (Gemini TTS)':
      case 'S9: Audio Gen': {
        const audio = parsed as { audioFiles?: Record<string, unknown>[] };
        if (Array.isArray(audio.audioFiles)) {
          // Backend returns per-spot items: { lang, spotId, audioUrl, durationMs, voiceId, model }
          // Frontend LanguageAudio expects per-language: { lang, label, audioUrl, durationMs, approved }
          // Group by language, enrich with label & approved flag
          const audioByLang = new Map<string, LanguageAudio>();
          for (const af of audio.audioFiles) {
            const lang = (af.lang as string) ?? '';
            const audioUrl = (af.audioUrl as string) ?? '';
            const durationMs = (af.durationMs as number) ?? 0;
            if (!audioUrl) continue;
            const spotEntry = {
              spotId: (af.spotId as string) ?? '',
              spotNumber: (af.spotNumber as number) ?? 0,
              title: (af.title as string) ?? '',
              audioUrl,
              durationMs,
            };
            const existing = audioByLang.get(lang);
            if (!existing) {
              audioByLang.set(lang, {
                lang,
                label: langLabel(lang),
                audioUrl,
                durationMs,
                approved: false,
                spots: [spotEntry],
              });
            } else {
              // Multi-spot: keep first URL, sum durations, collect all spots
              existing.durationMs += durationMs;
              existing.spots = [...(existing.spots ?? []), spotEntry];
            }
          }
          const enriched: LanguageAudio[] = Array.from(audioByLang.values());
          // Only move to 'review' if not already approved AND user has already
          // been through the configure step (audioStatus is 'generating' or later).
          // If audioStatus is still 'idle'/'configuring', keep it so the user
          // starts at the Configure sub-step rather than jumping to Review.
          const audioPatch: Record<string, unknown> = { audioFiles: enriched, isDirty: true };
          const currentAudioStatus = get().audioStatus;
          if (currentAudioStatus !== 'approved' && currentAudioStatus !== 'idle' && currentAudioStatus !== 'configuring') {
            audioPatch.audioStatus = 'review';
          }
          set(audioPatch as Partial<GuidesStore>);
        }
        break;
      }
      case 'S10: SRT Gen (rule-based)':
      case 'S10: SRT Gen': {
        const srt = parsed as { srtFiles?: LanguageSRT[] };
        if (Array.isArray(srt.srtFiles)) {
          set({ srtFiles: srt.srtFiles, isDirty: true });
        }
        break;
      }
      default:
        // Unknown node — log but don't crash
        console.warn(`[PipelineSync] Unknown node label: ${nodeLabel}`, parsed);
    }
  },
}),
    {
      name: 'laxy-guide-wizard',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => {
        // Strip non-serializable data from assets (File objects, blob URLs)
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { isSaving, ...rest } = state;
        return {
          ...rest,
          isSaving: false,
          assets: state.assets.map(({ file, previewUrl, ...a }) => ({
            ...a,
            file: undefined,
            previewUrl: undefined,
          })),
        } as unknown as GuidesStore;
      },
      // Merge function to handle rehydration properly
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<GuidesStore>;

        // Reset ALL in-flight statuses that can't survive a page reload
        const ingestionStatus =
          persisted.ingestionStatus === 'processing'
            ? ('idle' as const)
            : (persisted.ingestionStatus ?? currentState.ingestionStatus);
        const scriptStatus =
          persisted.scriptStatus === 'generating'
            ? ('idle' as const)
            : (persisted.scriptStatus ?? currentState.scriptStatus);
        const translationStatus =
          persisted.translationStatus === 'translating'
            ? ('idle' as const)
            : (persisted.translationStatus ?? currentState.translationStatus);
        const audioStatus =
          persisted.audioStatus === 'generating'
            ? ('idle' as const)
            : (persisted.audioStatus ?? currentState.audioStatus);
        const publishStatus =
          persisted.publishStatus === 'publishing'
            ? ('idle' as const)
            : (persisted.publishStatus ?? currentState.publishStatus);

        return {
          ...currentState,
          ...persisted,
          // Always reset transient state on load
          isSaving: false,
          syncStatus: 'synced' as const,
          // Apply in-flight resets
          ingestionStatus,
          ingestionError: ingestionStatus !== persisted.ingestionStatus ? null : (persisted.ingestionError ?? null),
          scriptStatus,
          scriptError: scriptStatus !== persisted.scriptStatus ? null : (persisted.scriptError ?? null),
          translationStatus,
          translationError: translationStatus !== persisted.translationStatus ? null : (persisted.translationError ?? null),
          audioStatus,
          audioError: audioStatus !== persisted.audioStatus ? null : (persisted.audioError ?? null),
          publishStatus,
          publishError: publishStatus !== persisted.publishStatus ? null : (persisted.publishError ?? null),
        };
      },
    },
  ),
);
