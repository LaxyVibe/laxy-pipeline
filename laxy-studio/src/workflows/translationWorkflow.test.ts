import { describe, expect, it, vi } from 'vitest';
import {
  buildTranslationGateApprovalPayload,
  createInitialTranslationProgress,
  generateTranslationsInParallel,
  getTargetLanguages,
  validateTranslationGenerationInput,
} from './translationWorkflow';

describe('translation workflow', () => {
  it('derives target languages by excluding core language', () => {
    expect(getTargetLanguages(['en', 'ja', 'fr'], 'en')).toEqual(['ja', 'fr']);
  });

  it('builds initial translation progress map', () => {
    expect(createInitialTranslationProgress(['ja', 'fr'])).toEqual({
      ja: { status: 'pending' },
      fr: { status: 'pending' },
    });
  });

  it('validates translation generation inputs', () => {
    expect(validateTranslationGenerationInput({ targetLanguages: [], approvedScripts: [] })).toContain('No target languages');
    expect(validateTranslationGenerationInput({
      targetLanguages: ['ja'],
      approvedScripts: [],
    })).toContain('No approved scripts');
  });

  it('generates translations in parallel and reports per-language progress', async () => {
    const updates: string[] = [];
    const translate = vi.fn(async ({ targetLanguage }: { targetLanguage: string }) => {
      if (targetLanguage === 'fr') {
        throw new Error('translator offline');
      }
      return {
        lang: targetLanguage,
        label: targetLanguage.toUpperCase(),
        approved: true,
        spots: [{
          spotId: 'spot-1',
          spotNumber: 1,
          title: 'Entrance',
          originalText: 'Hello',
          translatedText: 'こんにちは',
        }],
      };
    });

    const result = await generateTranslationsInParallel({
      targetLanguages: ['ja', 'fr'],
      coreLanguage: 'en',
      approvedScripts: [{
        spotId: 'spot-1',
        spotNumber: 1,
        title: 'Entrance',
        scriptText: 'Hello',
        approved: true,
        fastTrack: false,
      }],
      translate,
      onProgress: (language, update) => {
        updates.push(`${language}:${update.status}`);
      },
    });

    expect(result.translations).toHaveLength(1);
    expect(result.translations[0].lang).toBe('ja');
    expect(result.translations[0].approved).toBe(false);
    expect(result.errors).toEqual({ fr: 'translator offline' });
    expect(updates).toContain('ja:translating');
    expect(updates).toContain('ja:done');
    expect(updates).toContain('fr:error');
  });

  it('builds gate approval payload from reviewed translations', () => {
    const payload = buildTranslationGateApprovalPayload([
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
        lang: 'fr',
        label: 'French',
        approved: false,
        spots: [{
          spotId: 'spot-1',
          spotNumber: 1,
          title: 'Entrance',
          originalText: 'Hello',
          translatedText: 'Bonjour',
        }],
      },
    ]);

    expect(payload.approvedLanguages).toEqual(['ja']);
    expect(payload.rejectedLanguages).toEqual(['fr']);
    expect(payload.editedTranslations).toEqual([
      { lang: 'ja', spots: [{ spotId: 'spot-1', translatedText: 'こんにちは' }] },
      { lang: 'fr', spots: [{ spotId: 'spot-1', translatedText: 'Bonjour' }] },
    ]);
  });
});