import CloseIcon from '@mui/icons-material/Close';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import type { AudioGuideSettings } from '../../../audioMvp/model';

type Props = {
  open: boolean;
  settings: AudioGuideSettings;
  onClose: () => void;
  onDone: () => void;
  onEnvironmentChange: (value: string) => void;
  onTargetAudienceChange: (value: string) => void;
  onGoalChange: (value: string) => void;
  onToneChange: (value: string) => void;
};

export default function DirectorNoteDialog(props: Props) {
  const {
    open,
    settings,
    onClose,
    onDone,
    onEnvironmentChange,
    onTargetAudienceChange,
    onGoalChange,
    onToneChange,
  } = props;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Stack>
          <Typography variant="h6">Performance Hint</Typography>
          <Typography variant="body2" color="text.secondary">
            Describe where, who, what, and how for the performance.
          </Typography>
        </Stack>
        <IconButton size="small" onClick={onClose}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          <TextField
            label="Where (Environment)"
            helperText="The physical space, lighting, ambient atmosphere, and scene constraints."
            multiline
            minRows={3}
            value={settings.directorNote.scene}
            onChange={(event) => onEnvironmentChange(event.target.value)}
            fullWidth
          />

          <TextField
            label="Who (Target Audience)"
            helperText="Who is listening."
            multiline
            minRows={3}
            value={settings.directorNote.style}
            onChange={(event) => onTargetAudienceChange(event.target.value)}
            fullWidth
          />

          <TextField
            label="What (Expectation/Goal)"
            helperText="What emotional or intellectual impact to deliver."
            multiline
            minRows={3}
            value={settings.directorNote.pacing}
            onChange={(event) => onGoalChange(event.target.value)}
            fullWidth
          />

          <TextField
            label="How (Tone/Accent/Manner)"
            helperText="Raw user requests regarding style or accent."
            multiline
            minRows={3}
            value={settings.directorNote.tone}
            onChange={(event) => onToneChange(event.target.value)}
            fullWidth
          />
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={onDone} variant="contained">
          Done
        </Button>
      </DialogActions>
    </Dialog>
  );
}
