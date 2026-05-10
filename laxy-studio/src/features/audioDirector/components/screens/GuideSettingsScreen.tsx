import type { ReactNode } from 'react';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import CodeOutlinedIcon from '@mui/icons-material/CodeOutlined';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import RecordVoiceOverOutlinedIcon from '@mui/icons-material/RecordVoiceOverOutlined';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import StopIcon from '@mui/icons-material/Stop';
import TuneIcon from '@mui/icons-material/Tune';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  IconButton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  CONTENT_VERSION_OPTIONS,
  SCRIPT_ENHANCEMENT_OPTIONS,
  type AudioGuideSettings,
  type AudioMvpCharacter,
  type AudioMvpVoice,
  type VoiceRecommendation,
} from '../../../audioMvp/model';
import type { SaveStatus } from '../../types';
import { audioDirectorStyles } from '../../theme';
import AudioDirectorSectionHeader from '../AudioDirectorSectionHeader';

type Props = {
  globalSettings: AudioGuideSettings;
  selectedCharacter: AudioMvpCharacter;
  selectedVoice: AudioMvpVoice;
  globalRecommendation: VoiceRecommendation;
  estimatedTokens: number;
  saveStatus: SaveStatus;
  saveMessage: string | null;
  playingVoiceId: string | null;
  onPreviewVoice: (voiceId: string) => void;
  onOpenCharacterPicker: () => void;
  onOpenVoicePicker: () => void;
  onOpenDirectorNoteEditor: () => void;
  onOpenConfigPreview: () => void;
  onDownloadConfig: () => void;
  onSaveDraft: () => void;
  onBack?: () => void;
  onContinue: () => void;
};

function SummaryCard(props: {
  icon: ReactNode;
  title: string;
  actionLabel: string;
  onAction: () => void;
  children: ReactNode;
}) {
  const { icon, title, actionLabel, onAction, children } = props;

  return (
    <Card sx={audioDirectorStyles.sectionCard}>
      <CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
        <Stack spacing={2}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Stack direction="row" spacing={1} alignItems="center">
              {icon}
              <Typography variant="subtitle2" fontWeight={700}>{title}</Typography>
            </Stack>
            <Button size="small" startIcon={<EditOutlinedIcon />} onClick={onAction}>
              {actionLabel}
            </Button>
          </Stack>
          {children}
        </Stack>
      </CardContent>
    </Card>
  );
}

export default function GuideSettingsScreen(props: Props) {
  const {
    globalSettings,
    selectedCharacter,
    selectedVoice,
    globalRecommendation,
    estimatedTokens,
    saveStatus,
    saveMessage,
    playingVoiceId,
    onPreviewVoice,
    onOpenCharacterPicker,
    onOpenVoicePicker,
    onOpenDirectorNoteEditor,
    onOpenConfigPreview,
    onDownloadConfig,
    onSaveDraft,
    onBack,
    onContinue,
  } = props;

  return (
    <Stack spacing={3}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={2}
        justifyContent="space-between"
        alignItems={{ xs: 'stretch', md: 'flex-end' }}
      >
        <AudioDirectorSectionHeader
          icon={<TuneIcon />}
          title="Tune the guide direction"
          body="Pick the narrator persona, voice, and directing notes that shape how the final audio will feel."
          eyebrow="Guide Setup"
        />

        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
          <Button variant="outlined" size="small" startIcon={<CodeOutlinedIcon />} onClick={onOpenConfigPreview}>
            Preview Prompt
          </Button>
          <Button variant="outlined" size="small" startIcon={<DownloadOutlinedIcon />} onClick={onDownloadConfig}>
            Download Prompt
          </Button>
          <Button
            variant="contained"
            size="small"
            startIcon={<SaveOutlinedIcon />}
            onClick={onSaveDraft}
            disabled={saveStatus === 'saving'}
          >
            {saveStatus === 'saving' ? 'Creating Snapshot…' : 'Create Session Snapshot'}
          </Button>
        </Stack>
      </Stack>

      {saveMessage ? (
        <Alert severity={saveStatus === 'error' ? 'error' : 'success'}>
          {saveMessage}
        </Alert>
      ) : null}

      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: {
            xs: '1fr',
            lg: 'repeat(3, minmax(0, 1fr))',
          },
        }}
      >
        <SummaryCard
          icon={<RecordVoiceOverOutlinedIcon sx={{ color: 'text.secondary', fontSize: 20 }} />}
          title="Character"
          actionLabel="Edit"
          onAction={onOpenCharacterPicker}
        >
          <Stack direction="row" spacing={2} alignItems="center">
            <Typography variant="h4">{selectedCharacter.avatar}</Typography>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="subtitle1" fontWeight={700}>{selectedCharacter.name}</Typography>
              <Typography variant="body2" color="text.secondary">{selectedCharacter.role}</Typography>
            </Box>
            <Chip label={selectedCharacter.source === 'preset' ? 'Preset' : 'Custom'} size="small" />
          </Stack>

          {selectedCharacter.personalityDNA ? (
            <Typography variant="body2" color="text.secondary">
              {selectedCharacter.personalityDNA}
            </Typography>
          ) : null}

          <Box>
            <Typography variant="caption" fontWeight={700}>Core timbre</Typography>
            <Typography variant="body2" color="text.secondary">
              {selectedCharacter.coreTimbre}
            </Typography>
          </Box>
        </SummaryCard>

        <SummaryCard
          icon={<PlayCircleOutlineIcon sx={{ color: 'text.secondary', fontSize: 20 }} />}
          title="Voice"
          actionLabel="Edit"
          onAction={onOpenVoicePicker}
        >
          <Stack direction="row" spacing={2} alignItems="center">
            <IconButton
              size="small"
              onClick={() => onPreviewVoice(selectedVoice.id)}
              sx={{ border: '1px solid', borderColor: 'divider', width: 40, height: 40, flexShrink: 0 }}
            >
              {playingVoiceId === selectedVoice.id ? <StopIcon /> : <PlayArrowIcon />}
            </IconButton>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" useFlexGap>
                <Typography variant="subtitle1" fontWeight={700}>{selectedVoice.name}</Typography>
                {selectedVoice.id === globalRecommendation.recommendedVoiceId ? (
                  <Chip size="small" label="Recommended" color="warning" sx={{ height: 20, fontSize: '0.7rem' }} />
                ) : null}
              </Stack>
              <Typography variant="body2" color="text.secondary">{selectedVoice.summary}</Typography>
            </Box>
          </Stack>

          <Box>
            <Typography variant="caption" fontWeight={700}>Tone</Typography>
            <Typography variant="body2" color="text.secondary">{selectedVoice.tone}</Typography>
          </Box>

          <Box>
            <Typography variant="caption" fontWeight={700}>Recommendation</Typography>
            <Typography variant="body2" color="text.secondary">{globalRecommendation.reason}</Typography>
          </Box>
        </SummaryCard>

        <SummaryCard
          icon={<TuneIcon sx={{ color: 'text.secondary', fontSize: 20 }} />}
          title="Director Note"
          actionLabel="Edit"
          onAction={onOpenDirectorNoteEditor}
        >
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            <Chip
              label={CONTENT_VERSION_OPTIONS.find((option) => option.id === globalSettings.contentVersion)?.label ?? globalSettings.contentVersion}
              variant="outlined"
              size="small"
            />
            <Chip
              label={SCRIPT_ENHANCEMENT_OPTIONS.find((option) => option.id === globalSettings.scriptEnhancementLimit)?.label ?? globalSettings.scriptEnhancementLimit}
              variant="outlined"
              size="small"
            />
          </Stack>

          <Box>
            <Typography variant="caption" fontWeight={700}>Scene</Typography>
            <Typography variant="body2" color="text.secondary">{globalSettings.directorNote.scene}</Typography>
          </Box>

          <Box>
            <Typography variant="caption" fontWeight={700}>Style & pacing</Typography>
            <Typography variant="body2" color="text.secondary">
              {globalSettings.directorNote.style}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {globalSettings.directorNote.pacing}
            </Typography>
          </Box>
        </SummaryCard>
      </Box>

      <Card sx={audioDirectorStyles.sectionCard}>
        <CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
          <Stack spacing={2}>
            <Typography variant="subtitle1" fontWeight={700}>Generation summary</Typography>
            <Typography variant="body2" color="text.secondary">
              Audio generation will use the currently selected Character, Voice, and Director Note. If you want to inspect or edit the full compiled prompt, open the Director Note editor or the config preview.
            </Typography>
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              <Chip label={`${estimatedTokens.toLocaleString()} estimated tokens`} color="secondary" />
              {globalRecommendation.fallbackVoiceIds.length > 0 ? (
                <Chip label={`Fallbacks: ${globalRecommendation.fallbackVoiceIds.join(', ')}`} variant="outlined" />
              ) : null}
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="space-between">
        {onBack ? (
          <Button variant="outlined" startIcon={<ArrowBackIcon />} onClick={onBack}>
            Back
          </Button>
        ) : (
          <Box />
        )}
        <Button variant="contained" endIcon={<ArrowForwardIcon />} onClick={onContinue}>
          Jump to Script Polish
        </Button>
      </Stack>
    </Stack>
  );
}
