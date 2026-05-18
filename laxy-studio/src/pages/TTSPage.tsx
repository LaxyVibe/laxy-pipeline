// ---------------------------------------------------------------------------
// TTSPage — Table-driven script hub that launches Audio Director in an iframe
// ---------------------------------------------------------------------------
import { forwardRef, useEffect, useRef, useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Container,
  Dialog,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Slide,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Toolbar,
  Typography,
  TextField,
} from '@mui/material';
import type { TransitionProps } from '@mui/material/transitions';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import HeadphonesIcon from '@mui/icons-material/Headphones';
import LanguageOutlinedIcon from '@mui/icons-material/LanguageOutlined';
import PauseCircleOutlineIcon from '@mui/icons-material/PauseCircleOutline';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import DeployVersionFooter from '../components/DeployVersionFooter';
import { detectLanguageCode } from '../features/audioDirector/utils';
import { ROUTES } from '../routes';
import { SUPPORTED_LANGUAGES, langLabel } from '../types/entity';

type RowMessageTone = 'info' | 'warning';

type TtsRow = {
  id: string;
  inputScript: string;
  inputLanguage: string;
  outputScript: string;
  outputAudio: string;
  rowMessage: string | null;
  rowMessageTone: RowMessageTone;
};

const SlideUp = forwardRef(function SlideUp(
  props: TransitionProps & { children: React.ReactElement },
  ref: React.Ref<unknown>,
) {
  return <Slide direction="up" ref={ref} {...props} />;
});

const AUDIO_DIRECTOR_ORIGIN = window.location.origin;
const TTS_INPUT_LANGUAGE_CODES = new Set(['en', 'ja', 'ko', 'zh-TW', 'zh-CN', 'fr']);
const TTS_INPUT_LANGUAGES = SUPPORTED_LANGUAGES.filter((language) => TTS_INPUT_LANGUAGE_CODES.has(language.code));

function createTtsRow(id: string): TtsRow {
  return {
    id,
    inputScript: '',
    inputLanguage: 'en',
    outputScript: '',
    outputAudio: '',
    rowMessage: null,
    rowMessageTone: 'info',
  };
}

function OutputAudioPreviewButton(props: { audioUrl: string }) {
  const { audioUrl } = props;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const listenersAttachedRef = useRef(false);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    listenersAttachedRef.current = false;
    setIsPlaying(false);
  }, [audioUrl]);

  useEffect(() => () => {
    audioRef.current?.pause();
    audioRef.current = null;
  }, []);

  const handleTogglePlayback = async () => {
    const trimmedAudioUrl = audioUrl.trim();
    if (!trimmedAudioUrl) return;

    const audio = audioRef.current ?? new Audio(trimmedAudioUrl);
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
    <Button
      variant="outlined"
      size="small"
      startIcon={isPlaying ? <PauseCircleOutlineIcon /> : <PlayCircleOutlineIcon />}
      disabled={!audioUrl.trim()}
      onClick={() => {
        void handleTogglePlayback();
      }}
    >
      {isPlaying ? 'Pause audio' : 'Play audio'}
    </Button>
  );
}

export default function TTSPage() {
  const [rows, setRows] = useState<TtsRow[]>(() => [createTtsRow('row-1')]);
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const [iframeSrc, setIframeSrc] = useState<string>(ROUTES.audioDirector);
  const [iframeLoading, setIframeLoading] = useState(true);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const nextRowIdRef = useRef(2);

  const updateRow = (rowId: string, updater: (row: TtsRow) => TtsRow) => {
    setRows((currentRows) => currentRows.map((row) => (row.id === rowId ? updater(row) : row)));
  };

  const closeAudioDirector = () => {
    setOpen(false);
    setActiveRowId(null);
    setIframeLoading(true);
  };

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== AUDIO_DIRECTOR_ORIGIN) return;

      if (event.data?.type === 'laxy:ready') {
        setIframeLoading(false);

        const activeRow = rows.find((row) => row.id === activeRowId);
        if (!activeRow) return;

        iframeRef.current?.contentWindow?.postMessage(
          {
            type: 'laxy:script',
            text: activeRow.inputScript,
            language: activeRow.inputLanguage,
          },
          AUDIO_DIRECTOR_ORIGIN,
        );
        return;
      }

      if (event.data?.type === 'laxy:result-selected' && activeRowId) {
        updateRow(activeRowId, (row) => ({
          ...row,
          outputScript: typeof event.data.outputScript === 'string' ? event.data.outputScript : row.outputScript,
          outputAudio: typeof event.data.outputAudio === 'string' ? event.data.outputAudio : row.outputAudio,
        }));
        closeAudioDirector();
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [activeRowId, rows]);

  const handleAddRow = () => {
    const nextRowId = `row-${nextRowIdRef.current}`;
    nextRowIdRef.current += 1;
    setRows((currentRows) => [...currentRows, createTtsRow(nextRowId)]);
  };

  const handleRemoveRow = (rowId: string) => {
    if (rows.length === 1) return;
    if (!window.confirm('Remove this row?')) return;

    setRows((currentRows) => currentRows.filter((row) => row.id !== rowId));

    if (activeRowId === rowId) {
      closeAudioDirector();
    }
  };

  const handleAutoDetectLanguage = (rowId: string) => {
    const row = rows.find((entry) => entry.id === rowId);
    if (!row) return;

    const detected = detectLanguageCode(row.inputScript.trim());
    if (!detected) {
      updateRow(rowId, (currentRow) => ({
        ...currentRow,
        rowMessage: 'Could not confidently detect the script language. Please choose it manually.',
        rowMessageTone: 'warning',
      }));
      return;
    }

    if (!TTS_INPUT_LANGUAGE_CODES.has(detected.code)) {
      updateRow(rowId, (currentRow) => ({
        ...currentRow,
        rowMessage: `Detected ${langLabel(detected.code)}, which is not available in this table. Please choose one of the supported languages manually.`,
        rowMessageTone: 'warning',
      }));
      return;
    }

    updateRow(rowId, (currentRow) => ({
      ...currentRow,
      inputLanguage: detected.code,
      rowMessage: `Detected ${langLabel(detected.code)} and applied it to the input language.`,
      rowMessageTone: 'info',
    }));
  };

  const handleOpenRow = (rowId: string) => {
    setActiveRowId(rowId);
    setIframeLoading(true);
    setIframeSrc(`${ROUTES.audioDirector}?ts=${Date.now()}`);
    setIframeKey((currentKey) => currentKey + 1);
    setOpen(true);
  };

  const handleRequestClose = () => {
    if (!window.confirm('Close Audio Director? Any unchosen result in this session will be lost.')) {
      return;
    }
    closeAudioDirector();
  };

  return (
    <Container maxWidth={false} sx={{ py: 6, px: { xs: 2, md: 4 } }}>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h4" fontWeight={700} gutterBottom>
            Text to Speech
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Manage multiple scripts in one table, launch Audio Director per row,
            and capture the chosen script and audio back into the matching result.
          </Typography>
        </Box>

        <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2}>
          <Typography variant="subtitle1" fontWeight={600}>
            TTS Jobs
          </Typography>
          <Button variant="contained" startIcon={<AddIcon />} onClick={handleAddRow}>
            Add Row
          </Button>
        </Stack>

        <Paper
          elevation={0}
          sx={{
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 4,
            overflow: 'hidden',
          }}
        >
          <Box sx={{ overflowX: 'auto' }}>
            <Table sx={{ minWidth: 1320 }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700, minWidth: 320 }}>Input Script</TableCell>
                  <TableCell sx={{ fontWeight: 700, minWidth: 220 }}>Input Language</TableCell>
                  <TableCell sx={{ fontWeight: 700, minWidth: 180 }}>Actions</TableCell>
                  <TableCell sx={{ fontWeight: 700, minWidth: 320 }}>Output Script</TableCell>
                  <TableCell sx={{ fontWeight: 700, minWidth: 280 }}>Output Audio</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row, index) => (
                  <TableRow
                    key={row.id}
                    hover
                    selected={activeRowId === row.id && open}
                    sx={{ verticalAlign: 'top' }}
                  >
                    <TableCell>
                      <Stack spacing={1}>
                        <Typography variant="caption" color="text.secondary">
                          Row {index + 1}
                        </Typography>
                        <TextField
                          multiline
                          minRows={6}
                          maxRows={14}
                          fullWidth
                          placeholder="Paste or type the source script"
                          value={row.inputScript}
                          onChange={(event) => {
                            const nextValue = event.target.value;
                            updateRow(row.id, (currentRow) => ({
                              ...currentRow,
                              inputScript: nextValue,
                              rowMessage: currentRow.rowMessageTone === 'warning' ? null : currentRow.rowMessage,
                            }));
                          }}
                          inputProps={{ 'aria-label': `Input Script row ${index + 1}` }}
                        />
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Stack spacing={1.5}>
                        <FormControl fullWidth>
                          <InputLabel id={`tts-language-label-${row.id}`}>Input Language</InputLabel>
                          <Select
                            labelId={`tts-language-label-${row.id}`}
                            value={row.inputLanguage}
                            label="Input Language"
                            onChange={(event) => {
                              updateRow(row.id, (currentRow) => ({
                                ...currentRow,
                                inputLanguage: event.target.value,
                                rowMessage: `Input language set to ${langLabel(event.target.value)}.`,
                                rowMessageTone: 'info',
                              }));
                            }}
                          >
                            {TTS_INPUT_LANGUAGES.map((option) => (
                              <MenuItem key={option.code} value={option.code}>
                                {option.label}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                        <Button
                          variant="outlined"
                          size="small"
                          startIcon={<LanguageOutlinedIcon />}
                          disabled={!row.inputScript.trim()}
                          onClick={() => handleAutoDetectLanguage(row.id)}
                        >
                          Auto-detect
                        </Button>
                        <Typography
                          variant="caption"
                          sx={{
                            minHeight: 36,
                            color: row.rowMessageTone === 'warning' ? 'warning.main' : 'text.secondary',
                          }}
                        >
                          {row.rowMessage ?? 'Detect the script language automatically or choose it manually.'}
                        </Typography>
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Stack spacing={1}>
                        <Button
                          variant="contained"
                          size="small"
                          startIcon={<HeadphonesIcon />}
                          disabled={!row.inputScript.trim()}
                          onClick={() => handleOpenRow(row.id)}
                        >
                          Open Audio Director
                        </Button>
                        <Button
                          variant="text"
                          size="small"
                          color="inherit"
                          startIcon={<DeleteOutlineIcon />}
                          disabled={rows.length === 1}
                          onClick={() => handleRemoveRow(row.id)}
                        >
                          Remove
                        </Button>
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <TextField
                        multiline
                        minRows={6}
                        maxRows={14}
                        fullWidth
                        placeholder="Choose a result in Audio Director to fill this output script"
                        value={row.outputScript}
                        onChange={(event) => {
                          const nextValue = event.target.value;
                          updateRow(row.id, (currentRow) => ({
                            ...currentRow,
                            outputScript: nextValue,
                          }));
                        }}
                        inputProps={{ 'aria-label': `Output Script row ${index + 1}` }}
                      />
                    </TableCell>
                    <TableCell>
                      <Stack spacing={1}>
                        <TextField
                          fullWidth
                          placeholder="Choose a result in Audio Director to fill this output audio URL"
                          value={row.outputAudio}
                          onChange={(event) => {
                            const nextValue = event.target.value;
                            updateRow(row.id, (currentRow) => ({
                              ...currentRow,
                              outputAudio: nextValue,
                            }));
                          }}
                          inputProps={{ 'aria-label': `Output Audio row ${index + 1}` }}
                        />
                        <OutputAudioPreviewButton audioUrl={row.outputAudio} />
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        </Paper>

        <DeployVersionFooter />
      </Stack>

      <Dialog fullScreen open={open} onClose={handleRequestClose} TransitionComponent={SlideUp}>
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <Toolbar
            variant="dense"
            sx={{
              borderBottom: '1px solid',
              borderColor: 'divider',
              minHeight: 48,
              px: 2,
              flexShrink: 0,
            }}
          >
            <Typography variant="subtitle1" fontWeight={600} sx={{ flexGrow: 1 }}>
              Audio Director
            </Typography>
            <IconButton edge="end" onClick={handleRequestClose} aria-label="close">
              <CloseIcon />
            </IconButton>
          </Toolbar>

          <Box sx={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
            {iframeLoading && (
              <Box
                sx={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor: 'background.default',
                  zIndex: 1,
                }}
              >
                <CircularProgress />
              </Box>
            )}
            {open && (
              <iframe
                key={iframeKey}
                ref={iframeRef}
                src={iframeSrc}
                title="Audio Director"
                style={{
                  width: '100%',
                  height: '100%',
                  border: 'none',
                  display: 'block',
                }}
              />
            )}
          </Box>
        </Box>
      </Dialog>
    </Container>
  );
}
