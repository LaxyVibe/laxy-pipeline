import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CloseIcon from '@mui/icons-material/Close';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import { useMemo, useState } from 'react';
import {
  Box,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Stack,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import type { AudioMvpVoice } from '../../../audioMvp/model';
import { createSelectableCardSx } from '../../theme';

type Props = {
  open: boolean;
  femaleVoices: AudioMvpVoice[];
  maleVoices: AudioMvpVoice[];
  selectedVoiceId: string;
  recommendedVoiceId: string;
  playingVoiceId: string | null;
  onClose: () => void;
  onSelect: (voiceId: string) => void;
  onPreview: (voiceId: string) => void;
};

type VoiceTab = 'all' | 'female' | 'male';

function buildSpectrum(voiceId: string): number[] {
  let seed = 0;
  for (const char of voiceId) {
    seed += char.charCodeAt(0);
  }
  return Array.from({ length: 24 }, (_, index) => {
    const base = (Math.sin((seed + index * 13) * 0.15) + 1) / 2;
    return 18 + Math.round(base * 68);
  });
}

type VoiceGroupProps = {
  title: string;
  voices: AudioMvpVoice[];
  selectedVoiceId: string;
  recommendedVoiceId: string;
  playingVoiceId: string | null;
  onSelect: (voiceId: string) => void;
  onPreview: (voiceId: string) => void;
};

function VoiceGroup(props: VoiceGroupProps) {
  const {
    title,
    voices,
    selectedVoiceId,
    recommendedVoiceId,
    playingVoiceId,
    onSelect,
    onPreview,
  } = props;

  return (
    <Box>
      <Typography variant="overline" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
        {title}
      </Typography>
      <Stack spacing={1}>
        {voices.map((voice) => {
          const isSelected = selectedVoiceId === voice.id;
          const isRecommended = recommendedVoiceId === voice.id;
          const isPlaying = playingVoiceId === voice.id;

          return (
            <Paper
              key={voice.id}
              elevation={0}
              onClick={() => onSelect(voice.id)}
              sx={createSelectableCardSx({
                selected: isSelected,
                recommended: isRecommended,
              })}
            >
              <Stack direction="row" spacing={1.5} alignItems="center">
                <IconButton
                  size="small"
                  onClick={(event) => {
                    event.stopPropagation();
                    onPreview(voice.id);
                  }}
                  sx={{ border: '1px solid', borderColor: 'divider', width: 36, height: 36, flexShrink: 0 }}
                >
                  {isPlaying ? <StopIcon fontSize="small" /> : <PlayArrowIcon fontSize="small" />}
                </IconButton>

                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" useFlexGap>
                    <Typography variant="subtitle2" fontWeight={700}>{voice.name}</Typography>
                    {isRecommended ? (
                      <Chip size="small" label="Recommended" color="warning" sx={{ height: 20, fontSize: '0.7rem' }} />
                    ) : null}
                  </Stack>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>{voice.summary}</Typography>
                  <Typography variant="caption" color="text.secondary" display="block">Tone: {voice.tone}</Typography>
                  <Typography variant="caption" color="text.secondary" display="block">Best for: {voice.bestFor}</Typography>
                  <Stack direction="row" spacing={0.5} sx={{ mt: 1, height: 26, alignItems: 'end' }}>
                    {buildSpectrum(voice.id).map((height, idx) => (
                      <Box
                        key={`${voice.id}-spec-${idx}`}
                        sx={{
                          width: 4,
                          height,
                          borderRadius: 2,
                          bgcolor: isSelected ? 'primary.main' : 'rgba(31, 92, 79, 0.25)',
                        }}
                      />
                    ))}
                  </Stack>
                </Box>

                {isSelected ? (
                  <CheckCircleIcon sx={{ color: 'primary.main', fontSize: 24, flexShrink: 0 }} />
                ) : null}
              </Stack>
            </Paper>
          );
        })}
      </Stack>
    </Box>
  );
}

export default function VoicePickerDialog(props: Props) {
  const {
    open,
    femaleVoices,
    maleVoices,
    selectedVoiceId,
    recommendedVoiceId,
    playingVoiceId,
    onClose,
    onSelect,
    onPreview,
  } = props;
  const [tab, setTab] = useState<VoiceTab>('all');

  const visibleGroups = useMemo(() => {
    if (tab === 'female') {
      return [{ key: 'female', title: 'Female', voices: femaleVoices }];
    }
    if (tab === 'male') {
      return [{ key: 'male', title: 'Male', voices: maleVoices }];
    }
    return [
      { key: 'female', title: 'Female', voices: femaleVoices },
      { key: 'male', title: 'Male', voices: maleVoices },
    ];
  }, [femaleVoices, maleVoices, tab]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Stack>
          <Typography variant="h6">Select Voice</Typography>
          <Typography variant="body2" color="text.secondary">
            Preview the available voices and pick the one that best matches the character and tone.
          </Typography>
        </Stack>
        <IconButton size="small" onClick={onClose}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Tabs value={tab} onChange={(_, next: VoiceTab) => setTab(next)}>
            <Tab value="all" label="All" />
            <Tab value="female" label="Female" />
            <Tab value="male" label="Male" />
          </Tabs>

          {visibleGroups.map((group) => (
            <VoiceGroup
              key={group.key}
              title={group.title}
              voices={group.voices}
              selectedVoiceId={selectedVoiceId}
              recommendedVoiceId={recommendedVoiceId}
              playingVoiceId={playingVoiceId}
              onSelect={onSelect}
              onPreview={onPreview}
            />
          ))}
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
