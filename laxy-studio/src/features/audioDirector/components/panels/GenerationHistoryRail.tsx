import PauseCircleOutlineIcon from '@mui/icons-material/PauseCircleOutline';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  IconButton,
  LinearProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import type { AudioPoiDraft } from '../../../audioMvp/model';
import { audioDirectorStyles } from '../../theme';
import type { GenerationHistoryEntry, ItemGenerationState } from '../../types';

type Props = {
  items: AudioPoiDraft[];
  generationHistory: GenerationHistoryEntry[];
  audioFiles: Array<{
    lang: string;
    audioUrl: string;
  }>;
  itemStates: Record<string, ItemGenerationState>;
  progressSummary: {
    completed: number;
    total: number;
    currentLabel: string;
  };
  generationError: string | null;
  isGenerating: boolean;
};

type HistoryRow = {
  id: string;
  scriptText: string;
  audioUrl: string;
};

export default function GenerationHistoryRail(props: Props) {
  const { items, generationHistory, audioFiles, itemStates, progressSummary, generationError, isGenerating } = props;

  const itemLookup = useMemo(() => new Map(items.map((item) => [item.spotId, item])), [items]);
  const rows = useMemo<HistoryRow[]>(
    () =>
      generationHistory.flatMap((run) =>
        run.audioFiles.flatMap((languageAudio) =>
          (languageAudio.spots ?? []).map((spot) => {
            const reviewState = itemStates[`${languageAudio.lang}::${spot.spotId}`];
            const sourceItem = itemLookup.get(spot.spotId);
            const scriptText = (reviewState?.finalScript ?? reviewState?.originalScript ?? sourceItem?.scriptText ?? '').trim();

            return {
              id: `${run.runId}-${languageAudio.lang}-${spot.spotId}-${spot.audioUrl}`,
              scriptText,
              audioUrl: spot.audioUrl,
            };
          }),
        ),
      ),
    [generationHistory, itemLookup, itemStates],
  );
  const isShowingProgress = isGenerating || progressSummary.total > 0;

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        borderRadius: 5,
        border: '1px solid rgba(31, 43, 38, 0.10)',
        bgcolor: 'rgba(255, 255, 255, 0.88)',
        backdropFilter: 'blur(12px)',
        position: { xl: 'sticky' },
        top: { xl: 24 },
        display: 'flex',
        flexDirection: 'column',
        minHeight: { xl: 'calc(100vh - 48px)' },
      }}
    >
      <Stack spacing={2} sx={{ flex: 1, minHeight: 0 }}>
        <Box>
          <Typography variant="overline" sx={{ letterSpacing: '0.18em', color: 'text.secondary' }}>
            Result History
          </Typography>
          <Typography variant="h6" fontWeight={700}>
            Generated audio
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Review generated script audio in a compact list.
          </Typography>
        </Box>

        {generationError ? <Alert severity="error">{generationError}</Alert> : null}

        {isShowingProgress ? (
          <Paper elevation={0} sx={audioDirectorStyles.mutedPanel}>
            <Stack spacing={1.25}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1.5}>
                <Typography variant="subtitle2" fontWeight={700}>
                  Current run
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {audioFiles.length} file{audioFiles.length === 1 ? '' : 's'} ready
                </Typography>
              </Stack>

              <Stack direction="row" justifyContent="space-between" spacing={1}>
                <Typography variant="body2" color="text.secondary">
                  {progressSummary.currentLabel || 'Preparing generation'}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {progressSummary.completed} / {progressSummary.total}
                </Typography>
              </Stack>
              <LinearProgress
                variant="determinate"
                value={progressSummary.total === 0 ? 0 : (progressSummary.completed / progressSummary.total) * 100}
                sx={{ height: 8, borderRadius: 999 }}
              />
            </Stack>
          </Paper>
        ) : null}

        <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          {rows.length === 0 ? (
            <Alert severity="info">No generation history yet.</Alert>
          ) : (
            <Paper elevation={0} sx={{ ...audioDirectorStyles.nestedPanel, p: 0, overflow: 'hidden' }}>
              <Table size="small" aria-label="Result history">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ py: 1.25, fontWeight: 700 }}>Script</TableCell>
                    <TableCell sx={{ py: 1.25, width: 72, fontWeight: 700 }} align="center">
                      Play
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id} hover>
                      <TableCell sx={{ py: 1.25 }}>
                        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                          {row.scriptText || 'Generated script'}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ py: 0.5 }} align="center">
                        <HistoryAudioButton audioUrl={row.audioUrl} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>
          )}
        </Box>
      </Stack>
    </Paper>
  );
}

function HistoryAudioButton(props: { audioUrl: string }) {
  const { audioUrl } = props;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const listenersAttachedRef = useRef(false);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  const handleTogglePlayback = async () => {
    const audio = audioRef.current ?? new Audio(audioUrl);
    if (!audioRef.current) {
      audioRef.current = audio;
    }

    if (!listenersAttachedRef.current) {
      audio.addEventListener('play', () => setIsPlaying(true));
      audio.addEventListener('pause', () => setIsPlaying(false));
      audio.addEventListener('ended', () => setIsPlaying(false));
      listenersAttachedRef.current = true;
    }

    if (audio.paused) {
      await audio.play();
      return;
    }

    audio.pause();
  };

  return (
    <Tooltip title={isPlaying ? 'Pause audio' : 'Play audio'}>
      <IconButton
        aria-label={isPlaying ? 'Pause audio' : 'Play audio'}
        color={isPlaying ? 'primary' : 'default'}
        onClick={() => {
          void handleTogglePlayback();
        }}
        size="small"
      >
        {isPlaying ? <PauseCircleOutlineIcon /> : <PlayCircleOutlineIcon />}
      </IconButton>
    </Tooltip>
  );
}
