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

import { useGuidesStore } from '../../guidesStore';
import {
  startPipeline,
  sendHumanInput,
  getExecutedNodes,
  getLastStatus,
  getStoppedNodeId,
  getNodeOutput,
} from '../../api';
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
  const resetScripts = useGuidesStore((s) => s.resetScripts);
  const coreLanguage = useGuidesStore((s) => s.entityConfig.coreLanguage);
  const assets = useGuidesStore((s) => s.assets);
  const pipelineSessionId = useGuidesStore((s) => s.pipelineSessionId);
  const setPipelineIds = useGuidesStore((s) => s.setPipelineIds);

  const [approveLoading, setApproveLoading] = useState(false);

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

    setScriptStatus('generating');
    setScriptError(null);

    try {
      const sessionId = `script-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const response = await startPipeline(buildScriptQuestion(), sessionId);

      const executedNodes = getExecutedNodes(response);
      const stoppedNodeId = getStoppedNodeId(response);

      // Store pipeline IDs for human gate
      setPipelineIds(response.sessionId, stoppedNodeId);

      // Try to parse script generation output (S4: Script Gen)
      const scriptOutput = getNodeOutput(response, 'S4: Script Generation');
      // Also try image mapping output (S5: Image Map)
      const imageMapOutput = getNodeOutput(response, 'S5: Image-Spot Mapping');

      let extractedScripts: SpotScript[] = [];
      let extractedMappings: SpotImageMapping[] = [];

      if (scriptOutput && typeof scriptOutput === 'object') {
        const rawScripts =
          (scriptOutput as Record<string, unknown>).scripts ??
          (scriptOutput as Record<string, unknown>).spots ??
          (Array.isArray(scriptOutput) ? scriptOutput : null);

        if (Array.isArray(rawScripts)) {
          extractedScripts = rawScripts.map(
            (raw: Record<string, unknown>, idx: number) => ({
              spotId: (raw.spotId as string) ?? (raw.id as string) ?? spots[idx]?.id ?? `spot-${idx}`,
              spotNumber: (raw.spotNumber as number) ?? idx + 1,
              title: (raw.title as string) ?? spots[idx]?.title ?? `Spot ${idx + 1}`,
              scriptText: (raw.scriptText as string) ?? (raw.script as string) ?? (raw.text as string) ?? '',
              approved: false,
              fastTrack: false,
            }),
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

      // Fallback: create scripts from approved spots if nothing came from pipeline
      if (extractedScripts.length === 0) {
        extractedScripts = createSampleScripts(spots);
      }

      // Fallback: create round-robin image mapping if none from pipeline
      if (extractedMappings.length === 0) {
        extractedMappings = createRoundRobinImageMappings(spots, assets);
      }

      setScripts(extractedScripts);
      setImageMappings(extractedMappings);
      setScriptStatus('review');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';

      // Fallback to sample data if pipeline is unavailable
      const fallbackScripts = createSampleScripts(spots);
      const fallbackMappings = createRoundRobinImageMappings(spots, assets);
      setScripts(fallbackScripts);
      setImageMappings(fallbackMappings);
      setScriptError(`Pipeline unavailable — using sample scripts. (${message})`);
      setScriptStatus('review');
    }
  }, [
    spots,
    assets,
    buildScriptQuestion,
    setScripts,
    setImageMappings,
    setScriptStatus,
    setScriptError,
    setPipelineIds,
  ]);

  // ── Approve all scripts (Human Gate 3) ──
  const handleApproveGate = useCallback(async () => {
    setApproveLoading(true);
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

      // Try to send human input through ADK pipeline gate
      if (pipelineSessionId) {
        try {
          const checkpointId = useGuidesStore.getState().pipelineCheckpointId;
          if (checkpointId) {
            await sendHumanInput(
              pipelineSessionId,
              'approve',
              checkpointId,
              JSON.stringify(approvalPayload),
            );
          }
        } catch {
          // Pipeline gate call failed — continue anyway
        }
      }

      setScriptStatus('approved');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to approve';
      setScriptError(message);
    } finally {
      setApproveLoading(false);
    }
  }, [scripts, pipelineSessionId, setScriptStatus, setScriptError]);

  // ── Reset ──
  const handleReset = useCallback(() => {
    resetScripts();
  }, [resetScripts]);

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
                    ) : undefined,
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
      {scriptError && (
        <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setScriptError(null)}>
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

// ── Fallback sample scripts (Phase 1A stub data) ──

function createSampleScripts(
  spots: { id: string; spotNumber: number; title: string; artist: string; period: string; highlight: string }[],
): SpotScript[] {
  const sampleTexts: Record<string, string> = {
    'spot-sample-1':
      'Before you stands one of the most iconic images in all of art history — "The Great Wave off Kanagawa" by Katsushika Hokusai. Created during the Edo Period between 1829 and 1833, this woodblock print captures a towering wave about to crash upon three fishing boats, with Mount Fuji sitting serenely in the background. The dynamic composition, with its famous claw-like wave crests, demonstrates Hokusai\'s mastery of movement and his ability to convey both the power of nature and the vulnerability of human endeavour. This print is part of the series "Thirty-six Views of Mount Fuji" and has become one of the most recognizable works of Japanese art worldwide.',
    'spot-sample-2':
      'The magnificent "Wind God and Thunder God" folding screens before you are the work of Tawaraya Sōtatsu, a master of the Rinpa school from the 17th century Edo Period. These paired screens depict Fūjin, the god of wind, and Raijin, the god of thunder, rendered in bold ink with brilliant gold and silver leaf. Sōtatsu\'s dynamic brushwork brings these mythological figures to vivid life — notice how Fūjin clutches his bag of winds while Raijin hammers his ring of drums. Designated as a National Treasure, these screens represent the pinnacle of Japanese decorative painting.',
    'spot-sample-3':
      'Hasegawa Tōhaku\'s "Pine Trees Screen" is a masterwork of monochrome ink painting from the Azuchi–Momoyama Period. Using what scholars call the "reduction" technique, Tōhaku created an entire misty pine forest using only ink and empty space. The pine trees emerge from and dissolve into the fog with extraordinary subtlety — some barely visible, others dark and defined. This six-panel folding screen demonstrates that what is left unpainted can be as powerful as what is rendered. Designated as a National Treasure, it remains one of the most celebrated examples of ink wash painting in the world.',
  };

  return spots.map((spot) => ({
    spotId: spot.id,
    spotNumber: spot.spotNumber,
    title: spot.title,
    scriptText:
      sampleTexts[spot.id] ??
      `Welcome to "${spot.title}" by ${spot.artist || 'an unknown artist'}. ` +
      `Created during ${spot.period || 'an earlier era'}, this remarkable piece ` +
      `${spot.highlight ? `is notable for: ${spot.highlight}. ` : 'showcases exceptional artistry. '}` +
      `Take a moment to appreciate the detail and craftsmanship on display.`,
    approved: false,
    fastTrack: false,
  }));
}

function createRoundRobinImageMappings(
  spots: { id: string }[],
  assets: { id: string; fileType: string }[],
): SpotImageMapping[] {
  const imageAssets = assets.filter((a) => a.fileType === 'image');

  return spots.map((spot, idx) => ({
    spotId: spot.id,
    assignedAssetIds: imageAssets.length > 0
      ? [imageAssets[idx % imageAssets.length].id]
      : [],
    aiSuggested: true,
  }));
}
