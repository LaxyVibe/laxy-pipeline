// ---------------------------------------------------------------------------
// DirectorNoteEditor — editable director note for TTS generation style
// ---------------------------------------------------------------------------
import { Box, Typography, TextField } from '@mui/material';
import { useGuidesStore } from '../../../guidesStore';

export default function DirectorNoteEditor() {
  const directorNote = useGuidesStore((s) => s.directorNote);
  const setDirectorNote = useGuidesStore((s) => s.setDirectorNote);

  return (
    <Box>
      <Typography variant="subtitle1" fontWeight={700} gutterBottom>
        Director Note
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Optional directives that guide the AI voice generation. Pre-populated by AI — edit freely.
      </Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <TextField
          label="Vocal Environment"
          placeholder="e.g. Museum gallery, quiet and reflective atmosphere"
          value={directorNote.vocalEnvironment}
          onChange={(e) => setDirectorNote({ vocalEnvironment: e.target.value })}
          multiline
          minRows={2}
          maxRows={4}
          fullWidth
          variant="outlined"
          size="small"
          helperText="Describe the physical and emotional setting for the narration."
        />

        <TextField
          label="Mission of Speech"
          placeholder="e.g. Inform and inspire visitors about the cultural significance of each piece"
          value={directorNote.mission}
          onChange={(e) => setDirectorNote({ mission: e.target.value })}
          multiline
          minRows={2}
          maxRows={4}
          fullWidth
          variant="outlined"
          size="small"
          helperText="What should the narration achieve? What feeling should it evoke?"
        />

        <TextField
          label="Pacing & Energy"
          placeholder="e.g. Moderate pace, thoughtful pauses between sections, calm energy"
          value={directorNote.pacing}
          onChange={(e) => setDirectorNote({ pacing: e.target.value })}
          multiline
          minRows={2}
          maxRows={4}
          fullWidth
          variant="outlined"
          size="small"
          helperText="Speed, rhythm, and energy level of the narration."
        />
      </Box>
    </Box>
  );
}
