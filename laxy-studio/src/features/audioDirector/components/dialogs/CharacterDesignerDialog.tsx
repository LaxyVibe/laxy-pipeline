import CloseIcon from '@mui/icons-material/Close';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import SaveIcon from '@mui/icons-material/Save';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import type { GenerateCharacterResponse } from '../../../../api';
import type { CharacterDesignerValues } from '../../characterLibrary';

type Props = {
  open: boolean;
  mode: 'create' | 'edit';
  initialValues: CharacterDesignerValues;
  generatedProfile: GenerateCharacterResponse['character'] | null;
  generateError: string | null;
  isGenerating: boolean;
  isSaving: boolean;
  onClose: () => void;
  onGenerate: (values: CharacterDesignerValues) => Promise<void> | void;
  onSave: (values: CharacterDesignerValues) => Promise<void> | void;
};

function normalizeValues(values: CharacterDesignerValues): CharacterDesignerValues {
  return {
    name: values.name.trim(),
    gender: values.gender.trim(),
    role: values.role.trim(),
    context: values.context.trim(),
  };
}

function sameValues(
  left: CharacterDesignerValues | null,
  right: CharacterDesignerValues | null,
): boolean {
  if (!left || !right) return false;
  return (
    left.name === right.name
    && left.gender === right.gender
    && left.role === right.role
    && left.context === right.context
  );
}

export default function CharacterDesignerDialog(props: Props) {
  const {
    open,
    mode,
    initialValues,
    generatedProfile,
    generateError,
    isGenerating,
    isSaving,
    onClose,
    onGenerate,
    onSave,
  } = props;

  const [values, setValues] = useState<CharacterDesignerValues>(initialValues);
  const [lastGeneratedValues, setLastGeneratedValues] = useState<CharacterDesignerValues | null>(null);

  useEffect(() => {
    if (!open) return;
    setValues(initialValues);
    setLastGeneratedValues(null);
  }, [initialValues, open]);

  const normalizedValues = useMemo(() => normalizeValues(values), [values]);
  const isComplete = Boolean(
    normalizedValues.name
    && normalizedValues.gender
    && normalizedValues.role
    && normalizedValues.context,
  );
  const previewIsCurrent = Boolean(generatedProfile) && sameValues(lastGeneratedValues, normalizedValues);
  const previewIsStale = Boolean(generatedProfile) && !previewIsCurrent;

  return (
    <Dialog open={open} onClose={isGenerating || isSaving ? undefined : onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
        <Stack>
          <Typography variant="h6">
            {mode === 'create' ? 'Character Designer' : 'Edit Character'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Provide the character basics and let AI turn them into a reusable voice identity.
          </Typography>
        </Stack>

        <IconButton size="small" onClick={onClose} disabled={isGenerating || isSaving}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="Name"
              value={values.name}
              onChange={(event) => setValues((previous) => ({ ...previous, name: event.target.value }))}
              fullWidth
              required
            />
            <TextField
              label="Gender"
              value={values.gender}
              onChange={(event) => setValues((previous) => ({ ...previous, gender: event.target.value }))}
              fullWidth
              required
            />
          </Stack>

          <TextField
            label="Role"
            value={values.role}
            onChange={(event) => setValues((previous) => ({ ...previous, role: event.target.value }))}
            fullWidth
            required
            helperText="The character's position or narrator identity."
          />

          <TextField
            label="Context"
            value={values.context}
            onChange={(event) => setValues((previous) => ({ ...previous, context: event.target.value }))}
            fullWidth
            required
            multiline
            minRows={4}
            helperText="Describe the character's timbre, personality DNA, and linguistic style."
          />

          {generateError ? <Alert severity="error">{generateError}</Alert> : null}
          {previewIsStale ? (
            <Alert severity="info">
              The form changed after the last AI profile generation. Generate the profile again before saving.
            </Alert>
          ) : null}

          <Box>
            <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
              Preview
            </Typography>
            <Paper
              variant="outlined"
              sx={{
                p: 2,
                minHeight: 200,
                backgroundColor: '#faf7f0',
                whiteSpace: 'pre-wrap',
                fontFamily: 'Monaco, Menlo, Consolas, monospace',
                fontSize: 13,
                lineHeight: 1.6,
              }}
            >
              {generatedProfile?.audioProfileMarkdown?.trim()
                ? generatedProfile.audioProfileMarkdown.trim()
                : 'Generate a character profile to preview the final AUDIO PROFILE and SAMPLE CONTEXT.'}
            </Paper>
          </Box>
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={isGenerating || isSaving}>
          Cancel
        </Button>
        <Button
          variant="outlined"
          startIcon={<AutoAwesomeIcon />}
          disabled={!isComplete || isGenerating || isSaving}
          onClick={async () => {
            const nextValues = normalizeValues(values);
            await onGenerate(nextValues);
            setLastGeneratedValues(nextValues);
          }}
        >
          {isGenerating ? 'Generating…' : 'Generate Profile'}
        </Button>
        <Button
          variant="contained"
          startIcon={<SaveIcon />}
          disabled={!previewIsCurrent || isGenerating || isSaving}
          onClick={() => onSave(normalizeValues(values))}
        >
          {isSaving ? 'Saving…' : mode === 'create' ? 'Save Character' : 'Save Changes'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
