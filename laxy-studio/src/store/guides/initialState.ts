import {
  DEFAULT_ENTITY_CONFIG,
  type AssetFile,
  type AudioGenerationRun,
  type DirectorNote,
  type LanguageAudio,
  type LanguageSRT,
  type LanguageTranslation,
  type SpotImageMapping,
  type SpotMetadata,
  type SpotScript,
  type SpotSlideshow,
} from '../../types/entity';

export const GUIDE_INITIAL_STATE = {
  guideId: null as string | null,
  entityConfig: { ...DEFAULT_ENTITY_CONFIG },
  currentStep: 'entity-config' as const,
  isDirty: false,
  assets: [] as AssetFile[],
};

export const SAVE_RESUME_INITIAL_STATE = {
  lastSavedAt: null as number | null,
  isSaving: false,
  autoSaveEnabled: true,
};

export const PIPELINE_SYNC_INITIAL_STATE = {
  syncStatus: 'synced' as const,
  lastPipelineResponseAt: null as number | null,
};

export const INGESTION_INITIAL_STATE = {
  spots: [] as SpotMetadata[],
  ingestionStatus: 'idle' as const,
  ingestionError: null as string | null,
  selectedAssetIds: [] as string[],
  pipelineSessionId: null as string | null,
  pipelineCheckpointId: null as string | null,
};

export const SCRIPT_INITIAL_STATE = {
  scripts: [] as SpotScript[],
  imageMappings: [] as SpotImageMapping[],
  scriptStatus: 'idle' as const,
  scriptError: null as string | null,
};

export const TRANSLATION_INITIAL_STATE = {
  translations: [] as LanguageTranslation[],
  translationStatus: 'idle' as const,
  translationError: null as string | null,
};

export const AUDIO_INITIAL_STATE = {
  selectedCharacterId: null as string | null,
  selectedVoiceId: null as string | null,
  directorNote: { scene: '', style: '', pacing: '' } as DirectorNote,
  audioFiles: [] as LanguageAudio[],
  pronunciationMarkers: [],
  generationHistory: [] as AudioGenerationRun[],
  srtFiles: [] as LanguageSRT[],
  audioStatus: 'idle' as const,
  audioError: null as string | null,
};

export const PUBLISH_INITIAL_STATE = {
  slideshows: [] as SpotSlideshow[],
  publishStatus: 'idle' as const,
  publishError: null as string | null,
  previewDevice: 'mobile' as const,
  customSlug: '',
  publishJobId: null as string | null,
  publishedGuide: null,
};
