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
import { useState, useCallback, useMemo, useEffect } from 'react';
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
  startPipeline,
  getExecutedNodes,
  getStoppedNodeId,
  getNodeOutput,
} from '../../api';
import type {
  SpotSlideshow,
  SlideshowImage,
  PublishStatus,
  PublishedGuide,
} from '../../types/entity';

import SlideshowBuilder from './publish/SlideshowBuilder';
import PublishChecklist from './publish/PublishChecklist';
import GuidePreview from './publish/GuidePreview';
import FinalApproval from './publish/FinalApproval';
import QRCodeCard from './publish/QRCodeCard';

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
  const spots = useGuidesStore((s) => s.spots);
  const audioFiles = useGuidesStore((s) => s.audioFiles);
  const imageMappings = useGuidesStore((s) => s.imageMappings);
  const scripts = useGuidesStore((s) => s.scripts);
  const slideshows = useGuidesStore((s) => s.slideshows);
  const srtFiles = useGuidesStore((s) => s.srtFiles);
  const publishStatus = useGuidesStore((s) => s.publishStatus);
  const publishError = useGuidesStore((s) => s.publishError);
  const publishedGuide = useGuidesStore((s) => s.publishedGuide);
  const customSlug = useGuidesStore((s) => s.customSlug);
  const entityConfig = useGuidesStore((s) => s.entityConfig);

  const setSlideshows = useGuidesStore((s) => s.setSlideshows);
  const setPublishStatus = useGuidesStore((s) => s.setPublishStatus);
  const setPublishError = useGuidesStore((s) => s.setPublishError);
  const setCustomSlug = useGuidesStore((s) => s.setCustomSlug);
  const setPublishedGuide = useGuidesStore((s) => s.setPublishedGuide);
  const resetPublish = useGuidesStore((s) => s.resetPublish);

  const [subStep, setSubStep] = useState(() => statusToSubStep(publishStatus));

  // Sync subStep when publishStatus changes externally (e.g., pipeline sync, autosave restore)
  useEffect(() => {
    setSubStep(statusToSubStep(publishStatus));
  }, [publishStatus]);

  // ── Initialize slideshows from spots on mount ──
  useEffect(() => {
    if (slideshows.length === 0 && spots.length > 0) {
      const initial: SpotSlideshow[] = spots.map((spot, idx) => {
        // Find images mapped to this spot from the script step
        const mapping = imageMappings.find((m) => m.spotId === spot.id);
        const spotAudio = audioFiles.find(
          (a) => a.lang === entityConfig.coreLanguage,
        );
        const audioDuration = spotAudio ? 30 : 15; // placeholder duration

        const images: SlideshowImage[] = (mapping?.assignedAssetIds ?? []).map(
          (assetId: string, imgIdx: number) => ({
            assetId,
            order: imgIdx,
            startSec: 0,
            durationSec: 0,
            caption: '',
          }),
        );

        // Distribute time evenly
        if (images.length > 0) {
          const perImage = audioDuration / images.length;
          images.forEach((img, i) => {
            img.startSec = parseFloat((i * perImage).toFixed(2));
            img.durationSec = parseFloat(perImage.toFixed(2));
          });
        }

        return {
          spotId: spot.id,
          spotNumber: spot.spotNumber ?? idx + 1,
          title: spot.title,
          audioDurationSec: audioDuration,
          images,
        };
      });
      setSlideshows(initial);
    }
  }, [spots, slideshows.length, imageMappings, audioFiles, entityConfig.coreLanguage, setSlideshows]);

  // ── Readiness check ──
  const allReady = useMemo(() => {
    const ingestionOk = useGuidesStore.getState().ingestionStatus === 'approved';
    const scriptOk = useGuidesStore.getState().scriptStatus === 'approved';
    const audioOk = useGuidesStore.getState().audioStatus === 'approved';
    const srtOk = srtFiles.length > 0;
    const slideshowOk = slideshows.length > 0 && slideshows.every((s) => s.images.length > 0);

    // Translation is optional (single language may skip)
    const transStatus = useGuidesStore.getState().translationStatus;
    const langs = entityConfig.supportedLanguages ?? [];
    const translationOk = langs.length <= 1 || transStatus === 'approved';

    return ingestionOk && scriptOk && translationOk && audioOk && srtOk && slideshowOk;
  }, [slideshows, srtFiles.length, entityConfig.supportedLanguages]);

  // ── Publish handler ──
  const handlePublish = useCallback(async () => {
    setPublishStatus('publishing');
    setPublishError(null);

    try {
      // Build the question prompt for pipeline
      const spotSummary = spots
        .map(
          (s, i) =>
            `Spot ${i + 1}: "${s.title}" — ` +
            `${imageMappings.find((m) => m.spotId === s.id)?.assignedAssetIds.length ?? 0} images, ` +
            `script ${scripts.find((sc) => sc.spotId === s.id) ? 'ready' : 'missing'}`,
        )
        .join('\n');

      const question = [
        `[PUBLISH] Guide "${entityConfig.venueName}"`,
        `Venue: ${entityConfig.venueName}`,
        `Languages: ${entityConfig.coreLanguage}${(entityConfig.supportedLanguages ?? []).length > 0 ? ', ' + entityConfig.supportedLanguages!.join(', ') : ''}`,
        `Spots (${spots.length}):`,
        spotSummary,
        `Audio files: ${audioFiles.length}`,
        `SRT files: ${srtFiles.length}`,
        `Slideshows configured: ${slideshows.length}`,
        customSlug ? `Custom slug: ${customSlug}` : '',
        '',
        'Bundle and publish this guide to CDN. Generate QR code and shortlink.',
      ]
        .filter(Boolean)
        .join('\n');

      const sessionId = `publish-${entityConfig.venueName || 'guide'}-${Date.now()}`;

      let guideUrl = '';
      let shortUrl = '';
      let slug = '';

      try {
        const res = await startPipeline(question, sessionId);
        const nodes = getExecutedNodes(res);
        console.log('[PublishStep] Executed nodes:', nodes);

        // Try to parse publish result from pipeline response
        const publishResult = getNodeOutput(res, 'Publish Result') as Record<string, unknown> | null;
        if (publishResult) {
          guideUrl = (publishResult.guideUrl as string) ?? '';
          shortUrl = (publishResult.shortUrl as string) ?? '';
          slug = (publishResult.slug as string) ?? '';
        }

        // If pipeline didn't return URLs, use the response text
        if (!guideUrl && res.finalText) {
          // Try to parse JSON from response text
          try {
            const parsed = JSON.parse(res.finalText);
            guideUrl = parsed.guideUrl ?? parsed.url ?? '';
            shortUrl = parsed.shortUrl ?? '';
            slug = parsed.slug ?? '';
          } catch {
            // Non-JSON response — use as guide URL
            guideUrl = res.finalText.includes('http') ? res.finalText.trim() : '';
          }
        }
      } catch (err) {
        const pipelineMsg = err instanceof Error ? err.message : 'Pipeline unavailable';
        setPublishError(pipelineMsg);
        setPublishStatus('error');
        return;
      }

      if (!guideUrl) {
        setPublishError('Pipeline did not return a published guide URL.');
        setPublishStatus('error');
        return;
      }

      const slugValue =
        slug ||
        customSlug ||
        (entityConfig.venueName || 'guide')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');

      // Generate QR data URL
      const qrCanvas = document.createElement('canvas');
      const qrSize = 300;
      qrCanvas.width = qrSize;
      qrCanvas.height = qrSize;
      const qrCtx = qrCanvas.getContext('2d');
      let qrDataUrl = '';
      if (qrCtx) {
        qrCtx.fillStyle = '#ffffff';
        qrCtx.fillRect(0, 0, qrSize, qrSize);
        // Simplified QR-like placeholder
        const cells = 25;
        const cs = qrSize / cells;
        const h = Array.from(guideUrl).reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0);
        qrCtx.fillStyle = '#000000';
        for (let r = 0; r < cells; r++) {
          for (let c = 0; c < cells; c++) {
            if ((r < 8 && c < 8) || (r < 8 && c > cells - 9) || (r > cells - 9 && c < 8)) {
              // Finder patterns
              const fx = c < 8 ? 0 : cells - 7;
              const fy = r < 8 ? 0 : cells - 7;
              const rx = c - fx;
              const ry = r - fy;
              const border = rx === 0 || rx === 6 || ry === 0 || ry === 6;
              const inner = rx >= 2 && rx <= 4 && ry >= 2 && ry <= 4;
              if (border || inner) {
                qrCtx.fillRect(c * cs, r * cs, cs, cs);
              }
              continue;
            }
            if (((h + r * 37 + c * 53) & 0xffffffff) % 3 === 0) {
              qrCtx.fillRect(c * cs, r * cs, cs, cs);
            }
          }
        }
        qrDataUrl = qrCanvas.toDataURL('image/png');
      }

      const published: PublishedGuide = {
        guideUrl,
        shortUrl,
        slug: slugValue,
        qrDataUrl,
        publishedAt: Date.now(),
      };

      setPublishedGuide(published);
      setPublishStatus('published');
    } catch (err) {
      console.error('[PublishStep] Publish error:', err);
      setPublishError(err instanceof Error ? err.message : 'Publish failed');
      setPublishStatus('error');
    }
  }, [
    spots,
    scripts,
    imageMappings,
    audioFiles,
    srtFiles,
    slideshows,
    entityConfig,
    customSlug,
    setPublishStatus,
    setPublishError,
    setPublishedGuide,
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
      setPublishError(null); // clear stale errors on back-navigation
      setPublishStatus('previewing');
      setSubStep(1);
    }
  }, [subStep, publishStatus, setPublishStatus, setPublishError]);

  // ── Retry / Reset ──
  const handleRetry = useCallback(() => {
    resetPublish();
    setSubStep(0);
  }, [resetPublish]);

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
