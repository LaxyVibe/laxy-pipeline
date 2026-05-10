// ---------------------------------------------------------------------------
// TTSPage — Script input hub that launches Audio Director in an iframe dialog
// ---------------------------------------------------------------------------
import { useEffect, useRef, useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Container,
  Dialog,
  IconButton,
  Slide,
  TextField,
  Toolbar,
  Typography,
} from '@mui/material';
import type { TransitionProps } from '@mui/material/transitions';
import { forwardRef } from 'react';
import CloseIcon from '@mui/icons-material/Close';
import HeadphonesIcon from '@mui/icons-material/Headphones';
import { ROUTES } from '../routes';

const SlideUp = forwardRef(function SlideUp(
  props: TransitionProps & { children: React.ReactElement },
  ref: React.Ref<unknown>,
) {
  return <Slide direction="up" ref={ref} {...props} />;
});

const AUDIO_DIRECTOR_ORIGIN = window.location.origin;

export default function TTSPage() {
  const [script, setScript] = useState('');
  const [open, setOpen] = useState(false);
  const [iframeKey, setIframeKey] = useState(0); // remount iframe each open
  const [iframeSrc, setIframeSrc] = useState<string>(ROUTES.audioDirector);
  const [iframeLoading, setIframeLoading] = useState(true);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // Listen for the "ready" signal from the Audio Director iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== AUDIO_DIRECTOR_ORIGIN) return;
      if (event.data?.type === 'laxy:ready') {
        setIframeLoading(false);
        // Send the script text once the iframe signals it's ready
        iframeRef.current?.contentWindow?.postMessage(
          { type: 'laxy:script', text: script },
          AUDIO_DIRECTOR_ORIGIN,
        );
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [script]);

  const handleOpen = () => {
    setIframeLoading(true);
    setIframeSrc(`${ROUTES.audioDirector}?ts=${Date.now()}`);
    setIframeKey((k) => k + 1); // fresh iframe load each time
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
  };

  return (
    <Container maxWidth="lg" sx={{ py: 6 }}>
      <Box sx={{ mb: 5 }}>
        <Typography variant="h4" fontWeight={700} gutterBottom>
          Text to Speech
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Paste your script below, then pass it to Audio Director to configure
          voices and generate audio.
        </Typography>
      </Box>

      <TextField
        multiline
        fullWidth
        minRows={14}
        maxRows={28}
        value={script}
        onChange={(e) => setScript(e.target.value)}
        placeholder="Paste your script here…"
        variant="outlined"
        sx={{ mb: 3 }}
      />

      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          variant="contained"
          size="large"
          startIcon={<HeadphonesIcon />}
          disabled={!script.trim()}
          onClick={handleOpen}
          sx={{ px: 4, py: 1.25 }}
        >
          Pass to Audio Director
        </Button>
      </Box>

      {/* ── Full-screen dialog with Audio Director iframe ─────────────────── */}
      <Dialog
        fullScreen
        open={open}
        onClose={handleClose}
        TransitionComponent={SlideUp}
      >
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
            <IconButton edge="end" onClick={handleClose} aria-label="close">
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
