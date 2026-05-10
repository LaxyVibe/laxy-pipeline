import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  LinearProgress,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import { langLabel, type LanguageAudio, type LanguageSRT } from '../../../../types/entity';
import type { AudioPoiDraft } from '../../../audioMvp/model';
import { audioDirectorStyles } from '../../theme';
import type { ItemGenerationState } from '../../types';
import { downloadTextFile } from '../../utils';
import AudioDirectorSectionHeader from '../AudioDirectorSectionHeader';

type Props = {
  items: AudioPoiDraft[];
  coreLanguage: string;
  estimatedTokens: number;
  generationError: string | null;
  isGenerating: boolean;
  progressSummary: {
    completed: number;
    total: number;
    currentLabel: string;
  };
  itemStates: Record<string, ItemGenerationState>;
  audioFiles: LanguageAudio[];
  srtFiles: LanguageSRT[];
  onGenerate: () => void;
  onBack: () => void;
};

export default function AudioProductionScreen(props: Props) {
  const {
    items,
    coreLanguage,
    estimatedTokens,
    generationError,
    isGenerating,
    progressSummary,
    itemStates,
    audioFiles,
    srtFiles,
    onGenerate,
    onBack,
  } = props;
  const itemLookup = new Map(items.map((item) => [item.spotId, item]));

  return (
    <Stack spacing={3}>
      <Card sx={audioDirectorStyles.sectionCard}>
        <CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
          <Stack spacing={2.5}>
            <AudioDirectorSectionHeader
              icon={<PlayCircleOutlineIcon />}
              title="Generate and review audio"
              body="Render audio, track progress, and download the final output."
              eyebrow="Audio Production"
            />

            {generationError ? (
              <Alert severity="error">
                {generationError}
              </Alert>
            ) : null}

            <Box sx={audioDirectorStyles.mutedPanel}>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} justifyContent="space-between">
                <Box>
                  <Typography variant="subtitle2">Generation estimate</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Estimated spend reflects narration prompt size and optional cue enhancement.
                  </Typography>
                </Box>
                <Chip label={`${langLabel(coreLanguage)}: ${estimatedTokens.toLocaleString()} tokens`} color="secondary" />
              </Stack>
            </Box>

            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              <Chip
                label={coreLanguage === 'ja'
                  ? 'Japanese punctuation normalization enabled'
                  : coreLanguage.startsWith('zh')
                    ? 'Chinese terminology normalization enabled'
                    : 'Standard preprocessing path'}
                variant="outlined"
              />
            </Stack>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="space-between">
              <Button variant="outlined" startIcon={<ArrowBackIcon />} onClick={onBack}>
                Back to Script Polish
              </Button>
              <Button
                variant="contained"
                startIcon={<PlayCircleOutlineIcon />}
                onClick={onGenerate}
                disabled={isGenerating || items.length === 0}
              >
                {isGenerating
                  ? 'Generating…'
                  : `Generate ${langLabel(coreLanguage)} (${estimatedTokens.toLocaleString()} est.)`}
              </Button>
            </Stack>

            {progressSummary.total > 0 ? (
              <Stack spacing={1}>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} justifyContent="space-between">
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

            {Object.keys(itemStates).length > 0 ? (
              <Stack spacing={1}>
                {Object.entries(itemStates).map(([key, state]) => (
                  <Paper key={key} elevation={0} sx={audioDirectorStyles.nestedPanel}>
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} justifyContent="space-between">
                      <Box>
                        <Typography variant="body2" fontWeight={700}>
                          {state.label ?? key}
                        </Typography>
                        {state.message ? (
                          <Typography variant="body2" color="text.secondary">
                            {state.message}
                          </Typography>
                        ) : null}
                      </Box>
                      <Chip
                        label={state.status}
                        color={state.status === 'done' ? 'success' : state.status === 'error' ? 'error' : 'default'}
                        size="small"
                      />
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            ) : null}

            <Divider />

            {audioFiles.length === 0 ? (
              <Alert severity="info">
                No audio files have been generated yet. Use the button above to start the production run.
              </Alert>
            ) : (
              <Stack spacing={1.5}>
                {audioFiles.map((languageAudio) => {
                  const relatedSrt = srtFiles.find((entry) => entry.lang === languageAudio.lang);
                  const generatedSpots = languageAudio.spots ?? [];
                  return (
                    <Paper key={languageAudio.lang} elevation={0} sx={audioDirectorStyles.nestedPanel}>
                      <Stack spacing={1.5}>
                        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} justifyContent="space-between">
                          <Box>
                            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                              {languageAudio.label}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              {generatedSpots.length} audio file{generatedSpots.length === 1 ? '' : 's'} generated in this run
                            </Typography>
                          </Box>

                          <Stack direction="row" spacing={1}>
                            {generatedSpots.length === 1 ? (
                              <Button
                                variant="outlined"
                                startIcon={<DownloadOutlinedIcon />}
                                component="a"
                                href={generatedSpots[0].audioUrl}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Download Audio
                              </Button>
                            ) : null}
                            {relatedSrt ? (
                              <Button
                                variant="text"
                                onClick={() => downloadTextFile(`${languageAudio.lang}.srt`, relatedSrt.rawSrt, 'text/plain;charset=utf-8')}
                              >
                                Download SRT
                              </Button>
                            ) : null}
                          </Stack>
                        </Stack>

                        {generatedSpots.map((spot) => {
                          const reviewState = itemStates[`${languageAudio.lang}::${spot.spotId}`];
                          const sourceItem = itemLookup.get(spot.spotId);
                          const originalScript = reviewState?.originalScript ?? sourceItem?.scriptText ?? '';
                          const finalScript = reviewState?.finalScript ?? originalScript;

                          return (
                            <Paper
                              key={`${languageAudio.lang}-${spot.spotId}-${spot.audioUrl}`}
                              elevation={0}
                              sx={{
                                p: 1.5,
                                borderRadius: 3,
                                border: '1px solid rgba(31, 92, 79, 0.08)',
                                bgcolor: '#fffcf7',
                              }}
                            >
                              <Stack spacing={1.25}>
                                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                  {spot.spotNumber}. {spot.title}
                                </Typography>
                                <audio
                                  key={spot.audioUrl}
                                  controls
                                  preload="none"
                                  src={spot.audioUrl}
                                  style={{ width: '100%' }}
                                />
                                <Button
                                  variant="text"
                                  size="small"
                                  component="a"
                                  href={spot.audioUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  Open file
                                </Button>

                                <Box
                                  sx={{
                                    display: 'grid',
                                    gap: 1,
                                    gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' },
                                    pt: 0.5,
                                  }}
                                >
                                  <Paper
                                    elevation={0}
                                    sx={{
                                      p: 1.25,
                                      borderRadius: 2.5,
                                      border: '1px solid rgba(31, 92, 79, 0.08)',
                                      bgcolor: 'rgba(255,255,255,0.72)',
                                    }}
                                  >
                                    <Stack spacing={0.5}>
                                      <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                                        Original Script
                                      </Typography>
                                      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                                        {originalScript || 'No script available.'}
                                      </Typography>
                                    </Stack>
                                  </Paper>

                                  <Paper
                                    elevation={0}
                                    sx={{
                                      p: 1.25,
                                      borderRadius: 2.5,
                                      border: '1px solid rgba(31, 92, 79, 0.08)',
                                      bgcolor: 'rgba(255,255,255,0.72)',
                                    }}
                                  >
                                    <Stack spacing={0.5}>
                                      <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                                        Final Enhanced Script
                                      </Typography>
                                      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                                        {finalScript || 'No enhanced script available.'}
                                      </Typography>
                                    </Stack>
                                  </Paper>
                                </Box>
                              </Stack>
                            </Paper>
                          );
                        })}
                      </Stack>
                    </Paper>
                  );
                })}
              </Stack>
            )}
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
