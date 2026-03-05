// ---------------------------------------------------------------------------
// HumanGatePanel — approve / reject controls when pipeline is stopped
// ---------------------------------------------------------------------------
import { useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Stack,
  TextField,
  Typography,
  Alert,
  CircularProgress,
} from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import ScheduleIcon from '@mui/icons-material/Schedule';
import { PIPELINE_STAGES, usePipelineStore } from '../store';

export default function HumanGatePanel() {
  const stages = usePipelineStore((s) => s.stages);
  const currentStageIndex = usePipelineStore((s) => s.currentStageIndex);
  const status = usePipelineStore((s) => s.status);
  const approve = usePipelineStore((s) => s.approve);
  const reject = usePipelineStore((s) => s.reject);

  const [feedback, setFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (status !== 'stopped' || currentStageIndex < 0) return null;

  const def = PIPELINE_STAGES[currentStageIndex];
  const stage = stages[def.id];
  if (stage.status !== 'gate') return null;

  const handleApprove = async () => {
    setSubmitting(true);
    await approve(feedback || 'Approved.');
    setFeedback('');
    setSubmitting(false);
  };

  const handleReject = async () => {
    setSubmitting(true);
    await reject(feedback || 'Rejected. Please re-process.');
    setFeedback('');
    setSubmitting(false);
  };

  return (
    <Card
      sx={{
        mb: 3,
        borderColor: 'warning.main',
        borderWidth: 2,
        borderStyle: 'solid',
        background: 'linear-gradient(135deg, rgba(255,215,64,0.06) 0%, rgba(124,77,255,0.04) 100%)',
      }}
    >
      <CardContent>
        <Typography variant="h6" color="warning.main" gutterBottom>
          {def.gate?.replace(/^HG\d+: /, '')}
        </Typography>

        <Alert severity="info" variant="outlined" sx={{ mb: 2 }}>
          {def.gateDescription}
        </Alert>

        {stage.gateText && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2, whiteSpace: 'pre-wrap' }}>
            {stage.gateText}
          </Typography>
        )}

        {/* Show what will be processed on approval */}
        {def.approveInfo && (
          <Alert
            severity="warning"
            variant="outlined"
            icon={<ScheduleIcon />}
            sx={{ mb: 2 }}
          >
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
              {def.approveInfo.summary}
            </Typography>
            <Stack direction="row" flexWrap="wrap" gap={0.75} mt={0.5}>
              {def.approveInfo.steps.map((step) => (
                <Chip
                  key={step.name}
                  label={`${step.name} (${step.model}) ${step.estimate}`}
                  size="small"
                  variant="outlined"
                  sx={{
                    fontSize: '0.75rem',
                    color: step.model === 'local' || step.model === 'rule-based'
                      ? 'text.secondary'
                      : 'warning.dark',
                    borderColor: step.model === 'local' || step.model === 'rule-based'
                      ? 'divider'
                      : 'warning.main',
                  }}
                />
              ))}
            </Stack>
          </Alert>
        )}

        <TextField
          fullWidth
          multiline
          rows={2}
          placeholder="Add feedback or comments (optional)..."
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          variant="outlined"
          size="small"
          sx={{ mb: 2 }}
          disabled={submitting}
        />

        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button
            variant="contained"
            color="success"
            size="large"
            startIcon={submitting ? <CircularProgress size={18} /> : <CheckIcon />}
            onClick={handleApprove}
            disabled={submitting}
            sx={{ flex: 1 }}
          >
            Approve
          </Button>
          <Button
            variant="outlined"
            color="error"
            size="large"
            startIcon={submitting ? <CircularProgress size={18} /> : <CloseIcon />}
            onClick={handleReject}
            disabled={submitting}
            sx={{ flex: 1 }}
          >
            Reject
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
}
