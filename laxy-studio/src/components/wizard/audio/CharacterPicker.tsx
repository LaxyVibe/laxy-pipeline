// ---------------------------------------------------------------------------
// CharacterPicker — select a voice character persona for audio generation
// ---------------------------------------------------------------------------
import {
  Box,
  Card,
  CardContent,
  Typography,
  Chip,
  alpha,
} from '@mui/material';
import StarIcon from '@mui/icons-material/Star';
import { CHARACTER_PRESETS, type VoiceCharacter } from '../../../types/entity';
import { useGuidesStore } from '../../../guidesStore';

interface CharacterCardProps {
  character: VoiceCharacter;
  selected: boolean;
  onSelect: () => void;
}

function CharacterCard({ character, selected, onSelect }: CharacterCardProps) {
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
          boxShadow: 3,
        },
      }}
    >
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Typography variant="h4" sx={{ lineHeight: 1 }}>
            {character.avatar}
          </Typography>
          <Box sx={{ flex: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Typography variant="subtitle2" fontWeight={700}>
                {character.name}
              </Typography>
              {character.aiRecommended && (
                <Chip
                  icon={<StarIcon />}
                  label="AI Suggested"
                  size="small"
                  color="warning"
                  variant="outlined"
                  sx={{ height: 20, '& .MuiChip-label': { px: 0.5, fontSize: '0.65rem' } }}
                />
              )}
            </Box>
            <Typography variant="caption" color="text.secondary">
              {character.role}
            </Typography>
          </Box>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem', mb: 0.5 }}>
          {character.personality}
        </Typography>
        <Typography variant="caption" color="text.disabled" sx={{ fontStyle: 'italic' }}>
          {character.speechPatterns}
        </Typography>
      </CardContent>
    </Card>
  );
}

export default function CharacterPicker() {
  const selectedCharacterId = useGuidesStore((s) => s.selectedCharacterId);
  const setSelectedCharacterId = useGuidesStore((s) => s.setSelectedCharacterId);

  return (
    <Box>
      <Typography variant="subtitle1" fontWeight={700} gutterBottom>
        Character Selection
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Choose a voice persona that defines the narration style. The character shapes personality,
        tone, and speech patterns for the generated audio.
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' },
          gap: 2,
        }}
      >
        {CHARACTER_PRESETS.map((char) => (
          <CharacterCard
            key={char.id}
            character={char}
            selected={selectedCharacterId === char.id}
            onSelect={() => setSelectedCharacterId(char.id)}
          />
        ))}
      </Box>
    </Box>
  );
}
