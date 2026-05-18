import { Avatar, Box, Card, CardContent, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import AutoFixHighOutlinedIcon from '@mui/icons-material/AutoFixHighOutlined';

interface DirectorMessageCardProps {
  vocalEnvironment: string;
  mission: string;
  pacing: string;
  compiledPrompt: string;
  onManualEdit: () => void;
  onAiEdit: () => void;
}

export default function DirectorMessageCard({
  vocalEnvironment,
  mission,
  pacing,
  compiledPrompt,
  onManualEdit,
  onAiEdit,
}: DirectorMessageCardProps) {
  const directionText = [vocalEnvironment, mission, pacing]
    .filter((value) => value.trim().length > 0)
    .join(' | ')
    .trim();
  const finalText = compiledPrompt.trim() || directionText || 'No narration direction yet.';

  return (
    <Card
      sx={{
        background: 'linear-gradient(135deg, #f5f5f5 0%, #fafafa 100%)',
        border: '2px solid rgba(31, 92, 79, 0.2)',
        transition: 'all 0.2s ease',
        '&:hover': {
          boxShadow: '0 4px 12px rgba(31, 92, 79, 0.12)',
        },
      }}
    >
      <CardContent>
        <Stack spacing={2}>
          <Stack direction="row" spacing={2} alignItems="flex-start">
            <Avatar
              onClick={onManualEdit}
              sx={{
                width: 48,
                height: 48,
                background: '#D4AF37',
                color: '#1f5c4f',
                fontWeight: 700,
                fontSize: 20,
                cursor: 'pointer',
                transition: 'transform 0.2s',
                '&:hover': {
                  transform: 'scale(1.08)',
                },
              }}
            >
              D
            </Avatar>
            <Box sx={{ flex: 1 }}>
              <Typography
                variant="subtitle2"
                sx={{
                  fontWeight: 600,
                  color: '#1f5c4f',
                  mb: 0.5,
                }}
              >
                Director's Narration Direction
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  color: '#6B7280',
                }}
              >
                Click avatar to manually edit
              </Typography>
            </Box>

            <Stack direction="row" spacing={0.5}>
              <Tooltip title="Manual edit">
                <IconButton
                  onClick={onManualEdit}
                  size="small"
                  sx={{
                    color: '#1f5c4f',
                    background: 'rgba(31, 92, 79, 0.08)',
                    '&:hover': {
                      background: 'rgba(31, 92, 79, 0.15)',
                    },
                  }}
                >
                  <EditOutlinedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="AI edit">
                <IconButton
                  onClick={onAiEdit}
                  size="small"
                  sx={{
                    color: '#7C3AED',
                    background: 'rgba(124, 58, 237, 0.08)',
                    '&:hover': {
                      background: 'rgba(124, 58, 237, 0.15)',
                    },
                  }}
                >
                  <AutoFixHighOutlinedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Stack>
          </Stack>

          <Box
            sx={{
              background: '#fff',
              borderRadius: 1.5,
              p: 1.5,
              borderLeft: '4px solid #D4AF37',
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
              {finalText}
            </Typography>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}
