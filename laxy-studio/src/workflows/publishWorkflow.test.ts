import { describe, expect, it } from 'vitest';
import {
  buildInitialSlideshows,
  buildPublishQuestion,
  buildPublishSessionId,
  derivePublishSlug,
  isPublishReady,
  parsePublishPipelineResult,
} from './publishWorkflow';

describe('publish workflow', () => {
  it('builds initial slideshows from spot mappings', () => {
    const slideshows = buildInitialSlideshows({
      spots: [
        {
          id: 'spot-1',
          spotNumber: 1,
          title: 'Entrance',
          artist: '',
          period: '',
          material: '',
          dimensions: '',
          highlight: '',
          culturalDesignation: '',
          assetIds: [],
        },
      ],
      imageMappings: [
        {
          spotId: 'spot-1',
          assignedAssetIds: ['asset-a', 'asset-b'],
          aiSuggested: true,
        },
      ],
      audioFiles: [
        {
          lang: 'en',
          label: 'English',
          audioUrl: 'https://cdn/en.wav',
          durationMs: 1000,
          approved: true,
        },
      ],
      coreLanguage: 'en',
    });

    expect(slideshows).toHaveLength(1);
    expect(slideshows[0].images).toHaveLength(2);
    expect(slideshows[0].images[0].startSec).toBe(0);
    expect(slideshows[0].images[0].durationSec).toBe(15);
  });

  it('computes publish readiness from stage statuses', () => {
    expect(isPublishReady({
      ingestionStatus: 'approved',
      scriptStatus: 'approved',
      translationStatus: 'approved',
      audioStatus: 'approved',
      supportedLanguages: ['en', 'ja'],
      srtCount: 1,
      slideshows: [{
        spotId: 'spot-1',
        spotNumber: 1,
        title: 'Entrance',
        audioDurationSec: 30,
        images: [{
          assetId: 'asset-a',
          order: 0,
          startSec: 0,
          durationSec: 30,
          caption: '',
        }],
      }],
    })).toBe(true);
  });

  it('builds publish question summary', () => {
    const question = buildPublishQuestion({
      spots: [{
        id: 'spot-1',
        spotNumber: 1,
        title: 'Entrance',
        artist: '',
        period: '',
        material: '',
        dimensions: '',
        highlight: '',
        culturalDesignation: '',
        assetIds: [],
      }],
      imageMappings: [{ spotId: 'spot-1', assignedAssetIds: ['asset-a'], aiSuggested: true }],
      scripts: [{ spotId: 'spot-1' }],
      audioCount: 1,
      srtCount: 1,
      slideshowsCount: 1,
      customSlug: 'my-guide',
      entityConfig: {
        venueName: 'Laxy Museum',
        address: '',
        gps: null,
        mapImageUrl: '',
        coverImageUrl: '',
        website: '',
        phone: '',
        operatingHours: [],
        coreLanguage: 'en',
        supportedLanguages: ['en', 'ja'],
        enabledModules: ['guide'],
        selectedLayout: 'classic',
        itemFields: [],
      },
    });

    expect(question).toContain('[PUBLISH] Guide "Laxy Museum"');
    expect(question).toContain('Custom slug: my-guide');
  });

  it('parses publish pipeline result from step output', () => {
    const parsed = parsePublishPipelineResult({
      apiVersion: 'v1',
      sessionId: 'sess-1',
      steps: [{
        stepId: 'pipeline_complete',
        label: 'Pipeline Complete',
        status: 'FINISHED',
        output: {
          guideUrl: 'https://guide.example.com',
          shortUrl: 'https://laxy.click/x',
          slug: 'museum',
        },
      }],
      status: 'completed',
    });

    expect(parsed).toEqual({
      guideUrl: 'https://guide.example.com',
      shortUrl: 'https://laxy.click/x',
      slug: 'museum',
    });
  });

  it('falls back to finalText JSON parsing when step output missing', () => {
    const parsed = parsePublishPipelineResult({
      apiVersion: 'v1',
      sessionId: 'sess-2',
      steps: [],
      finalText: JSON.stringify({
        url: 'https://guide.example.com/from-text',
        shortUrl: 'https://laxy.click/text',
        slug: 'from-text',
      }),
      status: 'completed',
    });

    expect(parsed.guideUrl).toBe('https://guide.example.com/from-text');
    expect(parsed.shortUrl).toBe('https://laxy.click/text');
    expect(parsed.slug).toBe('from-text');
  });

  it('builds session id and derived slug', () => {
    expect(buildPublishSessionId('Venue', 123)).toBe('publish-Venue-123');
    expect(derivePublishSlug({ pipelineSlug: 'pipeline-slug', customSlug: 'custom', venueName: 'Name' })).toBe('pipeline-slug');
    expect(derivePublishSlug({ customSlug: 'custom', venueName: 'Name' })).toBe('custom');
    expect(derivePublishSlug({ venueName: 'Laxy Museum!!' })).toBe('laxy-museum');
  });
});