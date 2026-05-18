import { Box, Stack } from '@mui/material';
import type { AudioPoiDraft } from '../../../audioMvp/model';
import type { ItemGenerationState } from '../../types';
import DirectorMessageCard from './DirectorMessageCard';
import VoiceActorMessageCard from './VoiceActorMessageCard';

interface ChatMessageListProps {
  directorNote: {
    vocalEnvironment: string;
    mission: string;
    pacing: string;
    compiledPromptOverride: string;
    compiledPrompt: string;
  };
  items: AudioPoiDraft[];
  itemStates: Record<string, ItemGenerationState>;
  audioFiles: Array<{ audioUrl: string; spotId: string }>;
  coreLanguage: string;
  onManualEditDirectorNote: () => void;
  onAiEditDirectorNote: () => void;
  onOpenVoicePicker: (spotId: string) => void;
  onOpenCharacterPicker: (spotId: string) => void;
  playingAudioId: string | null;
  onPlayAudio: (spotId: string, audioUrl: string) => void;
  selectedCharacterName?: string;
  selectedVoiceName?: string;
  enhancedScript?: Record<string, string>;
  isEnhancementEnabled?: boolean;
}

export default function ChatMessageList({
  directorNote,
  items,
  itemStates,
  audioFiles,
  coreLanguage,
  onManualEditDirectorNote,
  onAiEditDirectorNote,
  onOpenVoicePicker,
  onOpenCharacterPicker,
  playingAudioId,
  onPlayAudio,
  selectedCharacterName,
  selectedVoiceName,
  enhancedScript = {},
  isEnhancementEnabled = false,
}: ChatMessageListProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        flex: 1,
        overflowY: 'auto',
        pr: 1,
        '&::-webkit-scrollbar': {
          width: 8,
        },
        '&::-webkit-scrollbar-track': {
          background: 'transparent',
        },
        '&::-webkit-scrollbar-thumb': {
          background: '#ccc',
          borderRadius: 4,
          '&:hover': {
            background: '#999',
          },
        },
      }}
    >
      {/* Director Message */}
      <DirectorMessageCard
        vocalEnvironment={directorNote.vocalEnvironment}
        mission={directorNote.mission}
        pacing={directorNote.pacing}
        compiledPrompt={directorNote.compiledPromptOverride || directorNote.compiledPrompt}
        onManualEdit={onManualEditDirectorNote}
        onAiEdit={onAiEditDirectorNote}
      />

      {/* Voice Actor Messages - one per item */}
      <Stack spacing={2}>
        {items.map((item) => {
          const audioFile = audioFiles.find((f) => f.spotId === item.spotId);
          const generationState = itemStates[`${coreLanguage}-${item.spotId}`];
          const effectiveScript = isEnhancementEnabled
            ? enhancedScript[item.spotId] || item.scriptText
            : item.scriptText;

          return (
            <VoiceActorMessageCard
              key={item.spotId}
              spotId={item.spotId}
              spotNumber={item.spotNumber}
              title={item.title}
              scriptText={effectiveScript}
              originalScriptText={item.scriptText}
              characterName={selectedCharacterName || 'Character'}
              voiceName={selectedVoiceName || 'Voice'}
              audioUrl={audioFile?.audioUrl}
              isPlaying={playingAudioId === item.spotId}
              onPlayAudio={onPlayAudio}
              onOpenVoicePicker={onOpenVoicePicker}
              onOpenCharacterPicker={onOpenCharacterPicker}
              generationState={generationState}
              isEnhancementEnabled={isEnhancementEnabled}
            />
          );
        })}
      </Stack>
    </Box>
  );
}
