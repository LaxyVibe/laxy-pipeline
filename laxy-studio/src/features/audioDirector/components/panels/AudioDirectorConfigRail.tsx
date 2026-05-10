import RecordVoiceOverOutlinedIcon from '@mui/icons-material/RecordVoiceOverOutlined';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import {
  Box,
  Button,
  Chip,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import type { ReactNode } from 'react';
import type { AudioMvpCharacter, AudioMvpVoice } from '../../../audioMvp/model';
import { audioDirectorStyles } from '../../theme';

type Props = {
  selectedCharacter: AudioMvpCharacter;
  selectedVoice: AudioMvpVoice;
  coreLanguage: string;
  estimatedTokens: number;
  onOpenCharacterPicker: () => void;
  onOpenVoicePicker: () => void;
};

function ConfigItem(props: {
  icon: ReactNode;
  label: string;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  const { icon, label, title, subtitle, onClick } = props;

  return (
    <Button
      onClick={onClick}
      variant="outlined"
      fullWidth
      sx={{
        justifyContent: 'flex-start',
        textAlign: 'left',
        p: 1.5,
      }}
      startIcon={icon}
    >
      <Stack spacing={0.25} alignItems="flex-start">
        <Typography variant="caption" color="text.secondary" sx={{ letterSpacing: '0.08em' }}>
          {label}
        </Typography>
        <Typography variant="subtitle2" fontWeight={700}>
          {title}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.4 }}>
          {subtitle}
        </Typography>
      </Stack>
    </Button>
  );
}

export default function AudioDirectorConfigRail(props: Props) {
  const { selectedCharacter, selectedVoice, coreLanguage, estimatedTokens, onOpenCharacterPicker, onOpenVoicePicker } = props;

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        borderRadius: 5,
        border: '1px solid rgba(31, 43, 38, 0.10)',
        bgcolor: 'rgba(255, 255, 255, 0.88)',
        backdropFilter: 'blur(12px)',
        position: { xl: 'sticky' },
        top: { xl: 24 },
      }}
    >
      <Stack spacing={2}>
        <Box>
          <Typography variant="overline" sx={{ letterSpacing: '0.18em', color: 'text.secondary' }}>
            Config
          </Typography>
          <Typography variant="h6" fontWeight={700}>
            Audio director setup
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Character and voice live here. Click an item to open the picker dialog.
          </Typography>
        </Box>

        <Stack spacing={1.25}>
          <ConfigItem
            icon={<RecordVoiceOverOutlinedIcon fontSize="small" />}
            label="Character"
            title={selectedCharacter.name}
            subtitle={selectedCharacter.role}
            onClick={onOpenCharacterPicker}
          />
          <ConfigItem
            icon={<PlayCircleOutlineIcon fontSize="small" />}
            label="Voice"
            title={selectedVoice.name}
            subtitle={selectedVoice.summary}
            onClick={onOpenVoicePicker}
          />
        </Stack>

        <Paper elevation={0} sx={{ p: 1.5, borderRadius: 3, bgcolor: 'background.default' }}>
          <Stack spacing={1}>
            <Chip label={`Language: ${coreLanguage.toUpperCase()}`} size="small" variant="outlined" />
            <Chip label={`${estimatedTokens.toLocaleString()} est. tokens`} size="small" color="secondary" />
            <Typography variant="caption" color="text.secondary">
              Keep these selections fixed while you edit notes and polish the script.
            </Typography>
          </Stack>
        </Paper>

        <Paper elevation={0} sx={{ p: 1.5, borderRadius: 3, bgcolor: 'rgba(31, 92, 79, 0.06)' }}>
          <Stack spacing={0.5}>
            <Typography variant="caption" color="text.secondary" sx={{ letterSpacing: '0.08em' }}>
              Workspace
            </Typography>
            <Typography variant="subtitle2" fontWeight={700}>
              One page, one flow
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Edit the director note, polish the script, then generate from the history rail.
            </Typography>
          </Stack>
        </Paper>
      </Stack>
    </Paper>
  );
}