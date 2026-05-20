import AddIcon from '@mui/icons-material/Add';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Stack,
  Tab,
  Tabs,
  Tooltip,
  Typography,
} from '@mui/material';
import type { AudioMvpCharacter } from '../../../audioMvp/model';
import { genderLabelForCharacter } from '../../characterLibrary';
import { createSelectableCardSx } from '../../theme';

type Props = {
  open: boolean;
  presetCharacters: AudioMvpCharacter[];
  customCharacters: AudioMvpCharacter[];
  selectedCharacterId: string;
  activeTab: 'preset' | 'custom';
  customCharactersLoading: boolean;
  customCharactersError: string | null;
  canManageCustomCharacters: boolean;
  pendingDeleteCharacterId: string | null;
  onClose: () => void;
  onSelect: (characterId: string) => void;
  onTabChange: (tab: 'preset' | 'custom') => void;
  onCreateCustomCharacter: () => void;
  onEditCustomCharacter: (character: AudioMvpCharacter) => void;
  onDeleteCustomCharacter: (character: AudioMvpCharacter) => void;
};

export default function CharacterPickerDialog(props: Props) {
  const {
    open,
    presetCharacters,
    customCharacters,
    selectedCharacterId,
    activeTab,
    customCharactersLoading,
    customCharactersError,
    canManageCustomCharacters,
    pendingDeleteCharacterId,
    onClose,
    onSelect,
    onTabChange,
    onCreateCustomCharacter,
    onEditCustomCharacter,
    onDeleteCustomCharacter,
  } = props;

  const activeCharacters = activeTab === 'preset' ? presetCharacters : customCharacters;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
        <Stack>
          <Typography variant="h6">Character Library</Typography>
          <Typography variant="body2" color="text.secondary">
            Switch between built-in presets and tenant-specific custom narrators.
          </Typography>
        </Stack>

        <IconButton size="small" onClick={onClose}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2}>
            <Tabs
              value={activeTab}
              onChange={(_event, value: 'preset' | 'custom') => onTabChange(value)}
              sx={{ minHeight: 40 }}
            >
              <Tab label="Presets" value="preset" />
              <Tab label={`Custom Characters (${customCharacters.length})`} value="custom" />
            </Tabs>

            {activeTab === 'custom' ? (
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={onCreateCustomCharacter}
                disabled={!canManageCustomCharacters}
              >
                New Character
              </Button>
            ) : null}
          </Stack>

          {activeTab === 'custom' && customCharactersError ? (
            <Alert severity="error">{customCharactersError}</Alert>
          ) : null}

          {activeTab === 'custom' && customCharactersLoading ? (
            <Stack direction="row" spacing={1} alignItems="center" sx={{ py: 3, justifyContent: 'center' }}>
              <CircularProgress size={20} />
              <Typography variant="body2" color="text.secondary">
                Loading tenant characters…
              </Typography>
            </Stack>
          ) : null}

          {!customCharactersLoading && activeCharacters.length === 0 ? (
            <Paper variant="outlined" sx={{ p: 3, backgroundColor: '#faf7f0' }}>
              <Typography variant="subtitle2" fontWeight={700}>
                {activeTab === 'preset' ? 'No preset characters available.' : 'No custom characters yet.'}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {activeTab === 'preset'
                  ? 'The built-in presets could not be loaded.'
                  : 'Create a character in Character Designer to add reusable narration personas.'}
              </Typography>
            </Paper>
          ) : null}

          <Stack spacing={1.5}>
            {activeCharacters.map((character) => {
              const isSelected = selectedCharacterId === character.id;
              const canManage = character.source === 'custom' && canManageCustomCharacters;
              const isDeleting = pendingDeleteCharacterId === character.id;

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
                        <Chip label={genderLabelForCharacter(character)} size="small" variant="outlined" />
                        <Chip
                          label={character.source === 'preset' ? 'Preset' : 'Custom'}
                          size="small"
                          color={character.source === 'preset' ? 'default' : 'primary'}
                          variant={character.source === 'preset' ? 'outlined' : 'filled'}
                        />
                      </Stack>

                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                        <strong>Context:</strong> {character.context || character.personalityDNA}
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
                          <strong>Sample context:</strong> {character.staticInstruction}
                        </Typography>
                      ) : null}
                    </Box>

                    <Stack direction="row" spacing={0.5} alignItems="center">
                      {canManage ? (
                        <>
                          <Tooltip title="Edit character">
                            <span>
                              <IconButton
                                size="small"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onEditCustomCharacter(character);
                                }}
                              >
                                <EditOutlinedIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                          <Tooltip title="Delete character">
                            <span>
                              <IconButton
                                size="small"
                                disabled={isDeleting}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onDeleteCustomCharacter(character);
                                }}
                              >
                                {isDeleting ? <CircularProgress size={16} /> : <DeleteOutlineIcon fontSize="small" />}
                              </IconButton>
                            </span>
                          </Tooltip>
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
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
