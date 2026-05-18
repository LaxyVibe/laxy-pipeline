import type { LanguageAudio, LanguageSRT } from '../../types/entity';

export type VoiceGenderFilter = 'all' | 'female' | 'male';
export type ContentVersion = 'standard' | 'long' | 'kid';
export type ScriptEnhancementLimit = 'none' | 'light' | 'medium';
export type CharacterGenderIdentity = 'feminine' | 'masculine' | 'neutral';

export interface AudioMvpVoice {
  id: string;
  name: string;
  gender: Exclude<VoiceGenderFilter, 'all'>;
  summary: string;
  tone: string;
  bestFor: string;
  tags: string[];
}

export interface AudioMvpCharacter {
  id: string;
  name: string;
  role: string;
  avatar: string;
  genderIdentity: CharacterGenderIdentity;
  coreTimbre: string;
  personalityDNA: string;
  linguisticFingerprint: string;
  brandPersona: string;
  accent: string;
  staticInstruction: string;
  recommendedVoiceId?: string;
  source: 'preset' | 'custom';
}

export interface DirectorNoteDraft {
  scene: string;
  style: string;
  pacing: string;
  compiledPromptOverride: string;
  isPromptCustomized: boolean;
}

export interface AudioGuideSettings {
  contentVersion: ContentVersion;
  characterId: string;
  voiceId: string;
  scriptEnhancementLimit: ScriptEnhancementLimit;
  directorNote: DirectorNoteDraft;
}

export interface AudioPoiDraft {
  spotId: string;
  spotNumber: number;
  title: string;
  scriptText: string;
  excerpt: string;
  overrideEnabled: boolean;
  overrideSettings?: AudioGuideSettings;
}

export interface VoiceRecommendation {
  recommendedVoiceId: string;
  reason: string;
  fallbackVoiceIds: string[];
}

export interface AudioGenerationSnapshot {
  audioFiles: LanguageAudio[];
  srtFiles: LanguageSRT[];
}

export interface ScriptEnhancementValidation {
  isValid: boolean;
  totalTags: number;
  issues: Array<{
    index: number;
    message: string;
    excerpt: string;
  }>;
}

export const CONTENT_VERSION_OPTIONS: Array<{
  id: ContentVersion;
  label: string;
  summary: string;
}> = [
  {
    id: 'standard',
    label: 'Standard',
    summary: 'Balanced museum-guide narration for the default production path.',
  },
  {
    id: 'long',
    label: 'Long',
    summary: 'Allows more reflective pauses and deeper descriptive delivery.',
  },
  {
    id: 'kid',
    label: 'Kid',
    summary: 'Uses simpler, warmer delivery cues aimed at younger listeners.',
  },
];

export const SCRIPT_ENHANCEMENT_OPTIONS: Array<{
  id: ScriptEnhancementLimit;
  label: string;
  summary: string;
}> = [
  {
    id: 'none',
    label: 'Off',
    summary: 'Leave the script untouched and generate directly from the written copy.',
  },
  {
    id: 'light',
    label: 'Light',
    summary: 'Add sparse performance cues that shape delivery while keeping the script easy to review.',
  },
  {
    id: 'medium',
    label: 'Medium',
    summary: 'Use a more expressive cue pass with richer emotion and pacing direction.',
  },
];

export const SCRIPT_TAG_EXAMPLES = [
  '[sigh]',
  '[laughing]',
  '[uhm]',
  '[short pause]',
  '[medium pause]',
  '[long pause]',
  '[whispering]',
  '[shouting]',
  '[sarcasm]',
  '[pause:0.5s]',
  '[pause:1s]',
  '[pause:1.5s]',
  '[phonetic:word|pronunciation]',
];

export const AUDIO_MVP_VOICES: AudioMvpVoice[] = [
  {
    id: 'Aoede',
    name: 'Aoede',
    gender: 'female',
    summary: 'Warm, balanced, and gently authoritative.',
    tone: 'steady warmth',
    bestFor: 'Museum narration, welcoming intros, kid-friendly guides',
    tags: ['warm', 'balanced', 'museum', 'curator', 'kid', 'friendly', 'guide'],
  },
  {
    id: 'Laomedeia',
    name: 'Laomedeia',
    gender: 'female',
    summary: 'Calm, refined, and softly immersive.',
    tone: 'calm serenity',
    bestFor: 'Quiet galleries, slow pacing, contemplative experiences',
    tags: ['calm', 'serene', 'quiet', 'gallery', 'reflective', 'slow'],
  },
  {
    id: 'Sulafat',
    name: 'Sulafat',
    gender: 'female',
    summary: 'Story-rich, intimate, and emotionally engaging.',
    tone: 'cinematic warmth',
    bestFor: 'Story-led tours, dramatic reveals, local tales',
    tags: ['story', 'dramatic', 'warm', 'intimate', 'tour', 'local', 'narrative'],
  },
  {
    id: 'Algenib',
    name: 'Algenib',
    gender: 'male',
    summary: 'Deep, grounded, and historically weighty.',
    tone: 'deep gravitas',
    bestFor: 'Historical context, solemn exhibits, legacy narratives',
    tags: ['deep', 'historical', 'gravitas', 'solemn', 'authoritative', 'legacy'],
  },
  {
    id: 'Schedar',
    name: 'Schedar',
    gender: 'male',
    summary: 'Even, clear, and disciplined.',
    tone: 'measured clarity',
    bestFor: 'Educational tours, clean narration, procedural explanations',
    tags: ['clear', 'measured', 'education', 'disciplined', 'professional', 'clean'],
  },
  {
    id: 'Sadaltager',
    name: 'Sadaltager',
    gender: 'male',
    summary: 'Knowledgeable, warm, and mature.',
    tone: 'knowledgeable warmth',
    bestFor: 'Expert-led guidance, curator notes, premium tours',
    tags: ['knowledgeable', 'warm', 'expert', 'curator', 'premium', 'museum'],
  },
];

export const PRESET_AUDIO_CHARACTERS: AudioMvpCharacter[] = [
  {
    id: 'museum-manager',
    name: 'Museum Manager',
    role: 'Museum Manager',
    avatar: '🏛️',
    genderIdentity: 'neutral',
    coreTimbre: 'A composed, mid-range voice with mature resonance and clean articulation.',
    personalityDNA: 'Formal, respectful, highly educated, deeply knowledgeable about preservation and context.',
    linguisticFingerprint: 'Uses polished, museum-grade phrasing and concise interpretive guidance without overacting.',
    brandPersona: 'Trustworthy institution host with calm authority.',
    accent: '',
    staticInstruction: 'You are Museum Manager, the calm institutional host of the guide. You speak with respect, clarity, and a curator\u2019s sense of structure while never becoming stiff or promotional.',
    recommendedVoiceId: 'Sadaltager',
    source: 'preset',
  },
  {
    id: 'kid-story-teller',
    name: 'Kid Story Teller',
    role: 'Kid Story Teller',
    avatar: '📚',
    genderIdentity: 'feminine',
    coreTimbre: 'A bright, warm, storybook voice with soft energy and friendly lift.',
    personalityDNA: 'Warm, enthusiastic, playful, encouraging, and easy for younger listeners to follow.',
    linguisticFingerprint: 'Uses simple vocabulary, vivid phrasing, classic storybook transitions, and gentle rhetorical questions.',
    brandPersona: 'Family-friendly guide who turns exhibits into living scenes.',
    accent: '',
    staticInstruction: 'You are Kid Story Teller, a warm narrator who invites children into the world of each exhibit. You keep vocabulary simple, emotional tone positive, and pacing easy to follow without sounding childish.',
    recommendedVoiceId: 'Aoede',
    source: 'preset',
  },
  {
    id: 'local-tour-guide',
    name: 'Local Tour Guide',
    role: 'Local Tour Guide',
    avatar: '🗺️',
    genderIdentity: 'neutral',
    coreTimbre: 'A conversational, confident voice with lively movement and local familiarity.',
    personalityDNA: 'Energetic, personable, observant, and excited to share insider context.',
    linguisticFingerprint: 'Feels spoken rather than recited, using bright transitions and friendly “look here” guidance.',
    brandPersona: 'Insider host who makes the listener feel like a welcome guest.',
    accent: '',
    staticInstruction: 'You are Local Tour Guide, a lively host who speaks like a trusted local friend. You stay natural, observant, and energetic while still delivering reliable context and wayfinding.',
    recommendedVoiceId: 'Sulafat',
    source: 'preset',
  },
];

export function splitParagraphs(raw: string): string[] {
  return raw
    .split(/\n\s*\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function sentenceFromText(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const match = normalized.match(/^(.{0,72}?[.!?。！？]|.{1,72})(\s|$)/);
  return (match?.[1] ?? normalized.slice(0, 72)).trim();
}

export function buildSpotTitle(text: string, spotNumber: number): string {
  const sentence = sentenceFromText(text)
    .replace(/[.!?。！？]+$/, '')
    .trim();
  return sentence.length > 0 ? sentence : `POI ${String(spotNumber).padStart(2, '0')}`;
}

export function buildExcerpt(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length <= 140 ? normalized : `${normalized.slice(0, 137).trimEnd()}...`;
}

export function createDefaultDirectorNote(
  contentVersion: ContentVersion,
): DirectorNoteDraft {
  return {
    scene: defaultScene(),
    style: defaultStyle(contentVersion),
    pacing: defaultPacingForContentVersion(contentVersion),
    compiledPromptOverride: '',
    isPromptCustomized: false,
  };
}

export function clearCompiledPromptCustomization(
  directorNote: DirectorNoteDraft,
): DirectorNoteDraft {
  return {
    ...directorNote,
    compiledPromptOverride: '',
    isPromptCustomized: false,
  };
}

export function createDefaultSettings(character: AudioMvpCharacter): AudioGuideSettings {
  const fallbackVoiceId = character.recommendedVoiceId ?? AUDIO_MVP_VOICES[0].id;
  return {
    contentVersion: 'standard',
    characterId: character.id,
    voiceId: fallbackVoiceId,
    scriptEnhancementLimit: 'none',
    directorNote: createDefaultDirectorNote('standard'),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function isContentVersion(value: unknown): value is ContentVersion {
  return value === 'standard' || value === 'long' || value === 'kid';
}

function isScriptEnhancementLimit(value: unknown): value is ScriptEnhancementLimit {
  return value === 'none' || value === 'light' || value === 'medium';
}

function isCharacterGenderIdentity(value: unknown): value is CharacterGenderIdentity {
  return value === 'feminine' || value === 'masculine' || value === 'neutral';
}

export function normalizeDirectorNoteDraft(
  value: unknown,
  fallback: DirectorNoteDraft = createDefaultDirectorNote('standard'),
): DirectorNoteDraft {
  if (!isRecord(value)) return fallback;

  const compiledPromptOverride = stringValue(value.compiledPromptOverride)
    ?? stringValue(value.compiledPrompt)
    ?? stringValue(value.stylePrompt)
    ?? fallback.compiledPromptOverride;

  return {
    scene: stringValue(value.scene) ?? stringValue(value.vocalEnvironment) ?? fallback.scene,
    style: stringValue(value.style)
      ?? stringValue(value.mission)
      ?? stringValue(value.missionOfSpeech)
      ?? fallback.style,
    pacing: stringValue(value.pacing) ?? stringValue(value.pacingAndEnergy) ?? fallback.pacing,
    compiledPromptOverride,
    isPromptCustomized: value.isPromptCustomized === true || Boolean(compiledPromptOverride.trim()),
  };
}

export function normalizeAudioGuideSettings(
  value: unknown,
  fallback: AudioGuideSettings,
): AudioGuideSettings {
  if (!isRecord(value)) return fallback;
  const contentVersion = isContentVersion(value.contentVersion) ? value.contentVersion : fallback.contentVersion;
  return {
    contentVersion,
    characterId: stringValue(value.characterId) ?? fallback.characterId,
    voiceId: stringValue(value.voiceId) ?? fallback.voiceId,
    scriptEnhancementLimit: isScriptEnhancementLimit(value.scriptEnhancementLimit)
      ? value.scriptEnhancementLimit
      : fallback.scriptEnhancementLimit,
    directorNote: normalizeDirectorNoteDraft(
      value.directorNote,
      createDefaultDirectorNote(contentVersion),
    ),
  };
}

export function normalizeAudioMvpCharacter(value: unknown): AudioMvpCharacter | null {
  if (!isRecord(value)) return null;
  const id = stringValue(value.id);
  const name = stringValue(value.name);
  const role = stringValue(value.role);
  const staticInstruction = stringValue(value.staticInstruction);
  if (!id || !name || !role || !staticInstruction) return null;

  return {
    id,
    name,
    role,
    avatar: stringValue(value.avatar) ?? '🎙️',
    genderIdentity: isCharacterGenderIdentity(value.genderIdentity) ? value.genderIdentity : 'neutral',
    coreTimbre: stringValue(value.coreTimbre) ?? '',
    personalityDNA: stringValue(value.personalityDNA) ?? '',
    linguisticFingerprint: stringValue(value.linguisticFingerprint) ?? '',
    brandPersona: stringValue(value.brandPersona) ?? '',
    accent: stringValue(value.accent) ?? '',
    staticInstruction,
    recommendedVoiceId: stringValue(value.recommendedVoiceId),
    source: value.source === 'preset' ? 'preset' : 'custom',
  };
}

export function normalizeAudioPoiDraft(
  value: unknown,
  fallbackSettings: AudioGuideSettings,
): AudioPoiDraft | null {
  if (!isRecord(value)) return null;
  const spotId = stringValue(value.spotId);
  const scriptText = stringValue(value.scriptText);
  if (!spotId || scriptText === undefined) return null;

  const overrideEnabled = value.overrideEnabled === true;
  const overrideSettings = overrideEnabled
    ? normalizeAudioGuideSettings(value.overrideSettings, fallbackSettings)
    : undefined;

  return {
    spotId,
    spotNumber: typeof value.spotNumber === 'number' ? value.spotNumber : 0,
    title: stringValue(value.title) ?? spotId,
    scriptText,
    excerpt: stringValue(value.excerpt) ?? buildExcerpt(scriptText),
    overrideEnabled,
    overrideSettings,
  };
}

function defaultScene(): string {
  return 'A guided tour setting where the voice feels present, welcoming, and confidently paced.';
}

function defaultStyle(
  contentVersion: ContentVersion,
): string {
  const versionGoal = contentVersion === 'kid'
    ? 'make the story easy for younger listeners to follow'
    : contentVersion === 'long'
      ? 'give the listener more room to absorb detail and atmosphere'
      : 'guide the listener through the key points with clarity';
  return `${versionGoal.charAt(0).toUpperCase()}${versionGoal.slice(1)} without sounding promotional or meta.`;
}

function defaultPacingForContentVersion(contentVersion: ContentVersion): string {
  if (contentVersion === 'long') {
    return 'Measured and spacious, with clear emphasis on names, dates, and visual details.';
  }
  if (contentVersion === 'kid') {
    return 'Warm and lightly animated, with shorter thought units and reassuring pauses.';
  }
  return 'Steady and clean, with short pauses after key information.';
}

export function resolvePoiDrafts(
  manuscriptText: string,
  previousItems: AudioPoiDraft[],
): AudioPoiDraft[] {
  const paragraphs = splitParagraphs(manuscriptText);
  return paragraphs.map((scriptText, index) => {
    const spotNumber = index + 1;
    const spotId = `spot_${String(spotNumber).padStart(3, '0')}`;
    const previous = previousItems.find((item) => item.spotId === spotId);
    return {
      spotId,
      spotNumber,
      title: buildSpotTitle(scriptText, spotNumber),
      scriptText,
      excerpt: buildExcerpt(scriptText),
      overrideEnabled: previous?.overrideEnabled ?? false,
      overrideSettings: previous?.overrideSettings,
    };
  });
}

export function contentVersionInstruction(contentVersion: ContentVersion): string {
  if (contentVersion === 'long') {
    return 'Deliver the long-form version with room for detail, atmosphere, and reflective pauses.';
  }
  if (contentVersion === 'kid') {
    return 'Deliver the kid version with simpler framing, warmth, and lightly playful momentum.';
  }
  return 'Deliver the standard version with balanced clarity, confidence, and museum-guide discipline.';
}

export function scriptEnhancementInstruction(limit: ScriptEnhancementLimit): string {
  if (limit === 'none') {
    return 'Do not add any bracket tags. Read the text naturally as written.';
  }
  if (limit === 'light') {
    return `Use bracket tags sparingly when they materially improve delivery. Example tags: ${SCRIPT_TAG_EXAMPLES.join(', ')}. There is no fixed tag whitelist, but keep the script readable and avoid cue clutter.`;
  }
  return `Use bracket tags expressively when they sharpen performance. Example tags: ${SCRIPT_TAG_EXAMPLES.join(', ')}. There is no fixed tag whitelist, but avoid stacking cues so densely that the script becomes hard to follow.`;
}

export function describeScriptEnhancementLimit(limit: ScriptEnhancementLimit): string {
  if (limit === 'none') {
    return 'Cue tags disabled — script should stay clean.';
  }
  if (limit === 'light') {
    return 'Light cue pass — use tags sparingly where they improve delivery.';
  }
  return 'Expressive cue pass — add as many helpful tags as needed while keeping the script readable.';
}

function splitIntoSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?。！？])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function sanitizeValidationExcerpt(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length <= 90 ? normalized : `${normalized.slice(0, 87).trimEnd()}...`;
}

function buildValidationExcerpt(text: string, start: number, end: number): string {
  const safeStart = Math.max(0, start - 28);
  const safeEnd = Math.min(text.length, end + 28);
  return sanitizeValidationExcerpt(text.slice(safeStart, safeEnd));
}

export function validateEnhancedScript(text: string): ScriptEnhancementValidation {
  const issues: ScriptEnhancementValidation['issues'] = [];
  let totalTags = 0;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (char === '[') {
      const closingIndex = text.indexOf(']', index + 1);
      if (closingIndex === -1) {
        issues.push({
          index: issues.length + 1,
          message: 'Cue tag is missing a closing bracket.',
          excerpt: buildValidationExcerpt(text, index, text.length),
        });
        break;
      }

      const rawContent = text.slice(index + 1, closingIndex);
      const content = rawContent.trim();

      if (!content) {
        issues.push({
          index: issues.length + 1,
          message: 'Cue tag cannot be empty.',
          excerpt: buildValidationExcerpt(text, index, closingIndex + 1),
        });
      } else if (rawContent.includes('[') || rawContent.includes(']')) {
        issues.push({
          index: issues.length + 1,
          message: 'Cue tag contains nested brackets.',
          excerpt: buildValidationExcerpt(text, index, closingIndex + 1),
        });
      } else {
        totalTags += 1;
      }

      index = closingIndex;
      continue;
    }

    if (char === ']') {
      issues.push({
        index: issues.length + 1,
        message: 'Cue tag has an extra closing bracket.',
        excerpt: buildValidationExcerpt(text, Math.max(0, index - 1), index + 1),
      });
    }
  }

  return {
    isValid: issues.length === 0,
    totalTags,
    issues,
  };
}

function chooseEnhancementTags(sentence: string, intensity: ScriptEnhancementLimit): string[] {
  if (intensity === 'none') return [];
  const lowered = sentence.toLowerCase();
  const tags: string[] = [];

  if (
    /quiet|soft|secret|hidden|whisper|silent|hushed/.test(lowered)
    && !tags.includes('[whispering]')
  ) {
    tags.push('[whispering]');
  }

  if (
    /laugh|smile|joy|playful|fun|delight/.test(lowered)
    && !tags.includes('[laughing]')
  ) {
    tags.push('[laughing]');
  }

  if (
    /loss|war|damage|destroy|mourning|tragic|sad|grief/.test(lowered)
    && !tags.includes('[sigh]')
  ) {
    tags.push('[sigh]');
  }

  if (
    sentence.includes('?')
    || /why|how|imagine|notice|look closely|believe it or not/.test(lowered)
  ) {
    tags.push('[short pause]');
  }

  if (intensity === 'medium' && sentence.length > 120 && !tags.includes('[medium pause]')) {
    tags.push('[medium pause]');
  }

  return tags.slice(0, 2);
}

export function enhanceScriptWithPerformanceCues(args: {
  scriptText: string;
  limit: ScriptEnhancementLimit;
}): string {
  const { scriptText, limit } = args;
  if (limit === 'none') return scriptText.trim();

  const sentences = splitIntoSentences(scriptText.trim());
  if (sentences.length === 0) return scriptText.trim();

  return sentences.map((sentence) => {
    const tags = chooseEnhancementTags(sentence, limit);
    if (tags.length === 0) return sentence;
    return `${tags.join(' ')} ${sentence}`;
  }).join(' ');
}

export function resolveCompiledPrompt(args: {
  settings: AudioGuideSettings;
  character: AudioMvpCharacter;
  voice: AudioMvpVoice;
  scriptText: string;
}): string {
  const { settings, character, voice, scriptText } = args;
  const { directorNote } = settings;
  if (directorNote.isPromptCustomized && directorNote.compiledPromptOverride.trim()) {
    return directorNote.compiledPromptOverride.trim();
  }

  const trimmedScript = scriptText.replace(/\s+/g, ' ').trim();
  const shortContext = trimmedScript.length <= 180
    ? trimmedScript
    : `${trimmedScript.slice(0, 177).trimEnd()}...`;

  return [
    character.staticInstruction.trim(),
    `Preferred voice model: ${voice.id}. Voice quality: ${voice.summary}.`,
    '',
    '## AUDIO PROFILE',
    `Core timbre: ${character.coreTimbre}`,
    `Personality DNA: ${character.personalityDNA}`,
    `Linguistic fingerprint: ${character.linguisticFingerprint}`,
    `Brand persona: ${character.brandPersona}`,
    character.accent ? `Accent: ${character.accent}` : '',
    '',
    '## THE SCENE',
    directorNote.scene,
    '',
    "## DIRECTOR'S NOTES",
    `Style: ${directorNote.style}`,
    `Pacing: ${directorNote.pacing}`,
    contentVersionInstruction(settings.contentVersion),
    scriptEnhancementInstruction(settings.scriptEnhancementLimit),
    '',
    '## SAMPLE CONTEXT',
    shortContext,
    '',
    'Stay in character, avoid meta commentary, and produce a natural ready-to-speak delivery.',
  ].filter(Boolean).join('\n');
}

function extractVoiceSignals(input: string): string[] {
  const text = input.toLowerCase();
  const signals: string[] = [];
  const signalGroups: Record<string, string[]> = {
    warm: ['warm', 'friendly', 'gentle', 'welcoming'],
    calm: ['calm', 'quiet', 'serene', 'reflective', 'soft'],
    story: ['story', 'storyteller', 'dramatic', 'cinematic', 'imaginative'],
    museum: ['museum', 'curator', 'gallery', 'exhibit', 'preservation'],
    historical: ['history', 'historical', 'legacy', 'ancient', 'heritage'],
    clear: ['clear', 'educational', 'teacher', 'guide', 'precise', 'professional'],
    kid: ['kid', 'children', 'family', 'young', 'playful'],
    local: ['local', 'tour', 'travel', 'friend', 'insider'],
    expert: ['expert', 'scholar', 'knowledgeable', 'academic', 'authority'],
  };

  Object.entries(signalGroups).forEach(([signal, keywords]) => {
    if (keywords.some((keyword) => text.includes(keyword))) {
      signals.push(signal);
    }
  });

  return signals;
}

export function recommendVoice(args: {
  character: AudioMvpCharacter;
  manuscriptText: string;
  contentVersion: ContentVersion;
}): VoiceRecommendation {
  const { character, manuscriptText, contentVersion } = args;
  const signals = extractVoiceSignals([
    character.role,
    character.coreTimbre,
    character.personalityDNA,
    character.linguisticFingerprint,
    character.brandPersona,
    manuscriptText,
    contentVersion,
  ].join(' '));

  const scored = AUDIO_MVP_VOICES.map((voice) => {
    let score = 0;
    const reasons: string[] = [];

    if (character.genderIdentity === 'neutral') {
      score += 1;
    } else if (
      (character.genderIdentity === 'feminine' && voice.gender === 'female')
      || (character.genderIdentity === 'masculine' && voice.gender === 'male')
    ) {
      score += 3;
      reasons.push(`matches the ${character.genderIdentity} leaning`);
    }

    if (character.recommendedVoiceId === voice.id) {
      score += 2.5;
      reasons.push('aligns with the character library preset');
    }

    const matchedSignals = signals.filter((signal) => voice.tags.includes(signal));
    if (matchedSignals.length > 0) {
      score += matchedSignals.length * 1.4;
      reasons.push(`fits ${matchedSignals.join(', ')} cues`);
    }

    if (contentVersion === 'kid' && (voice.id === 'Aoede' || voice.id === 'Sulafat')) {
      score += 1.5;
      reasons.push('handles kid-friendly warmth well');
    }

    if (contentVersion === 'long' && (voice.id === 'Laomedeia' || voice.id === 'Sadaltager')) {
      score += 1.2;
      reasons.push('supports longer-form pacing');
    }

    return {
      voice,
      score,
      reasons,
    };
  }).sort((left, right) => right.score - left.score);

  const top = scored[0] ?? { voice: AUDIO_MVP_VOICES[0], reasons: ['default fallback'] };
  const fallbacks = scored.slice(1, 3).map((item) => item.voice.id);

  return {
    recommendedVoiceId: top.voice.id,
    reason: `Recommended because it ${top.reasons.join(', ')}.`.replace(' because it .', '.'),
    fallbackVoiceIds: fallbacks,
  };
}

export function draftCharacterFromPrompt(prompt: string): AudioMvpCharacter {
  const normalized = prompt.trim();
  const lowered = normalized.toLowerCase();
  const role = lowered.includes('kid') || lowered.includes('child')
    ? 'Kid Story Teller'
    : lowered.includes('local') || lowered.includes('tour')
      ? 'Local Tour Guide'
      : lowered.includes('museum') || lowered.includes('curator') || lowered.includes('manager')
        ? 'Museum Manager'
        : 'Custom Guide Character';

  const genderIdentity: CharacterGenderIdentity =
    lowered.includes('female') || lowered.includes('woman') || lowered.includes('girl') || lowered.includes('feminine')
      ? 'feminine'
      : lowered.includes('male') || lowered.includes('man') || lowered.includes('boy') || lowered.includes('masculine')
        ? 'masculine'
        : 'neutral';

  const character: AudioMvpCharacter = {
    id: `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    name: role,
    role,
    avatar: role === 'Kid Story Teller' ? '🧒' : role === 'Local Tour Guide' ? '🚶' : '🎙️',
    genderIdentity,
    coreTimbre: lowered.includes('calm')
      ? 'A calm, refined voice with clean projection and controlled warmth.'
      : lowered.includes('deep')
        ? 'A lower, grounded voice with mature resonance and clear emphasis.'
        : 'A warm, present guide voice with natural clarity and stable pacing.',
    personalityDNA: lowered.includes('playful')
      ? 'Playful, warm, and highly encouraging without becoming chaotic.'
      : lowered.includes('formal')
        ? 'Formal, respectful, and highly composed with clear professional discipline.'
        : 'Approachable, confident, and easy to trust in guided narration.',
    linguisticFingerprint: lowered.includes('short')
      ? 'Uses short, direct phrases and avoids over-explaining.'
      : lowered.includes('story')
        ? 'Uses storytelling cadence, vivid transitions, and engaging imagery.'
        : 'Uses clean spoken phrasing with natural guide-style transitions.',
    brandPersona: lowered.includes('luxury')
      ? 'Premium host with polished hospitality.'
      : lowered.includes('local')
        ? 'Friendly insider who shares context like a welcome local.'
        : 'Reliable host who makes complex material feel approachable.',
    accent: '',
    staticInstruction: normalized
      ? `You are ${role}. ${normalized}`
      : `You are ${role}, a reliable narration persona for a guided audio experience.`,
    source: 'custom',
  };

  const recommendation = recommendVoice({
    character,
    manuscriptText: normalized,
    contentVersion: 'standard',
  });
  return {
    ...character,
    recommendedVoiceId: recommendation.recommendedVoiceId,
  };
}

export function buildDirectorPayload(args: {
  settings: AudioGuideSettings;
  character: AudioMvpCharacter;
  voice: AudioMvpVoice;
  scriptText: string;
}): {
  scene: string;
  style: string;
  pacing: string;
  compiledPrompt: string;
  contentVersion: ContentVersion;
  scriptEnhancementLimit: ScriptEnhancementLimit;
} {
  const { settings, character, voice, scriptText } = args;
  return {
    scene: settings.directorNote.scene,
    style: settings.directorNote.style,
    pacing: settings.directorNote.pacing,
    compiledPrompt: resolveCompiledPrompt({ settings, character, voice, scriptText }),
    contentVersion: settings.contentVersion,
    scriptEnhancementLimit: settings.scriptEnhancementLimit,
  };
}

export function estimateTokensForSettings(args: {
  items: AudioPoiDraft[];
  settingsResolver: (item: AudioPoiDraft) => AudioGuideSettings;
  characterResolver: (characterId: string) => AudioMvpCharacter | undefined;
  languageCount: number;
}): number {
  const { items, settingsResolver, characterResolver, languageCount } = args;
  const total = items.reduce((sum, item) => {
    const settings = settingsResolver(item);
    const character = characterResolver(settings.characterId);
    const voice = AUDIO_MVP_VOICES.find((candidate) => candidate.id === settings.voiceId) ?? AUDIO_MVP_VOICES[0];
    if (!character) return sum;
    const prompt = resolveCompiledPrompt({
      settings,
      character,
      voice,
      scriptText: item.scriptText,
    });
    return sum + Math.ceil(item.scriptText.length / 3.4) + Math.ceil(prompt.length / 4.2);
  }, 0);

  return total * Math.max(languageCount, 1);
}
