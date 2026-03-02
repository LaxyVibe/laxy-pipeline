// ---------------------------------------------------------------------------
// LoginPage — Firebase Auth login / register / password-reset
// ---------------------------------------------------------------------------
import { useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  TextField,
  Typography,
  Alert,
  Link,
  CircularProgress,
  Divider,
} from '@mui/material';
import { useAuthStore } from '../authStore';

type AuthMode = 'login' | 'register' | 'reset';

export default function LoginPage() {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const signIn = useAuthStore((s) => s.signIn);
  const signUp = useAuthStore((s) => s.signUp);
  const resetPassword = useAuthStore((s) => s.resetPassword);
  const error = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);

  const switchMode = (next: AuthMode) => {
    clearError();
    setResetSent(false);
    setMode(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setBusy(true);
    try {
      if (mode === 'login') {
        await signIn(email, password);
      } else if (mode === 'register') {
        await signUp(email, password, displayName || undefined);
      } else {
        await resetPassword(email);
        setResetSent(true);
      }
    } catch {
      // error already captured in authStore
    } finally {
      setBusy(false);
    }
  };

  const titles: Record<AuthMode, string> = {
    login: 'Sign In',
    register: 'Create Account',
    reset: 'Reset Password',
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #0a0e17 0%, #1a1040 100%)',
        p: 2,
      }}
    >
      <Card sx={{ width: '100%', maxWidth: 420 }}>
        <CardContent sx={{ p: 4 }}>
          <Typography variant="h5" fontWeight={700} gutterBottom>
            <span style={{ color: '#7c4dff' }}>Laxy</span> Studio
          </Typography>
          <Typography variant="h6" gutterBottom>
            {titles[mode]}
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          {resetSent && (
            <Alert severity="success" sx={{ mb: 2 }}>
              Password reset email sent. Check your inbox.
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {mode === 'register' && (
              <TextField
                label="Display Name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                autoComplete="name"
                fullWidth
              />
            )}
            <TextField
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              fullWidth
            />
            {mode !== 'reset' && (
              <TextField
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                fullWidth
              />
            )}
            <Button type="submit" variant="contained" size="large" disabled={busy} fullWidth>
              {busy ? <CircularProgress size={24} /> : titles[mode]}
            </Button>
          </Box>

          <Divider sx={{ my: 2 }} />

          {mode === 'login' && (
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Link component="button" variant="body2" onClick={() => switchMode('register')}>
                Create account
              </Link>
              <Link component="button" variant="body2" onClick={() => switchMode('reset')}>
                Forgot password?
              </Link>
            </Box>
          )}
          {mode === 'register' && (
            <Link component="button" variant="body2" onClick={() => switchMode('login')}>
              Already have an account? Sign in
            </Link>
          )}
          {mode === 'reset' && (
            <Link component="button" variant="body2" onClick={() => switchMode('login')}>
              Back to sign in
            </Link>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
