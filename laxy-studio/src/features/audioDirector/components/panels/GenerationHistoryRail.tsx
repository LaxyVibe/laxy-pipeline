import PauseCircleOutlineIcon from '@mui/icons-material/PauseCircleOutline';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
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
  onChooseAudio?: (selection: {
    audioUrl: string;
    scriptText: string;
    versionId?: string;
    storagePath?: string;
    guideId?: string;
    spotId?: string;
    lang?: string;
  }) => void;
};

type HistoryRow = {
  id: string;
  downloadName: string;
  scriptText: string;
  audioUrl: string;
  versionId?: string;
  storagePath?: string;
  guideId?: string;
  spotId?: string;
  lang?: string;
  generatedAt?: number;
  isActiveVersion?: boolean;
  isLatestVersion?: boolean;
};

function sanitizeFilenamePart(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '');
  return normalized || 'audio';
}

function inferAudioExtension(audioUrl: string): string {
  const match = audioUrl.match(/\.([a-z0-9]+)(?:[?#]|$)/i);
  const extension = match?.[1]?.toLowerCase();
  if (extension === 'wav' || extension === 'mp3') {
    return extension;
  }
  return 'mp3';
}

export default function GenerationHistoryRail(props: Props) {
  const { items, generationHistory, audioFiles, itemStates, progressSummary, generationError, isGenerating, onChooseAudio } = props;

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
              downloadName: [
                'audio-director',
                sanitizeFilenamePart(languageAudio.lang),
                `spot-${String(spot.spotNumber ?? sourceItem?.spotNumber ?? 0).padStart(3, '0')}`,
                sanitizeFilenamePart(spot.title || sourceItem?.title || ''),
              ].join('-') + `.${inferAudioExtension(spot.audioUrl)}`,
              scriptText: spot.scriptText?.trim() || scriptText,
              audioUrl: spot.audioUrl,
              versionId: spot.versionId,
              storagePath: spot.storagePath,
              guideId: spot.guideId,
              spotId: spot.spotId,
              lang: spot.lang ?? languageAudio.lang,
              generatedAt: spot.generatedAtMs ?? run.generatedAt,
              isActiveVersion: spot.isActiveVersion,
              isLatestVersion: spot.isLatestVersion,
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
        p: { xs: 2, md: 2.5 },
        borderRadius: 5,
        border: '1px solid rgba(31, 43, 38, 0.10)',
        bgcolor: 'rgba(255, 255, 255, 0.88)',
        backdropFilter: 'blur(12px)',
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
      }}
    >
      <Stack spacing={2} sx={{ flex: 1, minHeight: 0 }}>
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
                    <TableCell sx={{ py: 1.25, width: 88, fontWeight: 700 }} align="center">
                      Download
                    </TableCell>
                    <TableCell sx={{ py: 1.25, width: 112, fontWeight: 700 }} align="center">
                      Choose
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
                        {row.isActiveVersion || row.isLatestVersion || row.generatedAt ? (
                          <Stack direction="row" spacing={0.75} sx={{ mt: 0.75, flexWrap: 'wrap' }}>
                            {row.isActiveVersion ? <Chip label="Active" size="small" color="success" /> : null}
                            {row.isLatestVersion && !row.isActiveVersion ? <Chip label="Latest" size="small" /> : null}
                            {row.generatedAt ? (
                              <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
                                {new Date(row.generatedAt).toLocaleString()}
                              </Typography>
                            ) : null}
                          </Stack>
                        ) : null}
                      </TableCell>
                      <TableCell sx={{ py: 0.5 }} align="center">
                        <HistoryAudioButton audioUrl={row.audioUrl} />
                      </TableCell>
                      <TableCell sx={{ py: 0.5 }} align="center">
                        <HistoryDownloadButton audioUrl={row.audioUrl} downloadName={row.downloadName} />
                      </TableCell>
                      <TableCell sx={{ py: 0.5 }} align="center">
                        <HistoryChooseButton
                          audioUrl={row.audioUrl}
                          scriptText={row.scriptText}
                          versionId={row.versionId}
                          storagePath={row.storagePath}
                          guideId={row.guideId}
                          spotId={row.spotId}
                          lang={row.lang}
                          onChooseAudio={onChooseAudio}
                        />
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

function HistoryDownloadButton(props: { audioUrl: string; downloadName: string }) {
  const { audioUrl, downloadName } = props;

  return (
    <Tooltip title="Download audio">
      <IconButton
        aria-label="Download audio"
        component="a"
        href={audioUrl}
        download={downloadName}
        target="_blank"
        rel="noreferrer"
        size="small"
      >
        <DownloadOutlinedIcon />
      </IconButton>
    </Tooltip>
  );
}

function HistoryChooseButton(props: {
  audioUrl: string;
  scriptText: string;
  versionId?: string;
  storagePath?: string;
  guideId?: string;
  spotId?: string;
  lang?: string;
  onChooseAudio?: (selection: {
    audioUrl: string;
    scriptText: string;
    versionId?: string;
    storagePath?: string;
    guideId?: string;
    spotId?: string;
    lang?: string;
  }) => void;
}) {
  const { audioUrl, scriptText, versionId, storagePath, guideId, spotId, lang, onChooseAudio } = props;

  return (
    <Button
      variant="outlined"
      size="small"
      disabled={!onChooseAudio}
      onClick={() => onChooseAudio?.({ audioUrl, scriptText, versionId, storagePath, guideId, spotId, lang })}
    >
      Choose
    </Button>
  );
}
