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
import SyncIcon from '@mui/icons-material/Sync';

import { useGuidesStore } from '../../guidesStore';
import {
  startPipeline,
  sendHumanInput,
  getStoppedNodeId,
} from '../../api';
import type { IngestionStatus } from '../../types/entity';
import { usePipelineSync } from '../../hooks/usePipelineSync';
import {
  buildIngestionQuestion,
  parseIngestionPipelineResponse,
  validateIngestionAssets,
} from '../../workflows/ingestionWorkflow';
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
  const resetDownstreamFrom = useGuidesStore((s) => s.resetDownstreamFrom);
  const assets = useGuidesStore((s) => s.assets);

  const { applyResponse, buildGatePayload } = usePipelineSync();

  const [approveLoading, setApproveLoading] = useState(false);
  const [gateSyncFailed, setGateSyncFailed] = useState(false);

  const activeSubStep = statusToSubStep(ingestionStatus);

  // ── Trigger pipeline ──
  const handleStartIngestion = useCallback(async () => {
    if (selectedAssetIds.length === 0) return;

    const validationError = validateIngestionAssets(assets, selectedAssetIds);
    if (validationError) {
      setIngestionError(validationError);
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

      const response = await startPipeline(buildIngestionQuestion(assets, selectedAssetIds), sessionId, files, {
        venueName: useGuidesStore.getState().entityConfig.venueName,
        coreLanguage: useGuidesStore.getState().entityConfig.coreLanguage,
        supportedLanguages: useGuidesStore.getState().entityConfig.supportedLanguages,
        enabledModules: useGuidesStore.getState().entityConfig.enabledModules,
        selectedLayout: useGuidesStore.getState().entityConfig.selectedLayout ?? undefined,
      });
      const stoppedNodeId = getStoppedNodeId(response);

      // Store pipeline IDs for human gate interaction
      setPipelineIds(response.sessionId, stoppedNodeId);

      const parsed = parseIngestionPipelineResponse({
        response,
        selectedAssetIds,
      });

      if (parsed.kind === 'error') {
        setIngestionError(parsed.message);
        setIngestionStatus('error');
        return;
      }

      setSpots(parsed.spots);
      setIngestionStatus('review');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setIngestionError(message);
      setIngestionStatus('error');
    }
  }, [
    selectedAssetIds,
    assets,
    setIngestionStatus,
    setIngestionError,
    setSpots,
    setPipelineIds,
  ]);

  // ── Approve metadata (Human Gate 1) ──
  const handleApprove = useCallback(async () => {
    setApproveLoading(true);
    setGateSyncFailed(false);
    try {
      // Read pipeline IDs directly from the store to avoid stale closures
      const { pipelineSessionId: sid, pipelineCheckpointId: cpId } = useGuidesStore.getState();
      console.log('[IngestionStep] Approve clicked — sessionId:', sid, 'checkpointId:', cpId);

      // Send human gate approval through the ADK pipeline to advance to the next stage.
      // This continues the existing session (S4, S5 → HG3) so outputs carry over.
      if (sid && cpId) {
        try {
          const gatePayload = buildGatePayload();
          const response = await sendHumanInput(
            sid,
            'approve',
            cpId,
            JSON.stringify(gatePayload),
          );
          // Apply the response so downstream steps (scripts, image mappings) are pre-populated
          applyResponse(response);

          // Surface any step-level errors from the pipeline response as a warning
          // (ingestion itself is approved, but downstream steps may have failed)
          const stepErrors = (response.steps ?? [])
            .filter((s) => s.status === 'ERROR' && s.output)
            .map((s) => {
              const out = s.output as Record<string, unknown>;
              return `[${s.label}] ${(out.error as string) ?? (out.message as string) ?? 'Unknown error'}`;
            });
          if (stepErrors.length > 0) {
            setIngestionError(
              'Ingestion approved, but downstream pipeline steps encountered errors:\n' +
              stepErrors.join('\n'),
            );
          }
        } catch (gateErr: unknown) {
          const gateMsg = gateErr instanceof Error ? gateErr.message : 'Pipeline sync failed';
          console.warn('[IngestionStep] Gate approval failed:', gateMsg);
          setIngestionError(`Pipeline sync failed — you can retry from the approved view. (${gateMsg})`);
          setGateSyncFailed(true);
        }
      } else {
        console.warn('[IngestionStep] No pipeline session/checkpoint — skipping API call');
      }
      setIngestionStatus('approved');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to approve';
      setIngestionError(message);
    } finally {
      setApproveLoading(false);
    }
  }, [buildGatePayload, applyResponse, setIngestionStatus, setIngestionError]);

  // ── Reset (cascades to all downstream steps) ──
  const handleReset = useCallback(() => {
    resetDownstreamFrom('ingest');
  }, [resetDownstreamFrom]);

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
                    : step.icon,
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

      {/* Error / warning alert */}
      {ingestionError && (
        <Alert
          severity={ingestionStatus === 'approved' ? 'warning' : 'error'}
          sx={{ mb: 2, whiteSpace: 'pre-line' }}
          onClose={() => setIngestionError(null)}
          action={
            ingestionStatus === 'error' && (
              <Button
                color="inherit"
                size="small"
                startIcon={<RestartAltIcon />}
                onClick={() => {
                  setIngestionError(null);
                  handleStartIngestion();
                }}
              >
                Retry
              </Button>
            )
          }
        >
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
              {gateSyncFailed && (
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={approveLoading ? <CircularProgress size={16} color="inherit" /> : <SyncIcon />}
                  disabled={approveLoading}
                  onClick={handleApprove}
                >
                  Retry Sync
                </Button>
              )}
              <Button
                variant="outlined"
                color="warning"
                startIcon={<RateReviewIcon />}
                onClick={() => setIngestionStatus('review')}
              >
                Redo Review
              </Button>
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
