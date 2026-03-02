// ---------------------------------------------------------------------------
// WizardShell — main wizard layout with interactive stepper, auto-save,
// completion tracking, PipelineStepper sidebar, and pipeline sync indicator
// ---------------------------------------------------------------------------
import { useMemo } from 'react';
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
  Drawer,
  useMediaQuery,
  useTheme,
  Switch,
  FormControlLabel,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import SaveIcon from '@mui/icons-material/Save';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import CloudDoneIcon from '@mui/icons-material/CloudDone';
import CloudOffIcon from '@mui/icons-material/CloudOff';
import SyncIcon from '@mui/icons-material/Sync';
import EditNoteIcon from '@mui/icons-material/EditNote';
import { useGuidesStore, WIZARD_STEPS, type WizardStep } from '../../guidesStore';
import { useAutosave } from '../../hooks/useAutosave';
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
  const currentStep = useGuidesStore((s) => s.currentStep);
  const goToStep = useGuidesStore((s) => s.goToStep);
  const nextStep = useGuidesStore((s) => s.nextStep);
  const prevStep = useGuidesStore((s) => s.prevStep);
  const isDirty = useGuidesStore((s) => s.isDirty);
  const isValid = useGuidesStore((s) => s.isEntityConfigValid);
  const saveDraft = useGuidesStore((s) => s.saveDraft);
  const autoSaveEnabled = useGuidesStore((s) => s.autoSaveEnabled);
  const setAutoSaveEnabled = useGuidesStore((s) => s.setAutoSaveEnabled);
  const isStepAccessible = useGuidesStore((s) => s.isStepAccessible);
  const getStepCompletionStatus = useGuidesStore((s) => s.getStepCompletionStatus);
  const guideId = useGuidesStore((s) => s.guideId);

  const theme = useTheme();
  const isSmall = useMediaQuery(theme.breakpoints.down('md'));

  // Activate auto-save hook — saves 2s after last edit
  useAutosave(2000);

  const currentIdx = WIZARD_STEPS.findIndex((s) => s.id === currentStep);
  const isFirst = currentIdx === 0;
  const isLast = currentIdx === WIZARD_STEPS.length - 1;

  // For entity-config step, only allow next if valid
  const canProceed = currentStep === 'entity-config' ? isValid() : true;

  // Progress percentage for the overall wizard
  const completedCount = useMemo(
    () => WIZARD_STEPS.filter((s) => getStepCompletionStatus(s.id) === 'completed').length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentStep, getStepCompletionStatus],
  );

  const handleStepClick = (step: WizardStep) => {
    if (isStepAccessible(step)) {
      goToStep(step);
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
          {WIZARD_STEPS.map((step) => {
            const accessible = isStepAccessible(step.id);
            return (
              <Step key={step.id} completed={getStepCompletionStatus(step.id) === 'completed'}>
                <StepButton
                  onClick={() => handleStepClick(step.id)}
                  disabled={!accessible}
                  icon={
                    <WizardStepIcon
                      stepId={step.id}
                      icon={WIZARD_STEPS.indexOf(step) + 1}
                      active={step.id === currentStep}
                      completed={getStepCompletionStatus(step.id) === 'completed'}
                    />
                  }
                >
                  <StepLabel
                    error={getStepCompletionStatus(step.id) === 'error'}
                    StepIconComponent={() => null}
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
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={prevStep}
          disabled={isFirst}
          color="inherit"
        >
          Back
        </Button>

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
            onClick={nextStep}
            disabled={isLast || !canProceed}
          >
            {isLast ? 'Finish' : 'Next'}
          </Button>
        </Box>
      </Paper>
    </Box>
  );
}
