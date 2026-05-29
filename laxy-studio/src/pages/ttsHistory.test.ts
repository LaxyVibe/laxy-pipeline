import { describe, expect, it } from 'vitest';
import type {
  AudioHistoryTarget,
  AudioHistoryVersionRecord,
  AudioTrackSummaryRecord,
} from '../features/audioDirector/history';
import {
  buildTtsJobHistoryRecords,
  resolveTtsHistorySelectedRecordId,
  withoutJobHistoryCacheEntry,
} from './ttsHistory';

describe('tts history helpers', () => {
  const target: AudioHistoryTarget = {
    guideId: 'guide-1',
    spotId: 'spot-1',
    spotTitle: 'Entrance',
    lang: 'en',
  };

  const summary: AudioTrackSummaryRecord = {
    id: 'spot-1_en',
    guideId: 'guide-1',
    spotId: 'spot-1',
    lang: 'en',
    spotTitle: 'Entrance',
    activeVersionId: 'v1',
    latestVersionId: 'v2',
    latestGeneratedAt: 200,
    hasGeneratedAudio: true,
  };

  it('maps version docs, sorts active-first, and skips invalid records', () => {
    const records = buildTtsJobHistoryRecords({
      guideId: 'guide-1',
      target,
      summary,
      versions: [
        {
          docId: 'v2',
          data: {
            audioUrl: 'https://cdn/v2.mp3',
            createdAt: 200,
            scriptSnapshot: { scriptText: 'Latest script' },
            durationMs: 2200,
            voiceId: 'voice-b',
            model: 'gemini-tts',
          },
        },
        {
          docId: 'broken',
          data: {
            createdAt: 250,
          },
        },
        {
          docId: 'v1',
          data: {
            audioUrl: 'https://cdn/v1.mp3',
            createdAt: 100,
            scriptSnapshot: { scriptText: 'Active script' },
            durationMs: 1800,
            voiceId: 'voice-a',
          },
        },
      ],
    });

    expect(records.map((record) => record.versionId)).toEqual(['v1', 'v2']);
    expect(records[0]).toMatchObject({
      versionId: 'v1',
      isActiveVersion: true,
      scriptText: 'Active script',
      voiceId: 'voice-a',
    });
    expect(records[1]).toMatchObject({
      versionId: 'v2',
      isLatestVersion: true,
      scriptText: 'Latest script',
      model: 'gemini-tts',
    });
  });

  it('resolves the selected preview record without mutating row state', () => {
    const records: AudioHistoryVersionRecord[] = [
      {
        versionId: 'v1',
        runId: 'run-1',
        guideId: 'guide-1',
        spotId: 'spot-1',
        lang: 'en',
        spotTitle: 'Entrance',
        audioUrl: 'https://cdn/v1.mp3',
        scriptText: 'Active script',
        generatedAt: 100,
        durationMs: 1800,
        isActiveVersion: true,
        isLatestVersion: false,
      },
      {
        versionId: 'v2',
        runId: 'run-2',
        guideId: 'guide-1',
        spotId: 'spot-1',
        lang: 'en',
        spotTitle: 'Entrance',
        audioUrl: 'https://cdn/v2.mp3',
        scriptText: 'Latest script',
        generatedAt: 200,
        durationMs: 2200,
        isActiveVersion: false,
        isLatestVersion: true,
      },
    ];

    expect(resolveTtsHistorySelectedRecordId(records, null)).toBe('v1');
    expect(resolveTtsHistorySelectedRecordId(records, 'v2')).toBe('v2');
    expect(resolveTtsHistorySelectedRecordId(records, 'missing')).toBe('v1');
    expect(resolveTtsHistorySelectedRecordId([], 'v2')).toBeNull();
  });

  it('invalidates only the requested cached job history entry', () => {
    expect(withoutJobHistoryCacheEntry({
      'spot-1::en': ['v1'],
      'spot-2::ja': ['v3'],
    }, 'spot-1::en')).toEqual({
      'spot-2::ja': ['v3'],
    });
  });
});
