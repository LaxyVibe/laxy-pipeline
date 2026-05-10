// ---------------------------------------------------------------------------
// App — main layout with URL routing for Wizard steps
// ---------------------------------------------------------------------------
import { useEffect } from 'react';
import { useState } from 'react';
import { Routes, Route, Navigate, Outlet, useLocation, useParams } from 'react-router-dom';
import {
  AppBar,
  Toolbar,
  Typography,
  Box,
  CircularProgress,
} from '@mui/material';
import { useAuthStore } from './authStore';
import { WIZARD_STEPS } from './guidesStore';
import { ROUTES, guidePath } from './routes';
import AdminPage from './pages/AdminPage';
import DashboardPage from './pages/DashboardPage';
import GuidePage from './pages/GuidePage';
import LoginPage from './pages/LoginPage';
import PipelineDebugPage from './pages/PipelineDebugPage';
import AudioDirectorPage from './pages/AudioDirectorPage';
import AudioMvpPage from './pages/AudioMvpPage';
import AudioMvp2Page from './pages/AudioMvp2Page';
import TTSPage from './pages/TTSPage';

// ── App Shell ────────────────────────────────────────────────────────────────

function StudioLayout() {
  const location = useLocation();
  const hideAppHeader = location.pathname === ROUTES.audioDirector;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {!hideAppHeader && (
        <AppBar position="static" color="transparent" elevation={0} sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
          <Toolbar>
            <Typography variant="h6" sx={{ flexGrow: 1, fontWeight: 700 }}>
              <span style={{ color: '#7c4dff' }}>Laxy</span> Studio
            </Typography>
          </Toolbar>
        </AppBar>
      )}
      <Outlet />
    </Box>
  );
}

function FullscreenLoader() {
  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <CircularProgress />
    </Box>
  );
}

function LoginRoute() {
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);

  if (loading) return <FullscreenLoader />;
  if (user) return <Navigate to={ROUTES.dashboard} replace />;
  return <LoginPage />;
}

function LogoutRoute() {
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);
  const signOut = useAuthStore((s) => s.signOut);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (loading || !user) {
      return;
    }

    let active = true;
    setSigningOut(true);
    void signOut().finally(() => {
      if (active) setSigningOut(false);
    });

    return () => {
      active = false;
    };
  }, [loading, user, signOut]);

  if (loading || signingOut) return <FullscreenLoader />;
  return <Navigate to={ROUTES.login} replace />;
}

function ProtectedLayout() {
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);

  if (loading) return <FullscreenLoader />;
  if (!user) return <Navigate to={ROUTES.login} replace />;
  return <StudioLayout />;
}

function RootRedirect() {
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);

  if (loading) return <FullscreenLoader />;
  return <Navigate to={user ? ROUTES.dashboard : ROUTES.login} replace />;
}

function LegacyWizardRedirect() {
  const { step } = useParams<{ step: string }>();
  const isValidStep = WIZARD_STEPS.some((wizardStep) => wizardStep.id === step);
  const safeStep = isValidStep ? step! : 'entity-config';
  return <Navigate to={guidePath('new', safeStep)} replace />;
}

export default function App() {
  const listen = useAuthStore((s) => s.listen);

  useEffect(() => {
    const unsubscribe = listen();
    return () => unsubscribe();
  }, [listen]);

  return (
    <Routes>
      <Route path={ROUTES.adminWildcard} element={<AdminPage />} />
      <Route path={ROUTES.root} element={<RootRedirect />} />
      <Route path={ROUTES.login} element={<LoginRoute />} />
      <Route path={ROUTES.logout} element={<LogoutRoute />} />

      <Route element={<ProtectedLayout />}>
        <Route path={ROUTES.dashboard} element={<DashboardPage />} />
        <Route path={ROUTES.audioMvp} element={<AudioMvpPage />} />
        <Route path={ROUTES.audioDirector} element={<AudioDirectorPage />} />
        <Route path={ROUTES.audioMvp2} element={<AudioMvp2Page />} />
        <Route path={ROUTES.tts} element={<TTSPage />} />
        <Route path={ROUTES.guide} element={<GuidePage />} />
        <Route path={ROUTES.guideStep} element={<GuidePage />} />
        <Route path={ROUTES.debug} element={<PipelineDebugPage />} />
        <Route path={ROUTES.wizard} element={<Navigate to={guidePath('new', 'entity-config')} replace />} />
        <Route path={ROUTES.wizardStep} element={<LegacyWizardRedirect />} />
      </Route>

      <Route path="*" element={<Navigate to={ROUTES.root} replace />} />
    </Routes>
  );
}
