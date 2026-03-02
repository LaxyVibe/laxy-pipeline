// ---------------------------------------------------------------------------
// PipelineDebugPage — raw pipeline view exposed as a route
// ---------------------------------------------------------------------------
import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Container,
  IconButton,
  Paper,
  Tooltip,
  Typography,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import HistoryIcon from '@mui/icons-material/History';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { PIPELINE_STAGES, usePipelineStore } from '../store';
import PipelineStepper from '../components/PipelineStepper';
import HumanGatePanel from '../components/HumanGatePanel';
import StageDetail from '../components/StageDetail';
import HistoryDrawer from '../components/HistoryDrawer';

/**
 * Standalone page that exposes the raw ADK pipeline debug UI.
 * This is the same content that was previously shown in the "Pipeline"
 * toggle of App.tsx, now accessible via `/debug`.
 */
export default function PipelineDebugPage() {
  const status = usePipelineStore((s) => s.status);
  const error = usePipelineStore((s) => s.error);
  const currentStageIndex = usePipelineStore((s) => s.currentStageIndex);
  const stages = usePipelineStore((s) => s.stages);
  const pipelineStart = usePipelineStore((s) => s.start);
  const pipelineReset = usePipelineStore((s) => s.reset);
  const history = usePipelineStore((s) => s.history);
  const sessionId = usePipelineStore((s) => s.sessionId);

  const [histDrawer, setHistDrawer] = useState(false);

  const completedStages = PIPELINE_STAGES.map((def, idx) => ({ def, idx, stage: stages[def.id] }))
    .filter(({ stage }) => Object.keys(stage.nodeOutputs).length > 0);

  return (
    <Container maxWidth="xl" sx={{ flex: 1, py: 4 }}>
      {/* Toolbar */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <Typography variant="h5" sx={{ flex: 1 }}>
          Pipeline Debug
        </Typography>
        {sessionId && <Chip label={`Session: ${sessionId.slice(0, 20)}…`} size="small" variant="outlined" />}
        <Tooltip title="History">
          <IconButton onClick={() => setHistDrawer(true)} disabled={history.length === 0}>
            <HistoryIcon />
          </IconButton>
        </Tooltip>
        {status !== 'idle' && (
          <Button variant="outlined" size="small" startIcon={<RestartAltIcon />} onClick={pipelineReset} color="secondary">
            Reset
          </Button>
        )}
      </Box>

      {/* Error banner */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Idle — start button */}
      {status === 'idle' && (
        <Box sx={{ textAlign: 'center', py: 12 }}>
          <Typography variant="h4" gutterBottom>
            Museum Audio Guide Pipeline
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 4, maxWidth: 500, mx: 'auto' }}>
            Process museum exhibits through Gemini-powered OCR, metadata extraction, script generation,
            translation, and audio production — with human review gates at each checkpoint.
          </Typography>
          <Button variant="contained" size="large" startIcon={<PlayArrowIcon />} onClick={pipelineStart} sx={{ px: 5, py: 1.5, fontSize: '1.1rem' }}>
            Start Pipeline
          </Button>
        </Box>
      )}

      {/* Running / stopped / finished */}
      {status !== 'idle' && (
        <Box sx={{ display: 'flex', gap: 4 }}>
          <Box sx={{ width: 300, flexShrink: 0 }}>
            <PipelineStepper />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            {status === 'finished' && (
              <Paper
                sx={{
                  p: 3,
                  mb: 3,
                  textAlign: 'center',
                  background: 'linear-gradient(135deg, rgba(105,240,174,0.1) 0%, rgba(0,229,255,0.05) 100%)',
                  border: '1px solid',
                  borderColor: 'success.main',
                }}
              >
                <CheckCircleOutlineIcon sx={{ fontSize: 48, color: 'success.main', mb: 1 }} />
                <Typography variant="h5" color="success.main" gutterBottom>
                  Pipeline Complete
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  All stages finished successfully. {history.length} API calls made.
                </Typography>
              </Paper>
            )}
            <HumanGatePanel />
            {currentStageIndex >= 0 && <StageDetail stageIndex={currentStageIndex} />}
            {completedStages
              .filter(({ idx }) => idx !== currentStageIndex)
              .reverse()
              .map(({ idx }) => (
                <StageDetail key={idx} stageIndex={idx} />
              ))}
          </Box>
        </Box>
      )}

      <HistoryDrawer open={histDrawer} onClose={() => setHistDrawer(false)} />
    </Container>
  );
}
