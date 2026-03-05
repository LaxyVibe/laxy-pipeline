// ---------------------------------------------------------------------------
// PipelineDebugPage — session history browser + live pipeline debug view
// ---------------------------------------------------------------------------
import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Container,
  Divider,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Tooltip,
  Typography,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import HistoryIcon from '@mui/icons-material/History';
import RefreshIcon from '@mui/icons-material/Refresh';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import {
  collection,
  getDocs,
  orderBy,
  query,
  doc,
  getDoc,
} from 'firebase/firestore';
import { initFirebase } from '../firebase';
import { PIPELINE_STAGES, usePipelineStore } from '../store';
import PipelineStepper from '../components/PipelineStepper';
import HumanGatePanel from '../components/HumanGatePanel';
import StageDetail from '../components/StageDetail';
import HistoryDrawer from '../components/HistoryDrawer';

// ── Types matching the backend session schema ──

interface PipelineStepRecord {
  stepId: string;
  label: string;
  status: string;
  startedAt?: unknown;
  finishedAt?: unknown;
  output?: unknown;
  error?: string;
}

interface FirestoreSession {
  id: string;
  session_id?: string;
  status: string;
  current_step?: string;
  checkpoint_id?: string;
  steps?: PipelineStepRecord[];
  outputs?: Record<string, unknown>;
  created_at?: { toDate?: () => Date; seconds?: number };
  updated_at?: { toDate?: () => Date; seconds?: number };
  question?: string;
  uploads?: unknown[];
  context?: Record<string, unknown>;
}

function statusColor(s: string): 'default' | 'success' | 'warning' | 'error' | 'info' {
  if (s === 'finished') return 'success';
  if (s === 'running') return 'info';
  if (s === 'stopped') return 'warning';
  if (s === 'error') return 'error';
  return 'default';
}

function formatTs(ts: FirestoreSession['created_at']): string {
  if (!ts) return '—';
  try {
    const d = ts.toDate ? ts.toDate() : ts.seconds ? new Date(ts.seconds * 1000) : null;
    if (!d) return '—';
    return d.toLocaleString();
  } catch {
    return '—';
  }
}

// ── Session list panel ──

function SessionList({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (s: FirestoreSession) => void;
}) {
  const [sessions, setSessions] = useState<FirestoreSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const { db } = initFirebase();
      const q = query(
        collection(db, 'pipeline_sessions'),
        orderBy('created_at', 'desc'),
      );
      const snap = await getDocs(q);
      setSessions(snap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreSession)));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Typography variant="subtitle2" sx={{ flex: 1, fontWeight: 700 }}>
          Sessions ({sessions.length})
        </Typography>
        <Tooltip title="Refresh">
          <IconButton size="small" onClick={load} disabled={loading}>
            {loading ? <CircularProgress size={16} /> : <RefreshIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
      </Box>

      {error && (
        <Alert severity="error" sx={{ m: 1, fontSize: 12 }}>
          {error}
        </Alert>
      )}

      {!loading && sessions.length === 0 && !error && (
        <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
          No sessions found.
        </Typography>
      )}

      <List dense disablePadding sx={{ overflowY: 'auto', flex: 1 }}>
        {sessions.map((s) => (
          <ListItemButton
            key={s.id}
            selected={s.id === selectedId}
            onClick={() => onSelect(s)}
            sx={{ borderBottom: '1px solid', borderColor: 'divider', alignItems: 'flex-start', py: 1.5 }}
          >
            <ListItemText
              primary={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: 11 }}>
                    {(s.session_id ?? s.id).slice(0, 24)}…
                  </Typography>
                  <Chip
                    label={s.status ?? 'unknown'}
                    color={statusColor(s.status)}
                    size="small"
                    sx={{ height: 18, fontSize: 10 }}
                  />
                </Box>
              }
              secondary={
                <Box component="span" sx={{ display: 'block', mt: 0.5 }}>
                  {s.current_step && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: 11 }}>
                      Step: {s.current_step}
                    </Typography>
                  )}
                  <Typography variant="caption" color="text.disabled" sx={{ fontSize: 10 }}>
                    {formatTs(s.created_at)}
                  </Typography>
                </Box>
              }
            />
          </ListItemButton>
        ))}
      </List>
    </Box>
  );
}

// ── JSON output section with expand/collapse ──

function OutputSection({ label, value }: { label: string; value: unknown }) {
  const [open, setOpen] = useState(false);
  const json = JSON.stringify(value, null, 2);
  const preview = json.length > 120 ? json.slice(0, 120) + '…' : json;

  return (
    <Box sx={{ mb: 1 }}>
      <Box
        sx={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: 1 }}
        onClick={() => setOpen((o) => !o)}
      >
        <IconButton size="small">{open ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}</IconButton>
        <Typography variant="caption" sx={{ fontWeight: 600, fontFamily: 'monospace' }}>
          {label}
        </Typography>
        {!open && (
          <Typography variant="caption" color="text.disabled" sx={{ fontFamily: 'monospace', fontSize: 10 }}>
            {preview}
          </Typography>
        )}
      </Box>
      <Collapse in={open}>
        <Box
          component="pre"
          sx={{
            ml: 5,
            mt: 0.5,
            p: 1.5,
            bgcolor: 'action.hover',
            borderRadius: 1,
            fontSize: 11,
            fontFamily: 'monospace',
            overflowX: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}
        >
          {json}
        </Box>
      </Collapse>
    </Box>
  );
}

// ── Session detail panel ──

function SessionDetail({ sessionId }: { sessionId: string }) {
  const [session, setSession] = useState<FirestoreSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const { db } = initFirebase();
    getDoc(doc(db, 'pipeline_sessions', sessionId))
      .then((snap) => {
        if (snap.exists()) setSession({ id: snap.id, ...snap.data() } as FirestoreSession);
        else setError('Session not found');
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [sessionId]);

  if (loading) return <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>;
  if (error) return <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>;
  if (!session) return null;

  const steps: PipelineStepRecord[] = session.steps ?? [];
  const outputs = session.outputs ?? {};

  return (
    <Box sx={{ p: 3, overflowY: 'auto', height: '100%' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <Typography variant="h6" sx={{ flex: 1 }}>Session Detail</Typography>
        <Chip label={session.status ?? 'unknown'} color={statusColor(session.status)} size="small" />
      </Box>

      {/* Meta */}
      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: '140px 1fr', rowGap: 0.5, columnGap: 2 }}>
          {[
            ['Session ID', session.session_id ?? session.id],
            ['Status', session.status],
            ['Current step', session.current_step ?? '—'],
            ['Checkpoint', session.checkpoint_id ?? '—'],
            ['Created', formatTs(session.created_at)],
            ['Updated', formatTs(session.updated_at)],
            ['Uploads', String(session.uploads?.length ?? 0)],
          ].map(([k, v]) => (
            <>
              <Typography key={`k-${k}`} variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>{k}</Typography>
              <Typography key={`v-${k}`} variant="caption" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{v}</Typography>
            </>
          ))}
        </Box>
        {session.question && (
          <Box sx={{ mt: 1.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>Question</Typography>
            <Typography variant="body2" sx={{ mt: 0.25 }}>{session.question}</Typography>
          </Box>
        )}
      </Paper>

      {/* Step timeline */}
      <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700 }}>
        Steps ({steps.length})
      </Typography>
      {steps.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>No steps recorded.</Typography>
      )}
      {steps.map((step, i) => (
        <Paper key={i} variant="outlined" sx={{ p: 1.5, mb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: step.output ? 0.5 : 0 }}>
            <Chip
              label={step.status}
              color={statusColor(step.status?.toLowerCase())}
              size="small"
              sx={{ height: 18, fontSize: 10 }}
            />
            <Typography variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
              {step.label ?? step.stepId}
            </Typography>
          </Box>
          {step.error && (
            <Typography variant="caption" color="error" sx={{ display: 'block', ml: 0.5 }}>
              {step.error}
            </Typography>
          )}
          {step.output !== undefined && step.output !== null && (
            <OutputSection label="output" value={step.output} />
          )}
        </Paper>
      ))}

      {/* Outputs map */}
      {Object.keys(outputs).length > 0 && (
        <>
          <Divider sx={{ my: 2 }} />
          <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700 }}>
            Outputs ({Object.keys(outputs).length} keys)
          </Typography>
          {Object.entries(outputs).map(([key, val]) => (
            <OutputSection key={key} label={key} value={val} />
          ))}
        </>
      )}
    </Box>
  );
}

// ── Main page ──

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
  const [selectedSession, setSelectedSession] = useState<FirestoreSession | null>(null);
  // 'history' | 'live' tab
  const [tab, setTab] = useState<'history' | 'live'>('history');

  const completedStages = PIPELINE_STAGES.map((def, idx) => ({ def, idx, stage: stages[def.id] }))
    .filter(({ stage }) => Object.keys(stage.nodeOutputs).length > 0);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)' }}>
      {/* Page header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, px: 3, py: 1.5, borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>Pipeline Debug</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            size="small"
            variant={tab === 'history' ? 'contained' : 'outlined'}
            onClick={() => setTab('history')}
          >
            Session History
          </Button>
          <Button
            size="small"
            variant={tab === 'live' ? 'contained' : 'outlined'}
            onClick={() => setTab('live')}
          >
            Live Run
          </Button>
        </Box>
        <Box sx={{ flex: 1 }} />
        {tab === 'live' && sessionId && (
          <Chip label={`Session: ${sessionId.slice(0, 20)}…`} size="small" variant="outlined" />
        )}
        {tab === 'live' && (
          <Tooltip title="API call history">
            <IconButton onClick={() => setHistDrawer(true)} disabled={history.length === 0}>
              <HistoryIcon />
            </IconButton>
          </Tooltip>
        )}
        {tab === 'live' && status !== 'idle' && (
          <Button variant="outlined" size="small" startIcon={<RestartAltIcon />} onClick={pipelineReset} color="secondary">
            Reset
          </Button>
        )}
      </Box>

      {/* ── History tab ── */}
      {tab === 'history' && (
        <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Session list */}
          <Box sx={{ width: 320, flexShrink: 0, borderRight: '1px solid', borderColor: 'divider', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <SessionList
              selectedId={selectedSession?.id ?? null}
              onSelect={setSelectedSession}
            />
          </Box>

          {/* Session detail */}
          <Box sx={{ flex: 1, overflow: 'hidden' }}>
            {selectedSession ? (
              <SessionDetail sessionId={selectedSession.id} />
            ) : (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                <Typography variant="body2" color="text.secondary">
                  Select a session to inspect its steps and outputs.
                </Typography>
              </Box>
            )}
          </Box>
        </Box>
      )}

      {/* ── Live Run tab ── */}
      {tab === 'live' && (
        <Container maxWidth="xl" sx={{ flex: 1, py: 4, overflowY: 'auto' }}>
          {error && (
            <Alert severity="error" sx={{ mb: 3 }}>
              {error}
            </Alert>
          )}

          {status === 'idle' && (
            <Box sx={{ textAlign: 'center', py: 12 }}>
              <Typography variant="h4" gutterBottom>Museum Audio Guide Pipeline</Typography>
              <Typography variant="body1" color="text.secondary" sx={{ mb: 4, maxWidth: 500, mx: 'auto' }}>
                Process museum exhibits through Gemini-powered OCR, metadata extraction, script generation,
                translation, and audio production — with human review gates at each checkpoint.
              </Typography>
              <Button variant="contained" size="large" startIcon={<PlayArrowIcon />} onClick={pipelineStart} sx={{ px: 5, py: 1.5, fontSize: '1.1rem' }}>
                Start Pipeline
              </Button>
            </Box>
          )}

          {status !== 'idle' && (
            <Box sx={{ display: 'flex', gap: 4 }}>
              <Box sx={{ width: 300, flexShrink: 0 }}>
                <PipelineStepper />
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                {status === 'finished' && (
                  <Paper
                    sx={{
                      p: 3, mb: 3, textAlign: 'center',
                      background: 'linear-gradient(135deg, rgba(105,240,174,0.1) 0%, rgba(0,229,255,0.05) 100%)',
                      border: '1px solid', borderColor: 'success.main',
                    }}
                  >
                    <CheckCircleOutlineIcon sx={{ fontSize: 48, color: 'success.main', mb: 1 }} />
                    <Typography variant="h5" color="success.main" gutterBottom>Pipeline Complete</Typography>
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
        </Container>
      )}

      <HistoryDrawer open={histDrawer} onClose={() => setHistDrawer(false)} />
    </Box>
  );
}
