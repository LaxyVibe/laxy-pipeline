// ---------------------------------------------------------------------------
// WizardShell — main wizard layout with interactive stepper, auto-save,
// completion tracking, PipelineStepper sidebar, and pipeline sync indicator
// ---------------------------------------------------------------------------
import { useMemo, useState, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Stepper,
  Step,
  StepButton,
  StepLabel,
  StepIconProps,
  Typography,
  Button,
  Paper,
  Chip,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  useMediaQuery,
  useTheme,
  Switch,
  FormControlLabel,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import SaveIcon from '@mui/icons-material/Save';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import CloudDoneIcon from '@mui/icons-material/CloudDone';
import CloudOffIcon from '@mui/icons-material/CloudOff';
import SyncIcon from '@mui/icons-material/Sync';
import EditNoteIcon from '@mui/icons-material/EditNote';
import { useGuidesStore, WIZARD_STEPS, type WizardStep } from '../../guidesStore';
import { useAutosave } from '../../hooks/useAutosave';
import { getTraceSessionId } from '../../api';
import { guidePath } from '../../routes';
import EntityConfigForm from './EntityConfigForm';
import LayoutPicker from './LayoutPicker';
import AssetsStep from './AssetsStep';
import ModuleSelect from './ModuleSelect';
import IngestionStep from './IngestionStep';
import ScriptReviewStep from './ScriptReviewStep';
import TranslationReviewStep from './TranslationReviewStep';
import AudioProductionStep from './AudioProductionStep';
import PublishStep from './PublishStep';

// ── Step completion icon ─────────────────────────────────────────────────────

function WizardStepIcon(props: StepIconProps & { stepId: WizardStep }) {
  const status = useGuidesStore((s) => s.getStepCompletionStatus(props.stepId));
  const currentStep = useGuidesStore((s) => s.currentStep);
  const isActive = props.stepId === currentStep;

  if (status === 'completed') {
    return <CheckCircleIcon sx={{ color: 'success.main', fontSize: 28 }} />;
  }
  if (status === 'error') {
    return <ErrorIcon sx={{ color: 'error.main', fontSize: 28 }} />;
  }
  if (isActive) {
    return (
      <Box
        sx={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          bgcolor: 'primary.main',
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 14,
          fontWeight: 700,
        }}
      >
        {props.icon}
      </Box>
    );
  }
  return <RadioButtonUncheckedIcon sx={{ color: 'text.disabled', fontSize: 28 }} />;
}

// ── Sync status badge ────────────────────────────────────────────────────────

function SyncStatusBadge() {
  const syncStatus = useGuidesStore((s) => s.syncStatus);

  const config = {
    synced: { icon: <CloudDoneIcon fontSize="small" />, label: 'Synced', color: 'success' as const },
    'local-changes': { icon: <EditNoteIcon fontSize="small" />, label: 'Unsaved changes', color: 'warning' as const },
    syncing: { icon: <SyncIcon fontSize="small" sx={{ animation: 'spin 1s linear infinite', '@keyframes spin': { '0%': { transform: 'rotate(0deg)' }, '100%': { transform: 'rotate(360deg)' } } }} />, label: 'Syncing…', color: 'info' as const },
    conflict: { icon: <CloudOffIcon fontSize="small" />, label: 'Conflict', color: 'error' as const },
  }[syncStatus];

  return (
    <Chip
      icon={config.icon}
      label={config.label}
      size="small"
      color={config.color}
      variant="outlined"
    />
  );
}

/** Placeholder for steps not yet implemented */
function ComingSoonStep({ label }: { label: string }) {
  return (
    <Paper sx={{ p: 6, textAlign: 'center' }}>
      <Typography variant="h6" color="text.secondary" gutterBottom>
        {label}
      </Typography>
      <Chip label="Coming soon" variant="outlined" />
      <Typography variant="body2" color="text.disabled" sx={{ mt: 2 }}>
        This wizard step will be implemented in a future update.
      </Typography>
    </Paper>
  );
}

/** Render the step content based on the current wizard step */
function StepContent() {
  const currentStep = useGuidesStore((s) => s.currentStep);

  switch (currentStep) {
    case 'entity-config':
      return <EntityConfigForm />;
    case 'layout':
      return <LayoutPicker />;
    case 'assets':
      return <AssetsStep />;
    case 'modules':
      return <ModuleSelect />;
    case 'ingest':
      return <IngestionStep />;
    case 'script':
      return <ScriptReviewStep />;
    case 'translation':
      return <TranslationReviewStep />;
    case 'audio':
      return <AudioProductionStep />;
    case 'publish':
      return <PublishStep />;
    default:
      return <ComingSoonStep label={WIZARD_STEPS.find((s) => s.id === currentStep)?.label ?? currentStep} />;
  }
}

// ── Last saved indicator ─────────────────────────────────────────────────────

function LastSavedLabel() {
  const lastSavedAt = useGuidesStore((s) => s.lastSavedAt);
  const isSaving = useGuidesStore((s) => s.isSaving);

  if (isSaving) {
    return (
      <Typography variant="caption" color="text.secondary" sx={{ mx: 1 }}>
        Saving…
      </Typography>
    );
  }

  if (!lastSavedAt) return null;

  const fmt = new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(lastSavedAt));

  return (
    <Tooltip title={`Last saved at ${fmt}`}>
      <Typography variant="caption" color="text.secondary" sx={{ mx: 1 }}>
        Saved {fmt}
      </Typography>
    </Tooltip>
  );
}

// ── Main WizardShell ─────────────────────────────────────────────────────────

export default function WizardShell() {
  const { step: urlStep } = useParams<{ step: string }>();
  const navigate = useNavigate();

  const currentStep = useGuidesStore((s) => s.currentStep);
  const goToStep = useGuidesStore((s) => s.goToStep);
  const nextStep = useGuidesStore((s) => s.nextStep);
  const prevStep = useGuidesStore((s) => s.prevStep);
  const isDirty = useGuidesStore((s) => s.isDirty);
  const isValid = useGuidesStore((s) => s.isEntityConfigValid);
  const saveDraft = useGuidesStore((s) => s.saveDraft);
  const markClean = useGuidesStore((s) => s.markClean);
  const autoSaveEnabled = useGuidesStore((s) => s.autoSaveEnabled);
  const setAutoSaveEnabled = useGuidesStore((s) => s.setAutoSaveEnabled);
  const isStepAccessible = useGuidesStore((s) => s.isStepAccessible);
  const getStepCompletionStatus = useGuidesStore((s) => s.getStepCompletionStatus);
  const guideId = useGuidesStore((s) => s.guideId);
  const pipelineSessionId = useGuidesStore((s) => s.pipelineSessionId);
  const pipelineCheckpointId = useGuidesStore((s) => s.pipelineCheckpointId);
  const clearAll = useGuidesStore((s) => s.clearAll);
  const routeGuideId = useParams<{ id?: string }>().id ?? 'new';
  const traceSessionId = useMemo(() => getTraceSessionId(), []);

  const theme = useTheme();
  const isSmall = useMediaQuery(theme.breakpoints.down('md'));

  // Sync URL → store: when the URL step changes, update the store
  useEffect(() => {
    const validStep = WIZARD_STEPS.find((s) => s.id === urlStep);
    if (validStep && urlStep !== currentStep) {
      goToStep(validStep.id);
    } else if (!validStep && urlStep) {
      // Invalid step slug in URL → redirect to the current store step
      navigate(guidePath(routeGuideId, currentStep), { replace: true });
    }
  }, [urlStep]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync store → URL: when the store step changes (e.g. via next/prev), update the URL
  useEffect(() => {
    if (currentStep !== urlStep) {
      navigate(guidePath(routeGuideId, currentStep), { replace: true });
    }
  }, [currentStep]); // eslint-disable-line react-hooks/exhaustive-deps

  // Activate auto-save hook — saves 2s after last edit
  useAutosave(2000);

  useEffect(() => {
    console.info('[WizardShell]', {
      event: 'wizard.session.start',
      traceSessionId,
      guideId: guideId ?? routeGuideId,
      pipelineSessionId,
      pipelineCheckpointId,
    });
  }, [traceSessionId, guideId, routeGuideId, pipelineSessionId, pipelineCheckpointId]);

  useEffect(() => {
    console.info('[WizardShell]', {
      event: 'wizard.step.view',
      traceSessionId,
      guideId: guideId ?? routeGuideId,
      stepId: currentStep,
      pipelineSessionId,
      pipelineCheckpointId,
    });
  }, [
    traceSessionId,
    guideId,
    routeGuideId,
    currentStep,
    pipelineSessionId,
    pipelineCheckpointId,
  ]);

  const currentIdx = WIZARD_STEPS.findIndex((s) => s.id === currentStep);
  const isFirst = currentIdx === 0;
  const isLast = currentIdx === WIZARD_STEPS.length - 1;

  // Gate "Next" on current step's completion status.
  // Subscribe to the actual status value so React re-renders when it changes
  // (e.g. after uploading assets, approving ingestion, etc.).
  const currentStepStatus = useGuidesStore(
    useCallback((s) => s.getStepCompletionStatus(currentStep), [currentStep]),
  );
  const canProceed = useMemo(() => {
    if (currentStep === 'entity-config') return isValid();
    return currentStepStatus === 'completed';
  }, [currentStep, currentStepStatus, isValid]);

  // ── Clear All confirmation dialog ──
  const [clearAllOpen, setClearAllOpen] = useState(false);

  const handleClearAll = useCallback(() => {
    clearAll();
    setClearAllOpen(false);
  }, [clearAll]);

  // ── Dirty-navigation confirmation dialog ──
  type PendingNav = { kind: 'step'; target: WizardStep } | { kind: 'next' } | { kind: 'prev' };
  const [pendingNav, setPendingNav] = useState<PendingNav | null>(null);

  const executePendingNav = useCallback(
    (nav: PendingNav) => {
      switch (nav.kind) {
        case 'step':
          goToStep(nav.target);
          break;
        case 'next':
          nextStep();
          break;
        case 'prev':
          prevStep();
          break;
      }
    },
    [goToStep, nextStep, prevStep],
  );

  const requestNav = useCallback(
    (nav: PendingNav) => {
      if (isDirty) {
        setPendingNav(nav);
      } else {
        executePendingNav(nav);
      }
    },
    [isDirty, executePendingNav],
  );

  const handleDirtySave = useCallback(() => {
    saveDraft();
    if (pendingNav) executePendingNav(pendingNav);
    setPendingNav(null);
  }, [saveDraft, executePendingNav, pendingNav]);

  const handleDirtyDiscard = useCallback(() => {
    markClean();
    if (pendingNav) executePendingNav(pendingNav);
    setPendingNav(null);
  }, [markClean, executePendingNav, pendingNav]);

  const handleDirtyCancel = useCallback(() => {
    setPendingNav(null);
  }, []);

  // Progress percentage for the overall wizard
  const completedCount = useMemo(
    () => WIZARD_STEPS.filter((s) => getStepCompletionStatus(s.id) === 'completed').length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentStep, getStepCompletionStatus],
  );

  const handleStepClick = (step: WizardStep) => {
    if (isStepAccessible(step)) {
      requestNav({ kind: 'step', target: step });
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Guide ID + progress bar */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, px: 1 }}>
        {guideId && (
          <Chip
            label={`Guide: ${guideId.slice(0, 8)}…`}
            size="small"
            variant="outlined"
            sx={{ fontFamily: 'monospace', fontSize: 11 }}
          />
        )}
        <Chip
          label={`${completedCount} / ${WIZARD_STEPS.length} steps`}
          size="small"
          color={completedCount === WIZARD_STEPS.length ? 'success' : 'default'}
        />
        <Box sx={{ flex: 1 }} />
        <SyncStatusBadge />
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={autoSaveEnabled}
              onChange={(_, v) => setAutoSaveEnabled(v)}
            />
          }
          label={<Typography variant="caption">Auto-save</Typography>}
          sx={{ mr: 0 }}
        />
      </Box>

      {/* Horizontal stepper with completion icons */}
      <Paper sx={{ px: 3, pt: 2, pb: 1, mb: 3, borderRadius: 2 }}>
        <Stepper
          activeStep={currentIdx}
          nonLinear
          alternativeLabel={!isSmall}
          orientation={isSmall ? 'vertical' : 'horizontal'}
        >
          {WIZARD_STEPS.map((step, idx) => {
            const accessible = isStepAccessible(step.id);
            return (
              <Step key={step.id} completed={getStepCompletionStatus(step.id) === 'completed'}>
                <StepButton
                  onClick={() => handleStepClick(step.id)}
                  disabled={!accessible}
                >
                  <StepLabel
                    error={getStepCompletionStatus(step.id) === 'error'}
                    StepIconComponent={(iconProps) => (
                      <WizardStepIcon
                        {...iconProps}
                        stepId={step.id}
                        icon={idx + 1}
                      />
                    )}
                  >
                    <Typography
                      variant="caption"
                      sx={{
                        fontWeight: step.id === currentStep ? 700 : 400,
                        color: !accessible ? 'text.disabled' : undefined,
                      }}
                    >
                      {step.label}
                    </Typography>
                  </StepLabel>
                </StepButton>
              </Step>
            );
          })}
        </Stepper>
      </Paper>

      {/* Step content */}
      <Box sx={{ flex: 1, overflow: 'auto', pb: 10 }}>
        <StepContent />
      </Box>

      {/* Bottom navigation bar */}
      <Paper
        elevation={8}
        sx={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          px: 3,
          py: 1.5,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderTop: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.paper',
          zIndex: 1200,
        }}
      >
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <Button
            startIcon={<ArrowBackIcon />}
            onClick={() => requestNav({ kind: 'prev' })}
            disabled={isFirst}
            color="inherit"
          >
            Back
          </Button>
          <Tooltip title="Clear all data and start a new guide">
            <Button
              startIcon={<DeleteSweepIcon />}
              onClick={() => setClearAllOpen(true)}
              color="error"
              size="small"
              sx={{ ml: 1 }}
            >
              Clear All
            </Button>
          </Tooltip>
        </Box>

        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <LastSavedLabel />

          {isDirty && (
            <Button
              startIcon={<SaveIcon />}
              variant="outlined"
              size="small"
              onClick={saveDraft}
            >
              Save Draft
            </Button>
          )}

          <Button
            endIcon={<ArrowForwardIcon />}
            variant="contained"
            onClick={() => requestNav({ kind: 'next' })}
            disabled={isLast || !canProceed}
          >
            {isLast ? 'Finish' : 'Next'}
          </Button>
        </Box>
      </Paper>

      {/* Clear All confirmation dialog */}
      <Dialog open={clearAllOpen} onClose={() => setClearAllOpen(false)}>
        <DialogTitle>Start New Guide?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will permanently clear <strong>all</strong> data for the current
            guide — entity setup, assets, scripts, translations, audio, and
            publishing. This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setClearAllOpen(false)} color="inherit">
            Cancel
          </Button>
          <Button onClick={handleClearAll} color="error" variant="contained">
            Clear Everything
          </Button>
        </DialogActions>
      </Dialog>

      {/* Unsaved changes confirmation dialog */}
      <Dialog open={pendingNav !== null} onClose={handleDirtyCancel}>
        <DialogTitle>Unsaved Changes</DialogTitle>
        <DialogContent>
          <DialogContentText>
            You have unsaved changes on this step. Would you like to save before
            navigating away?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDirtyCancel} color="inherit">
            Cancel
          </Button>
          <Button onClick={handleDirtyDiscard} color="warning">
            Discard
          </Button>
          <Button onClick={handleDirtySave} variant="contained">
            Save & Continue
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
