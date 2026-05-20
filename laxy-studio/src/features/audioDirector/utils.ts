import { francAll } from 'franc-min';
import type { AudioGenerateLanguageResponse } from '../../api';
import { langLabel, type LanguageAudio, type LanguageSRT } from '../../types/entity';
import {
  AUDIO_MVP_VOICES,
  normalizeAudioGuideSettings,
  normalizeAudioMvpCharacter,
  normalizeAudioPoiDraft,
  PRESET_AUDIO_CHARACTERS,
  type AudioGuideSettings,
  type AudioMvpCharacter,
  type AudioPoiDraft,
  type ScriptEnhancementValidation,
} from '../audioMvp/model';
import type { AudioDirectorDraft } from './types';

export const AUDIO_DIRECTOR_DRAFT_STORAGE_KEY = 'audio-director-draft-v2';
export const LEGACY_AUDIO_DIRECTOR_DRAFT_STORAGE_KEY = 'audio-director-draft-v1';
export const LEGACY_AUDIO_MVP2_DRAFT_STORAGE_KEY = 'audio-mvp2-draft-v1';

const DETECT_MIN_CONFIDENCE = 0.86;
const DETECT_MIN_MARGIN = 0.08;

const ISO3_TO_LANGUAGE_CODE: Record<string, string> = {
  eng: 'en',
  jpn: 'ja',
  kor: 'ko',
  cmn: 'zh',
  zho: 'zh',
  fra: 'fr',
  deu: 'de',
  spa: 'es',
  ita: 'it',
  por: 'pt',
  tha: 'th',
  vie: 'vi',
  ind: 'id',
  msa: 'ms',
  arb: 'ar',
  rus: 'ru',
};

const CJK_RE = /[\u4e00-\u9fff\u3400-\u4dbf\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g;

function detectChineseVariant(text: string): 'zh-TW' | 'zh-CN' {
  const simplifiedHints = text.match(/[这后发国云体台万与门术级]/g)?.length ?? 0;
  const traditionalHints = text.match(/[這後發國雲體臺萬與門術級]/g)?.length ?? 0;
  return traditionalHints >= simplifiedHints ? 'zh-TW' : 'zh-CN';
}

function detectCjkFallback(text: string): { code: string; confidence: number } | null {
  const cjkMatches = text.match(CJK_RE);
  if (!cjkMatches || cjkMatches.length < 4) return null;

  const cjkRatio = cjkMatches.length / text.replace(/\s/g, '').length;
  if (cjkRatio < 0.3) return null;

  const hanCount = cjkMatches.filter((char) => char.charCodeAt(0) >= 0x4e00).length;
  const kanaCount = cjkMatches.filter((char) => {
    const codePoint = char.charCodeAt(0);
    return (codePoint >= 0x3040 && codePoint <= 0x309f)
      || (codePoint >= 0x30a0 && codePoint <= 0x30ff);
  }).length;
  const hangulCount = cjkMatches.filter((char) => char.charCodeAt(0) >= 0xac00 && char.charCodeAt(0) <= 0xd7af).length;

  if (hangulCount > hanCount && hangulCount > kanaCount) return { code: 'ko', confidence: 0.9 };
  if (kanaCount > hanCount * 0.3) return { code: 'ja', confidence: 0.9 };
  return { code: detectChineseVariant(text), confidence: 0.9 };
}

export function detectLanguageCode(text: string): { code: string; confidence: number } | null {
  const hasCjk = CJK_RE.test(text);
  CJK_RE.lastIndex = 0;
  const minLength = hasCjk ? 6 : 30;

  const candidates = francAll(text, { minLength });
  if (candidates.length > 0) {
    const [bestIso, bestScore] = candidates[0];
    if (bestIso && bestIso !== 'und') {
      const secondScore = candidates[1]?.[1] ?? 0;
      const confidence = Number.isFinite(bestScore) ? bestScore : 0;
      const margin = confidence - secondScore;
      if (confidence >= DETECT_MIN_CONFIDENCE && margin >= DETECT_MIN_MARGIN) {
        const mapped = ISO3_TO_LANGUAGE_CODE[bestIso];
        if (mapped) {
          if (mapped === 'zh') return { code: detectChineseVariant(text), confidence };
          return { code: mapped, confidence };
        }
      }
    }
  }

  return detectCjkFallback(text);
}

export function createSessionId(): string {
  return `audio-director-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function cloneSettings(settings: AudioGuideSettings): AudioGuideSettings {
  return JSON.parse(JSON.stringify(settings)) as AudioGuideSettings;
}

export function readLocalStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeLocalStorage(key: string, value: unknown) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota and privacy mode failures.
  }
}

export function readStoredAudioDirectorDraft(): AudioDirectorDraft | null {
  const current = readLocalStorage<AudioDirectorDraft | null>(AUDIO_DIRECTOR_DRAFT_STORAGE_KEY, null);
  if (current) return normalizeAudioDirectorDraft(current);

  const legacyAudioDirector = readLocalStorage<AudioDirectorDraft | null>(LEGACY_AUDIO_DIRECTOR_DRAFT_STORAGE_KEY, null);
  if (legacyAudioDirector) {
    return normalizeAudioDirectorDraft(legacyAudioDirector, { dropScriptBoundState: true });
  }

  return normalizeAudioDirectorDraft(
    readLocalStorage<AudioDirectorDraft | null>(LEGACY_AUDIO_MVP2_DRAFT_STORAGE_KEY, null),
    { dropScriptBoundState: true },
  );
}

function normalizeAudioDirectorDraft(
  raw: unknown,
  options: { dropScriptBoundState?: boolean } = {},
): AudioDirectorDraft | null {
  if (typeof raw !== 'object' || raw === null) return null;

  const value = raw as Partial<AudioDirectorDraft>;
  const defaultSettings = {
    contentVersion: 'standard',
    characterId: PRESET_AUDIO_CHARACTERS[0].id,
    voiceId: PRESET_AUDIO_CHARACTERS[0].recommendedVoiceId ?? AUDIO_MVP_VOICES[0].id,
    scriptEnhancementLimit: 'none',
    directorNote: {
      scene: '',
      style: '',
      pacing: '',
      compiledPromptOverride: '',
      isPromptCustomized: false,
    },
  } satisfies AudioGuideSettings;
  const normalizedGlobalSettings = normalizeAudioGuideSettings(value.globalSettings, defaultSettings);
  const globalSettings = value.scriptEnhancementEnabled === true
    && normalizedGlobalSettings.scriptEnhancementLimit === 'none'
    ? {
      ...normalizedGlobalSettings,
      scriptEnhancementLimit: 'light' as const,
    }
    : normalizedGlobalSettings;
  const dropScriptBoundState = options.dropScriptBoundState === true;
  const manuscriptText = typeof value.manuscriptText === 'string' ? value.manuscriptText : '';
  const normalizedItems = dropScriptBoundState
    ? []
    : Array.isArray(value.items)
      ? value.items
        .map((item) => normalizeAudioPoiDraft(item, globalSettings))
        .filter((item): item is AudioPoiDraft => Boolean(item))
      : [];

  return {
    manuscriptText,
    sessionId: dropScriptBoundState ? null : typeof value.sessionId === 'string' ? value.sessionId : null,
    coreLanguage: typeof value.coreLanguage === 'string' ? value.coreLanguage : 'en',
    scriptEnhancementEnabled: globalSettings.scriptEnhancementLimit !== 'none',
    globalSettings,
    items: normalizedItems,
    customCharacters: Array.isArray(value.customCharacters)
      ? value.customCharacters
        .map(normalizeAudioMvpCharacter)
        .filter((item): item is AudioMvpCharacter => Boolean(item))
      : [],
    enhancementCache: !dropScriptBoundState && value.enhancementCache && typeof value.enhancementCache === 'object'
      ? value.enhancementCache
      : {},
    readingAssistCache: !dropScriptBoundState && value.readingAssistCache && typeof value.readingAssistCache === 'object'
      ? value.readingAssistCache
      : {},
    generationHistory: !dropScriptBoundState && Array.isArray(value.generationHistory)
      ? value.generationHistory
      : [],
  };
}

function downloadBlob(filename: string, blob: Blob) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(objectUrl);
}

export function downloadJson(filename: string, payload: unknown) {
  downloadBlob(
    filename,
    new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' }),
  );
}

export function downloadTextFile(filename: string, content: string, mimeType: string) {
  downloadBlob(filename, new Blob([content], { type: mimeType }));
}

export function buildGenerationStateKey(language: string, spotId: string): string {
  return `${language}::${spotId}`;
}

export function createEmptyValidation(): ScriptEnhancementValidation {
  return {
    isValid: true,
    totalTags: 0,
    issues: [],
  };
}

export function estimateEnhancementTokens(items: AudioPoiDraft[], languageCount: number): number {
  const base = items.reduce((sum, item) => sum + Math.ceil(item.scriptText.length / 3.6), 0);
  return base * Math.max(languageCount, 1);
}

function withCacheBust(url: string, value: string | number): string {
  if (!url) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}v=${encodeURIComponent(String(value))}`;
}

export function upsertLanguageAudio(
  previous: LanguageAudio[],
  language: string,
  item: AudioGenerateLanguageResponse['audioFiles'][number],
): LanguageAudio[] {
  if (!item.audioUrl) return previous;
  const rawItem = item as Record<string, unknown>;
  const cacheBustedUrl = withCacheBust(item.audioUrl, `${Date.now()}-${item.spotId}`);
  const existingIndex = previous.findIndex((entry) => entry.lang === language);
  const nextSpot = {
    spotId: item.spotId,
    spotNumber: item.spotNumber,
    title: item.title,
    audioUrl: cacheBustedUrl,
    durationMs: item.durationMs,
    scriptText: typeof rawItem.scriptText === 'string' ? rawItem.scriptText : undefined,
    versionId: typeof rawItem.versionId === 'string' ? rawItem.versionId : undefined,
    storagePath: typeof rawItem.storagePath === 'string' ? rawItem.storagePath : undefined,
    guideId: typeof rawItem.guideId === 'string' ? rawItem.guideId : undefined,
    lang: typeof rawItem.lang === 'string' ? rawItem.lang : language,
    generatedAtMs: typeof rawItem.generatedAtMs === 'number' ? rawItem.generatedAtMs : Date.now(),
    isActiveVersion: typeof rawItem.isActiveVersion === 'boolean' ? rawItem.isActiveVersion : undefined,
    isLatestVersion: typeof rawItem.isLatestVersion === 'boolean' ? rawItem.isLatestVersion : undefined,
  };

  if (existingIndex < 0) {
    return [
      ...previous,
      {
        lang: language,
        label: langLabel(language),
        audioUrl: nextSpot.audioUrl,
        durationMs: nextSpot.durationMs,
        approved: false,
        spots: [nextSpot],
      },
    ];
  }

  const existing = previous[existingIndex];
  const mergedSpots = [
    ...(existing.spots ?? []).filter((spot) => spot.spotId !== nextSpot.spotId),
    nextSpot,
  ].sort((left, right) => left.spotNumber - right.spotNumber);

  const updated = [...previous];
  updated[existingIndex] = {
    ...existing,
    audioUrl: mergedSpots[0]?.audioUrl ?? existing.audioUrl,
    durationMs: mergedSpots.reduce((sum, spot) => sum + spot.durationMs, 0),
    spots: mergedSpots,
  };
  return updated;
}

export function upsertLanguageSrt(
  previous: LanguageSRT[],
  language: string,
  item: AudioGenerateLanguageResponse['srtFiles'][number],
): LanguageSRT[] {
  const existingIndex = previous.findIndex((entry) => entry.lang === language);
  const nextSegment: LanguageSRT = {
    lang: language,
    label: langLabel(language),
    entries: item.entries,
    rawSrt: item.rawSrt,
  };

  if (existingIndex < 0) {
    return [...previous, nextSegment];
  }

  const updated = [...previous];
  updated[existingIndex] = nextSegment;
  return updated;
}

export function preprocessScriptForLanguage(language: string, text: string): {
  processedText: string;
  preprocessingNotes: string[];
} {
  const trimmed = text.trim();
  if (language === 'ja') {
    return {
      processedText: trimmed.replace(/[—–]/g, '、').replace(/\s+/g, ' '),
      preprocessingNotes: ['Japanese punctuation normalization applied before TTS submission.'],
    };
  }
  if (language.startsWith('zh')) {
    return {
      processedText: trimmed
        .replace(/\(/g, '（')
        .replace(/\)/g, '）')
        .replace(/Museum/gi, 'museum'),
      preprocessingNotes: ['Chinese terminology normalization applied before TTS submission.'],
    };
  }
  return {
    processedText: trimmed,
    preprocessingNotes: [],
  };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}
