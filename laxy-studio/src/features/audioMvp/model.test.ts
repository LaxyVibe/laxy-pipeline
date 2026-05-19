import { describe, expect, it } from 'vitest';
import {
  AUDIO_DIRECTOR_SAMPLE_CONTEXT,
  AUDIO_MVP_VOICES,
  PRESET_AUDIO_CHARACTERS,
  TTS_SCRIPT_FIDELITY_INSTRUCTION,
  clearCompiledPromptCustomization,
  createDefaultSettings,
  resolveCompiledPrompt,
  validateEnhancedScript,
} from './model';

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

describe('resolveCompiledPrompt', () => {
  it('includes the script fidelity instruction for all voices', () => {
    const settings = createDefaultSettings(PRESET_AUDIO_CHARACTERS[0]);
    const prompt = resolveCompiledPrompt({
      settings,
      character: PRESET_AUDIO_CHARACTERS[0],
      voice: AUDIO_MVP_VOICES[0],
      scriptText: 'Hello world.',
    });

    expect(prompt).toContain(TTS_SCRIPT_FIDELITY_INSTRUCTION);
  });

  it('uses the fixed sample context instead of echoing the current script', () => {
    const settings = createDefaultSettings(PRESET_AUDIO_CHARACTERS[0]);
    const prompt = resolveCompiledPrompt({
      settings,
      character: PRESET_AUDIO_CHARACTERS[0],
      voice: AUDIO_MVP_VOICES[0],
      scriptText: 'きょうもよいてんきですね。',
    });

    expect(prompt).toContain('## SAMPLE CONTEXT');
    expect(prompt).toContain(AUDIO_DIRECTOR_SAMPLE_CONTEXT);
    expect(prompt).not.toContain('きょうもよいてんきですね。');
  });
});
