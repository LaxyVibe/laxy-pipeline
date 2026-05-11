import { useState } from 'react';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import LocalMoviesOutlinedIcon from '@mui/icons-material/LocalMoviesOutlined';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import SwapHorizOutlinedIcon from '@mui/icons-material/SwapHorizOutlined';
import {
  Box,
  Button,
  ButtonBase,
  Card,
  CardContent,
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
  generateDisabled?: boolean;
  onChangeScript: (nextText: string) => void;
  onChangeCompiledPrompt: (nextText: string) => void;
  onGenerate: () => void;
  onPreviewVoice: (voiceId: string) => void;
  onOpenCharacterPicker: () => void;
  onOpenVoicePicker: () => void;
  onOpenScriptPolish: () => void;
  onOpenDirectorNote: () => void;
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
    generateDisabled = false,
    onChangeScript,
    onChangeCompiledPrompt,
    onGenerate,
    onPreviewVoice,
    onOpenCharacterPicker,
    onOpenVoicePicker,
    onOpenScriptPolish,
    onOpenDirectorNote,
  } = props;

  const [manualEditEnabled, setManualEditEnabled] = useState(false);

  return (
    <Stack spacing={2}>
      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: {
            xs: '1fr',
            md: '260px minmax(0, 1fr) 180px',
          },
          alignItems: 'stretch',
        }}
      >
        <Card sx={audioDirectorStyles.sectionCard}>
          <CardContent sx={{ p: { xs: 2.5, md: 3 }, height: '100%' }}>
            <Stack spacing={2} sx={{ height: '100%' }}>
              <Box sx={{ position: 'relative', pb: 1.5 }}>
                <ButtonBase
                  onClick={onOpenCharacterPicker}
                  sx={{
                    width: '100%',
                    aspectRatio: '1 / 1',
                    borderRadius: '24px',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: '5rem',
                    bgcolor: 'rgba(31, 92, 79, 0.08)',
                  }}
                >
                  <span aria-hidden="true">{characterAvatar}</span>
                </ButtonBase>

                <ButtonBase
                  onClick={() => onPreviewVoice(voiceId)}
                  sx={{
                    position: 'absolute',
                    left: 10,
                    right: 10,
                    bottom: 0,
                    px: 1.25,
                    py: 0.75,
                    borderRadius: '999px',
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
                      variant="caption"
                      sx={{
                        fontWeight: 700,
                        lineHeight: 1.2,
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
                      sx={{ ml: 0.5 }}
                    >
                      <SwapHorizOutlinedIcon sx={{ fontSize: 18 }} />
                    </IconButton>
                  </Tooltip>
                </ButtonBase>
              </Box>

              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                {characterName}
              </Typography>
            </Stack>
          </CardContent>
        </Card>

        <Card sx={audioDirectorStyles.sectionCard}>
          <CardContent sx={{ p: { xs: 2.5, md: 3 }, height: '100%' }}>
            <TextField
              label="Narration Direction"
              multiline
              minRows={8}
              fullWidth
              value={compiledPrompt}
              onChange={(event) => onChangeCompiledPrompt(event.target.value)}
              helperText="Refine the final narration direction that will guide the generated performance."
            />
          </CardContent>
        </Card>

        <Card sx={audioDirectorStyles.sectionCard}>
          <CardContent sx={{ p: { xs: 2.5, md: 3 }, height: '100%' }}>
            <ButtonBase
              onClick={onOpenDirectorNote}
              sx={{
                width: '100%',
                height: '100%',
                minHeight: 180,
                borderRadius: '20px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                gap: 1.5,
                bgcolor: 'rgba(31, 92, 79, 0.06)',
                textAlign: 'center',
                px: 2,
              }}
            >
              <Box
                sx={{
                  width: 72,
                  height: 72,
                  borderRadius: '20px',
                  display: 'grid',
                  placeItems: 'center',
                  bgcolor: 'rgba(255,255,255,0.92)',
                  boxShadow: '0 10px 24px rgba(31, 43, 38, 0.08)',
                }}
              >
                <LocalMoviesOutlinedIcon sx={{ fontSize: 34 }} />
              </Box>
              <Stack spacing={0.5}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  Director Note
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Scene, style, pacing
                </Typography>
              </Stack>
            </ButtonBase>
          </CardContent>
        </Card>
      </Box>

      <Card sx={audioDirectorStyles.sectionCard}>
        <CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
          <Box
            sx={{
              display: 'grid',
              gap: 2,
              gridTemplateColumns: '44px minmax(0, 1fr)',
              alignItems: 'start',
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
            </Stack>

            <Stack spacing={1.25}>
              <TextField
                multiline
                minRows={8}
                maxRows={16}
                fullWidth
                value={scriptText}
                onChange={(event) => onChangeScript(event.target.value)}
                disabled={!manualEditEnabled}
              />

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
        </CardContent>
      </Card>
    </Stack>
  );
}
