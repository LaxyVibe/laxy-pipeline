import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CloseIcon from '@mui/icons-material/Close';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import type { CharacterEditorDraft } from '../../types';

type Props = {
  open: boolean;
  editingCharacterId: string | null;
  designerPrompt: string;
  isGeneratingCharacter: boolean;
  characterDraft: CharacterEditorDraft;
  onClose: () => void;
  onDesignerPromptChange: (value: string) => void;
  onDraftChange: (draft: CharacterEditorDraft) => void;
  onGenerateDraft: () => void;
  onSave: () => void;
};

export default function CharacterEditorDialog(props: Props) {
  const {
    open,
    editingCharacterId,
    designerPrompt,
    isGeneratingCharacter,
    characterDraft,
    onClose,
    onDesignerPromptChange,
    onDraftChange,
    onGenerateDraft,
    onSave,
  } = props;

  const updateDraft = <K extends keyof CharacterEditorDraft>(field: K, value: CharacterEditorDraft[K]) => {
    onDraftChange({
      ...characterDraft,
      [field]: value,
    });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Stack>
          <Typography variant="h6">{editingCharacterId ? 'Edit Character' : 'Create Character'}</Typography>
          <Typography variant="body2" color="text.secondary">
            Build a narrator profile that can be reused across guides.
          </Typography>
        </Stack>
        <IconButton size="small" onClick={onClose}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField
            label="Character Designer Prompt"
            multiline
            minRows={3}
            value={designerPrompt}
            onChange={(event) => onDesignerPromptChange(event.target.value)}
            placeholder="Example: Warm local guide who treats visitors like welcomed guests and speaks with insider confidence."
          />

          <Button
            variant="outlined"
            startIcon={<AutoAwesomeIcon />}
            onClick={onGenerateDraft}
            disabled={!designerPrompt.trim() || isGeneratingCharacter}
          >
            {isGeneratingCharacter ? 'Generating…' : 'Generate Character'}
          </Button>

          <Divider />

          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <TextField
              label="Name"
              value={characterDraft.name}
              onChange={(event) => updateDraft('name', event.target.value)}
              fullWidth
            />
            <TextField
              label="Role"
              value={characterDraft.role}
              onChange={(event) => updateDraft('role', event.target.value)}
              fullWidth
            />
          </Stack>

          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <TextField
              label="Avatar"
              value={characterDraft.avatar}
              onChange={(event) => updateDraft('avatar', event.target.value)}
              fullWidth
            />
            <TextField
              select
              label="Gender Identity"
              value={characterDraft.genderIdentity}
              onChange={(event) => updateDraft('genderIdentity', event.target.value as CharacterEditorDraft['genderIdentity'])}
              fullWidth
            >
              <MenuItem value="neutral">Neutral</MenuItem>
              <MenuItem value="feminine">Feminine</MenuItem>
              <MenuItem value="masculine">Masculine</MenuItem>
            </TextField>
          </Stack>

          <TextField
            label="Accent"
            value={characterDraft.accent}
            onChange={(event) => updateDraft('accent', event.target.value)}
          />

          <TextField
            label="Core Timbre"
            multiline
            minRows={2}
            value={characterDraft.coreTimbre}
            onChange={(event) => updateDraft('coreTimbre', event.target.value)}
          />
          <TextField
            label="Personality DNA"
            multiline
            minRows={2}
            value={characterDraft.personalityDNA}
            onChange={(event) => updateDraft('personalityDNA', event.target.value)}
          />
          <TextField
            label="Linguistic Fingerprint"
            multiline
            minRows={2}
            value={characterDraft.linguisticFingerprint}
            onChange={(event) => updateDraft('linguisticFingerprint', event.target.value)}
          />
          <TextField
            label="Brand Persona"
            multiline
            minRows={2}
            value={characterDraft.brandPersona}
            onChange={(event) => updateDraft('brandPersona', event.target.value)}
          />
          <TextField
            label="Base Guidance"
            multiline
            minRows={5}
            value={characterDraft.staticInstruction}
            onChange={(event) => updateDraft('staticInstruction', event.target.value)}
          />
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>
          Cancel
        </Button>
        <Button variant="contained" onClick={onSave}>
          {editingCharacterId ? 'Update Character' : 'Save Character'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
