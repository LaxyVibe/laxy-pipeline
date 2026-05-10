import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { FullConfig } from '@playwright/test';

export default async function globalSetup(_config: FullConfig): Promise<void> {
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = path.dirname(currentFile);
  const repoRoot = path.resolve(currentDir, '..', '..');
  const scriptPath = path.resolve(repoRoot, 'functions', 'tests_e2e', 'seed_auth_claims.py');

  const functionsVenvPython = path.resolve(repoRoot, 'functions', 'venv', 'bin', 'python');
  const defaultVenvPython = path.resolve(repoRoot, '.venv', 'bin', 'python');
  const pythonCommand = process.env.E2E_PYTHON_CMD
    ?? (existsSync(functionsVenvPython) ? functionsVenvPython : undefined)
    ?? (existsSync(defaultVenvPython) ? defaultVenvPython : 'python3');

  const args = [
    scriptPath,
    '--project', process.env.E2E_FIREBASE_PROJECT ?? 'laxy-studio-dev',
    '--auth-host', process.env.E2E_AUTH_HOST ?? '127.0.0.1:9099',
    '--api-key', process.env.E2E_AUTH_API_KEY ?? 'fake-api-key',
    '--email', process.env.E2E_ADMIN_EMAIL ?? 'audio-mvp-e2e-admin@example.com',
    '--password', process.env.E2E_ADMIN_PASSWORD ?? 'Passw0rd123',
    '--role', process.env.E2E_ADMIN_ROLE ?? 'client-admin',
    '--tenant', process.env.E2E_ADMIN_TENANT ?? 'tenant-e2e',
  ];

  const result = spawnSync(pythonCommand, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      FIREBASE_AUTH_EMULATOR_HOST: process.env.E2E_AUTH_HOST ?? '127.0.0.1:9099',
    },
  });

  if (result.status !== 0) {
    throw new Error(`Failed to seed auth emulator user via ${scriptPath}`);
  }
}
