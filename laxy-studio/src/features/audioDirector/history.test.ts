import { describe, expect, it } from 'vitest';
import {
  buildAudioDirectorHistoryUrl,
  buildGenerationHistoryFromVersions,
  extractScriptText,
  mapAudioTrackSummary,
  readAudioHistoryTarget,
  sortHistoryVersions,
  type AudioHistoryVersionRecord,
} from './history';

describe('audio director history helpers', () => {
  it('builds launcher urls with history query params', () => {
    expect(buildAudioDirectorHistoryUrl({
      basePath: '/audio-director',
      target: {
        tenantId: 'tenant-a',
        guideId: 'guide-1',
        guideTitle: 'National Museum Tour',
        spotId: 'spot-2',
        spotTitle: 'Main Hall',
        lang: 'ja',
        launchId: 'launch-1',
      },
      cacheBust: 123,
    })).toBe('/audio-director?screen=audio-production&source=tts&guideId=guide-1&spotId=spot-2&lang=ja&tenantId=tenant-a&guideTitle=National+Museum+Tour&spotTitle=Main+Hall&launchId=launch-1&ts=123');
  });

  it('omits tenantId from launcher urls when no tenant claim is available', () => {
    expect(buildAudioDirectorHistoryUrl({
      basePath: '/audio-director',
      target: {
        guideId: 'guide-1',
        spotId: 'spot-2',
        lang: 'ja',
      },
      cacheBust: 123,
    })).toBe('/audio-director?screen=audio-production&source=tts&guideId=guide-1&spotId=spot-2&lang=ja&ts=123');
  });

  it('extracts script text from version snapshots', () => {
    expect(extractScriptText({ scriptText: 'hello' })).toBe('hello');
    expect(extractScriptText({ text: 'world' })).toBe('world');
    expect(extractScriptText('raw text')).toBe('raw text');
  });

  it('reads spot titles back from iframe query params', () => {
    expect(readAudioHistoryTarget(new URLSearchParams(
      'guideId=guide-1&spotId=spot-2&lang=ja&guideTitle=National+Museum+Tour&spotTitle=Main+Hall&launchId=launch-1',
    ))).toEqual({
      guideId: 'guide-1',
      spotId: 'spot-2',
      lang: 'ja',
      guideTitle: 'National Museum Tour',
      spotTitle: 'Main Hall',
      tenantId: undefined,
      launchId: 'launch-1',
    });
  });

  it('maps track summaries from Firestore-like data', () => {
    expect(mapAudioTrackSummary({
      guideId: 'guide-1',
      docId: 'spot-1_en',
      data: {
        spotId: 'spot-1',
        lang: 'en',
        spotTitle: 'Entrance',
        activeVersionId: 'v1',
        latestVersionId: 'v2',
        latestGeneratedAt: 100,
      },
    })).toEqual({
      id: 'spot-1_en',
      guideId: 'guide-1',
      spotId: 'spot-1',
      lang: 'en',
      spotTitle: 'Entrance',
      activeVersionId: 'v1',
      latestVersionId: 'v2',
      latestGeneratedAt: 100,
      hasGeneratedAudio: true,
    });
  });

  it('marks placeholder summaries that do not have versions yet', () => {
    expect(mapAudioTrackSummary({
      guideId: 'guide-1',
      docId: 'spot-1_en',
      data: {
        spotId: 'spot-1',
        lang: 'en',
        spotTitle: 'Entrance',
        latestGeneratedAt: 0,
        hasGeneratedAudio: false,
      },
    })).toEqual({
      id: 'spot-1_en',
      guideId: 'guide-1',
      spotId: 'spot-1',
      lang: 'en',
      spotTitle: 'Entrance',
      latestGeneratedAt: 0,
      hasGeneratedAudio: false,
    });
  });

  it('falls back when persisted spot titles contain placeholder strings', () => {
    expect(mapAudioTrackSummary({
      guideId: 'guide-1',
      docId: 'spot-1_en',
      data: {
        spotId: 'spot-1',
        lang: 'en',
        spotTitle: 'None',
        latestGeneratedAt: 0,
        hasGeneratedAudio: false,
      },
    })).toEqual({
      id: 'spot-1_en',
      guideId: 'guide-1',
      spotId: 'spot-1',
      lang: 'en',
      spotTitle: 'spot-1',
      latestGeneratedAt: 0,
      hasGeneratedAudio: false,
    });
  });

  it('sorts active versions first and builds result rows', () => {
    const records: AudioHistoryVersionRecord[] = [
      {
        versionId: 'v2',
        runId: 'run-2',
        guideId: 'guide-1',
        spotId: 'spot-1',
        lang: 'en',
        spotTitle: 'Entrance',
        audioUrl: 'https://cdn/v2.mp3',
        storagePath: 'audio/guide-1/spot-1/en/v2.mp3',
        scriptText: 'Latest script',
        generatedAt: 200,
        durationMs: 2000,
        isActiveVersion: false,
        isLatestVersion: true,
      },
      {
        versionId: 'v1',
        runId: 'run-1',
        guideId: 'guide-1',
        spotId: 'spot-1',
        lang: 'en',
        spotTitle: 'Entrance',
        audioUrl: 'https://cdn/v1.mp3',
        storagePath: 'audio/guide-1/spot-1/en/v1.mp3',
        scriptText: 'Active script',
        generatedAt: 100,
        durationMs: 1500,
        isActiveVersion: true,
        isLatestVersion: false,
      },
    ];

    expect(sortHistoryVersions(records).map((record) => record.versionId)).toEqual(['v1', 'v2']);

    const history = buildGenerationHistoryFromVersions(records);
    expect(history).toHaveLength(2);
    expect(history[0].audioFiles[0].spots?.[0]).toMatchObject({
      versionId: 'v1',
      storagePath: 'audio/guide-1/spot-1/en/v1.mp3',
      scriptText: 'Active script',
      isActiveVersion: true,
    });
  });
});
