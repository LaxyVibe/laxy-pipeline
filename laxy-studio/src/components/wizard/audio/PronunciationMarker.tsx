// ---------------------------------------------------------------------------
// PronunciationMarkerUI — mark timestamp + text comment on audio issues
// ---------------------------------------------------------------------------
import { useState, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Chip,
  Paper,
  Collapse,
  Alert,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import FlagIcon from '@mui/icons-material/Flag';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import { useGuidesStore } from '../../../guidesStore';

function formatTimestamp(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface PronunciationMarkerUIProps {
  currentTimestamp: number;
}

export default function PronunciationMarkerUI({
  currentTimestamp,
}: PronunciationMarkerUIProps) {
  const markers = useGuidesStore((s) => s.pronunciationMarkers);
  const addMarker = useGuidesStore((s) => s.addPronunciationMarker);
  const removeMarker = useGuidesStore((s) => s.removePronunciationMarker);

  const [showForm, setShowForm] = useState(false);
  const [comment, setComment] = useState('');
  const [markerTime, setMarkerTime] = useState(0);

  const handleMarkIssue = useCallback(() => {
    setMarkerTime(currentTimestamp);
    setShowForm(true);
  }, [currentTimestamp]);

  const handleSubmit = useCallback(() => {
    if (!comment.trim()) return;
    addMarker({
      id: `marker-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      timestampSec: markerTime,
      comment: comment.trim(),
    });
    setComment('');
    setShowForm(false);
  }, [comment, markerTime, addMarker]);

  const handleCancel = useCallback(() => {
    setComment('');
    setShowForm(false);
  }, []);

  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          mb: 1,
        }}
      >
        <Typography variant="subtitle2" fontWeight={700}>
          Pronunciation Issues
        </Typography>
        <Button
          size="small"
          startIcon={<FlagIcon />}
          onClick={handleMarkIssue}
          variant="outlined"
          color="warning"
        >
          Mark Issue at {formatTimestamp(currentTimestamp)}
        </Button>
      </Box>

      <Alert severity="info" sx={{ mb: 1, py: 0.5 }} icon={false}>
        <Typography variant="caption">
          This is an AI function and can make mistakes. Please check carefully before launch.
        </Typography>
      </Alert>

      {/* Add marker form */}
      <Collapse in={showForm}>
        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <AccessTimeIcon fontSize="small" color="action" />
            <Chip
              label={formatTimestamp(markerTime)}
              size="small"
              color="warning"
              variant="outlined"
            />
          </Box>
          <TextField
            label="Describe the pronunciation issue"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            multiline
            minRows={2}
            fullWidth
            size="small"
            placeholder="e.g. The word 'Kanagawa' is mispronounced — should sound like 'kah-nah-GAH-wah'"
            sx={{ mb: 1 }}
          />
          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
            <Button size="small" onClick={handleCancel}>
              Cancel
            </Button>
            <Button
              size="small"
              variant="contained"
              startIcon={<AddIcon />}
              onClick={handleSubmit}
              disabled={!comment.trim()}
            >
              Add Marker
            </Button>
          </Box>
        </Paper>
      </Collapse>

      {/* Markers list */}
      {markers.length > 0 ? (
        <List dense>
          {markers
            .slice()
            .sort((a, b) => a.timestampSec - b.timestampSec)
            .map((marker) => (
              <ListItem
                key={marker.id}
                sx={{
                  bgcolor: 'background.paper',
                  borderRadius: 1,
                  mb: 0.5,
                  border: '1px solid',
                  borderColor: 'divider',
                }}
              >
                <Chip
                  icon={<AccessTimeIcon />}
                  label={formatTimestamp(marker.timestampSec)}
                  size="small"
                  color="warning"
                  variant="outlined"
                  sx={{ mr: 1.5, minWidth: 70 }}
                />
                <ListItemText
                  primary={marker.comment}
                  primaryTypographyProps={{ variant: 'body2' }}
                />
                <ListItemSecondaryAction>
                  <IconButton
                    edge="end"
                    size="small"
                    onClick={() => removeMarker(marker.id)}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
        </List>
      ) : (
        <Typography variant="caption" color="text.disabled">
          No pronunciation issues marked yet.
        </Typography>
      )}
    </Box>
  );
}
