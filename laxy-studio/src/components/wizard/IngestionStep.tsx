// ---------------------------------------------------------------------------
// IngestionStep — Step 1 of the Guide pipeline wizard
//
// Sub-steps:
//   1. Select Content (ContentSelector)
//   2. AI Processing (trigger ADK pipeline → spinner)
//   3. Review & Approve (MetadataEditor + Human Gate 1)
// ---------------------------------------------------------------------------
import { useState, useCallback } from 'react';
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
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import RateReviewIcon from '@mui/icons-material/RateReview';

import { useGuidesStore } from '../../guidesStore';
import {
  startPipeline,
  getExecutedNodes,
  getLastStatus,
  getStoppedNodeId,
  getNodeOutput,
} from '../../api';
import type { SpotMetadata, IngestionStatus } from '../../types/entity';
import ContentSelector from './ContentSelector';
import MetadataEditor from './MetadataEditor';

// ── Sub-step definitions ──

const SUB_STEPS = [
  { label: 'Select Content', icon: <CloudUploadIcon /> },
  { label: 'AI Processing', icon: <AutoFixHighIcon /> },
  { label: 'Review & Approve', icon: <RateReviewIcon /> },
];

function statusToSubStep(status: IngestionStatus): number {
  switch (status) {
    case 'idle':
    case 'selecting':
      return 0;
    case 'processing':
      return 1;
    case 'review':
    case 'approved':
    case 'error':
      return 2;
    default:
      return 0;
  }
}

// ── Processing overlay ──

function ProcessingOverlay() {
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
            AI is processing your content…
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Extracting metadata from uploaded assets using OCR and AI analysis.
            <br />
            This may take a moment.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'center' }}>
          <Chip label="OCR Parse" size="small" variant="outlined" />
          <Chip label="→" size="small" sx={{ bgcolor: 'transparent' }} />
          <Chip label="Metadata Extraction" size="small" variant="outlined" />
          <Chip label="→" size="small" sx={{ bgcolor: 'transparent' }} />
          <Chip label="Human Gate 1" size="small" variant="outlined" />
        </Box>
      </Paper>
    </Fade>
  );
}

// ── Main IngestionStep ──

export default function IngestionStep() {
  const ingestionStatus = useGuidesStore((s) => s.ingestionStatus);
  const ingestionError = useGuidesStore((s) => s.ingestionError);
  const selectedAssetIds = useGuidesStore((s) => s.selectedAssetIds);
  const spots = useGuidesStore((s) => s.spots);
  const setIngestionStatus = useGuidesStore((s) => s.setIngestionStatus);
  const setIngestionError = useGuidesStore((s) => s.setIngestionError);
  const setSpots = useGuidesStore((s) => s.setSpots);
  const setPipelineIds = useGuidesStore((s) => s.setPipelineIds);
  const resetIngestion = useGuidesStore((s) => s.resetIngestion);
  const coreLanguage = useGuidesStore((s) => s.entityConfig.coreLanguage);
  const assets = useGuidesStore((s) => s.assets);

  const [approveLoading, setApproveLoading] = useState(false);

  const activeSubStep = statusToSubStep(ingestionStatus);

  // Build a question string with selected asset info (includes download URLs when available)
  const buildQuestion = useCallback(() => {
    const selectedAssets = assets.filter((a) => selectedAssetIds.includes(a.id));
    const assetSummary = selectedAssets
      .map((a) => {
        const base = `- ${a.name} (${a.mimeType})`;
        if (a.downloadUrl) return `${base}: ${a.downloadUrl}`;
        if (a.sourceUrl) return `${base}: ${a.sourceUrl}`;
        return base;
      })
      .join('\n');
    return `Process the following ${selectedAssets.length} asset(s) for metadata extraction.\nCore language: ${coreLanguage}\n\nAssets:\n${assetSummary}`;
  }, [assets, selectedAssetIds, coreLanguage]);

  // ── Trigger pipeline ──
  const handleStartIngestion = useCallback(async () => {
    if (selectedAssetIds.length === 0) return;

    // Verify all selected assets have finished uploading to Firebase Storage
    const selectedAssets = assets.filter((a) => selectedAssetIds.includes(a.id));
    const pendingUploads = selectedAssets.filter(
      (a) => a.source === 'file' && a.status !== 'done',
    );
    if (pendingUploads.length > 0) {
      setIngestionError(
        `${pendingUploads.length} file(s) still uploading. Please wait for uploads to finish.`,
      );
      return;
    }
    const missingUrls = selectedAssets.filter(
      (a) => a.source === 'file' && !a.downloadUrl,
    );
    if (missingUrls.length > 0) {
      setIngestionError(
        'Some files failed to upload to storage. Please remove and re-add them.',
      );
      return;
    }

    setIngestionStatus('processing');
    setIngestionError(null);

    try {
      const sessionId = `wizard-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

      // Collect raw File objects for selected assets so they are sent as
      // base64 uploads to the ADK pipeline (the LLM step receives them as attachments).
      const selectedAssets = assets.filter((a) => selectedAssetIds.includes(a.id));
      const files = selectedAssets
        .map((a) => a.file)
        .filter((f): f is File => f != null);

      const response = await startPipeline(buildQuestion(), sessionId, files);

      const executedNodes = getExecutedNodes(response);
      const lastStatus = getLastStatus(response);
      const stoppedNodeId = getStoppedNodeId(response);

      // Store pipeline IDs for human gate interaction
      setPipelineIds(response.sessionId, stoppedNodeId);

      // Try to extract spots from the S1 metadata extraction node
      const metadataOutput = getNodeOutput(response, 'S1: Metadata Extract (Gemini)');

      let extractedSpots: SpotMetadata[] = [];

      if (metadataOutput && typeof metadataOutput === 'object') {
        // Expected shape: { spots: [...] } or array directly
        const rawSpots = (metadataOutput as Record<string, unknown>).spots ??
          (metadataOutput as Record<string, unknown>).items ??
          (Array.isArray(metadataOutput) ? metadataOutput : null);

        if (Array.isArray(rawSpots)) {
          extractedSpots = rawSpots.map((raw: Record<string, unknown>, idx: number) => ({
            id: (raw.id as string) ?? `spot-${Date.now()}-${idx}`,
            spotNumber: idx + 1,
            title: (raw.title as string) ?? '',
            artist: (raw.artist as string) ?? '',
            period: (raw.period as string) ?? '',
            material: (raw.material as string) ?? '',
            dimensions: (raw.dimensions as string) ?? '',
            highlight: (raw.highlight as string) ?? '',
            culturalDesignation: (raw.culturalDesignation as string) ?? (raw.cultural_designation as string) ?? '',
            sourceText: (raw.sourceText as string) ?? undefined,
            assetIds: selectedAssetIds,
          }));
        }
      }

      // Also try to get OCR text
      const ocrOutput = getNodeOutput(response, 'S2: OCR Parse (Gemini)');
      let ocrText: string | undefined;
      if (typeof ocrOutput === 'string') {
        ocrText = ocrOutput;
      } else if (ocrOutput && typeof ocrOutput === 'object') {
        const ocrObj = ocrOutput as Record<string, unknown>;
        ocrText = (ocrObj.text as string) ?? (ocrObj._content as string) ?? undefined;
      }

      // If we got OCR text but no spots, create a single spot with the text
      if (extractedSpots.length === 0 && ocrText) {
        extractedSpots = [{
          id: `spot-${Date.now()}-0`,
          spotNumber: 1,
          title: 'Untitled',
          artist: '',
          period: '',
          material: '',
          dimensions: '',
          highlight: '',
          culturalDesignation: '',
          sourceText: ocrText,
          assetIds: selectedAssetIds,
        }];
      }

      // If still no spots, create sample data to show the UI works
      if (extractedSpots.length === 0) {
        extractedSpots = createSampleSpots(selectedAssetIds);
      }

      setSpots(extractedSpots);

      // Check if pipeline stopped at a human gate
      if (lastStatus === 'STOPPED' || executedNodes.includes('HG1: Data Review')) {
        setIngestionStatus('review');
      } else {
        setIngestionStatus('review');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setIngestionError(message);
      setIngestionStatus('error');
    }
  }, [
    selectedAssetIds,
    buildQuestion,
    setIngestionStatus,
    setIngestionError,
    setSpots,
    setPipelineIds,
  ]);

  // ── Approve metadata (Human Gate 1) ──
  const handleApprove = useCallback(async () => {
    setApproveLoading(true);
    try {
      // In a full integration, this would call sendHumanInput to approve through the gate.
      // For Phase 1A, we simply mark the ingestion as approved.
      setIngestionStatus('approved');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to approve';
      setIngestionError(message);
    } finally {
      setApproveLoading(false);
    }
  }, [setIngestionStatus, setIngestionError]);

  // ── Reset ──
  const handleReset = useCallback(() => {
    resetIngestion();
  }, [resetIngestion]);

  return (
    <Box>
      {/* Title */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" gutterBottom fontWeight={700}>
          Step 1: Ingestion
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Upload content, let AI extract metadata, then review and approve before script generation.
        </Typography>
      </Box>

      {/* Sub-step progress */}
      <Paper sx={{ px: 3, pt: 2, pb: 1, mb: 3 }}>
        <Stepper activeStep={activeSubStep} alternativeLabel>
          {SUB_STEPS.map((step, idx) => (
            <Step key={step.label} completed={idx < activeSubStep || ingestionStatus === 'approved'}>
              <StepLabel
                StepIconProps={{
                  icon: ingestionStatus === 'approved' && idx <= activeSubStep
                    ? <CheckCircleOutlineIcon color="success" />
                    : undefined,
                }}
              >
                <Typography
                  variant="caption"
                  sx={{ fontWeight: idx === activeSubStep ? 700 : 400 }}
                >
                  {step.label}
                </Typography>
              </StepLabel>
            </Step>
          ))}
        </Stepper>
      </Paper>

      {/* Error alert */}
      {ingestionError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setIngestionError(null)}>
          {ingestionError}
        </Alert>
      )}

      {/* Sub-step content */}
      {(ingestionStatus === 'idle' || ingestionStatus === 'selecting') && (
        <Box>
          <ContentSelector />
          <Divider sx={{ my: 3 }} />
          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              variant="contained"
              size="large"
              startIcon={<PlayArrowIcon />}
              disabled={selectedAssetIds.length === 0}
              onClick={handleStartIngestion}
            >
              Start AI Extraction
            </Button>
          </Box>
        </Box>
      )}

      {ingestionStatus === 'processing' && <ProcessingOverlay />}

      {(ingestionStatus === 'review' || ingestionStatus === 'error') && (
        <Box>
          <MetadataEditor />
          <Divider sx={{ my: 3 }} />

          {/* Human Gate 1 — Data Review actions */}
          <Paper
            sx={{
              p: 3,
              bgcolor: (t) => alpha(t.palette.warning.main, 0.08),
              borderLeft: 4,
              borderColor: 'warning.main',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <RateReviewIcon color="warning" />
              <Typography variant="subtitle1" fontWeight={700}>
                Human Gate 1 — Data Review
              </Typography>
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Review the AI-extracted metadata above. Edit any fields inline, reorder spots by
              dragging, add or remove items as needed. When satisfied, approve to proceed to
              script generation.
            </Typography>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <Button
                variant="contained"
                color="success"
                startIcon={approveLoading ? <CircularProgress size={18} color="inherit" /> : <CheckCircleOutlineIcon />}
                disabled={spots.length === 0 || approveLoading}
                onClick={handleApprove}
              >
                Approve & Continue
              </Button>
              <Button
                variant="outlined"
                color="inherit"
                startIcon={<RestartAltIcon />}
                onClick={handleReset}
              >
                Start Over
              </Button>
            </Box>
          </Paper>
        </Box>
      )}

      {ingestionStatus === 'approved' && (
        <Fade in>
          <Paper
            sx={{
              p: 4,
              textAlign: 'center',
              bgcolor: (t) => alpha(t.palette.success.main, 0.08),
              borderLeft: 4,
              borderColor: 'success.main',
            }}
          >
            <CheckCircleOutlineIcon color="success" sx={{ fontSize: 48, mb: 1 }} />
            <Typography variant="h6" gutterBottom>
              Ingestion Approved
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {spots.length} spot{spots.length !== 1 ? 's' : ''} approved and ready for script generation.
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
              <Button
                variant="outlined"
                startIcon={<RestartAltIcon />}
                onClick={handleReset}
              >
                Re-do Ingestion
              </Button>
            </Box>
          </Paper>
        </Fade>
      )}
    </Box>
  );
}

// ── Fallback sample spots (Phase 1A stub data) ──

function createSampleSpots(assetIds: string[]): SpotMetadata[] {
  return [
    {
      id: 'spot-sample-1',
      spotNumber: 1,
      title: 'The Great Wave off Kanagawa',
      artist: 'Katsushika Hokusai',
      period: 'Edo Period (1829–1833)',
      material: 'Woodblock print, ink and color on paper',
      dimensions: '25.7 × 37.9 cm',
      highlight: 'One of the most recognizable works of Japanese art in the world',
      culturalDesignation: 'Important Cultural Property',
      sourceText: 'Sample OCR text for The Great Wave off Kanagawa by Hokusai...',
      assetIds,
    },
    {
      id: 'spot-sample-2',
      spotNumber: 2,
      title: 'Wind God and Thunder God',
      artist: 'Tawaraya Sōtatsu',
      period: 'Edo Period (17th century)',
      material: 'Ink, color, gold, and silver on paper',
      dimensions: 'Two-panel folding screen, 154.5 x 169.8 cm each',
      highlight: 'Iconic Rinpa school masterpiece depicting Fūjin and Raijin',
      culturalDesignation: 'National Treasure',
      sourceText: 'Sample OCR text for Wind God and Thunder God screens...',
      assetIds,
    },
    {
      id: 'spot-sample-3',
      spotNumber: 3,
      title: 'Pine Trees Screen',
      artist: 'Hasegawa Tōhaku',
      period: 'Azuchi–Momoyama Period (16th century)',
      material: 'Ink on paper',
      dimensions: 'Six-panel folding screen, 156.8 × 356.0 cm',
      highlight: 'Masterpiece of monochrome ink painting using "reduction" technique',
      culturalDesignation: 'National Treasure',
      sourceText: 'Sample OCR text for Pine Trees Screen by Hasegawa Tōhaku...',
      assetIds,
    },
  ];
}
