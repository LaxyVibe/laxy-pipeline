// ---------------------------------------------------------------------------
// PublishStep — Step 6 of the Guide pipeline wizard
//
// Sub-steps:
//   1. Configure Slideshow (image timelines per spot)
//   2. Preview & Check (device preview + readiness checklist)
//   3. Approve & Publish (final approval, CMS push, QR + shortlink)
//
// Features:
//   S6-1  Slideshow Builder (TTML)
//   S6-2  CMS Publishing (readiness checklist + pipeline publish)
//   S6-3  Preview (device frame preview)
//   S6-4  Final Approval & Publish
//   S6-5  QR Code Generation
//   S6-6  Shortlink / URL
// ---------------------------------------------------------------------------
import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  Paper,
  Stepper,
  Step,
  StepLabel,
  Button,
  Alert,
  CircularProgress,
  Chip,
  Divider,
  Fade,
  alpha,
} from '@mui/material';
import SlideshowIcon from '@mui/icons-material/Slideshow';
import PreviewIcon from '@mui/icons-material/Preview';
import PublishIcon from '@mui/icons-material/Publish';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CelebrationIcon from '@mui/icons-material/Celebration';

import { useGuidesStore } from '../../guidesStore';
import {
  ApiRequestError,
  fetchPublishStatus,
  publishGuide,
} from '../../api';
import type {
  PublishStatus,
  PublishedGuide,
} from '../../types/entity';

import SlideshowBuilder from './publish/SlideshowBuilder';
import PublishChecklist from './publish/PublishChecklist';
import GuidePreview from './publish/GuidePreview';
import FinalApproval from './publish/FinalApproval';
import QRCodeCard from './publish/QRCodeCard';
import {
  buildInitialSlideshows,
  buildPublishSessionId,
  derivePublishSlug,
  isPublishReady,
} from '../../workflows/publishWorkflow';

// ── Sub-step definitions ──

const SUB_STEPS = [
  { label: 'Slideshow', icon: <SlideshowIcon /> },
  { label: 'Preview & Check', icon: <PreviewIcon /> },
  { label: 'Publish', icon: <PublishIcon /> },
];

function statusToSubStep(status: PublishStatus): number {
  switch (status) {
    case 'idle':
      return 0;
    case 'previewing':
      return 1;
    case 'publishing':
    case 'published':
    case 'error':
      return 2;
    default:
      return 0;
  }
}

// ── Processing overlay ──

function PublishingOverlay() {
  return (
    <Fade in>
      <Paper
        sx={{
          p: 6,
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 3,
        }}
      >
        <CircularProgress size={64} thickness={3} />
        <Box>
          <Typography variant="h6" gutterBottom>
            Publishing guide…
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Bundling content, generating slideshows, and deploying to CDN.
            <br />
            This may take a few moments.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'center' }}>
          <Chip label="Bundle Content" size="small" variant="outlined" />
          <Chip label="→" size="small" sx={{ bgcolor: 'transparent' }} />
          <Chip label="Generate TTML" size="small" variant="outlined" />
          <Chip label="→" size="small" sx={{ bgcolor: 'transparent' }} />
          <Chip label="Deploy CDN" size="small" variant="outlined" />
          <Chip label="→" size="small" sx={{ bgcolor: 'transparent' }} />
          <Chip label="Generate QR" size="small" variant="outlined" />
        </Box>
      </Paper>
    </Fade>
  );
}

// ── Published success banner ──

function PublishedSuccess({ guide }: { guide: PublishedGuide }) {
  return (
    <Paper
      sx={{
        p: 3,
        mb: 3,
        bgcolor: (t) => alpha(t.palette.success.main, 0.08),
        border: '2px solid',
        borderColor: 'success.main',
        borderRadius: 2,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
      }}
    >
      <CelebrationIcon color="success" sx={{ fontSize: 40 }} />
      <Box>
        <Typography variant="h6" color="success.main" fontWeight={700}>
          Guide Published Successfully!
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Your guide is now live and accessible via the links below.
          Published at {new Date(guide.publishedAt).toLocaleString()}.
        </Typography>
      </Box>
    </Paper>
  );
}

// ── Main PublishStep ──

export default function PublishStep() {
  const ingestionStatus = useGuidesStore((s) => s.ingestionStatus);
  const scriptStatus = useGuidesStore((s) => s.scriptStatus);
  const translationStatus = useGuidesStore((s) => s.translationStatus);
  const audioStatus = useGuidesStore((s) => s.audioStatus);
  const spots = useGuidesStore((s) => s.spots);
  const audioFiles = useGuidesStore((s) => s.audioFiles);
  const imageMappings = useGuidesStore((s) => s.imageMappings);
  const scripts = useGuidesStore((s) => s.scripts);
  const slideshows = useGuidesStore((s) => s.slideshows);
  const srtFiles = useGuidesStore((s) => s.srtFiles);
  const publishStatus = useGuidesStore((s) => s.publishStatus);
  const publishError = useGuidesStore((s) => s.publishError);
  const publishJobId = useGuidesStore((s) => s.publishJobId);
  const publishedGuide = useGuidesStore((s) => s.publishedGuide);
  const customSlug = useGuidesStore((s) => s.customSlug);
  const entityConfig = useGuidesStore((s) => s.entityConfig);

  const setSlideshows = useGuidesStore((s) => s.setSlideshows);
  const setPublishStatus = useGuidesStore((s) => s.setPublishStatus);
  const setPublishError = useGuidesStore((s) => s.setPublishError);
  const setCustomSlug = useGuidesStore((s) => s.setCustomSlug);
  const setPublishJobId = useGuidesStore((s) => s.setPublishJobId);
  const setPublishedGuide = useGuidesStore((s) => s.setPublishedGuide);

  const [subStep, setSubStep] = useState(() => statusToSubStep(publishStatus));

  // Sync subStep when publishStatus changes externally (e.g., pipeline sync, autosave restore)
  useEffect(() => {
    setSubStep(statusToSubStep(publishStatus));
  }, [publishStatus]);

  // ── Initialize slideshows from spots on mount ──
  useEffect(() => {
    if (slideshows.length === 0 && spots.length > 0) {
      const initial = buildInitialSlideshows({
        spots,
        imageMappings,
        audioFiles,
        coreLanguage: entityConfig.coreLanguage,
      });
      setSlideshows(initial);
    }
  }, [spots, slideshows.length, imageMappings, audioFiles, entityConfig.coreLanguage, setSlideshows]);

  // ── Readiness check ──
  const allReady = useMemo(() => {
    return isPublishReady({
      ingestionStatus,
      scriptStatus,
      translationStatus,
      audioStatus,
      supportedLanguages: entityConfig.supportedLanguages ?? [],
      srtCount: srtFiles.length,
      slideshows,
    });
  }, [
    ingestionStatus,
    scriptStatus,
    translationStatus,
    audioStatus,
    entityConfig.supportedLanguages,
    srtFiles.length,
    slideshows,
  ]);

  const pollTimeoutRef = useRef<number | null>(null);
  const pollInFlightRef = useRef(false);

  const publishRequestBase = useMemo(() => ({
    sessionId: buildPublishSessionId(entityConfig.venueName),
    venueName: entityConfig.venueName,
    coreLanguage: entityConfig.coreLanguage,
    supportedLanguages: entityConfig.supportedLanguages,
    customSlug: customSlug || undefined,
    spotsCount: spots.length,
    scriptsCount: scripts.length,
    slideshowsCount: slideshows.length,
    audioCount: audioFiles.length,
    srtCount: srtFiles.length,
  }), [
    entityConfig.venueName,
    entityConfig.coreLanguage,
    entityConfig.supportedLanguages,
    customSlug,
    spots.length,
    scripts.length,
    slideshows.length,
    audioFiles.length,
    srtFiles.length,
  ]);

  const stopPublishPolling = useCallback(() => {
    if (pollTimeoutRef.current !== null) {
      window.clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
    pollInFlightRef.current = false;
  }, []);

  const applyPublishResult = useCallback((result: Awaited<ReturnType<typeof publishGuide>>) => {
    setPublishJobId(result.publishId);

    if (result.status === 'processing') {
      setPublishError(null);
      setPublishStatus('publishing');
      return;
    }

    if (result.status === 'failed') {
      setPublishStatus('error');
      setPublishError(
        result.retryable
          ? 'Publish failed. Retry to start a new publish attempt.'
          : 'Publish failed and cannot be retried.',
      );
      return;
    }

    if (!result.guideUrl) {
      setPublishError('Pipeline did not return a published guide URL.');
      setPublishStatus('error');
      return;
    }

    const slugValue = derivePublishSlug({
      pipelineSlug: result.slug,
      customSlug,
      venueName: entityConfig.venueName,
    });

    const published: PublishedGuide = {
      publishId: result.publishId,
      guideUrl: result.guideUrl,
      shortUrl: result.shortUrl,
      slug: slugValue,
      qrDataUrl: result.qrDataUrl,
      publishedAt: result.publishedAt || Date.now(),
    };

    setPublishedGuide(published);
    setPublishError(null);
    setPublishStatus('published');
  }, [
    customSlug,
    entityConfig.venueName,
    setPublishError,
    setPublishedGuide,
    setPublishJobId,
    setPublishStatus,
  ]);

  const pollPublishJob = useCallback(async (jobId: string) => {
    if (pollInFlightRef.current) {
      return;
    }

    pollInFlightRef.current = true;
    try {
      const result = await fetchPublishStatus(jobId);
      applyPublishResult(result);

      if (result.status === 'processing') {
        pollTimeoutRef.current = window.setTimeout(() => {
          void pollPublishJob(jobId);
        }, 2000);
      } else {
        stopPublishPolling();
      }
    } catch (err) {
      stopPublishPolling();
      console.error('[PublishStep] Publish status polling error:', err);
      const message = err instanceof ApiRequestError
        ? err.message
        : (err instanceof Error ? err.message : 'Publish status polling failed');
      setPublishError(message);
      setPublishStatus('error');
    } finally {
      pollInFlightRef.current = false;
    }
  }, [applyPublishResult, setPublishError, setPublishStatus, stopPublishPolling]);

  const startPublishPolling = useCallback((jobId: string) => {
    stopPublishPolling();
    setPublishJobId(jobId);
    setPublishStatus('publishing');
    pollTimeoutRef.current = window.setTimeout(() => {
      void pollPublishJob(jobId);
    }, 0);
  }, [pollPublishJob, setPublishJobId, setPublishStatus, stopPublishPolling]);

  useEffect(() => {
    if (!publishJobId && publishedGuide?.publishId) {
      setPublishJobId(publishedGuide.publishId);
    }
  }, [publishJobId, publishedGuide, setPublishJobId]);

  useEffect(() => {
    if (publishStatus === 'publishing' && publishJobId) {
      startPublishPolling(publishJobId);
    }
  }, [publishStatus, publishJobId, startPublishPolling]);

  useEffect(() => {
    return () => {
      stopPublishPolling();
    };
  }, [stopPublishPolling]);

  // ── Publish handler ──
  const handlePublish = useCallback(async () => {
    stopPublishPolling();
    setPublishedGuide(null);
    setPublishStatus('publishing');
    setPublishError(null);

    try {
      const result = await publishGuide(publishRequestBase);
      applyPublishResult(result);

      if (result.status === 'processing') {
        startPublishPolling(result.publishId);
      }
    } catch (err) {
      console.error('[PublishStep] Publish error:', err);
      const message = err instanceof ApiRequestError
        ? err.message
        : (err instanceof Error ? err.message : 'Publish failed');
      setPublishError(message);
      setPublishStatus('error');
    }
  }, [
    applyPublishResult,
    publishRequestBase,
    setPublishError,
    setPublishStatus,
    setPublishedGuide,
    startPublishPolling,
    stopPublishPolling,
  ]);

  // ── Navigation ──
  const canGoNext = useMemo(() => {
    if (subStep === 0) {
      // Need at least one slideshow configured
      return slideshows.length > 0;
    }
    if (subStep === 1) return true; // Can always move to publish step
    return false;
  }, [subStep, slideshows.length]);

  const handleNext = useCallback(() => {
    if (subStep === 0) {
      setPublishStatus('previewing');
      setSubStep(1);
    } else if (subStep === 1) {
      setSubStep(2);
    }
  }, [subStep, setPublishStatus]);

  const handleBack = useCallback(() => {
    if (subStep === 1) {
      setPublishStatus('idle');
      setSubStep(0);
    } else if (subStep === 2 && publishStatus !== 'published') {
      stopPublishPolling();
      setPublishError(null); // clear stale errors on back-navigation
      setPublishStatus('previewing');
      setSubStep(1);
    }
  }, [subStep, publishStatus, setPublishStatus, setPublishError, stopPublishPolling]);

  // ── Retry / Reset ──
  const handleRetry = useCallback(async () => {
    if (!publishJobId) {
      await handlePublish();
      return;
    }

    stopPublishPolling();
    setPublishStatus('publishing');
    setPublishError(null);

    try {
      const result = await publishGuide({
        ...publishRequestBase,
        publishId: publishJobId,
        retry: true,
      });
      applyPublishResult(result);
      if (result.status === 'processing') {
        startPublishPolling(result.publishId);
      }
    } catch (err) {
      console.error('[PublishStep] Retry publish error:', err);
      const message = err instanceof ApiRequestError
        ? err.message
        : (err instanceof Error ? err.message : 'Retry publish failed');
      setPublishError(message);
      setPublishStatus('error');
    }
  }, [
    applyPublishResult,
    handlePublish,
    publishJobId,
    publishRequestBase,
    setPublishError,
    setPublishStatus,
    startPublishPolling,
    stopPublishPolling,
  ]);

  // ── Sub-step content ──
  const renderSubStep = () => {
    // Publishing in progress
    if (publishStatus === 'publishing') {
      return <PublishingOverlay />;
    }

    switch (subStep) {
      // ── Step 0: Configure Slideshow ──
      case 0:
        return (
          <Fade in>
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                <SlideshowIcon color="primary" />
                <Typography variant="h6" fontWeight={700}>
                  Configure Slideshows
                </Typography>
                {slideshows.length > 0 && (
                  <Chip
                    label={`${slideshows.length} spots`}
                    size="small"
                    color="primary"
                    variant="outlined"
                  />
                )}
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Set up image slideshows for each spot. Images will be timed to sync
                with the audio narration using TTML timing.
              </Typography>
              <SlideshowBuilder />
            </Box>
          </Fade>
        );

      // ── Step 1: Preview & Check ──
      case 1:
        return (
          <Fade in>
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                <PreviewIcon color="primary" />
                <Typography variant="h6" fontWeight={700}>
                  Preview & Readiness Check
                </Typography>
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Preview how the guide will look on different devices and verify
                all content is ready for publishing.
              </Typography>

              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                  gap: 3,
                }}
              >
                <Box>
                  <GuidePreview />
                </Box>
                <Box>
                  <PublishChecklist />
                </Box>
              </Box>
            </Box>
          </Fade>
        );

      // ── Step 2: Approve & Publish ──
      case 2:
        return (
          <Fade in>
            <Box>
              {/* Published success banner */}
              {publishedGuide && <PublishedSuccess guide={publishedGuide} />}

              {/* Error banner */}
              {publishError && (
                <Alert severity="error" sx={{ mb: 2 }} onClose={() => setPublishError(null)}>
                  {publishError}
                </Alert>
              )}

              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', md: publishedGuide ? '1fr 1fr' : '1fr' },
                  gap: 3,
                }}
              >
                {/* Final approval / summary */}
                <Box>
                  <FinalApproval
                    onPublish={handlePublish}
                    publishing={false /* publishing state returns overlay above */}
                    allReady={allReady}
                  />
                </Box>

                {/* QR Code & Links (always visible, pre+post publish) */}
                <Box>
                  <QRCodeCard
                    publishedGuide={publishedGuide}
                    customSlug={customSlug}
                    onSlugChange={setCustomSlug}
                  />
                </Box>
              </Box>
            </Box>
          </Fade>
        );

      default:
        return null;
    }
  };

  return (
    <Box>
      {/* Header */}
      <Paper sx={{ p: 3, mb: 3, borderRadius: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
          <PublishIcon color="primary" sx={{ fontSize: 32 }} />
          <Box>
            <Typography variant="h5" fontWeight={700}>
              Step 6 — Publishing
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Configure slideshows, preview your guide, and publish to CDN.
            </Typography>
          </Box>
          {publishStatus === 'published' && (
            <Chip
              icon={<CheckCircleIcon />}
              label="Published"
              color="success"
              sx={{ ml: 'auto' }}
            />
          )}
        </Box>

        {/* Sub-step stepper */}
        <Stepper activeStep={subStep} alternativeLabel>
          {SUB_STEPS.map((step, idx) => (
            <Step key={step.label} completed={idx < subStep || publishStatus === 'published'}>
              <StepLabel
                StepIconProps={{
                  icon: step.icon,
                }}
              >
                <Typography variant="caption" fontWeight={idx === subStep ? 700 : 400}>
                  {step.label}
                </Typography>
              </StepLabel>
            </Step>
          ))}
        </Stepper>
      </Paper>

      {/* Sub-step content */}
      {renderSubStep()}

      {/* Navigation buttons */}
      {publishStatus !== 'publishing' && (
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 3 }}>
          <Button
            startIcon={<ArrowBackIcon />}
            onClick={handleBack}
            disabled={subStep === 0}
            color="inherit"
          >
            Back
          </Button>

          {subStep < 2 && (
            <Button
              endIcon={<ArrowForwardIcon />}
              variant="contained"
              onClick={handleNext}
              disabled={!canGoNext}
            >
              Next
            </Button>
          )}

          {publishStatus === 'error' && (
            <Button variant="outlined" color="warning" onClick={handleRetry}>
              Retry
            </Button>
          )}
        </Box>
      )}
    </Box>
  );
}
