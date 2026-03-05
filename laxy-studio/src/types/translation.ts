// Types for per-language translation API

export interface SpotTranslation {
  spotId: string;
  spotNumber: number;
  title: string;
  originalText: string;
  translatedText: string;
}

export interface LanguageTranslation {
  lang: string;
  label: string;
  spots: SpotTranslation[];
  approved: boolean;
}

export interface TranslateLanguageRequest {
  scripts: Array<{
    spotId: string;
    spotNumber: number;
    title: string;
    scriptText: string;
  }>;
  targetLanguage: string;
  coreLanguage: string;
}
