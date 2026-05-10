import { describe, expect, it, vi } from 'vitest';
import {
  buildAudioGateApprovalPayload,
  buildAudioScriptPayload,
  buildDirectorNotePayload,
  buildTranslationsByLanguage,
  createInitialAudioProgress,
  generateAudioInParallel,
} from './audioWorkflow';

describe('audio workflow', () => {
  it('builds initial audio progress map', () => {
    expect(createInitialAudioProgress(['en', 'ja'])).toEqual({
      en: { status: 'pending' },
      ja: { status: 'pending' },
    });
  });

  it('builds audio script payload from scripts', () => {
    expect(buildAudioScriptPayload([
      {
        spotId: 'spot-1',
        spotNumber: 1,
        title: 'Entrance',
        scriptText: 'Welcome',
        approved: true,
        fastTrack: false,
      },
    ])).toEqual([
      {
        spotId: 'spot-1',
        spotNumber: 1,
        title: 'Entrance',
        scriptText: 'Welcome',
      },
    ]);
  });

  it('builds translation lookup by language', () => {
    expect(buildTranslationsByLanguage([
      {
        lang: 'ja',
        label: 'Japanese',
        approved: true,
        spots: [{
          spotId: 'spot-1',
          spotNumber: 1,
          title: 'Entrance',
          originalText: 'Hello',
          translatedText: 'こんにちは',
        }],
      },
      {
        lang: 'en',
        label: 'English',
        approved: true,
        spots: [{
          spotId: 'spot-1',
          spotNumber: 1,
          title: 'Entrance',
          originalText: 'Hello',
          translatedText: 'Hello',
        }],
      },
    ], 'en')).toEqual({
      ja: [{ spotId: 'spot-1', translatedText: 'こんにちは' }],
    });
  });

  it('normalizes director note payload', () => {
    expect(buildDirectorNotePayload({
      scene: '',
      style: 'mission',
      pacing: '',
    })).toEqual({
      scene: '',
      style: 'mission',
      pacing: '',
      compiledPrompt: '',
      contentVersion: '',
      scriptEnhancementLimit: '',
    });
  });

  it('generates audio in parallel and aggregates outputs', async () => {
    const updates: string[] = [];

    const generate = vi.fn(async ({ language }: { language: string }) => {
      if (language === 'fr') {
        throw new Error('tts failed');
      }

      return {
        lang: language,
        audioFiles: [
          {
            lang: language,
            spotId: 'spot-1',
            spotNumber: 1,
            title: 'Entrance',
            audioUrl: `https://cdn/${language}/spot1.wav`,
            durationMs: 1200,
          },
        ],
        srtFiles: [
          {
            lang: language,
            spotId: 'spot-1',
            entries: [
              { index: 1, startTime: '00:00:00,000', endTime: '00:00:01,200', text: 'Hello' },
            ],
            rawSrt: '1\\n00:00:00,000 --> 00:00:01,200\\nHello',
          },
        ],
      };
    });

    const result = await generateAudioInParallel({
      languages: ['en', 'fr'],
      sessionId: 'audio-1',
      scripts: [{
        spotId: 'spot-1',
        spotNumber: 1,
        title: 'Entrance',
        scriptText: 'Welcome',
      }],
      voiceId: 'Aoede',
      directorNote: {
        scene: 'gallery',
        style: 'inform',
        pacing: 'moderate',
      },
      translationsByLanguage: {
        fr: [{ spotId: 'spot-1', translatedText: 'Bonjour' }],
      },
      generate,
      onProgress: (language, update) => {
        updates.push(`${language}:${update.status}`);
      },
    });

    expect(result.audioFiles).toHaveLength(1);
    expect(result.audioFiles[0].lang).toBe('en');
    expect(result.srtFiles).toHaveLength(1);
    expect(result.errors).toEqual({ fr: 'tts failed' });
    expect(updates).toContain('en:done');
    expect(updates).toContain('fr:error');
  });

  it('builds gate approval payload from audio review state', () => {
    const payload = buildAudioGateApprovalPayload({
      audioFiles: [
        {
          lang: 'en',
          label: 'English',
          audioUrl: 'https://cdn/en.wav',
          durationMs: 1000,
          approved: true,
        },
        {
          lang: 'ja',
          label: 'Japanese',
          audioUrl: 'https://cdn/ja.wav',
          durationMs: 1000,
          approved: false,
        },
      ],
      pronunciationMarkers: [
        { id: 'm1', timestampSec: 1.2, comment: 'Fix name' },
      ],
      selectedCharacterId: 'char-museum-curator',
      selectedVoiceId: 'Aoede',
      directorNote: {
        scene: 'gallery',
        style: 'inform',
        pacing: 'moderate',
      },
    });

    expect(payload.approvedLanguages).toEqual(['en']);
    expect(payload.rejectedLanguages).toEqual(['ja']);
    expect(payload.characterId).toBe('char-museum-curator');
    expect(payload.voiceId).toBe('Aoede');
    expect(payload.pronunciationMarkers).toHaveLength(1);
  });
});
