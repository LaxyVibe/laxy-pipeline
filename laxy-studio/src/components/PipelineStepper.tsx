// ---------------------------------------------------------------------------
// PipelineStepper — vertical step indicator on the left
// ---------------------------------------------------------------------------
import {
  Stepper,
  Step,
  StepLabel,
  StepContent,
  Typography,
  Box,
  Chip,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import PauseCircleIcon from '@mui/icons-material/PauseCircle';
import PlayCircleIcon from '@mui/icons-material/PlayCircle';
import ErrorIcon from '@mui/icons-material/Error';
import { PIPELINE_STAGES, StageStatus, usePipelineStore } from '../store';

function statusIcon(status: StageStatus) {
  switch (status) {
    case 'completed':
      return <CheckCircleIcon sx={{ color: 'success.main' }} />;
    case 'gate':
      return <PauseCircleIcon sx={{ color: 'warning.main' }} />;
    case 'running':
      return <PlayCircleIcon sx={{ color: 'primary.main' }} />;
    case 'rejected':
      return <ErrorIcon sx={{ color: 'error.main' }} />;
    default:
      return <RadioButtonUncheckedIcon sx={{ color: 'text.disabled' }} />;
  }
}

function statusChip(status: StageStatus) {
  const map: Record<StageStatus, { label: string; color: 'success' | 'warning' | 'info' | 'error' | 'default' }> = {
    completed: { label: 'Done', color: 'success' },
    gate: { label: 'Awaiting Review', color: 'warning' },
    running: { label: 'Running', color: 'info' },
    rejected: { label: 'Rejected', color: 'error' },
    pending: { label: 'Pending', color: 'default' },
  };
  const { label, color } = map[status];
  return <Chip label={label} color={color} size="small" variant="outlined" />;
}

export default function PipelineStepper() {
  const stages = usePipelineStore((s) => s.stages);
  const currentStageIndex = usePipelineStore((s) => s.currentStageIndex);
  const pipelineStatus = usePipelineStore((s) => s.status);

  // Determine the active step for the MUI Stepper
  const activeStep =
    pipelineStatus === 'finished'
      ? PIPELINE_STAGES.length
      : currentStageIndex >= 0
        ? currentStageIndex
        : -1;

  return (
    <Box sx={{ minWidth: 280 }}>
      <Typography variant="h6" sx={{ mb: 2, px: 1 }}>
        Pipeline
      </Typography>
      <Stepper activeStep={activeStep} orientation="vertical" nonLinear>
        {PIPELINE_STAGES.map((def, idx) => {
          const stage = stages[def.id];
          return (
            <Step key={def.id} completed={stage.status === 'completed'}>
              <StepLabel
                icon={statusIcon(stage.status)}
                optional={statusChip(stage.status)}
              >
                <Typography
                  variant="subtitle2"
                  sx={{
                    fontWeight: idx === currentStageIndex ? 700 : 400,
                    color: idx === currentStageIndex ? 'primary.main' : 'text.primary',
                  }}
                >
                  {def.title}
                </Typography>
              </StepLabel>
              <StepContent>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  {def.description}
                </Typography>
                {def.gate && (
                  <Typography variant="caption" color="warning.main">
                    Gate: {def.gate.replace(/^HG\d+: /, '')}
                  </Typography>
                )}
              </StepContent>
            </Step>
          );
        })}
      </Stepper>
    </Box>
  );
}
