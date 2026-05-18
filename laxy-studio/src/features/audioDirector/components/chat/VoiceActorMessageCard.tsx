import { Avatar, Box, Button, Card, CardContent, CircularProgress, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import type { ItemGenerationState } from '../../types';
import { useState } from 'react';

interface VoiceActorMessageCardProps {
  spotId: string;
  spotNumber: number;
  title: string;
  scriptText: string;
  originalScriptText: string;
  characterName: string;
  voiceName: string;
  audioUrl?: string;
  isPlaying: boolean;
  onPlayAudio: (spotId: string, audioUrl: string) => void;
  onOpenVoicePicker: (spotId: string) => void;
  onOpenCharacterPicker: (spotId: string) => void;
  generationState?: ItemGenerationState;
  isEnhancementEnabled: boolean;
}

export default function VoiceActorMessageCard({
  spotId,
  spotNumber,
  title,
  scriptText,
  originalScriptText,
  characterName,
  voiceName,
  audioUrl,
  isPlaying,
  onPlayAudio,
  onOpenVoicePicker,
  onOpenCharacterPicker,
  generationState,
  isEnhancementEnabled,
}: VoiceActorMessageCardProps) {
  const [showOriginal, setShowOriginal] = useState(false);

  const status = generationState?.status || 'idle';
  const isGeneratingOrPreparing = status === 'generating' || status === 'preparing' || status === 'enhancing';

  const statusColor = {
    idle: '#9CA3AF',
    preparing: '#3B82F6',
    enhancing: '#8B5CF6',
    generating: '#F59E0B',
    done: '#10B981',
    error: '#EF4444',
  }[status] || '#9CA3AF';

  const displayText = showOriginal ? originalScriptText : scriptText;

  return (
    <Card
      sx={{
        background: 'linear-gradient(135deg, #f5f5f5 0%, #fafafa 100%)',
        border: `2px solid ${statusColor}33`,
        transition: 'all 0.2s ease',
        '&:hover': {
          boxShadow: `0 4px 12px ${statusColor}22`,
        },
      }}
    >
      <CardContent>
        <Stack spacing={2}>
          {/* Header with Voice Actor Avatar and metadata */}
          <Stack direction="row" spacing={2} alignItems="flex-start">
            <Tooltip title="Click to pick voice">
              <Avatar
                onClick={() => onOpenVoicePicker(spotId)}
                sx={{
                  width: 48,
                  height: 48,
                  background: '#1f5c4f',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: 20,
                  cursor: 'pointer',
                  transition: 'transform 0.2s',
                  '&:hover': {
                    transform: 'scale(1.08)',
                  },
                }}
              >
                V
              </Avatar>
            </Tooltip>

            <Box sx={{ flex: 1 }}>
              <Stack direction="row" spacing={1} alignItems="center" mb={0.5}>
                <Typography
                  variant="subtitle2"
                  sx={{
                    fontWeight: 600,
                    color: '#1f5c4f',
                  }}
                >
                  Stop {spotNumber}. {title}
                </Typography>
                {status !== 'idle' && (
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.5,
                      background: `${statusColor}22`,
                      color: statusColor,
                      px: 1,
                      py: 0.25,
                      borderRadius: 1,
                      fontSize: 11,
                      fontWeight: 500,
                    }}
                  >
                    {isGeneratingOrPreparing && <CircularProgress size={10} sx={{ color: statusColor }} />}
                    <span>{status}</span>
                  </Box>
                )}
              </Stack>

              {/* Character and Voice badges */}
              <Stack direction="row" spacing={1}>
                <Tooltip title="Click to pick character">
                  <Button
                    onClick={() => onOpenCharacterPicker(spotId)}
                    size="small"
                    sx={{
                      textTransform: 'none',
                      fontSize: 12,
                      fontWeight: 500,
                      color: '#1f5c4f',
                      background: 'rgba(31, 92, 79, 0.08)',
                      padding: '4px 8px',
                      height: 'auto',
                      '&:hover': {
                        background: 'rgba(31, 92, 79, 0.15)',
                      },
                    }}
                  >
                    👤 {characterName}
                  </Button>
                </Tooltip>

                <Tooltip title="Click to pick voice">
                  <Button
                    onClick={() => onOpenVoicePicker(spotId)}
                    size="small"
                    sx={{
                      textTransform: 'none',
                      fontSize: 12,
                      fontWeight: 500,
                      color: '#7C3AED',
                      background: 'rgba(124, 58, 237, 0.08)',
                      padding: '4px 8px',
                      height: 'auto',
                      '&:hover': {
                        background: 'rgba(124, 58, 237, 0.15)',
                      },
                    }}
                  >
                    🎤 {voiceName}
                  </Button>
                </Tooltip>
              </Stack>
            </Box>
          </Stack>

          {/* Script Text */}
          <Box
            sx={{
              background: '#fff',
              borderRadius: 1.5,
              p: 1.5,
              borderLeft: `4px solid ${statusColor}`,
              minHeight: 60,
            }}
          >
            <Typography
              variant="body2"
              sx={{
                color: '#374151',
                lineHeight: 1.7,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {displayText}
            </Typography>
          </Box>

          {/* Show original/enhanced toggle and audio button */}
          <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
            {isEnhancementEnabled && scriptText !== originalScriptText && (
              <Button
                size="small"
                onClick={() => setShowOriginal(!showOriginal)}
                sx={{
                  textTransform: 'none',
                  fontSize: 12,
                  color: '#7C3AED',
                  p: 0,
                  '&:hover': {
                    background: 'transparent',
                  },
                }}
              >
                {showOriginal ? 'Show Enhanced' : 'Show Original'}
              </Button>
            )}

            {audioUrl && (
              <Tooltip title={isPlaying ? 'Pause' : 'Play audio'}>
                <IconButton
                  onClick={() => onPlayAudio(spotId, audioUrl)}
                  disabled={isGeneratingOrPreparing}
                  sx={{
                    width: 40,
                    height: 40,
                    background: '#1f5c4f',
                    color: '#fff',
                    transition: 'all 0.2s',
                    '&:hover:not(:disabled)': {
                      background: '#2a7a6c',
                      transform: 'scale(1.05)',
                    },
                    '&:disabled': {
                      background: '#ccc',
                      color: '#999',
                    },
                  }}
                >
                  {isPlaying ? <PauseIcon /> : <PlayArrowIcon />}
                </IconButton>
              </Tooltip>
            )}
          </Stack>

          {/* Status message or error */}
          {generationState?.message && (
            <Typography
              variant="caption"
              sx={{
                color: status === 'error' ? '#EF4444' : '#6B7280',
                display: 'block',
                fontStyle: 'italic',
              }}
            >
              {generationState.message}
            </Typography>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
