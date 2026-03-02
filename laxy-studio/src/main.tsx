import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider, CssBaseline, CircularProgress, Box } from '@mui/material';
import { theme } from './theme';
import App from './App';

// Lazy-load the FireCMS admin panel (heavy bundle — only loaded at /admin)
const AdminApp = lazy(() => import('./admin/AdminApp'));

function Root() {
  // Simple path-based routing: render AdminApp for /admin/*, otherwise Studio
  const isAdmin = window.location.pathname.startsWith('/admin');

  if (isAdmin) {
    return (
      <Suspense
        fallback={
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
            <CircularProgress />
          </Box>
        }
      >
        <AdminApp />
      </Suspense>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
