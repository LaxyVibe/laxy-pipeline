import { describe, expect, it } from 'vitest';
import {
  AUDIO_MVP_VOICES,
  PRESET_AUDIO_CHARACTERS,
  clearCompiledPromptCustomization,
  clearGeneratedPerformanceGuidelines,
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
      generatedPerformanceGuidelines: 'Style: Test\nPace: Test\nAccent: Test',
      compiledPromptOverride: 'Old character prompt',
      isPromptCustomized: true,
    });

    expect(result).toEqual({
      scene: 'Quiet gallery',
      style: 'Adult visitors',
      pacing: 'Leave them feeling reflective',
      tone: 'Soft British accent',
      generatedPerformanceGuidelines: 'Style: Test\nPace: Test\nAccent: Test',
      compiledPromptOverride: '',
      isPromptCustomized: false,
    });
  });
});

describe('clearGeneratedPerformanceGuidelines', () => {
  it('clears generated placeholder 2 guidance while keeping raw where/who/what/how input', () => {
    const result = clearGeneratedPerformanceGuidelines({
      scene: 'Quiet gallery',
      style: 'Adult visitors',
      pacing: 'Leave them feeling reflective',
      tone: 'Soft British accent',
      generatedPerformanceGuidelines: 'Style: Test\nPace: Test\nAccent: Test',
      compiledPromptOverride: '',
      isPromptCustomized: false,
    });

    expect(result).toEqual({
      scene: 'Quiet gallery',
      style: 'Adult visitors',
      pacing: 'Leave them feeling reflective',
      tone: 'Soft British accent',
      generatedPerformanceGuidelines: '',
      compiledPromptOverride: '',
      isPromptCustomized: false,
    });
  });
});

describe('resolveCompiledPrompt', () => {
  it('uses generated detailed performance guidelines and omits placeholder 1', () => {
    const settings = createDefaultSettings(PRESET_AUDIO_CHARACTERS[0]);
    settings.directorNote.generatedPerformanceGuidelines = [
      'Style: The "Reverent Guide". You must hear the deep respect in the tone; the voice stays composed and inwardly focused.',
      'Pace: Speaks with a calm, unhurried cadence. Insert deliberate 1-second pauses after major historical facts to let the weight sink in.',
      'Accent: Use the character profile accent baseline with careful museum-guide diction and any user-requested localized pronunciation.',
    ].join('\n');
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
    expect(prompt).not.toContain('Placeholder 1');
    expect(prompt).toContain('## DETAILED PERFORMANCE GUIDELINES');
    expect(prompt).toContain('Style: The "Reverent Guide".');
    expect(prompt).toContain('Pace: Speaks with a calm, unhurried cadence.');
    expect(prompt).toContain('Accent: Use the character profile accent baseline');
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
