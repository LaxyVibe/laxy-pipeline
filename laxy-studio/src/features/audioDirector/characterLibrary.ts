import type { GenerateCharacterResponse } from '../../api';
import {
  buildCharacterAudioProfileMarkdown,
  type AudioMvpCharacter,
} from '../audioMvp/model';

export type CharacterDesignerValues = {
  name: string;
  gender: string;
  role: string;
  context: string;
};

export function createEmptyCharacterDesignerValues(): CharacterDesignerValues {
  return {
    name: '',
    gender: '',
    role: '',
    context: '',
  };
}

export function genderLabelForCharacter(character: AudioMvpCharacter): string {
  if (character.gender?.trim()) return character.gender.trim();
  if (character.genderIdentity === 'masculine') return 'Male';
  if (character.genderIdentity === 'feminine') return 'Female';
  return 'Neutral';
}

type GeneratedCharacterPayload = GenerateCharacterResponse['character'];

export function buildCustomCharacterRecord(args: {
  id: string;
  tenantId?: string;
  guideId?: string;
  createdBy: string;
  values: CharacterDesignerValues;
  character: GeneratedCharacterPayload;
  createdAt?: number;
  updatedAt?: number;
}): AudioMvpCharacter {
  const {
    id,
    tenantId,
    guideId,
    createdBy,
    values,
    character,
    createdAt,
    updatedAt,
  } = args;

  return {
    id,
    name: character.name.trim() || values.name.trim(),
    gender: character.gender.trim() || values.gender.trim(),
    role: character.role.trim() || values.role.trim(),
    avatar: character.avatar.trim() || '🎙️',
    genderIdentity: character.genderIdentity,
    context: character.context.trim() || values.context.trim(),
    coreTimbre: character.coreTimbre.trim(),
    personalityDNA: character.personalityDNA.trim(),
    linguisticFingerprint: character.linguisticFingerprint.trim(),
    brandPersona: character.brandPersona.trim(),
    accent: character.accent.trim(),
    staticInstruction: character.staticInstruction.trim(),
    audioProfileMarkdown: character.audioProfileMarkdown.trim() || buildCharacterAudioProfileMarkdown({
      name: character.name.trim() || values.name.trim(),
      role: character.role.trim() || values.role.trim(),
      staticInstruction: character.staticInstruction.trim(),
    }),
    source: 'custom',
    tenantId,
    guideId,
    createdBy,
    createdAt,
    updatedAt,
  };
}

export function buildCustomCharacterFirestorePayload(args: {
  tenantId?: string;
  guideId?: string;
  createdBy: string;
  values: CharacterDesignerValues;
  character: GeneratedCharacterPayload;
}) {
  const normalized = buildCustomCharacterRecord({
    id: 'pending',
    tenantId: args.tenantId,
    guideId: args.guideId,
    createdBy: args.createdBy,
    values: args.values,
    character: args.character,
  });

  return {
    name: normalized.name,
    gender: normalized.gender,
    role: normalized.role,
    avatar: normalized.avatar,
    genderIdentity: normalized.genderIdentity,
    context: normalized.context ?? '',
    coreTimbre: normalized.coreTimbre,
    personalityDNA: normalized.personalityDNA,
    linguisticFingerprint: normalized.linguisticFingerprint,
    brandPersona: normalized.brandPersona,
    accent: normalized.accent,
    staticInstruction: normalized.staticInstruction,
    audioProfileMarkdown: normalized.audioProfileMarkdown,
    source: normalized.source,
    createdBy: args.createdBy,
    ...(args.tenantId ? { tenantId: args.tenantId } : {}),
    ...(args.guideId ? { guideId: args.guideId } : {}),
  };
}
