import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import {
  Box,
  Button,
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
  onCreate: () => void;
  onEdit: (characterId: string) => void;
  onDelete: (characterId: string) => void;
};

export default function CharacterPickerDialog(props: Props) {
  const {
    open,
    characters,
    selectedCharacterId,
    onClose,
    onSelect,
    onCreate,
    onEdit,
    onDelete,
  } = props;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
        <Stack>
          <Typography variant="h6">Select Character</Typography>
          <Typography variant="body2" color="text.secondary">
            Presets give you a fast starting point, while custom characters let you define your own narrator.
          </Typography>
        </Stack>

        <Stack direction="row" spacing={1} alignItems="center">
          <Button
            variant="outlined"
            size="small"
            startIcon={<AddCircleOutlineIcon />}
            onClick={() => {
              onClose();
              onCreate();
            }}
          >
            New Character
          </Button>
          <IconButton size="small" onClick={onClose}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>
      </DialogTitle>

      <DialogContent dividers>
        <Stack spacing={1.5} sx={{ pt: 1 }}>
          {characters.map((character) => {
            const isSelected = selectedCharacterId === character.id;
            const isCustom = character.source === 'custom';

            return (
              <Paper
                key={character.id}
                elevation={0}
                onClick={() => onSelect(character.id)}
                sx={createSelectableCardSx({
                  selected: isSelected,
                  backgroundColor: isCustom ? '#ffffff' : '#faf7f0',
                })}
              >
                <Stack direction="row" spacing={2} alignItems="flex-start">
                  <Typography variant="h4">{character.avatar}</Typography>

                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
                      <Typography variant="subtitle1" fontWeight={700}>{character.name}</Typography>
                      <Chip label={isCustom ? 'Custom' : 'Preset'} size="small" />
                    </Stack>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                      {character.role}
                    </Typography>
                    {character.personalityDNA ? (
                      <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.75 }}>
                        {character.personalityDNA}
                      </Typography>
                    ) : null}
                    {character.coreTimbre ? (
                      <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.75 }}>
                        <strong>Core timbre:</strong> {character.coreTimbre}
                      </Typography>
                    ) : null}
                  </Box>

                  <Stack direction="row" spacing={0.5} alignItems="center">
                    {isCustom ? (
                      <>
                        <IconButton
                          size="small"
                          onClick={(event) => {
                            event.stopPropagation();
                            onClose();
                            onEdit(character.id);
                          }}
                        >
                          <EditOutlinedIcon fontSize="small" />
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={(event) => {
                            event.stopPropagation();
                            if (window.confirm(`Delete the "${character.name}" character?`)) {
                              onDelete(character.id);
                            }
                          }}
                        >
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      </>
                    ) : null}
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
