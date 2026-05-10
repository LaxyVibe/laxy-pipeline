import type { LanguageTranslation, SpotScript } from '../types/entity';
import type { TranslateLanguageRequest } from '../types/translation';

export type TranslationProgressStatus = 'pending' | 'translating' | 'done' | 'error';

export type TranslationProgressMap = Record<string, {
  status: TranslationProgressStatus;
  error?: string;
}>;

export function getTargetLanguages(
  supportedLanguages: string[],
  coreLanguage: string,
): string[] {
  return supportedLanguages.filter((language) => language !== coreLanguage);
}

export function createInitialTranslationProgress(
  targetLanguages: string[],
): TranslationProgressMap {
  const progress: TranslationProgressMap = {};
  targetLanguages.forEach((language) => {
    progress[language] = { status: 'pending' };
  });
  return progress;
}

export function validateTranslationGenerationInput(args: {
  targetLanguages: string[];
  approvedScripts: SpotScript[];
}): string | null {
  const { targetLanguages, approvedScripts } = args;

  if (targetLanguages.length === 0) {
    return 'No target languages configured. Add additional languages in Entity Setup.';
  }

  if (approvedScripts.length === 0) {
    return 'No approved scripts to translate.';
  }

  return null;
}

export function buildTranslationGateApprovalPayload(
  translations: LanguageTranslation[],
): {
  approvedLanguages: string[];
  rejectedLanguages: string[];
  editedTranslations: Array<{ lang: string; spots: Array<{ spotId: string; translatedText: string }> }>;
} {
  return {
    approvedLanguages: translations
      .filter((translation) => translation.approved)
      .map((translation) => translation.lang),
    rejectedLanguages: translations
      .filter((translation) => !translation.approved)
      .map((translation) => translation.lang),
    editedTranslations: translations.map((translation) => ({
      lang: translation.lang,
      spots: translation.spots.map((spot) => ({
        spotId: spot.spotId,
        translatedText: spot.translatedText,
      })),
    })),
  };
}

function toTranslationScriptPayload(
  approvedScripts: SpotScript[],
): TranslateLanguageRequest['scripts'] {
  return approvedScripts.map((script) => ({
    spotId: script.spotId,
    spotNumber: script.spotNumber,
    title: script.title,
    scriptText: script.scriptText,
  }));
}

export async function generateTranslationsInParallel(args: {
  targetLanguages: string[];
  coreLanguage: string;
  approvedScripts: SpotScript[];
  translate: (request: TranslateLanguageRequest) => Promise<LanguageTranslation>;
  onProgress?: (language: string, update: { status: TranslationProgressStatus; error?: string }) => void;
}): Promise<{
  translations: LanguageTranslation[];
  errors: Record<string, string>;
}> {
  type TranslationGenerateSuccess = {
    language: string;
    translation: LanguageTranslation;
  };
  type TranslationGenerateFailure = {
    language: string;
    error: string;
  };

  const {
    targetLanguages,
    coreLanguage,
    approvedScripts,
    translate,
    onProgress,
  } = args;

  const scripts = toTranslationScriptPayload(approvedScripts);

  const settled: Array<TranslationGenerateSuccess | TranslationGenerateFailure> = await Promise.all(
    targetLanguages.map(async (language): Promise<TranslationGenerateSuccess | TranslationGenerateFailure> => {
      onProgress?.(language, { status: 'translating' });
      try {
        const result = await translate({
          scripts,
          targetLanguage: language,
          coreLanguage,
        });
        onProgress?.(language, { status: 'done' });
        return {
          language,
          translation: {
            ...result,
            approved: false,
          },
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

  const translations: LanguageTranslation[] = [];
  const errors: Record<string, string> = {};

  for (const item of settled) {
    if ('translation' in item) {
      translations.push(item.translation);
    } else {
      errors[item.language] = item.error;
    }
  }

  return { translations, errors };
}