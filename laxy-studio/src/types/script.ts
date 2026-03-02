// ---------------------------------------------------------------------------
// Script & Translation types
// ---------------------------------------------------------------------------
// Core script/translation types live in entity.ts. This module re-exports
// them and adds Firestore/API-specific variants.

export type {
  SpotScript,
  SpotImageMapping,
  ScriptStatus,
  SpotTranslation,
  LanguageTranslation,
  TranslationStatus,
  SRTEntry,
  LanguageSRT,
} from './entity';

// ---------------------------------------------------------------------------
// Extended types for backend integration
// ---------------------------------------------------------------------------

/** Script generation request sent to the ADK pipeline */
export interface ScriptGenerationRequest {
  guideId: string;
  spotIds: string[];
  coreLanguage: string;
  /** Optional tone/style instructions from the user */
  styleNotes?: string;
}

/** Script generation response from the pipeline */
export interface ScriptGenerationResponse {
  scripts: Array<{
    spotId: string;
    scriptText: string;
  }>;
  imageMappings: Array<{
    spotId: string;
    assignedAssetIds: string[];
  }>;
  /** Token usage metadata */
  tokenCount: number;
  durationMs: number;
}

/** Translation request sent to the ADK pipeline */
export interface TranslationRequest {
  guideId: string;
  spotIds: string[];
  sourceLanguage: string;
  targetLanguages: string[];
}

/** Translation response from the pipeline */
export interface TranslationResponse {
  translations: Array<{
    lang: string;
    spots: Array<{
      spotId: string;
      translatedText: string;
    }>;
  }>;
  tokenCount: number;
  durationMs: number;
}

/** Script version snapshot for history / undo */
export interface ScriptVersion {
  id: string;
  spotId: string;
  scriptText: string;
  /** Who created this version: 'ai' | userId */
  author: string;
  createdAt: number;
  /** Optional commit message */
  note?: string;
}

/** Translation version snapshot for history / undo */
export interface TranslationVersion {
  id: string;
  spotId: string;
  lang: string;
  translatedText: string;
  author: string;
  createdAt: number;
  note?: string;
}
