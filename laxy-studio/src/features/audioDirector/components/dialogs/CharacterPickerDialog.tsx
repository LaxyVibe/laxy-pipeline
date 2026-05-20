import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CloseIcon from '@mui/icons-material/Close';
import {
  Box,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import type { AudioMvpCharacter } from '../../../audioMvp/model';
import { createSelectableCardSx } from '../../theme';

type Props = {
  open: boolean;
  characters: AudioMvpCharacter[];
  selectedCharacterId: string;
  onClose: () => void;
  onSelect: (characterId: string) => void;
};

export default function CharacterPickerDialog(props: Props) {
  const {
    open,
    characters,
    selectedCharacterId,
    onClose,
    onSelect,
  } = props;

  const genderLabel = (genderIdentity: AudioMvpCharacter['genderIdentity']) => {
    if (genderIdentity === 'masculine') return 'Male';
    if (genderIdentity === 'feminine') return 'Female';
    return 'Neutral';
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
        <Stack>
          <Typography variant="h6">Character Library</Typography>
          <Typography variant="body2" color="text.secondary">
            Choose from three fixed narration personas for Audio Director.
          </Typography>
        </Stack>

        <IconButton size="small" onClick={onClose}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        <Stack spacing={1.5} sx={{ pt: 1 }}>
          {characters.map((character) => {
            const isSelected = selectedCharacterId === character.id;

            return (
              <Paper
                key={character.id}
                elevation={0}
                onClick={() => onSelect(character.id)}
                sx={createSelectableCardSx({
                  selected: isSelected,
                  backgroundColor: '#faf7f0',
                })}
              >
                <Stack direction="row" spacing={2} alignItems="flex-start">
                  <Typography variant="h4">{character.avatar}</Typography>

                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
                      <Typography variant="subtitle1" fontWeight={700}>{character.name}</Typography>
                      <Chip label={character.role} size="small" />
                      <Chip label={genderLabel(character.genderIdentity)} size="small" variant="outlined" />
                    </Stack>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                      <strong>Context:</strong> {character.personalityDNA}
                    </Typography>
                    {character.coreTimbre ? (
                      <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
                        <strong>Voice:</strong> {character.coreTimbre}
                      </Typography>
                    ) : null}
                    {character.staticInstruction ? (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        display="block"
                        sx={{
                          mt: 1,
                          display: '-webkit-box',
                          WebkitLineClamp: 4,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                      >
                        <strong>Output:</strong> {character.staticInstruction}
                      </Typography>
                    ) : null}
                  </Box>

                  <Stack direction="row" spacing={0.5} alignItems="center">
                    {isSelected ? (
                      <CheckCircleIcon sx={{ color: 'primary.main', fontSize: 24, flexShrink: 0 }} />
                    ) : null}
                  </Stack>
                </Stack>
              </Paper>
            );
          })}
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
