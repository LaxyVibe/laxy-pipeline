import { z } from 'zod';

export const PIPELINE_API_VERSION = 'v1' as const;

export const PIPELINE_STEP_IDS = {
  s2_ocr_parse: 's2_ocr_parse',
  s1_metadata_extract: 's1_metadata_extract',
  hg1_data_review: 'hg1_data_review',
  s4_script_gen: 's4_script_gen',
  s5_image_map: 's5_image_map',
  hg3_script_review: 'hg3_script_review',
  s6_translation: 's6_translation',
  hg4_translation_review: 'hg4_translation_review',
  n5_character_select: 'n5_character_select',
  s7_voice_recommend: 's7_voice_recommend',
  s8_director_note: 's8_director_note',
  s9_audio_gen: 's9_audio_gen',
  n6_audio_qa: 'n6_audio_qa',
  hg5_audio_review: 'hg5_audio_review',
  n8_generation_history: 'n8_generation_history',
  s10_srt_gen: 's10_srt_gen',
  pipeline_complete: 'pipeline_complete',
} as const;

export type PipelineStepId = (typeof PIPELINE_STEP_IDS)[keyof typeof PIPELINE_STEP_IDS];

export const PipelineStepSchema = z.object({
  stepId: z.string().min(1),
  label: z.string().min(1),
  status: z.enum(['FINISHED', 'STOPPED', 'RUNNING', 'ERROR']),
  output: z.unknown().nullable().optional(),
});

export const PipelineResponseSchema = z.object({
  apiVersion: z.string().optional(),
  sessionId: z.string().min(1),
  checkpointId: z.string().nullable().optional(),
  steps: z.array(PipelineStepSchema).default([]),
  finalText: z.string().nullable().optional(),
  status: z.string().optional(),
});

export type ContractPipelineResponse = z.infer<typeof PipelineResponseSchema>;

export function parsePipelineResponse(payload: unknown): ContractPipelineResponse {
  const parsed = PipelineResponseSchema.parse(payload);
  return {
    ...parsed,
    apiVersion: parsed.apiVersion ?? PIPELINE_API_VERSION,
  };
}

const AudioFileResultSchema = z.object({
  lang: z.string().min(1),
  spotId: z.string().min(1),
  spotNumber: z.number().optional(),
  title: z.string().optional(),
  audioUrl: z.string(),
  durationMs: z.number(),
  voiceId: z.string().optional(),
  model: z.string().optional(),
  error: z.string().optional(),
});

const SrtEntrySchema = z.object({
  index: z.number(),
  startTime: z.string(),
  endTime: z.string(),
  text: z.string(),
});

const SrtFileResultSchema = z.object({
  lang: z.string().min(1),
  spotId: z.string().min(1),
  entries: z.array(SrtEntrySchema),
  rawSrt: z.string(),
});

export const AudioGenerateResponseSchema = z.object({
  success: z.boolean(),
  audioFiles: z.array(AudioFileResultSchema),
  srtFiles: z.array(SrtFileResultSchema),
  totalAudioFiles: z.number(),
  totalSrtFiles: z.number(),
  error: z.string().optional(),
});

export type ContractAudioGenerateResponse = z.infer<typeof AudioGenerateResponseSchema>;

export function parseAudioGenerateResponse(payload: unknown): ContractAudioGenerateResponse {
  return AudioGenerateResponseSchema.parse(payload);
}

const AudioGenerateLanguageFileSchema = z.object({
  lang: z.string().min(1),
  spotId: z.string().min(1),
  spotNumber: z.number(),
  title: z.string(),
  audioUrl: z.string(),
  durationMs: z.number(),
  voiceId: z.string().optional(),
  model: z.string().optional(),
  error: z.string().optional(),
});

const AudioGenerateLanguageSrtSchema = z.object({
  lang: z.string().min(1),
  spotId: z.string().min(1),
  entries: z.array(SrtEntrySchema),
  rawSrt: z.string(),
});

export const AudioGenerateLanguageResponseSchema = z.object({
  lang: z.string().min(1),
  audioFiles: z.array(AudioGenerateLanguageFileSchema),
  srtFiles: z.array(AudioGenerateLanguageSrtSchema),
});

export type ContractAudioGenerateLanguageResponse = z.infer<typeof AudioGenerateLanguageResponseSchema>;

export function parseAudioGenerateLanguageResponse(payload: unknown): ContractAudioGenerateLanguageResponse {
  return AudioGenerateLanguageResponseSchema.parse(payload);
}

const SpotTranslationSchema = z.object({
  spotId: z.string().min(1),
  spotNumber: z.number(),
  title: z.string(),
  originalText: z.string(),
  translatedText: z.string(),
});

export const LanguageTranslationResponseSchema = z.object({
  lang: z.string().min(1),
  label: z.string().min(1),
  spots: z.array(SpotTranslationSchema),
  approved: z.boolean(),
});

export type ContractLanguageTranslationResponse = z.infer<typeof LanguageTranslationResponseSchema>;

export function parseLanguageTranslationResponse(payload: unknown): ContractLanguageTranslationResponse {
  return LanguageTranslationResponseSchema.parse(payload);
}

export const PublishGuideResponseSchema = z.object({
  success: z.boolean(),
  publishId: z.string().min(1),
  status: z.enum(['processing', 'published', 'failed']),
  guideUrl: z.string().min(1),
  shortUrl: z.string().min(1),
  slug: z.string().min(1),
  qrDataUrl: z.string().min(1),
  publishedAt: z.number(),
  retryable: z.boolean().optional(),
  attempts: z.number().int().positive().optional(),
  maxAttempts: z.number().int().positive().optional(),
});

export type ContractPublishGuideResponse = z.infer<typeof PublishGuideResponseSchema>;

export function parsePublishGuideResponse(payload: unknown): ContractPublishGuideResponse {
  return PublishGuideResponseSchema.parse(payload);
}
