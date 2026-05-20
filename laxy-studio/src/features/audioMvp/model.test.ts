import { describe, expect, it } from 'vitest';
import {
  AUDIO_MVP_VOICES,
  PRESET_AUDIO_CHARACTERS,
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
      scene: 'Quiet gallery',
      style: 'Adult visitors',
      pacing: 'Leave them feeling reflective',
      tone: 'Soft British accent',
      compiledPromptOverride: 'Old character prompt',
      isPromptCustomized: true,
    });

    expect(result).toEqual({
      scene: 'Quiet gallery',
      style: 'Adult visitors',
      pacing: 'Leave them feeling reflective',
      tone: 'Soft British accent',
      compiledPromptOverride: '',
      isPromptCustomized: false,
    });
  });
});

describe('resolveCompiledPrompt', () => {
  it('uses the new performance hint prompt structure', () => {
    const settings = createDefaultSettings(PRESET_AUDIO_CHARACTERS[0]);
    settings.directorNote.scene = 'Candlelit stone corridor with soft ambient echo';
    settings.directorNote.style = 'Curious first-time museum visitors';
    settings.directorNote.pacing = 'Deliver a calm sense of wonder';
    settings.directorNote.tone = 'Measured, warm, lightly British';
    const prompt = resolveCompiledPrompt({
      settings,
      character: PRESET_AUDIO_CHARACTERS[0],
      voice: AUDIO_MVP_VOICES[0],
      scriptText: 'Hello world.',
      poiName: 'Main Hall',
      projectTitle: 'Grand Museum Tour',
    });

    expect(prompt).toContain('# AUDIO PROFILE: John');
    expect(prompt).toContain('## "[Museum Manager/Main Hall]"');
    expect(prompt).toContain('## THE SCENE: Grand Museum Tour');
    expect(prompt).toContain('Environment: Candlelit stone corridor with soft ambient echo.');
    expect(prompt).toContain('Target audience: Curious first-time museum visitors.');
    expect(prompt).toContain('Expectation/goal: Deliver a calm sense of wonder.');
    expect(prompt).toContain('Tone/Accent/Manner: Measured, warm, lightly British.');
    expect(prompt).toContain('#### TRANSCRIPT');
    expect(prompt).toContain('Hello world.');
  });

  it('uses guide and spot names when provided for scene and poi labels', () => {
    const settings = createDefaultSettings(PRESET_AUDIO_CHARACTERS[0]);
    const prompt = resolveCompiledPrompt({
      settings,
      character: PRESET_AUDIO_CHARACTERS[0],
      voice: AUDIO_MVP_VOICES[0],
      scriptText: 'Narration text.',
      poiName: 'Bronze Gallery',
      projectTitle: 'City Museum Guide',
    });

    expect(prompt).toContain('## "[Museum Manager/Bronze Gallery]"');
    expect(prompt).toContain('## THE SCENE: City Museum Guide');
  });

  it('uses the selected character output sentence as sample context instead of echoing the current script', () => {
    const settings = createDefaultSettings(PRESET_AUDIO_CHARACTERS[0]);
    const selectedCharacter = PRESET_AUDIO_CHARACTERS[0];
    const prompt = resolveCompiledPrompt({
      settings,
      character: selectedCharacter,
      voice: AUDIO_MVP_VOICES[0],
      scriptText: 'きょうもよいてんきですね。',
    });

    expect(prompt).toContain('## SAMPLE CONTEXT');
    expect(prompt).toContain(selectedCharacter.staticInstruction);
    expect(prompt.split(selectedCharacter.staticInstruction)).toHaveLength(2);
    expect(prompt).toContain('#### TRANSCRIPT');
    expect(prompt).toContain('きょうもよいてんきですね。');
  });
});
