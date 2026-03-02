// ---------------------------------------------------------------------------
// App — main layout with Wizard / Pipeline Debug toggle
// ---------------------------------------------------------------------------
import { useState } from 'react';
import {
  AppBar,
  Toolbar,
  Typography,
  Box,
  Button,
  Container,
  Alert,
  LinearProgress,
  IconButton,
  Tooltip,
  Paper,
  Chip,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import HistoryIcon from '@mui/icons-material/History';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import BugReportIcon from '@mui/icons-material/BugReport';
import { PIPELINE_STAGES, usePipelineStore } from './store';
import PipelineStepper from './components/PipelineStepper';
import HumanGatePanel from './components/HumanGatePanel';
import StageDetail from './components/StageDetail';
import HistoryDrawer from './components/HistoryDrawer';
import WizardShell from './components/wizard/WizardShell';

type AppView = 'wizard' | 'pipeline';

export default function App() {
  const status = usePipelineStore((s) => s.status);
  const error = usePipelineStore((s) => s.error);
  const currentStageIndex = usePipelineStore((s) => s.currentStageIndex);
  const stages = usePipelineStore((s) => s.stages);
  const pipelineStart = usePipelineStore((s) => s.start);
  const pipelineReset = usePipelineStore((s) => s.reset);
  const history = usePipelineStore((s) => s.history);
  const sessionId = usePipelineStore((s) => s.sessionId);

  const [histDrawer, setHistDrawer] = useState(false);
  const [view, setView] = useState<AppView>('wizard');

  // Determine which stages have outputs to show
  const completedStages = PIPELINE_STAGES
    .map((def, idx) => ({ def, idx, stage: stages[def.id] }))
    .filter(({ stage }) => Object.keys(stage.nodeOutputs).length > 0);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {/* Header */}
      <AppBar position="static" color="transparent" elevation={0} sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1, fontWeight: 700 }}>
            <span style={{ color: '#7c4dff' }}>Laxy</span> Studio
          </Typography>

          {/* View toggle */}
          <ToggleButtonGroup
            value={view}
            exclusive
            onChange={(_, v) => v && setView(v)}
            size="small"
            sx={{ mr: 2 }}
          >
            <ToggleButton value="wizard">
              <Tooltip title="Guide Wizard"><AutoFixHighIcon sx={{ mr: 0.5 }} /></Tooltip>
              Wizard
            </ToggleButton>
            <ToggleButton value="pipeline">
              <Tooltip title="Pipeline Debug"><BugReportIcon sx={{ mr: 0.5 }} /></Tooltip>
              Pipeline
            </ToggleButton>
          </ToggleButtonGroup>

          {view === 'pipeline' && sessionId && (
            <Chip label={`Session: ${sessionId.slice(0, 12)}...`} size="small" variant="outlined" sx={{ mr: 2 }} />
          )}
          {view === 'pipeline' && (
            <Tooltip title="History">
              <IconButton sx={{ mr: 1 }} onClick={() => setHistDrawer(true)} disabled={history.length === 0}>
                <HistoryIcon />
              </IconButton>
            </Tooltip>
          )}
          {view === 'pipeline' && status !== 'idle' && (
            <Button
              variant="outlined"
              size="small"
              startIcon={<RestartAltIcon />}
              onClick={pipelineReset}
              color="secondary"
            >
              Reset
            </Button>
          )}
        </Toolbar>
      </AppBar>

      {/* Loading bar */}
      {view === 'pipeline' && status === 'running' && <LinearProgress color="primary" />}

      {/* ── Wizard View ── */}
      {view === 'wizard' && (
        <Container maxWidth="lg" sx={{ flex: 1, py: 3 }}>
          <WizardShell />
        </Container>
      )}

      {/* ── Pipeline Debug View ── */}
      {view === 'pipeline' && (
        <Container maxWidth="xl" sx={{ flex: 1, py: 4 }}>
          {/* Error banner */}
          {error && (
            <Alert severity="error" sx={{ mb: 3 }} onClose={() => {}}>
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
              <Button
                variant="contained"
                size="large"
                startIcon={<PlayArrowIcon />}
                onClick={pipelineStart}
                sx={{ px: 5, py: 1.5, fontSize: '1.1rem' }}
              >
                Start Pipeline
              </Button>
            </Box>
          )}

          {/* Pipeline running / stopped / finished */}
          {status !== 'idle' && (
            <Box sx={{ display: 'flex', gap: 4 }}>
              {/* Left: stepper */}
              <Box sx={{ width: 300, flexShrink: 0 }}>
                <PipelineStepper />
              </Box>

              {/* Right: stage details & gate */}
              <Box sx={{ flex: 1, minWidth: 0 }}>
                {/* Finished banner */}
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

                {/* Human Gate controls */}
                <HumanGatePanel />

                {/* Stage outputs — show current first, then completed ones */}
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
        </Container>
      )}

      {/* History drawer */}
      <HistoryDrawer open={histDrawer} onClose={() => setHistDrawer(false)} />
    </Box>
  );
}
