import { Box, Container } from '@mui/material';
import type { AudioPoiDraft, AudioGuideSettings } from '../../../audioMvp/model';
import type { ItemGenerationState } from '../../types';
import ChatMessageList from './ChatMessageList';

interface ChatInterfaceProps {
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
  globalSettings: AudioGuideSettings;
  onManualEditDirectorNote: () => void;
  onAiEditDirectorNote: () => void;
  onOpenVoicePicker: () => void;
  onOpenCharacterPicker: () => void;
  selectedCharacterName?: string;
  selectedVoiceName?: string;
  enhancedScript?: Record<string, string>;
  isEnhancementEnabled?: boolean;
  playingAudioId: string | null;
  onPlayAudio: (spotId: string, audioUrl: string) => void;
}

export default function ChatInterface({
  directorNote,
  items,
  itemStates,
  audioFiles,
  coreLanguage,
  onManualEditDirectorNote,
  onAiEditDirectorNote,
  onOpenVoicePicker,
  onOpenCharacterPicker,
  selectedCharacterName,
  selectedVoiceName,
  enhancedScript = {},
  isEnhancementEnabled = false,
  playingAudioId,
  onPlayAudio,
}: ChatInterfaceProps) {
  return (
    <Container maxWidth="lg">
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '1fr 300px' },
          gap: 3,
          height: 'calc(100vh - 200px)',
        }}
      >
        {/* Chat Column - Left */}
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          }}
        >
          <ChatMessageList
            directorNote={directorNote}
            items={items}
            itemStates={itemStates}
            audioFiles={audioFiles}
            coreLanguage={coreLanguage}
            onManualEditDirectorNote={onManualEditDirectorNote}
            onAiEditDirectorNote={onAiEditDirectorNote}
            onOpenVoicePicker={(spotId) => {
              // Store spotId or handle per-spot voice picker
              onOpenVoicePicker();
            }}
            onOpenCharacterPicker={(spotId) => {
              // Store spotId or handle per-spot character picker
              onOpenCharacterPicker();
            }}
            playingAudioId={playingAudioId}
            onPlayAudio={onPlayAudio}
            selectedCharacterName={selectedCharacterName}
            selectedVoiceName={selectedVoiceName}
            enhancedScript={enhancedScript}
            isEnhancementEnabled={isEnhancementEnabled}
          />
        </Box>

        {/* Right Sidebar - Reserved for future context panel */}
        <Box
          sx={{
            display: { xs: 'none', md: 'flex' },
            flexDirection: 'column',
            background: 'linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%)',
            borderRadius: 2,
            p: 2,
            border: '1px solid #e5e7eb',
            height: '100%',
            overflowY: 'auto',
          }}
        >
          {/* Empty placeholder for future context panel */}
          <Box sx={{ color: '#9CA3AF', textAlign: 'center', py: 4 }}>
            Context panel (reserved for future features)
          </Box>
        </Box>
      </Box>
    </Container>
  );
}
