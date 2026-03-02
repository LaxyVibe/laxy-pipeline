// ---------------------------------------------------------------------------
// VoicePicker — select a TTS voice with gender filter and AI suggestion
// ---------------------------------------------------------------------------
import { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Chip,
  ToggleButton,
  ToggleButtonGroup,
  IconButton,
  Tooltip,
  alpha,
} from '@mui/material';
import StarIcon from '@mui/icons-material/Star';
import FemaleIcon from '@mui/icons-material/Female';
import MaleIcon from '@mui/icons-material/Male';
import PeopleIcon from '@mui/icons-material/People';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import { AVAILABLE_VOICES, type TTSVoice } from '../../../types/entity';
import { useGuidesStore } from '../../../guidesStore';

type GenderFilter = 'all' | 'female' | 'male';

interface VoiceCardProps {
  voice: TTSVoice;
  selected: boolean;
  onSelect: () => void;
}

function VoiceCard({ voice, selected, onSelect }: VoiceCardProps) {
  return (
    <Card
      onClick={onSelect}
      sx={{
        cursor: 'pointer',
        border: 2,
        borderColor: selected ? 'primary.main' : 'divider',
        bgcolor: selected
          ? (t) => alpha(t.palette.primary.main, 0.06)
          : 'background.paper',
        transition: 'all 0.2s',
        '&:hover': {
          borderColor: selected ? 'primary.main' : 'primary.light',
          transform: 'translateY(-2px)',
          boxShadow: 2,
        },
      }}
    >
      <CardContent
        sx={{
          p: 1.5,
          '&:last-child': { pb: 1.5 },
          display: 'flex',
          alignItems: 'center',
          gap: 1,
        }}
      >
        {voice.gender === 'female' ? (
          <FemaleIcon color="secondary" />
        ) : (
          <MaleIcon color="info" />
        )}
        <Box sx={{ flex: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Typography variant="subtitle2" fontWeight={700}>
              {voice.name}
            </Typography>
            {voice.aiRecommended && (
              <Chip
                icon={<StarIcon />}
                label="Suggested"
                size="small"
                color="warning"
                variant="outlined"
                sx={{
                  height: 20,
                  '& .MuiChip-label': { px: 0.5, fontSize: '0.65rem' },
                }}
              />
            )}
          </Box>
          <Typography variant="caption" color="text.secondary">
            {voice.description}
          </Typography>
        </Box>
        <Tooltip title="Preview voice sample (coming soon)">
          <span>
            <IconButton size="small" disabled>
              <PlayCircleOutlineIcon />
            </IconButton>
          </span>
        </Tooltip>
      </CardContent>
    </Card>
  );
}

export default function VoicePicker() {
  const selectedVoiceId = useGuidesStore((s) => s.selectedVoiceId);
  const setSelectedVoiceId = useGuidesStore((s) => s.setSelectedVoiceId);
  const [genderFilter, setGenderFilter] = useState<GenderFilter>('all');

  const filteredVoices =
    genderFilter === 'all'
      ? AVAILABLE_VOICES
      : AVAILABLE_VOICES.filter((v) => v.gender === genderFilter);

  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          mb: 2,
        }}
      >
        <Box>
          <Typography variant="subtitle1" fontWeight={700}>
            Voice Selection
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Choose the TTS voice for audio generation.
          </Typography>
        </Box>
        <ToggleButtonGroup
          value={genderFilter}
          exclusive
          onChange={(_, v) => v && setGenderFilter(v)}
          size="small"
        >
          <ToggleButton value="all">
            <PeopleIcon sx={{ mr: 0.5, fontSize: 18 }} /> All
          </ToggleButton>
          <ToggleButton value="female">
            <FemaleIcon sx={{ mr: 0.5, fontSize: 18 }} /> Female
          </ToggleButton>
          <ToggleButton value="male">
            <MaleIcon sx={{ mr: 0.5, fontSize: 18 }} /> Male
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
          gap: 1.5,
        }}
      >
        {filteredVoices.map((voice) => (
          <VoiceCard
            key={voice.id}
            voice={voice}
            selected={selectedVoiceId === voice.id}
            onSelect={() => setSelectedVoiceId(voice.id)}
          />
        ))}
      </Box>
    </Box>
  );
}
