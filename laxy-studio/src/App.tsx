// ---------------------------------------------------------------------------
// App — main layout with URL routing for Wizard steps
// ---------------------------------------------------------------------------
import { Routes, Route, Navigate } from 'react-router-dom';
import {
  AppBar,
  Toolbar,
  Typography,
  Box,
  Container,
} from '@mui/material';
import WizardShell from './components/wizard/WizardShell';
import PipelineDebugPage from './pages/PipelineDebugPage';

// ── App Shell ────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {/* Header */}
      <AppBar position="static" color="transparent" elevation={0} sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1, fontWeight: 700 }}>
            <span style={{ color: '#7c4dff' }}>Laxy</span> Studio
          </Typography>
        </Toolbar>
      </AppBar>

      {/* ── Routed content ── */}
      <Routes>
        {/* Wizard routes — step encoded in URL */}
        <Route
          path="/wizard/:step"
          element={
            <Container maxWidth="lg" sx={{ flex: 1, py: 3 }}>
              <WizardShell />
            </Container>
          }
        />
        {/* /wizard with no step → redirect to first step */}
        <Route path="/wizard" element={<Navigate to="/wizard/entity-config" replace />} />

        {/* Pipeline debug view */}
        <Route path="/debug" element={<PipelineDebugPage />} />

        {/* Fallback — redirect root to wizard */}
        <Route path="*" element={<Navigate to="/wizard/entity-config" replace />} />
      </Routes>
    </Box>
  );
}
