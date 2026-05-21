import { describe, expect, it } from 'vitest';
import { preprocessScriptForLanguage } from './utils';

describe('audio director language preprocessing', () => {
  it('preserves Japanese line breaks while normalizing narration punctuation', () => {
    const result = preprocessScriptForLanguage('ja', 'あした—\n\nにゅーす');

    expect(result.processedText).toBe('あした、\n\nにゅーす');
    expect(result.preprocessingNotes).toEqual([
      'Japanese punctuation normalization applied before TTS submission while preserving line breaks.',
    ]);
  });
});
