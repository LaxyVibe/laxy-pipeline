// ---------------------------------------------------------------------------
// Character & Voice types
// ---------------------------------------------------------------------------
// Core character/voice types live in entity.ts. This module re-exports them
// and adds Firestore/API-specific variants.

export type { VoiceCharacter, TTSVoice } from './entity';
export { CHARACTER_PRESETS, AVAILABLE_VOICES } from './entity';

import type { DirectorNote } from './entity';
export type { DirectorNote } from './entity';

// ---------------------------------------------------------------------------
// Extended types for backend integration
// ---------------------------------------------------------------------------

/** Custom character created by the user (beyond presets) */
export interface CustomCharacter {
  id: string;
  /** Guide this character belongs to */
  guideId: string;
  name: string;
  role: string;
  avatar: string;
  personality: string;
  speechPatterns: string;
  /** Created by current user */
  createdBy: string;
  createdAt: number;
}

/** Voice preference saved per guide */
export interface VoicePreference {
  guideId: string;
  characterId: string;
  voiceId: string;
  directorNote: DirectorNote;
  /** Languages this preference applies to (empty = all) */
  languages: string[];
}

/** TTS generation request sent to the audio pipeline */
export interface TTSGenerationRequest {
  guideId: string;
  spotIds: string[];
  languages: string[];
  voiceId: string;
  characterId: string;
  directorNote: DirectorNote;
}

/** TTS generation response from the audio pipeline */
export interface TTSGenerationResponse {
  runId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  /** Audio download URLs keyed by `{spotId}_{lang}` */
  audioUrls: Record<string, string>;
  /** Token usage */
  tokenCount: number;
  /** Generation duration in ms */
  durationMs: number;
  error?: string;
}

// Re-export audio-related entity types for convenience
export type {
  LanguageAudio,
  PronunciationMarker,
  AudioGenerationRun,
  AudioStatus,
} from './entity';
