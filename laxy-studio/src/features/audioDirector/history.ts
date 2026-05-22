import { langLabel, type LanguageAudio } from '../../types/entity';
import type { GenerationHistoryEntry } from './types';

export type AudioHistoryTarget = {
  tenantId?: string;
  guideId: string;
  spotId: string;
  lang: string;
  guideTitle?: string;
  spotTitle?: string;
  launchId?: string;
};

export type AudioHistorySelection = {
  guideId?: string;
  spotId?: string;
  lang?: string;
  versionId?: string;
  storagePath?: string;
};

export type AudioTrackSummaryRecord = {
  id: string;
  guideId: string;
  spotId: string;
  lang: string;
  spotTitle: string;
  activeVersionId?: string;
  latestVersionId?: string;
  latestGeneratedAt: number;
  hasGeneratedAudio?: boolean;
  audioDirectorConfig?: StoredAudioDirectorConfig;
  ttsPromptSnapshot?: StoredTtsPromptSnapshot;
};

export type StoredAudioDirectorConfig = {
  voiceId?: string;
  characterId?: string;
  characterName?: string;
  scene?: string;
  detailedSceneParagraph?: string;
  style?: string;
  pacing?: string;
  tone?: string;
  generatedPerformanceGuidelines?: string;
};

export type StoredTtsPromptSnapshot = {
  compiledPrompt: string;
};

type LegacyStoredTtsPromptConfig = StoredAudioDirectorConfig & StoredTtsPromptSnapshot;

export type AudioHistoryVersionRecord = {
  versionId: string;
  runId: string;
  guideId: string;
  spotId: string;
  lang: string;
  spotTitle: string;
  audioUrl: string;
  storagePath?: string;
  scriptText: string;
  generatedAt: number;
  durationMs: number;
  voiceId?: string;
  model?: string;
  isActiveVersion: boolean;
  isLatestVersion: boolean;
};

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readOptionalTitle(value: unknown): string {
  const normalized = readString(value);
  if (!normalized) return '';
  const lower = normalized.toLowerCase();
  if (lower === 'none' || lower === 'null' || lower === 'undefined') {
    return '';
  }
  return normalized;
}

function readNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value && typeof value === 'object' && typeof (value as { toMillis?: unknown }).toMillis === 'function') {
    return Number((value as { toMillis: () => number }).toMillis());
  }
  return 0;
}

function readStoredAudioDirectorConfig(value: unknown): StoredAudioDirectorConfig | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const voiceId = readString(record.voiceId);
  const characterId = readString(record.characterId);
  const characterName = readString(record.characterName);
  const scene = readString(record.scene);
  const detailedSceneParagraph = readString(record.detailedSceneParagraph);
  const style = readString(record.style);
  const pacing = readString(record.pacing);
  const tone = readString(record.tone);
  const generatedPerformanceGuidelines = readString(record.generatedPerformanceGuidelines);

  if (
    !voiceId
    && !characterId
    && !characterName
    && !scene
    && !detailedSceneParagraph
    && !style
    && !pacing
    && !tone
    && !generatedPerformanceGuidelines
  ) {
    return undefined;
  }

  return {
    voiceId: voiceId || undefined,
    characterId: characterId || undefined,
    characterName: characterName || undefined,
    scene: scene || undefined,
    detailedSceneParagraph: detailedSceneParagraph || undefined,
    style: style || undefined,
    pacing: pacing || undefined,
    tone: tone || undefined,
    generatedPerformanceGuidelines: generatedPerformanceGuidelines || undefined,
  };
}

function readStoredTtsPromptSnapshot(value: unknown): StoredTtsPromptSnapshot | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const compiledPrompt = readString(record.compiledPrompt);
  if (!compiledPrompt) return undefined;
  return { compiledPrompt };
}

function readLegacyStoredTtsPromptConfig(value: unknown): LegacyStoredTtsPromptConfig | undefined {
  const snapshot = readStoredTtsPromptSnapshot(value);
  const config = readStoredAudioDirectorConfig(value);
  if (!snapshot && !config) return undefined;
  return {
    compiledPrompt: snapshot?.compiledPrompt ?? '',
    ...config,
  };
}

export function buildAudioTrackDocId(spotId: string, lang: string): string {
  return `${spotId}_${lang}`;
}

export function buildAudioDirectorHistoryUrl(args: {
  basePath: string;
  target: AudioHistoryTarget;
  screen?: string;
  cacheBust?: string | number;
}): string {
  const params = new URLSearchParams({
    screen: args.screen ?? 'audio-production',
    source: 'tts',
    guideId: args.target.guideId,
    spotId: args.target.spotId,
    lang: args.target.lang,
  });
  if (args.target.tenantId) {
    params.set('tenantId', args.target.tenantId);
  }
  if (args.target.guideTitle) {
    params.set('guideTitle', args.target.guideTitle);
  }
  if (args.target.spotTitle) {
    params.set('spotTitle', args.target.spotTitle);
  }
  if (args.target.launchId) {
    params.set('launchId', args.target.launchId);
  }
  if (args.cacheBust != null) {
    params.set('ts', String(args.cacheBust));
  }
  return `${args.basePath}?${params.toString()}`;
}

export function readAudioHistoryTarget(searchParams: URLSearchParams): AudioHistoryTarget | null {
  const tenantId = readString(searchParams.get('tenantId'));
  const guideId = readString(searchParams.get('guideId'));
  const spotId = readString(searchParams.get('spotId'));
  const lang = readString(searchParams.get('lang'));
  const guideTitle = readOptionalTitle(searchParams.get('guideTitle'));
  const spotTitle = readOptionalTitle(searchParams.get('spotTitle'));
  const launchId = readString(searchParams.get('launchId'));
  if (!guideId || !spotId || !lang) {
    return null;
  }
  return {
    tenantId: tenantId || undefined,
    guideId,
    spotId,
    lang,
    guideTitle: guideTitle || undefined,
    spotTitle: spotTitle || undefined,
    launchId: launchId || undefined,
  };
}

export function extractScriptText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (!value || typeof value !== 'object') return '';

  const record = value as Record<string, unknown>;
  return [
    readString(record.scriptText),
    readString(record.text),
    readString(record.content),
    readString(record.transcript),
    readString(record.sourceText),
    readString(record.effectiveText),
  ].find(Boolean) ?? '';
}

export function mapAudioTrackSummary(args: {
  guideId: string;
  docId: string;
  data: Record<string, unknown>;
}): AudioTrackSummaryRecord | null {
  const { guideId, docId, data } = args;
  const spotId = readString(data.spotId) || docId.split('_')[0] || '';
  const lang = readString(data.lang);
  if (!spotId || !lang) return null;
  const legacyPromptConfig = readLegacyStoredTtsPromptConfig(data.ttsPromptConfig);

  return {
    id: docId,
    guideId,
    spotId,
    lang,
    spotTitle: readOptionalTitle(data.spotTitle) || readOptionalTitle(data.title) || spotId,
    activeVersionId: readString(data.activeVersionId) || undefined,
    latestVersionId: readString(data.latestVersionId) || undefined,
    latestGeneratedAt: readNumber(data.latestGeneratedAt) || readNumber(data.updatedAt),
    hasGeneratedAudio:
      typeof data.hasGeneratedAudio === 'boolean'
        ? data.hasGeneratedAudio
        : Boolean(readString(data.activeVersionId) || readString(data.latestVersionId) || readNumber(data.latestGeneratedAt)),
    audioDirectorConfig: readStoredAudioDirectorConfig(data.audioDirectorConfig) ?? (legacyPromptConfig ? {
      voiceId: legacyPromptConfig.voiceId,
      characterId: legacyPromptConfig.characterId,
      characterName: legacyPromptConfig.characterName,
      scene: legacyPromptConfig.scene,
      detailedSceneParagraph: legacyPromptConfig.detailedSceneParagraph,
      style: legacyPromptConfig.style,
      pacing: legacyPromptConfig.pacing,
      tone: legacyPromptConfig.tone,
      generatedPerformanceGuidelines: legacyPromptConfig.generatedPerformanceGuidelines,
    } : undefined),
    ttsPromptSnapshot: readStoredTtsPromptSnapshot(data.ttsPromptSnapshot) ?? (
      legacyPromptConfig?.compiledPrompt
        ? { compiledPrompt: legacyPromptConfig.compiledPrompt }
        : undefined
    ),
  };
}

export function mapAudioHistoryVersion(args: {
  guideId: string;
  target: AudioHistoryTarget;
  summary: AudioTrackSummaryRecord | null;
  docId: string;
  data: Record<string, unknown>;
}): AudioHistoryVersionRecord | null {
  const { guideId, target, summary, docId, data } = args;
  const audioUrl = readString(data.audioUrl) || readString(data.downloadUrl) || readString(data.url);
  if (!audioUrl) return null;

  const versionId = docId;
  const generatedAt = readNumber(data.createdAt) || readNumber(data.generatedAt) || readNumber(data.updatedAt);
  const lang = readString(data.lang) || target.lang;
  const spotId = readString(data.spotId) || target.spotId;

  return {
    versionId,
    runId: readString(data.runId) || versionId,
    guideId,
    spotId,
    lang,
    spotTitle: readOptionalTitle(data.spotTitle) || readOptionalTitle(data.title) || target.spotTitle || summary?.spotTitle || spotId,
    audioUrl,
    storagePath: readString(data.storagePath) || undefined,
    scriptText:
      extractScriptText(data.scriptSnapshot)
      || readString(data.scriptText)
      || readString(data.text)
      || readString(data.transcript),
    generatedAt,
    durationMs: readNumber(data.durationMs) || readNumber(data.activeDurationMs),
    voiceId: readString(data.voiceId) || undefined,
    model: readString(data.model) || readString(data.ttsModel) || undefined,
    isActiveVersion: summary?.activeVersionId === versionId,
    isLatestVersion: summary?.latestVersionId
      ? summary.latestVersionId === versionId
      : generatedAt > 0,
  };
}

export function sortHistoryVersions(records: AudioHistoryVersionRecord[]): AudioHistoryVersionRecord[] {
  return [...records].sort((left, right) => {
    if (left.isActiveVersion !== right.isActiveVersion) {
      return left.isActiveVersion ? -1 : 1;
    }
    return right.generatedAt - left.generatedAt;
  });
}

export function buildGenerationHistoryFromVersions(records: AudioHistoryVersionRecord[]): GenerationHistoryEntry[] {
  return sortHistoryVersions(records).map((record) => {
    const languageAudio: LanguageAudio = {
      lang: record.lang,
      label: langLabel(record.lang),
      audioUrl: record.audioUrl,
      durationMs: record.durationMs,
      approved: false,
      spots: [{
        spotId: record.spotId,
        spotNumber: 1,
        title: record.spotTitle,
        audioUrl: record.audioUrl,
        durationMs: record.durationMs,
        scriptText: record.scriptText,
        versionId: record.versionId,
        storagePath: record.storagePath,
        guideId: record.guideId,
        lang: record.lang,
        generatedAtMs: record.generatedAt,
        isActiveVersion: record.isActiveVersion,
        isLatestVersion: record.isLatestVersion,
      }],
    };

    return {
      runId: record.runId,
      generatedAt: record.generatedAt,
      coreLanguage: record.lang,
      label: record.isActiveVersion ? 'Chosen version' : 'Historical version',
      audioFiles: [languageAudio],
      srtFiles: [],
      itemCount: 1,
    };
  });
}
