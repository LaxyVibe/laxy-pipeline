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
  gender?: string;
  genderIdentity: CharacterGenderIdentity;
  context?: string;
  coreTimbre: string;
  personalityDNA: string;
  linguisticFingerprint: string;
  brandPersona: string;
  accent: string;
  staticInstruction: string;
  audioProfileMarkdown?: string;
  recommendedVoiceId?: string;
  source: 'preset' | 'custom';
  tenantId?: string;
  guideId?: string;
  createdBy?: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface DirectorNoteDraft {
  scene: string;
  detailedSceneParagraph: string;
  style: string;
  pacing: string;
  tone: string;
  generatedPerformanceGuidelines: string;
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
    label: 'Level 0 - Off',
    summary: 'Use the original script directly with no added performance cue tags.',
  },
  {
    id: 'light',
    label: 'Light',
    summary: 'Add a restrained cue pass with sparse emotional or pause tags.',
  },
  {
    id: 'medium',
    label: 'Expressive',
    summary: 'Allow a fuller cue pass while keeping each sentence stable and natural.',
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

export const TTS_SCRIPT_FIDELITY_INSTRUCTION =
  'Make sure you exactly follow the script when you read it. Read the punctuation (commas and periods) naturally as pauses to ensure clear delivery of each segment.';

export const AUDIO_DIRECTOR_SAMPLE_CONTEXT =
  '八幡さまは古くより多くの人々に親しまれ、お祀りされてきました。 全国約１１万の神社のうち、八幡さまが最も多く、４万６００社あまりのお社(やしろ)があります。 宇佐神宮は４万社あまりある八幡さまの総本宮です。 御祭神である八幡大神さまは応神天皇のご神霊で、５７１年(欽明天皇の時代）に初めて宇佐の地にご示顕になったといわれます。応神天皇は大陸の文化と産業...';

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
    name: 'John',
    role: 'Museum Manager',
    avatar: '🏛️',
    gender: 'Male',
    genderIdentity: 'masculine',
    context: 'A knowledgeable person who has a formal and confident tone.',
    coreTimbre: 'A deep, resonant, and clear vocal timbre with composed projection.',
    personalityDNA: 'A knowledgeable museum manager with a formal and confident tone.',
    linguisticFingerprint: 'Measured, respectful pacing that delivers cultural detail with poise and precision.',
    brandPersona: 'Quietly authoritative art preservation expert with meticulous delivery.',
    accent: '',
    staticInstruction: 'You are John, a male Museum Manager with a deep, resonant, and clear vocal timbre. Your voice maintains a consistently formal and meticulous delivery, embodying the quiet confidence of an art preservation expert. You speak with measured, respectful pacing, ensuring every cultural detail is conveyed with absolute poise.',
    recommendedVoiceId: 'Algenib',
    source: 'preset',
  },
  {
    id: 'kid-story-teller',
    name: 'Linda',
    role: 'Kid Story Teller',
    avatar: '📚',
    gender: 'Female',
    genderIdentity: 'feminine',
    context: 'A warm mom-like storyteller who naturally handles kids and young audiences.',
    coreTimbre: 'A naturally bright, high-pitched, and velvety timbre with a built-in vocal smile.',
    personalityDNA: 'A warm mom-like storyteller who naturally handles kids and young audiences.',
    linguisticFingerprint: 'Gentle, melodic cadence with inviting, playful delivery that keeps young imaginations engaged.',
    brandPersona: 'Warm family storyteller with playful encouragement and soft emotional clarity.',
    accent: '',
    staticInstruction: 'You are Storyteller Linda. Your female voice possesses a naturally bright, high-pitched, and velvety timbre that carries a built-in "vocal smile." You maintain an inherently warm, inviting, and playful persona, delivering lines with a gentle, melodic cadence designed to captivate young imaginations.',
    recommendedVoiceId: 'Aoede',
    source: 'preset',
  },
  {
    id: 'local-tour-guide',
    name: 'Alex',
    role: 'Local Tour Guide',
    avatar: '🗺️',
    gender: 'Male',
    genderIdentity: 'masculine',
    context: 'Energetic local guide who feels satisfied when telling the story of his own town.',
    coreTimbre: 'A crisp, forward-projecting, and highly energetic timbre.',
    personalityDNA: 'Energetic local guide who feels satisfied when telling the story of his own town.',
    linguisticFingerprint: 'Conversational, welcoming phrasing with a spirited, upbeat cadence that attracts listeners.',
    brandPersona: 'Friendly hometown insider whose enthusiasm makes visitors feel like old friends.',
    accent: '',
    staticInstruction: 'You are Alex, a male local tour guide whose voice has a crisp, forward-projecting, and highly energetic timbre. Your personality DNA is inherently friendly and enthusiastic, radiating a genuine sense of pride and satisfaction whenever you share your hometown\'s secrets. Your linguistic style is conversational and welcoming, naturally attracting listeners with a spirited, upbeat cadence that makes them feel like old friends.',
    recommendedVoiceId: 'Schedar',
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
  _contentVersion: ContentVersion,
): DirectorNoteDraft {
  return {
    scene: '',
    detailedSceneParagraph: '',
    style: '',
    pacing: '',
    tone: '',
    generatedPerformanceGuidelines: '',
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

export function clearGeneratedPerformanceGuidelines(
  directorNote: DirectorNoteDraft,
): DirectorNoteDraft {
  return {
    ...directorNote,
    detailedSceneParagraph: '',
    generatedPerformanceGuidelines: '',
  };
}

export function createDefaultSettings(character?: AudioMvpCharacter): AudioGuideSettings {
  const fallbackVoiceId = character?.recommendedVoiceId ?? AUDIO_MVP_VOICES[0].id;
  return {
    contentVersion: 'standard',
    characterId: character?.id ?? '',
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

function timestampMillis(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'object' && value !== null) {
    const candidate = value as { toMillis?: () => number; seconds?: number; nanoseconds?: number };
    if (typeof candidate.toMillis === 'function') {
      const millis = candidate.toMillis();
      return Number.isFinite(millis) ? millis : undefined;
    }
    if (typeof candidate.seconds === 'number') {
      return (candidate.seconds * 1000) + Math.floor((candidate.nanoseconds ?? 0) / 1_000_000);
    }
  }
  return undefined;
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
    detailedSceneParagraph:
      stringValue(value.detailedSceneParagraph)
      ?? stringValue(value.sceneParagraph)
      ?? fallback.detailedSceneParagraph,
    style: stringValue(value.style)
      ?? stringValue(value.mission)
      ?? stringValue(value.missionOfSpeech)
      ?? fallback.style,
    pacing: stringValue(value.pacing) ?? stringValue(value.pacingAndEnergy) ?? fallback.pacing,
    tone: stringValue(value.tone)
      ?? stringValue(value.how)
      ?? stringValue(value.manner)
      ?? stringValue(value.accent)
      ?? fallback.tone,
    generatedPerformanceGuidelines:
      stringValue(value.generatedPerformanceGuidelines)
      ?? stringValue(value.detailedPerformanceGuidelines)
      ?? fallback.generatedPerformanceGuidelines,
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
    gender: stringValue(value.gender),
    genderIdentity: isCharacterGenderIdentity(value.genderIdentity) ? value.genderIdentity : 'neutral',
    context: stringValue(value.context),
    coreTimbre: stringValue(value.coreTimbre) ?? '',
    personalityDNA: stringValue(value.personalityDNA) ?? '',
    linguisticFingerprint: stringValue(value.linguisticFingerprint) ?? '',
    brandPersona: stringValue(value.brandPersona) ?? '',
    accent: stringValue(value.accent) ?? '',
    staticInstruction,
    audioProfileMarkdown: stringValue(value.audioProfileMarkdown) ?? buildCharacterAudioProfileMarkdown({
      name,
      role,
      staticInstruction,
    }),
    recommendedVoiceId: stringValue(value.recommendedVoiceId),
    source: value.source === 'preset' ? 'preset' : 'custom',
    tenantId: stringValue(value.tenantId),
    guideId: stringValue(value.guideId),
    createdBy: stringValue(value.createdBy),
    createdAt: timestampMillis(value.createdAt),
    updatedAt: timestampMillis(value.updatedAt),
  };
}

export function buildCharacterAudioProfileMarkdown(args: {
  name: string;
  role: string;
  staticInstruction: string;
}): string {
  const { name, role, staticInstruction } = args;
  return [
    `# AUDIO PROFILE: ${name}`,
    `## ROLE: ${role}`,
    '### SAMPLE CONTEXT:',
    staticInstruction.trim(),
  ].join('\n');
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
    return 'Cue density level 0: use the original script directly without adding bracketed performance tags.';
  }
  if (limit === 'light') {
    return `Cue density level 1: use bracket tags sparingly when they materially improve delivery. Example tags: ${SCRIPT_TAG_EXAMPLES.join(', ')}. Keep the script readable and avoid cue clutter.`;
  }
  return `Cue density level 2: use bracket tags expressively when they sharpen performance. Example tags: ${SCRIPT_TAG_EXAMPLES.join(', ')}. Add more active emotion and pause direction, but keep the script readable.`;
}

export function describeScriptEnhancementLimit(limit: ScriptEnhancementLimit): string {
  if (limit === 'none') {
    return 'Cue density level 0: audio uses the original script with no generated cue tags.';
  }
  if (limit === 'light') {
    return 'Cue density level 1: use a light cue pass with sparse tags where they improve delivery.';
  }
  return 'Cue density level 2: use a more expressive cue pass with richer emotion and pause direction.';
}

export function isScriptEnhancementActive(limit: ScriptEnhancementLimit): boolean {
  return limit !== 'none';
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

  const consecutiveTagMatch = text.match(/\][,.;:!?…—\s]*\[/);
  if (consecutiveTagMatch) {
    const start = consecutiveTagMatch.index ?? 0;
    issues.push({
      index: issues.length + 1,
      message: 'Cue tags cannot be placed directly next to each other.',
      excerpt: buildValidationExcerpt(text, start, start + consecutiveTagMatch[0].length),
    });
  }

  splitIntoSentences(text).forEach((sentence) => {
    const sentenceTags = sentence.match(/\[[^[\]]+\]/g) ?? [];
    if (sentenceTags.length <= 2) return;

    const sentenceStart = text.indexOf(sentence);
    const safeStart = sentenceStart >= 0 ? sentenceStart : 0;
    issues.push({
      index: issues.length + 1,
      message: 'Each sentence can contain at most 2 cue tags.',
      excerpt: buildValidationExcerpt(text, safeStart, safeStart + sentence.length),
    });
  });

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
  poiName?: string;
  projectTitle?: string;
}): string {
  const { settings, character, scriptText, poiName, projectTitle } = args;
  const { directorNote } = settings;
  const sampleContext = character.staticInstruction.trim() || AUDIO_DIRECTOR_SAMPLE_CONTEXT;
  if (directorNote.isPromptCustomized && directorNote.compiledPromptOverride.trim()) {
    return directorNote.compiledPromptOverride.trim();
  }

  const resolvedPoiName = poiName?.trim() || 'POI Name';
  const resolvedProjectTitle = projectTitle?.trim() || 'Project Title';
  const detailedSceneParagraph = directorNote.detailedSceneParagraph.trim();
  const detailedPerformanceGuidelines = directorNote.generatedPerformanceGuidelines.trim();

  return [
    `# AUDIO PROFILE: ${character.name}`,
    `## "[${character.role}/${resolvedPoiName}]"`,
    `## THE SCENE: ${resolvedProjectTitle}`,
    detailedSceneParagraph,
    detailedPerformanceGuidelines ? '## DETAILED PERFORMANCE GUIDELINES' : '',
    detailedPerformanceGuidelines,
    '### SAMPLE CONTEXT',
    sampleContext,
    '#### TRANSCRIPT',
    scriptText.trim(),
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
  poiName?: string;
  projectTitle?: string;
}): {
  scene: string;
  style: string;
  pacing: string;
  compiledPrompt: string;
  contentVersion: ContentVersion;
  scriptEnhancementLimit: ScriptEnhancementLimit;
} {
  const { settings, character, voice, scriptText, poiName, projectTitle } = args;
  return {
    scene: settings.directorNote.scene,
    style: settings.directorNote.style,
    pacing: settings.directorNote.pacing,
    compiledPrompt: resolveCompiledPrompt({ settings, character, voice, scriptText, poiName, projectTitle }),
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
