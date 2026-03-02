// ---------------------------------------------------------------------------
// GenerationHistory — list of past audio generation runs
// ---------------------------------------------------------------------------
import { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  List,
  ListItemButton,
  ListItemText,
  Chip,
  Collapse,
  Divider,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import HistoryIcon from '@mui/icons-material/History';
import type { AudioGenerationRun } from '../../../types/entity';
import { useGuidesStore } from '../../../guidesStore';

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface RunItemProps {
  run: AudioGenerationRun;
}

function RunItem({ run }: RunItemProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <ListItemButton onClick={() => setExpanded(!expanded)} sx={{ borderRadius: 1 }}>
        <ListItemText
          primary={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="body2" fontWeight={600}>
                {formatDate(run.timestamp)}
              </Typography>
              <Chip
                label={`${run.languages.length} lang${run.languages.length !== 1 ? 's' : ''}`}
                size="small"
                variant="outlined"
              />
              <Chip label={run.voiceName} size="small" variant="outlined" />
            </Box>
          }
          secondary={`Character: ${run.characterName} · Tokens: ${run.tokenCount.toLocaleString()}`}
        />
        <ExpandMoreIcon
          sx={{
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
          }}
        />
      </ListItemButton>
      <Collapse in={expanded}>
        <Box sx={{ px: 2, pb: 2 }}>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1 }}>
            <Typography variant="caption" color="text.secondary">
              Languages:
            </Typography>
            {run.languages.map((l) => (
              <Chip key={l} label={l.toUpperCase()} size="small" />
            ))}
          </Box>
          <Typography variant="caption" color="text.secondary" display="block">
            Vocal Environment: {run.directorNote.vocalEnvironment || '—'}
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block">
            Mission: {run.directorNote.mission || '—'}
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block">
            Pacing: {run.directorNote.pacing || '—'}
          </Typography>
        </Box>
      </Collapse>
      <Divider />
    </>
  );
}

export default function GenerationHistory() {
  const history = useGuidesStore((s) => s.generationHistory);

  if (history.length === 0) {
    return (
      <Paper variant="outlined" sx={{ p: 3, textAlign: 'center' }}>
        <HistoryIcon sx={{ fontSize: 32, color: 'text.disabled', mb: 1 }} />
        <Typography variant="body2" color="text.disabled">
          No generation history yet.
        </Typography>
      </Paper>
    );
  }

  return (
    <Box>
      <Typography variant="subtitle1" fontWeight={700} gutterBottom>
        Generation History
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Every run is saved for auditing, rollback, and cost tracking.
      </Typography>
      <Paper variant="outlined">
        <List disablePadding>
          {history.map((run) => (
            <RunItem key={run.id} run={run} />
          ))}
        </List>
      </Paper>
    </Box>
  );
}
