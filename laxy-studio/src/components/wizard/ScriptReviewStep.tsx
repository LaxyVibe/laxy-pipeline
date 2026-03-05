// ---------------------------------------------------------------------------
// ScriptReviewStep — Step 3 of the Guide pipeline wizard
//
// Sub-steps:
//   1. Generate Scripts (trigger ADK pipeline → spinner)
//   2. Review Scripts & Image Mapping (per-spot cards + Human Gate 3)
//
// Features:
//   S3-1  AI Script Generation display — per-spot script cards
//   S3-2  Image-Spot Mapping — AI auto-suggest + manual override
//   S3-3  Human Gate 3 — per-spot approve/reject + bulk toggle
//   S3-4  Fast Track — per-spot bypass downstream gates
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
  Card,
  CardContent,
  CardActions,
  Collapse,
  IconButton,
  TextField,
  Checkbox,
  FormControlLabel,
  Switch,
  Tooltip,
  alpha,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import RateReviewIcon from '@mui/icons-material/RateReview';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import EditNoteIcon from '@mui/icons-material/EditNote';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import RemoveDoneIcon from '@mui/icons-material/RemoveDone';
import BoltIcon from '@mui/icons-material/Bolt';
import DescriptionIcon from '@mui/icons-material/Description';
import SyncIcon from '@mui/icons-material/Sync';

import { useGuidesStore } from '../../guidesStore';
import {
  startPipeline,
  sendHumanInput,
  getExecutedNodes,
  getLastStatus,
  getStoppedNodeId,
  getNodeOutput,
} from '../../api';
import { usePipelineSync } from '../../hooks/usePipelineSync';
import type { SpotScript, SpotImageMapping, ScriptStatus } from '../../types/entity';
import ImageSpotMapper from './ImageSpotMapper';

// ── Sub-step definitions ──

const SUB_STEPS = [
  { label: 'Generate Scripts', icon: <AutoFixHighIcon /> },
  { label: 'Review & Approve', icon: <RateReviewIcon /> },
];

function statusToSubStep(status: ScriptStatus): number {
  switch (status) {
    case 'idle':
      return 0;
    case 'generating':
      return 0;
    case 'review':
    case 'approved':
    case 'error':
      return 1;
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
            AI is generating scripts…
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Creating narrated descriptions for each spot based on approved metadata.
            <br />
            This may take a moment.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'center' }}>
          <Chip label="Script Generation" size="small" variant="outlined" />
          <Chip label="→" size="small" sx={{ bgcolor: 'transparent' }} />
          <Chip label="Image Mapping" size="small" variant="outlined" />
          <Chip label="→" size="small" sx={{ bgcolor: 'transparent' }} />
          <Chip label="Human Gate 3" size="small" variant="outlined" />
        </Box>
      </Paper>
    </Fade>
  );
}

// ── Single script card ──

interface ScriptCardProps {
  script: SpotScript;
}

function ScriptCard({ script }: ScriptCardProps) {
  const updateScript = useGuidesStore((s) => s.updateScript);
  const approveScript = useGuidesStore((s) => s.approveScript);
  const rejectScript = useGuidesStore((s) => s.rejectScript);
  const toggleFastTrack = useGuidesStore((s) => s.toggleFastTrack);

  const [expanded, setExpanded] = useState(true);

  return (
    <Card
      sx={{
        mb: 2,
        borderLeft: 4,
        borderColor: script.approved
          ? 'success.main'
          : 'warning.main',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          px: 2,
          pt: 1.5,
          pb: 0.5,
          gap: 1,
        }}
      >
        <Chip
          label={`#${script.spotNumber}`}
          size="small"
          color="primary"
          sx={{ fontWeight: 700, minWidth: 36 }}
        />
        <Typography variant="subtitle1" fontWeight={600} sx={{ flex: 1 }}>
          {script.title}
        </Typography>

        {script.approved && (
          <Chip
            icon={<CheckCircleOutlineIcon />}
            label="Approved"
            size="small"
            color="success"
            variant="outlined"
          />
        )}
        {script.fastTrack && (
          <Chip
            icon={<BoltIcon />}
            label="Fast Track"
            size="small"
            color="secondary"
            variant="outlined"
          />
        )}

        <IconButton
          size="small"
          onClick={() => setExpanded(!expanded)}
          sx={{
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
          }}
        >
          <ExpandMoreIcon />
        </IconButton>
      </Box>

      <Collapse in={expanded}>
        <CardContent sx={{ pt: 0 }}>
          {/* Editable script text */}
          <TextField
            multiline
            fullWidth
            minRows={4}
            maxRows={12}
            value={script.scriptText}
            onChange={(e) =>
              updateScript(script.spotId, { scriptText: e.target.value })
            }
            variant="outlined"
            size="small"
            label="Script"
            sx={{
              mb: 2,
              '& .MuiOutlinedInput-root': {
                fontFamily: '"Inter", sans-serif',
                fontSize: '0.875rem',
                lineHeight: 1.7,
              },
            }}
          />

          {/* Image-Spot Mapping */}
          <ImageSpotMapper spotId={script.spotId} spotTitle={script.title} />
        </CardContent>

        <CardActions sx={{ px: 2, pb: 1.5, pt: 0, justifyContent: 'space-between' }}>
          <FormControlLabel
            control={
              <Checkbox
                checked={script.fastTrack}
                onChange={() => toggleFastTrack(script.spotId)}
                size="small"
                icon={<BoltIcon color="disabled" />}
                checkedIcon={<BoltIcon />}
              />
            }
            label={
              <Typography variant="caption" color="text.secondary">
                Fast Track — skip review
              </Typography>
            }
          />

          <Box sx={{ display: 'flex', gap: 1 }}>
            {script.approved ? (
              <Button
                size="small"
                color="warning"
                onClick={() => rejectScript(script.spotId)}
              >
                Un-approve
              </Button>
            ) : (
              <Button
                size="small"
                variant="contained"
                color="success"
                startIcon={<CheckCircleOutlineIcon />}
                onClick={() => approveScript(script.spotId)}
              >
                Approve
              </Button>
            )}
          </Box>
        </CardActions>
      </Collapse>
    </Card>
  );
}

// ── Main ScriptReviewStep ──

export default function ScriptReviewStep() {
  const spots = useGuidesStore((s) => s.spots);
  const scripts = useGuidesStore((s) => s.scripts);
  const scriptStatus = useGuidesStore((s) => s.scriptStatus);
  const scriptError = useGuidesStore((s) => s.scriptError);
  const ingestionStatus = useGuidesStore((s) => s.ingestionStatus);
  const setScripts = useGuidesStore((s) => s.setScripts);
  const setScriptStatus = useGuidesStore((s) => s.setScriptStatus);
  const setScriptError = useGuidesStore((s) => s.setScriptError);
  const setImageMappings = useGuidesStore((s) => s.setImageMappings);
  const approveAllScripts = useGuidesStore((s) => s.approveAllScripts);
  const rejectAllScripts = useGuidesStore((s) => s.rejectAllScripts);
  const resetDownstreamFrom = useGuidesStore((s) => s.resetDownstreamFrom);
  const coreLanguage = useGuidesStore((s) => s.entityConfig.coreLanguage);
  const assets = useGuidesStore((s) => s.assets);
  const setPipelineIds = useGuidesStore((s) => s.setPipelineIds);

  const { applyResponse, buildGatePayload } = usePipelineSync();

  const [approveLoading, setApproveLoading] = useState(false);
  const [gateSyncFailed, setGateSyncFailed] = useState(false);

  const activeSubStep = statusToSubStep(scriptStatus);
  const approvedCount = scripts.filter((s) => s.approved).length;
  const fastTrackCount = scripts.filter((s) => s.fastTrack).length;
  const allApproved = scripts.length > 0 && approvedCount === scripts.length;

  // ── Build question for script generation ──
  const buildScriptQuestion = useCallback(() => {
    const spotsSummary = spots
      .map(
        (s) =>
          `Spot #${s.spotNumber}: "${s.title}" by ${s.artist || 'Unknown'} (${s.period || 'Unknown period'})` +
          `\n  Material: ${s.material || 'N/A'}` +
          `\n  Dimensions: ${s.dimensions || 'N/A'}` +
          `\n  Highlight: ${s.highlight || 'N/A'}` +
          `\n  Cultural Designation: ${s.culturalDesignation || 'N/A'}`,
      )
      .join('\n\n');

    return (
      `Generate audio guide scripts for the following ${spots.length} approved spots.\n` +
      `Core language: ${coreLanguage}\n\n` +
      `Approved Metadata:\n${spotsSummary}`
    );
  }, [spots, coreLanguage]);

  // ── Trigger script generation ──
  const handleGenerateScripts = useCallback(async () => {
    if (spots.length === 0) return;

    // If scripts are already populated (e.g., from IngestionStep's gate approval
    // that advanced the pipeline through S4+S5), skip the pipeline call
    if (scripts.length > 0 && scripts.some((s) => s.scriptText)) {
      setScriptStatus('review');
      return;
    }

    setScriptStatus('generating');
    setScriptError(null);

    try {
      let response;

      // Try to resume from existing session instead of starting a new one.
      // If the pipeline was advanced through HG1 approval, it may have already
      // produced S4+S5 data and paused at HG3. In that case, data would already
      // be in the store. Resume from any valid checkpoint on the current session.
      const { pipelineSessionId: sid, pipelineCheckpointId: cpId } = useGuidesStore.getState();
      if (sid && cpId) {
        const gatePayload = buildGatePayload();
        response = await sendHumanInput(
          sid,
          'approve',
          cpId,
          JSON.stringify(gatePayload),
        );
      } else {
        // Fallback: start a new pipeline session
        const sessionId = `script-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        response = await startPipeline(buildScriptQuestion(), sessionId, undefined, {
          venueName: useGuidesStore.getState().entityConfig.venueName,
          coreLanguage: useGuidesStore.getState().entityConfig.coreLanguage,
          supportedLanguages: useGuidesStore.getState().entityConfig.supportedLanguages,
        });
      }

      const executedNodes = getExecutedNodes(response);
      const stoppedNodeId = getStoppedNodeId(response);

      // Store pipeline IDs for human gate
      setPipelineIds(response.sessionId, stoppedNodeId);

      // Apply response through the central sync mechanism
      applyResponse(response);

      // Try to parse script generation output (S4: Script Gen)
      const scriptOutput = getNodeOutput(response, 'S4: Script Gen (Gemini Pro)') ?? getNodeOutput(response, 'S4: Script Generation');
      // Also try image mapping output (S5: Image Map)
      const imageMapOutput = getNodeOutput(response, 'S5: Image Map (Gemini)') ?? getNodeOutput(response, 'S5: Image-Spot Mapping');

      let extractedScripts: SpotScript[] = [];
      let extractedMappings: SpotImageMapping[] = [];

      if (scriptOutput && typeof scriptOutput === 'object') {
        const rawScripts =
          (scriptOutput as Record<string, unknown>).scripts ??
          (scriptOutput as Record<string, unknown>).spots ??
          (Array.isArray(scriptOutput) ? scriptOutput : null);

        if (Array.isArray(rawScripts)) {
          extractedScripts = rawScripts.map(
            (raw: Record<string, unknown>, idx: number) => {
              // Backend may return variants: { kids, academic, quick, professional, brief }
              // Pick 'professional' as the default scriptText, fallback to other fields
              let text = (raw.scriptText as string) ?? (raw.script as string) ?? (raw.text as string) ?? '';
              if (!text && typeof raw.variants === 'object' && raw.variants !== null) {
                const variants = raw.variants as Record<string, string>;
                text = variants.professional ?? variants.academic ?? variants.quick ?? variants.kids ?? variants.brief ?? '';
              }
              return {
                spotId: (raw.spotId as string) ?? (raw.id as string) ?? spots[idx]?.id ?? `spot-${idx}`,
                spotNumber: (raw.spotNumber as number) ?? idx + 1,
                title: (raw.title as string) ?? spots[idx]?.title ?? `Spot ${idx + 1}`,
                scriptText: text,
                approved: false,
                fastTrack: false,
              };
            },
          );
        }
      }

      // Parse image mapping output
      if (imageMapOutput && typeof imageMapOutput === 'object') {
        const rawMappings =
          (imageMapOutput as Record<string, unknown>).mappings ??
          (imageMapOutput as Record<string, unknown>).spots ??
          (Array.isArray(imageMapOutput) ? imageMapOutput : null);

        if (Array.isArray(rawMappings)) {
          extractedMappings = rawMappings.map(
            (raw: Record<string, unknown>, idx: number) => ({
              spotId: (raw.spotId as string) ?? spots[idx]?.id ?? `spot-${idx}`,
              assignedAssetIds: Array.isArray(raw.suggestedImages)
                ? (raw.suggestedImages as string[])
                : Array.isArray(raw.assetIds)
                  ? (raw.assetIds as string[])
                  : [],
              aiSuggested: true,
            }),
          );
        }
      }

      // If pipeline returned no scripts, show an error instead of fake data
      if (extractedScripts.length === 0) {
        setScriptError(
          'AI did not return any scripts. Please check the pipeline logs and try again.',
        );
        setScriptStatus('error');
        return;
      }

      setScripts(extractedScripts);
      if (extractedMappings.length > 0) {
        setImageMappings(extractedMappings);
      }
      setScriptStatus('review');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setScriptError(message);
      setScriptStatus('error');
    }
  }, [
    spots,
    scripts,
    assets,
    buildScriptQuestion,
    buildGatePayload,
    applyResponse,
    setScripts,
    setImageMappings,
    setScriptStatus,
    setScriptError,
    setPipelineIds,
  ]);

  // ── Approve all scripts (Human Gate 3) ──
  const handleApproveGate = useCallback(async () => {
    setApproveLoading(true);
    setGateSyncFailed(false);
    try {
      // Build the approval payload with per-spot statuses
      const approvalPayload = {
        approvedSpots: scripts.filter((s) => s.approved).map((s) => s.spotId),
        rejectedSpots: scripts.filter((s) => !s.approved).map((s) => s.spotId),
        fastTrackSpots: scripts.filter((s) => s.fastTrack).map((s) => s.spotId),
        editedScripts: scripts.map((s) => ({
          spotId: s.spotId,
          scriptText: s.scriptText,
        })),
      };

      // Read pipeline IDs directly from the store to avoid stale closures
      const { pipelineSessionId: sid, pipelineCheckpointId: cpId } = useGuidesStore.getState();
      console.log('[ScriptReviewStep] Approve clicked — sessionId:', sid, 'checkpointId:', cpId);

      // Try to send human input through ADK pipeline gate
      if (sid && cpId) {
        try {
          const response = await sendHumanInput(
            sid,
            'approve',
            cpId,
            JSON.stringify(approvalPayload),
          );
          // Apply the response so downstream steps (translations, etc.) are pre-populated
          applyResponse(response);

          // Surface any downstream step errors as a warning
          const stepErrors = (response.steps ?? [])
            .filter((s) => s.status === 'ERROR' && s.output)
            .map((s) => {
              const out = s.output as Record<string, unknown>;
              return `[${s.label}] ${(out.error as string) ?? (out.message as string) ?? 'Unknown error'}`;
            });
          if (stepErrors.length > 0) {
            setScriptError(
              'Scripts approved, but downstream pipeline steps encountered errors:\n' +
              stepErrors.join('\n'),
            );
          }
        } catch (gateErr: unknown) {
          const gateMsg = gateErr instanceof Error ? gateErr.message : 'Pipeline sync failed';
          console.warn('[ScriptReviewStep] Gate approval failed:', gateMsg);
          setScriptError(`Pipeline sync failed — you can retry from the approved view. (${gateMsg})`);
          setGateSyncFailed(true);
        }
      } else {
        // No valid checkpoint (e.g. previous pipeline errored out mid-run).
        // Start a new pipeline session with the approved scripts as context so
        // downstream steps (S6 translation, etc.) can proceed.
        console.warn('[ScriptReviewStep] No checkpoint — starting a new pipeline session');
        try {
          const sessionId = `hg3-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
          const response = await startPipeline(
            buildScriptQuestion() + '\n\nUser has approved the scripts above. Continue to translation.',
            sessionId,
            undefined,
            {
              venueName: useGuidesStore.getState().entityConfig.venueName,
              coreLanguage: useGuidesStore.getState().entityConfig.coreLanguage,
              supportedLanguages: useGuidesStore.getState().entityConfig.supportedLanguages,
            },
          );
          applyResponse(response);
        } catch (startErr: unknown) {
          const startMsg = startErr instanceof Error ? startErr.message : 'Pipeline start failed';
          console.warn('[ScriptReviewStep] Fallback pipeline start failed:', startMsg);
          setScriptError(`Could not start downstream pipeline — approval saved locally. (${startMsg})`);
        }
      }

      setScriptStatus('approved');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to approve';
      setScriptError(message);
    } finally {
      setApproveLoading(false);
    }
  }, [scripts, setScriptStatus, setScriptError, applyResponse, buildScriptQuestion]);

  // ── Reset (cascades to all downstream steps) ──
  const handleReset = useCallback(() => {
    resetDownstreamFrom('script');
  }, [resetDownstreamFrom]);

  // ── Pre-condition: ingestion must be approved ──
  if (ingestionStatus !== 'approved') {
    return (
      <Paper sx={{ p: 4, textAlign: 'center' }}>
        <DescriptionIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
        <Typography variant="h6" color="text.secondary" gutterBottom>
          Complete Ingestion First
        </Typography>
        <Typography variant="body2" color="text.disabled">
          Approve the metadata in Step 1 (Ingestion) before generating scripts.
        </Typography>
      </Paper>
    );
  }

  return (
    <Box>
      {/* Title */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" gutterBottom fontWeight={700}>
          Step 3: Script Generation
        </Typography>
        <Typography variant="body2" color="text.secondary">
          AI generates narrated scripts for each spot. Review, edit, assign images, then approve.
        </Typography>
      </Box>

      {/* Sub-step progress */}
      <Paper sx={{ px: 3, pt: 2, pb: 1, mb: 3 }}>
        <Stepper activeStep={activeSubStep} alternativeLabel>
          {SUB_STEPS.map((step, idx) => (
            <Step key={step.label} completed={idx < activeSubStep || scriptStatus === 'approved'}>
              <StepLabel
                StepIconProps={{
                  icon:
                    scriptStatus === 'approved' && idx <= activeSubStep ? (
                      <CheckCircleOutlineIcon color="success" />
                    ) : step.icon,
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
      {scriptError && (
        <Alert
          severity={scriptStatus === 'approved' ? 'warning' : 'error'}
          sx={{ mb: 2, whiteSpace: 'pre-line' }}
          onClose={() => setScriptError(null)}
        >
          {scriptError}
        </Alert>
      )}

      {/* Idle — ready to generate */}
      {scriptStatus === 'idle' && (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <EditNoteIcon sx={{ fontSize: 48, color: 'primary.main', mb: 1 }} />
          <Typography variant="h6" gutterBottom>
            Ready to Generate Scripts
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            {spots.length} approved spot{spots.length !== 1 ? 's' : ''} will be sent to AI for
            script generation.
          </Typography>
          <Button
            variant="contained"
            size="large"
            startIcon={<PlayArrowIcon />}
            onClick={handleGenerateScripts}
          >
            Generate Scripts
          </Button>
        </Paper>
      )}

      {/* Generating */}
      {scriptStatus === 'generating' && <ProcessingOverlay />}

      {/* Review */}
      {(scriptStatus === 'review' || scriptStatus === 'error') && (
        <Box>
          {/* Bulk actions bar */}
          <Paper
            sx={{
              p: 2,
              mb: 2,
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              flexWrap: 'wrap',
            }}
          >
            <Typography variant="subtitle2" sx={{ mr: 'auto' }}>
              {approvedCount} / {scripts.length} approved
              {fastTrackCount > 0 && (
                <Chip
                  icon={<BoltIcon />}
                  label={`${fastTrackCount} Fast Track`}
                  size="small"
                  color="secondary"
                  variant="outlined"
                  sx={{ ml: 1 }}
                />
              )}
            </Typography>
            <Button
              size="small"
              variant="outlined"
              color="success"
              startIcon={<DoneAllIcon />}
              onClick={approveAllScripts}
              disabled={allApproved}
            >
              Approve All
            </Button>
            <Button
              size="small"
              variant="outlined"
              color="warning"
              startIcon={<RemoveDoneIcon />}
              onClick={rejectAllScripts}
              disabled={approvedCount === 0}
            >
              Un-approve All
            </Button>
          </Paper>

          {/* Script cards */}
          {scripts.map((script) => (
            <ScriptCard key={script.spotId} script={script} />
          ))}

          <Divider sx={{ my: 3 }} />

          {/* Human Gate 3 — Script Review actions */}
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
                Human Gate 3 — Script Review
              </Typography>
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Review each script above. Edit text inline, assign images to spots, and
              approve individually or in bulk. Fast-tracked items will skip downstream
              review gates. When ready, approve to proceed to translation.
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
              <Button
                variant="contained"
                color="success"
                startIcon={
                  approveLoading ? (
                    <CircularProgress size={18} color="inherit" />
                  ) : (
                    <CheckCircleOutlineIcon />
                  )
                }
                disabled={approvedCount === 0 || approveLoading}
                onClick={handleApproveGate}
              >
                Approve & Continue ({approvedCount}/{scripts.length})
              </Button>
              <Button
                variant="outlined"
                color="inherit"
                startIcon={<RestartAltIcon />}
                onClick={handleReset}
              >
                Re-generate
              </Button>
            </Box>
          </Paper>
        </Box>
      )}

      {/* Approved */}
      {scriptStatus === 'approved' && (
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
              Scripts Approved
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {approvedCount} script{approvedCount !== 1 ? 's' : ''} approved
              {fastTrackCount > 0 && ` (${fastTrackCount} fast-tracked)`}. Ready for
              translation.
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
              {gateSyncFailed && (
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={approveLoading ? <CircularProgress size={16} color="inherit" /> : <SyncIcon />}
                  disabled={approveLoading}
                  onClick={handleApproveGate}
                >
                  Retry Sync
                </Button>
              )}
              <Button
                variant="outlined"
                color="warning"
                startIcon={<RateReviewIcon />}
                onClick={() => setScriptStatus('review')}
              >
                Redo Review
              </Button>
              <Button
                variant="outlined"
                startIcon={<RestartAltIcon />}
                onClick={handleReset}
              >
                Re-generate Scripts
              </Button>
            </Box>
          </Paper>
        </Fade>
      )}
    </Box>
  );
}
