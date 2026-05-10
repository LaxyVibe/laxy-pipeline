// ---------------------------------------------------------------------------
// Guides Store — wizard state for guide creation / editing
// ---------------------------------------------------------------------------
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  EntityConfig,
  DEFAULT_ENTITY_CONFIG,
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
import {
  AUDIO_INITIAL_STATE,
  GUIDE_INITIAL_STATE,
  INGESTION_INITIAL_STATE,
  PIPELINE_SYNC_INITIAL_STATE,
  PUBLISH_INITIAL_STATE,
  SAVE_RESUME_INITIAL_STATE,
  SCRIPT_INITIAL_STATE,
  TRANSLATION_INITIAL_STATE,
} from './store/guides/initialState';
import { createDomainActions } from './store/guides/domainActions';
import { createMetaActions } from './store/guides/metaActions';
import { applyPipelineStepData } from './store/guides/pipelineSync';

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
  publishJobId: string | null;
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
  setPublishJobId: (publishId: string | null) => void;
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
  applyStepData: (stepId: string, data: unknown) => void;

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
  ...GUIDE_INITIAL_STATE,
  ...SAVE_RESUME_INITIAL_STATE,
  ...PIPELINE_SYNC_INITIAL_STATE,
  ...INGESTION_INITIAL_STATE,
  ...SCRIPT_INITIAL_STATE,
  ...TRANSLATION_INITIAL_STATE,
  ...AUDIO_INITIAL_STATE,
  ...PUBLISH_INITIAL_STATE,

  ...createDomainActions(set, get),

  ...createMetaActions(set, get, WIZARD_STEPS),

  // ── Pipeline sync ──
  setSyncStatus: (status) => set({ syncStatus: status }),

  applyStepData: (stepId: string, data: unknown) => {
    applyPipelineStepData(set, get, stepId, data);
  },
} as GuidesStore),
    {
      name: 'laxy-guide-wizard',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => {
        // Strip transient runtime fields and non-serializable asset fields.
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const {
          isSaving,
          pipelineSessionId,
          pipelineCheckpointId,
          syncStatus,
          lastPipelineResponseAt,
          ingestionError,
          scriptError,
          translationError,
          audioError,
          publishError,
          ...rest
        } = state;
        return {
          ...rest,
          isSaving: false,
          pipelineSessionId: null,
          pipelineCheckpointId: null,
          syncStatus: 'synced',
          lastPipelineResponseAt: null,
          ingestionError: null,
          scriptError: null,
          translationError: null,
          audioError: null,
          publishError: null,
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
        const hasRecoverablePublishJob =
          persisted.publishStatus === 'publishing'
          && typeof persisted.publishJobId === 'string'
          && persisted.publishJobId.length > 0;
        const publishStatus =
          hasRecoverablePublishJob
            ? ('publishing' as const)
            : persisted.publishStatus === 'publishing'
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
