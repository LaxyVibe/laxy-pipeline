import { useState } from 'react';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import LocalMoviesOutlinedIcon from '@mui/icons-material/LocalMoviesOutlined';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import SwapHorizOutlinedIcon from '@mui/icons-material/SwapHorizOutlined';
import TranslateOutlinedIcon from '@mui/icons-material/TranslateOutlined';
import {
  Box,
  Button,
  ButtonBase,
  Card,
  CardContent,
  Chip,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { audioDirectorStyles } from '../../theme';

type Props = {
  scriptText: string;
  compiledPrompt: string;
  characterAvatar: string;
  characterName: string;
  voiceId: string;
  voiceName: string;
  isGenerating: boolean;
  isGeneratingJapaneseReading?: boolean;
  generateDisabled?: boolean;
  japaneseReadingStale?: boolean;
  japaneseReadingText?: string;
  onChangeScript: (nextText: string) => void;
  onChangeJapaneseReading?: (nextText: string) => void;
  onChangeCompiledPrompt: (nextText: string) => void;
  onGenerate: () => void;
  onGenerateJapaneseReading?: () => void;
  onPreviewVoice: (voiceId: string) => void;
  onOpenCharacterPicker: () => void;
  onOpenVoicePicker: () => void;
  onOpenScriptPolish: () => void;
  onOpenDirectorNote: () => void;
  showJapaneseReading?: boolean;
};

export default function TtsScriptSection(props: Props) {
  const {
    scriptText,
    compiledPrompt,
    characterAvatar,
    characterName,
    voiceId,
    voiceName,
    isGenerating,
    isGeneratingJapaneseReading = false,
    generateDisabled = false,
    japaneseReadingStale = false,
    japaneseReadingText = '',
    onChangeScript,
    onChangeJapaneseReading,
    onChangeCompiledPrompt,
    onGenerate,
    onGenerateJapaneseReading,
    onPreviewVoice,
    onOpenCharacterPicker,
    onOpenVoicePicker,
    onOpenScriptPolish,
    onOpenDirectorNote,
    showJapaneseReading = false,
  } = props;

  const [manualEditEnabled, setManualEditEnabled] = useState(false);
  const editorHeight = { xs: 320, md: 380, xl: 420 };
  const primaryEditorHeight = showJapaneseReading
    ? { xs: 180, md: 205, xl: 230 }
    : editorHeight;
  const readingEditorHeight = { xs: 110, md: 125, xl: 140 };
  const scrollingTextFieldSx = {
    flex: 1,
    minHeight: 0,
    '& .MuiInputBase-root': {
      height: '100%',
      alignItems: 'stretch',
    },
    '& .MuiInputBase-inputMultiline': {
      height: '100% !important',
      overflow: 'auto !important',
    },
  } as const;

  return (
    <Box
      sx={{
        display: 'grid',
        gap: { xs: 1.5, md: 2 },
        gridTemplateColumns: 'minmax(0, 0.9fr) minmax(0, 1.8fr) minmax(0, 1fr)',
        alignItems: 'stretch',
        height: { xs: 'calc(100vh - 152px)', md: 'calc(100vh - 164px)' },
        minHeight: 0,
      }}
    >
      <Card sx={{ ...audioDirectorStyles.sectionCard, height: '100%', minHeight: 0, overflow: 'hidden' }}>
        <CardContent sx={{ p: { xs: 2.25, md: 2.5 }, height: '100%' }}>
          <Stack spacing={1.75}>
            <Typography variant="overline" sx={{ color: 'text.secondary', letterSpacing: '0.14em' }}>
              Character & Voice Actor
            </Typography>

            <ButtonBase
              onClick={onOpenCharacterPicker}
              sx={{
                position: 'relative',
                width: '100%',
                aspectRatio: '1 / 1',
                borderRadius: '16px',
                display: 'grid',
                placeItems: 'center',
                fontSize: { xs: '4rem', md: '5rem' },
                bgcolor: 'rgba(31, 92, 79, 0.08)',
                boxShadow: '0 12px 28px rgba(31, 43, 38, 0.08)',
              }}
            >
              <span aria-hidden="true">{characterAvatar}</span>
              <Box
                sx={{
                  position: 'absolute',
                  top: 12,
                  right: 12,
                  width: 34,
                  height: 34,
                  borderRadius: '999px',
                  display: 'grid',
                  placeItems: 'center',
                  bgcolor: 'rgba(255,255,255,0.94)',
                  border: '1px solid rgba(31, 92, 79, 0.12)',
                  boxShadow: '0 8px 18px rgba(31, 43, 38, 0.10)',
                }}
              >
                <EditOutlinedIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
              </Box>
            </ButtonBase>

            <Stack spacing={0.5}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                {characterName}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Voice actor
              </Typography>
            </Stack>

            <ButtonBase
              onClick={() => onPreviewVoice(voiceId)}
              sx={{
                width: '100%',
                px: 1.25,
                py: 1,
                borderRadius: '14px',
                bgcolor: 'rgba(255,255,255,0.96)',
                border: '1px solid rgba(31, 92, 79, 0.10)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 0.75,
                boxShadow: '0 8px 20px rgba(31, 43, 38, 0.08)',
                textAlign: 'left',
              }}
            >
              <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0 }}>
                <PlayCircleOutlineIcon sx={{ fontSize: 18, color: 'text.secondary', flexShrink: 0 }} />
                <Typography
                  variant="body2"
                  sx={{
                    minWidth: 0,
                    fontWeight: 700,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {voiceName}
                </Typography>
              </Stack>

              <Tooltip title="Change voice">
                <IconButton
                  size="small"
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenVoicePicker();
                  }}
                  aria-label="Change voice"
                >
                  <SwapHorizOutlinedIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>
            </ButtonBase>
          </Stack>
        </CardContent>
      </Card>

      <Card sx={{ ...audioDirectorStyles.sectionCard, height: '100%', minHeight: 0, overflow: 'hidden' }}>
        <CardContent sx={{ p: { xs: 2.25, md: 2.5 }, height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <Stack spacing={1.25} sx={{ height: '100%', minHeight: 0 }}>
            <Stack direction="row" spacing={1.25} alignItems="center">
              <ButtonBase
                onClick={onOpenDirectorNote}
                sx={{
                  position: 'relative',
                  width: 56,
                  height: 56,
                  borderRadius: '14px',
                  display: 'grid',
                  placeItems: 'center',
                  bgcolor: 'rgba(31, 92, 79, 0.10)',
                  boxShadow: '0 12px 28px rgba(31, 43, 38, 0.08)',
                  flexShrink: 0,
                }}
              >
                <LocalMoviesOutlinedIcon sx={{ fontSize: 28 }} />
                <Box
                  sx={{
                    position: 'absolute',
                    right: -4,
                    bottom: -4,
                    width: 22,
                    height: 22,
                    borderRadius: '999px',
                    display: 'grid',
                    placeItems: 'center',
                    bgcolor: 'rgba(255,255,255,0.94)',
                    border: '1px solid rgba(31, 92, 79, 0.12)',
                    boxShadow: '0 6px 14px rgba(31, 43, 38, 0.10)',
                  }}
                >
                  <EditOutlinedIcon sx={{ fontSize: 12, color: 'text.secondary' }} />
                </Box>
              </ButtonBase>

              <Stack spacing={0.25}>
                <Typography variant="overline" sx={{ color: 'text.secondary', letterSpacing: '0.14em' }}>
                  Director&apos;s Notes
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Scene, style, pacing
                </Typography>
              </Stack>
            </Stack>

            <Box sx={{ height: editorHeight, minHeight: editorHeight, display: 'flex' }}>
              <TextField
                multiline
                minRows={1}
                fullWidth
                value={compiledPrompt}
                onChange={(event) => onChangeCompiledPrompt(event.target.value)}
                sx={scrollingTextFieldSx}
              />
            </Box>
            <Typography variant="caption" color="text.secondary">
              Refine the final narration direction that will guide the generated performance.
            </Typography>
          </Stack>
        </CardContent>
      </Card>

      <Card sx={{ ...audioDirectorStyles.sectionCard, height: '100%', minHeight: 0, overflow: 'hidden' }}>
        <CardContent sx={{ p: { xs: 2.25, md: 2.5 }, height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <Stack spacing={1.25} sx={{ height: '100%', minHeight: 0 }}>
            <Typography variant="overline" sx={{ color: 'text.secondary', letterSpacing: '0.14em' }}>
              Script Canvas
            </Typography>

            <Box
              sx={{
                display: 'grid',
                gap: 2,
                gridTemplateColumns: '44px minmax(0, 1fr)',
                alignItems: 'start',
                flex: 1,
                minHeight: 0,
              }}
            >
              <Stack spacing={1}>
                <Tooltip title={manualEditEnabled ? 'Disable manual edit' : 'Enable manual edit'}>
                  <IconButton
                    onClick={() => setManualEditEnabled((previous) => !previous)}
                    aria-label={manualEditEnabled ? 'Disable manual edit' : 'Enable manual edit'}
                    color={manualEditEnabled ? 'primary' : 'default'}
                  >
                    <EditOutlinedIcon />
                  </IconButton>
                </Tooltip>

                <Tooltip title="Open AI polish">
                  <IconButton onClick={onOpenScriptPolish} aria-label="Open AI polish">
                    <AutoAwesomeIcon />
                  </IconButton>
                </Tooltip>

                {showJapaneseReading ? (
                  <Tooltip title={isGeneratingJapaneseReading ? 'Generating Hiragana reading…' : 'Generate Hiragana reading'}>
                    <span>
                      <IconButton
                        onClick={onGenerateJapaneseReading}
                        aria-label="Generate Hiragana reading"
                        color={japaneseReadingText.trim() ? 'primary' : 'default'}
                        disabled={!scriptText.trim() || isGeneratingJapaneseReading || !onGenerateJapaneseReading}
                      >
                        <TranslateOutlinedIcon />
                      </IconButton>
                    </span>
                  </Tooltip>
                ) : null}
              </Stack>

              <Stack spacing={1.25} sx={{ minHeight: 0 }}>
                <Box sx={{ height: primaryEditorHeight, minHeight: primaryEditorHeight, display: 'flex' }}>
                  <TextField
                    multiline
                    minRows={1}
                    fullWidth
                    value={scriptText}
                    onChange={(event) => onChangeScript(event.target.value)}
                    disabled={!manualEditEnabled}
                    sx={scrollingTextFieldSx}
                  />
                </Box>

                {showJapaneseReading ? (
                  <Stack spacing={0.75}>
                    <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
                      <Typography variant="caption" color="text.secondary" sx={{ letterSpacing: '0.08em' }}>
                        Japanese narration reading
                      </Typography>
                      <Chip
                        size="small"
                        color={japaneseReadingStale ? 'warning' : japaneseReadingText.trim() ? 'primary' : 'default'}
                        variant="outlined"
                        label={
                          japaneseReadingStale
                            ? 'Needs refresh'
                            : japaneseReadingText.trim()
                              ? 'Ready for TTS'
                              : 'Not generated yet'
                        }
                      />
                    </Stack>

                    <Box sx={{ height: readingEditorHeight, minHeight: readingEditorHeight, display: 'flex' }}>
                      <TextField
                        multiline
                        minRows={1}
                        fullWidth
                        value={japaneseReadingText}
                        onChange={(event) => onChangeJapaneseReading?.(event.target.value)}
                        placeholder="Generate Hiragana reading, then adjust pronunciation here if needed."
                        sx={scrollingTextFieldSx}
                      />
                    </Box>

                    <Typography variant="caption" color="text.secondary">
                      Audio generation will use this Hiragana reading for Japanese TTS when available.
                    </Typography>
                  </Stack>
                ) : null}

                <Stack direction="row" justifyContent="flex-end">
                  <Button
                    variant="contained"
                    startIcon={<PlayCircleOutlineIcon />}
                    onClick={onGenerate}
                    disabled={generateDisabled || isGenerating}
                  >
                    {isGenerating ? 'Generating…' : 'Generate audio'}
                  </Button>
                </Stack>
              </Stack>
            </Box>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
