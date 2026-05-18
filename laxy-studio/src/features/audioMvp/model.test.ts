import { describe, expect, it } from 'vitest';
import { clearCompiledPromptCustomization, validateEnhancedScript } from './model';

describe('validateEnhancedScript', () => {
  it('accepts creative Gemini TTS audio tags when brackets are well formed', () => {
    const validation = validateEnhancedScript(
      '[clears throat gently] [hushed tone] [measured pace] Now, regarding this particular exhibit...',
    );

    expect(validation.isValid).toBe(true);
    expect(validation.issues).toEqual([]);
    expect(validation.totalTags).toBe(3);
  });

  it('still reports malformed bracket structure', () => {
    const validation = validateEnhancedScript('[whispers Hello ]');

    expect(validation.isValid).toBe(true);

    const broken = validateEnhancedScript('[whispers Hello');
    expect(broken.isValid).toBe(false);
    expect(broken.issues[0]?.message).toBe('Cue tag is missing a closing bracket.');
  });
});

describe('clearCompiledPromptCustomization', () => {
  it('keeps scene style and pacing while clearing stale compiled prompt override', () => {
    const result = clearCompiledPromptCustomization({
      scene: 'Gallery',
      style: 'Warm',
      pacing: 'Slow',
      compiledPromptOverride: 'Old character prompt',
      isPromptCustomized: true,
    });

    expect(result).toEqual({
      scene: 'Gallery',
      style: 'Warm',
      pacing: 'Slow',
      compiledPromptOverride: '',
      isPromptCustomized: false,
    });
  });
});
