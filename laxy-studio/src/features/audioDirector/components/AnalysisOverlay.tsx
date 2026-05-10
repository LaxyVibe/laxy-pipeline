import { Backdrop, Box, CircularProgress, Fade, LinearProgress, Stack, Typography } from '@mui/material';
import { keyframes } from '@mui/material/styles';

type Props = {
  open: boolean;
  analysisPhase: number;
  detectedLangLabel: string | null;
};

const outerPulse = keyframes`
  0% { transform: scale(1); opacity: 0.6; }
  50% { transform: scale(1.25); opacity: 0.15; }
  100% { transform: scale(1); opacity: 0.6; }
`;

const innerPulse = keyframes`
  0% { transform: scale(1); opacity: 0.4; }
  50% { transform: scale(1.18); opacity: 0.1; }
  100% { transform: scale(1); opacity: 0.4; }
`;

export default function AnalysisOverlay(props: Props) {
  const { open, analysisPhase, detectedLangLabel } = props;

  return (
    <Backdrop
      open={open}
      sx={{
        zIndex: (theme) => theme.zIndex.modal + 1,
        bgcolor: 'rgba(31, 43, 38, 0.82)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <Fade in={open} timeout={400}>
        <Stack alignItems="center" spacing={4} sx={{ textAlign: 'center', px: 3 }}>
          <Box
            sx={{
              position: 'relative',
              width: 120,
              height: 120,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                borderRadius: '50%',
                border: '3px solid rgba(255,255,255,0.12)',
                animation: `${outerPulse} 2s ease-in-out infinite`,
              }}
            />
            <Box
              sx={{
                position: 'absolute',
                inset: 10,
                borderRadius: '50%',
                border: '2px solid rgba(255,255,255,0.08)',
                animation: `${innerPulse} 2s ease-in-out 0.3s infinite`,
              }}
            />
            <CircularProgress
              size={52}
              thickness={2.5}
              sx={{ color: 'rgba(255,255,255,0.85)' }}
            />
          </Box>

          <Stack spacing={1.5} alignItems="center">
            <Typography
              variant="h5"
              sx={{
                fontWeight: 700,
                color: '#fff',
                letterSpacing: '-0.02em',
              }}
            >
              {analysisPhase < 1
                ? 'Preparing…'
                : analysisPhase < 2
                  ? 'Detecting language…'
                  : analysisPhase < 3
                    ? detectedLangLabel
                      ? `Detected: ${detectedLangLabel}`
                      : 'Language identified'
                    : 'Setting up your session'}
            </Typography>

            <Box sx={{ width: 260 }}>
              <LinearProgress
                variant="determinate"
                value={analysisPhase < 1 ? 15 : analysisPhase < 2 ? 50 : analysisPhase < 3 ? 80 : 100}
                sx={{
                  height: 4,
                  borderRadius: 2,
                  bgcolor: 'rgba(255,255,255,0.12)',
                  '& .MuiLinearProgress-bar': {
                    bgcolor: '#5f9b8d',
                    borderRadius: 2,
                    transition: 'transform 0.6s ease',
                  },
                }}
              />
            </Box>

            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.78rem' }}>
              {analysisPhase < 2
                ? 'Scanning script content'
                : analysisPhase < 3
                  ? 'Preparing script'
                  : 'Almost ready'}
            </Typography>
          </Stack>
        </Stack>
      </Fade>
    </Backdrop>
  );
}
