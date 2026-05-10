import type {
  AudioGenerateLanguageRequest,
  AudioGenerateLanguageResponse,
} from '../api';
import {
  langLabel,
  type DirectorNote,
  type LanguageAudio,
  type LanguageSRT,
  type PronunciationMarker,
  type SRTEntry,
  type SpotScript,
  type LanguageTranslation,
  type SpotAudioFile,
} from '../types/entity';

export type AudioProgressStatus = 'pending' | 'generating' | 'done' | 'error';

export type AudioProgressMap = Record<string, {
  status: AudioProgressStatus;
  error?: string;
}>;

export function createInitialAudioProgress(languages: string[]): AudioProgressMap {
  const progress: AudioProgressMap = {};
  languages.forEach((language) => {
    progress[language] = { status: 'pending' };
  });
  return progress;
}

export function buildAudioScriptPayload(
  scripts: SpotScript[],
): AudioGenerateLanguageRequest['scripts'] {
  return scripts.map((script) => ({
    spotId: script.spotId,
    spotNumber: script.spotNumber,
    title: script.title,
    scriptText: script.scriptText,
  }));
}

export function buildTranslationsByLanguage(
  translations: LanguageTranslation[],
  coreLanguage: string,
): Record<string, Array<{ spotId: string; translatedText: string }>> {
  const map: Record<string, Array<{ spotId: string; translatedText: string }>> = {};
  translations
    .filter((translation) => translation.lang !== coreLanguage)
    .forEach((translation) => {
      map[translation.lang] = translation.spots.map((spot) => ({
        spotId: spot.spotId,
        translatedText: spot.translatedText,
      }));
    });
  return map;
}

export function buildDirectorNotePayload(
  directorNote: DirectorNote,
): NonNullable<AudioGenerateLanguageRequest['directorNote']> {
  return {
    scene: directorNote.scene || '',
    style: directorNote.style || '',
    pacing: directorNote.pacing || '',
    compiledPrompt: directorNote.compiledPrompt || '',
    contentVersion: directorNote.contentVersion || '',
    scriptEnhancementLimit: directorNote.scriptEnhancementLimit || '',
  };
}

function aggregateLanguageAudioResult(
  language: string,
  response: AudioGenerateLanguageResponse,
): {
  audio?: LanguageAudio;
  srt?: LanguageSRT;
} {
  const spotAudios: SpotAudioFile[] = [];
  let firstUrl = '';
  let totalDuration = 0;

  for (const audioFile of response.audioFiles) {
    if (audioFile.audioUrl) {
      if (!firstUrl) firstUrl = audioFile.audioUrl;
      spotAudios.push({
        spotId: audioFile.spotId,
        spotNumber: audioFile.spotNumber,
        title: audioFile.title,
        audioUrl: audioFile.audioUrl,
        durationMs: audioFile.durationMs,
      });
    }
    totalDuration += audioFile.durationMs;
  }

  const entries: SRTEntry[] = [];
  let rawSrt = '';
  for (const srtFile of response.srtFiles) {
    const offset = entries.length;
    for (const entry of srtFile.entries) {
      entries.push({
        index: entry.index + offset,
        startTime: entry.startTime,
        endTime: entry.endTime,
        text: entry.text,
      });
    }
    rawSrt += (rawSrt ? '\n' : '') + srtFile.rawSrt;
  }

  return {
    audio: firstUrl
      ? {
        lang: language,
        label: langLabel(language),
        audioUrl: firstUrl,
        durationMs: totalDuration,
        approved: false,
        spots: spotAudios,
      }
      : undefined,
    srt: entries.length > 0
      ? {
        lang: language,
        label: langLabel(language),
        entries,
        rawSrt,
      }
      : undefined,
  };
}

function extractLanguageError(response: AudioGenerateLanguageResponse): string | null {
  const messages = response.audioFiles
    .map((audioFile) => audioFile.error?.trim())
    .filter((message): message is string => Boolean(message));
  if (messages.length === 0) return null;
  return Array.from(new Set(messages)).join(' | ');
}

export async function generateAudioInParallel(args: {
  languages: string[];
  sessionId: string;
  scripts: AudioGenerateLanguageRequest['scripts'];
  voiceId: string;
  directorNote: NonNullable<AudioGenerateLanguageRequest['directorNote']>;
  translationsByLanguage?: Record<string, Array<{ spotId: string; translatedText: string }>>;
  generate: (request: AudioGenerateLanguageRequest) => Promise<AudioGenerateLanguageResponse>;
  onProgress?: (language: string, update: { status: AudioProgressStatus; error?: string }) => void;
}): Promise<{
  audioFiles: LanguageAudio[];
  srtFiles: LanguageSRT[];
  errors: Record<string, string>;
}> {
  type AudioGenerateSuccess = {
    language: string;
    result: AudioGenerateLanguageResponse;
  };
  type AudioGenerateFailure = {
    language: string;
    error: string;
  };

  const {
    languages,
    sessionId,
    scripts,
    voiceId,
    directorNote,
    translationsByLanguage,
    generate,
    onProgress,
  } = args;

  const settled: Array<AudioGenerateSuccess | AudioGenerateFailure> = await Promise.all(
    languages.map(async (language): Promise<AudioGenerateSuccess | AudioGenerateFailure> => {
      onProgress?.(language, { status: 'generating' });
      try {
        const result = await generate({
          sessionId,
          scripts,
          voiceId,
          language,
          directorNote,
          translations: translationsByLanguage?.[language],
        });
        onProgress?.(language, { status: 'done' });
        return {
          language,
          result,
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Error';
        onProgress?.(language, { status: 'error', error: message });
        return {
          language,
          error: message,
        };
      }
    }),
  );

  const audioFiles: LanguageAudio[] = [];
  const srtFiles: LanguageSRT[] = [];
  const errors: Record<string, string> = {};

  for (const item of settled) {
    if ('result' in item) {
      const aggregated = aggregateLanguageAudioResult(item.language, item.result);
      if (aggregated.audio) audioFiles.push(aggregated.audio);
      if (aggregated.srt) srtFiles.push(aggregated.srt);
      if (!aggregated.audio) {
        const languageError = extractLanguageError(item.result);
        if (languageError) {
          errors[item.language] = languageError;
        }
      }
    } else {
      errors[item.language] = item.error;
    }
  }

  return {
    audioFiles,
    srtFiles,
    errors,
  };
}

export function buildAudioGateApprovalPayload(args: {
  audioFiles: LanguageAudio[];
  pronunciationMarkers: PronunciationMarker[];
  selectedCharacterId: string | null;
  selectedVoiceId: string | null;
  directorNote: DirectorNote;
}): {
  approvedLanguages: string[];
  rejectedLanguages: string[];
  pronunciationMarkers: PronunciationMarker[];
  characterId: string | null;
  voiceId: string | null;
  directorNote: DirectorNote;
} {
  const {
    audioFiles,
    pronunciationMarkers,
    selectedCharacterId,
    selectedVoiceId,
    directorNote,
  } = args;

  return {
    approvedLanguages: audioFiles
      .filter((audio) => audio.approved)
      .map((audio) => audio.lang),
    rejectedLanguages: audioFiles
      .filter((audio) => !audio.approved)
      .map((audio) => audio.lang),
    pronunciationMarkers,
    characterId: selectedCharacterId,
    voiceId: selectedVoiceId,
    directorNote,
  };
}
