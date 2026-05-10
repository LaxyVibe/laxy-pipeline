import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  LinearProgress,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import { langLabel, type LanguageAudio, type LanguageSRT } from '../../../../types/entity';
import type { AudioPoiDraft } from '../../../audioMvp/model';
import { audioDirectorStyles } from '../../theme';
import type { GenerationHistoryEntry, ItemGenerationState } from '../../types';
import { downloadTextFile } from '../../utils';

type Props = {
  items: AudioPoiDraft[];
  generationHistory: GenerationHistoryEntry[];
  audioFiles: LanguageAudio[];
  srtFiles: LanguageSRT[];
  itemStates: Record<string, ItemGenerationState>;
  progressSummary: {
    completed: number;
    total: number;
    currentLabel: string;
  };
  generationError: string | null;
  isGenerating: boolean;
  onGenerate: () => void;
};

export default function GenerationHistoryRail(props: Props) {
  const {
    items,
    generationHistory,
    audioFiles,
    srtFiles,
    itemStates,
    progressSummary,
    generationError,
    isGenerating,
    onGenerate,
  } = props;

  const hasCurrentRun = audioFiles.length > 0 || isGenerating || progressSummary.total > 0;

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
            Review the latest output first, then scan previous generation runs below.
          </Typography>
        </Box>

        {generationError ? <Alert severity="error">{generationError}</Alert> : null}

        {hasCurrentRun ? (
          <Paper elevation={0} sx={audioDirectorStyles.mutedPanel}>
            <Stack spacing={1.25}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                <Typography variant="subtitle2" fontWeight={700}>
                  Current run
                </Typography>
                <Chip label={`${audioFiles.length} item${audioFiles.length === 1 ? '' : 's'}`} size="small" variant="outlined" />
              </Stack>

              {progressSummary.total > 0 ? (
                <Stack spacing={0.75}>
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
                    sx={{ height: 10, borderRadius: 999 }}
                  />
                </Stack>
              ) : null}

              {audioFiles.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  Current run has not produced audio yet.
                </Typography>
              ) : (
                <Stack spacing={1.25}>
                  {audioFiles.map((languageAudio) => (
                    <RunCard
                      key={`${languageAudio.lang}-${languageAudio.audioUrl}`}
                      languageAudio={languageAudio}
                      relatedSrt={srtFiles.find((entry) => entry.lang === languageAudio.lang)}
                      itemStates={itemStates}
                      items={items}
                    />
                  ))}
                </Stack>
              )}
            </Stack>
          </Paper>
        ) : null}

        <Stack spacing={1.5} sx={{ flex: 1, minHeight: 0, overflow: 'auto', pr: 0.25 }}>
          {generationHistory.length === 0 ? (
            <Alert severity="info">
              No generation history yet. Use the button below to create the first run.
            </Alert>
          ) : (
            generationHistory.map((run, index) => (
              <Paper key={run.runId} elevation={0} sx={audioDirectorStyles.nestedPanel}>
                <Stack spacing={1.25}>
                  <Stack direction="row" justifyContent="space-between" spacing={1} alignItems="center">
                    <Box>
                      <Typography variant="subtitle2" fontWeight={700}>
                        Run {generationHistory.length - index}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {run.label}
                      </Typography>
                    </Box>
                    <Stack direction="column" alignItems="flex-end" spacing={0.5}>
                      <Chip label={langLabel(run.coreLanguage)} size="small" color="secondary" />
                      <Typography variant="caption" color="text.secondary">
                        {new Date(run.generatedAt).toLocaleString()}
                      </Typography>
                    </Stack>
                  </Stack>

                  <Typography variant="body2" color="text.secondary">
                    {run.itemCount} item{run.itemCount === 1 ? '' : 's'} generated
                  </Typography>

                  <Stack spacing={1}>
                    {run.audioFiles.map((languageAudio) => (
                      <RunCard
                        key={`${run.runId}-${languageAudio.lang}-${languageAudio.audioUrl}`}
                        languageAudio={languageAudio}
                        relatedSrt={run.srtFiles.find((entry) => entry.lang === languageAudio.lang)}
                        itemStates={itemStates}
                        items={items}
                      />
                    ))}
                  </Stack>
                </Stack>
              </Paper>
            ))
          )}
        </Stack>

        <Card sx={{ mt: 'auto' }}>
          <CardContent sx={{ p: 2 }}>
            <Stack spacing={1.5}>
              <Typography variant="subtitle2" fontWeight={700}>
                Generate
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Render the current director note and polished script into audio.
              </Typography>
              <Button
                variant="contained"
                size="large"
                startIcon={<PlayCircleOutlineIcon />}
                onClick={onGenerate}
                disabled={isGenerating || items.length === 0}
                fullWidth
              >
                {isGenerating ? 'Generating…' : 'Generate audio'}
              </Button>
            </Stack>
          </CardContent>
        </Card>
      </Stack>
    </Paper>
  );
}

function RunCard(props: {
  languageAudio: LanguageAudio;
  relatedSrt: LanguageSRT | undefined;
  itemStates: Record<string, ItemGenerationState>;
  items: AudioPoiDraft[];
}) {
  const { languageAudio, relatedSrt, itemStates, items } = props;
  const generatedSpots = languageAudio.spots ?? [];
  const itemLookup = new Map(items.map((item) => [item.spotId, item]));

  return (
    <Paper elevation={0} sx={{ p: 1.25, borderRadius: 3, border: '1px solid rgba(31, 92, 79, 0.08)', bgcolor: '#fffcf7' }}>
      <Stack spacing={1.25}>
        <Stack direction="row" justifyContent="space-between" spacing={1} alignItems="center">
          <Box>
            <Typography variant="body2" fontWeight={700}>
              {languageAudio.label}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {generatedSpots.length} audio file{generatedSpots.length === 1 ? '' : 's'}
            </Typography>
          </Box>

          {relatedSrt ? (
            <Button
              variant="text"
              size="small"
              onClick={() => downloadTextFile(`${languageAudio.lang}.srt`, relatedSrt.rawSrt, 'text/plain;charset=utf-8')}
            >
              Download SRT
            </Button>
          ) : null}
        </Stack>

        {generatedSpots.map((spot) => {
          const reviewState = itemStates[`${languageAudio.lang}::${spot.spotId}`];
          const sourceItem = itemLookup.get(spot.spotId);
          const originalScript = reviewState?.originalScript ?? sourceItem?.scriptText ?? '';
          const finalScript = reviewState?.finalScript ?? originalScript;

          return (
            <Paper key={`${languageAudio.lang}-${spot.spotId}-${spot.audioUrl}`} elevation={0} sx={{ p: 1, borderRadius: 2.5, border: '1px solid rgba(31, 92, 79, 0.08)', bgcolor: 'rgba(255,255,255,0.72)' }}>
              <Stack spacing={1}>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  {spot.spotNumber}. {spot.title}
                </Typography>
                <audio key={spot.audioUrl} controls preload="none" src={spot.audioUrl} style={{ width: '100%' }} />
                <Button variant="text" size="small" component="a" href={spot.audioUrl} target="_blank" rel="noreferrer">
                  Open file
                </Button>
                <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' } }}>
                  <Box sx={{ p: 1, borderRadius: 2, border: '1px solid rgba(31, 92, 79, 0.08)', bgcolor: 'rgba(255,255,255,0.86)' }}>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                      Original Script
                    </Typography>
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                      {originalScript || 'No script available.'}
                    </Typography>
                  </Box>
                  <Box sx={{ p: 1, borderRadius: 2, border: '1px solid rgba(31, 92, 79, 0.08)', bgcolor: 'rgba(255,255,255,0.86)' }}>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                      Final Enhanced Script
                    </Typography>
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                      {finalScript || 'No enhanced script available.'}
                    </Typography>
                  </Box>
                </Box>
              </Stack>
            </Paper>
          );
        })}
      </Stack>
    </Paper>
  );
}