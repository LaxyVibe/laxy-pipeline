import { describe, expect, it } from 'vitest';
import {
  parseAudioGenerateLanguageResponse,
  parseAudioGenerateResponse,
  parseLanguageTranslationResponse,
  parsePipelineResponse,
  parsePublishGuideResponse,
  PIPELINE_API_VERSION,
  PIPELINE_STEP_IDS,
} from './pipeline';

describe('parsePipelineResponse', () => {
  it('fills default apiVersion when missing', () => {
    const parsed = parsePipelineResponse({
      sessionId: 'sess-1',
      checkpointId: null,
      steps: [],
      status: 'running',
    });

    expect(parsed.apiVersion).toBe(PIPELINE_API_VERSION);
    expect(parsed.sessionId).toBe('sess-1');
  });

  it('throws when a step is missing stepId', () => {
    expect(() =>
      parsePipelineResponse({
        sessionId: 'sess-2',
        steps: [
          {
            label: 'S2: OCR Parse (Gemini)',
            status: 'FINISHED',
            output: null,
          },
        ],
      }),
    ).toThrow();
  });

  it('accepts all canonical pipeline step IDs', () => {
    const steps = Object.values(PIPELINE_STEP_IDS).map((stepId) => ({
      stepId,
      label: stepId,
      status: 'FINISHED' as const,
      output: null,
    }));

    const parsed = parsePipelineResponse({
      sessionId: 'sess-3',
      checkpointId: null,
      steps,
      status: 'completed',
    });

    expect(parsed.steps).toHaveLength(Object.values(PIPELINE_STEP_IDS).length);
    expect(parsed.steps.map((s) => s.stepId)).toEqual(Object.values(PIPELINE_STEP_IDS));
  });
});

describe('audio and translation contracts', () => {
  it('parses valid audio generation response', () => {
    const parsed = parseAudioGenerateResponse({
      success: true,
      audioFiles: [
        {
          lang: 'en',
          spotId: 'spot_001',
          spotNumber: 1,
          title: 'Entrance',
          audioUrl: 'https://cdn/en/spot1.wav',
          durationMs: 1000,
        },
      ],
      srtFiles: [
        {
          lang: 'en',
          spotId: 'spot_001',
          entries: [{ index: 1, startTime: '00:00:00,000', endTime: '00:00:01,000', text: 'Hello' }],
          rawSrt: '1\\n00:00:00,000 --> 00:00:01,000\\nHello',
        },
      ],
      totalAudioFiles: 1,
      totalSrtFiles: 1,
    });

    expect(parsed.success).toBe(true);
    expect(parsed.audioFiles).toHaveLength(1);
  });

  it('rejects invalid audio generation response', () => {
    expect(() =>
      parseAudioGenerateResponse({
        success: true,
        audioFiles: [{ lang: 'en', spotId: 'spot_001', audioUrl: 'x', durationMs: 1000 }],
        srtFiles: [],
        totalAudioFiles: 1,
      }),
    ).toThrow();
  });

  it('parses valid per-language audio response', () => {
    const parsed = parseAudioGenerateLanguageResponse({
      lang: 'en',
      audioFiles: [
        {
          lang: 'en',
          spotId: 'spot_001',
          spotNumber: 1,
          title: 'Entrance',
          audioUrl: 'https://cdn/en/spot1.wav',
          durationMs: 1000,
        },
      ],
      srtFiles: [],
    });

    expect(parsed.lang).toBe('en');
    expect(parsed.audioFiles[0].spotNumber).toBe(1);
  });

  it('parses valid language translation response', () => {
    const parsed = parseLanguageTranslationResponse({
      lang: 'ja',
      label: 'Japanese',
      approved: false,
      spots: [
        {
          spotId: 'spot_001',
          spotNumber: 1,
          title: 'Entrance',
          originalText: 'Hello',
          translatedText: 'こんにちは',
        },
      ],
    });

    expect(parsed.lang).toBe('ja');
    expect(parsed.spots).toHaveLength(1);
  });

  it('parses valid publish response', () => {
    const parsed = parsePublishGuideResponse({
      success: true,
      publishId: 'pub-1',
      status: 'published',
      guideUrl: 'https://guide.laxy.app/g/test',
      shortUrl: 'https://laxy.click/test',
      slug: 'test',
      qrDataUrl: 'data:image/svg+xml;base64,PHN2Zy8+',
      publishedAt: 1710000000000,
      retryable: false,
      attempts: 1,
      maxAttempts: 3,
    });

    expect(parsed.publishId).toBe('pub-1');
    expect(parsed.status).toBe('published');
  });

  it('rejects invalid publish response shape', () => {
    expect(() =>
      parsePublishGuideResponse({
        success: true,
        publishId: '',
        status: 'published',
      }),
    ).toThrow();
  });
});
