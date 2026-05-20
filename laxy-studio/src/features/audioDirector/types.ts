import type {
  AudioGuideSettings,
  AudioMvpCharacter,
  AudioPoiDraft,
  ScriptEnhancementValidation,
} from '../audioMvp/model';
import type { LanguageAudio, LanguageSRT } from '../../types/entity';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
export type ProgressStatus = 'idle' | 'preparing' | 'enhancing' | 'generating' | 'done' | 'error';
export type WizardScreen = 'guide-settings' | 'script-polish' | 'audio-production';

export type EnhancementEntry = {
  sourceText: string;
  enhancedText: string;
  isEdited: boolean;
  generatedAt: number | null;
  phoneticOverrides: Array<{ source: string; target: string }>;
  validation: ScriptEnhancementValidation;
};

export type JapaneseReadingEntry = {
  sourceText: string;
  hiraganaText: string;
  isEdited: boolean;
  generatedAt: number | null;
};

export type ItemGenerationState = {
  status: ProgressStatus;
  label?: string;
  message?: string;
  error?: string;
  originalScript?: string;
  finalScript?: string;
};

export type AudioDirectorDraft = {
  manuscriptText: string;
  sessionId: string | null;
  coreLanguage: string;
  scriptEnhancementEnabled: boolean;
  globalSettings: AudioGuideSettings;
  items: AudioPoiDraft[];
  customCharacters: AudioMvpCharacter[];
  enhancementCache: Record<string, Record<string, EnhancementEntry>>;
  readingAssistCache: Record<string, Record<string, JapaneseReadingEntry>>;
  generationHistory: GenerationHistoryEntry[];
};

export type GenerationHistoryEntry = {
  runId: string;
  generatedAt: number;
  coreLanguage: string;
  label: string;
  audioFiles: LanguageAudio[];
  srtFiles: LanguageSRT[];
  itemCount: number;
};
