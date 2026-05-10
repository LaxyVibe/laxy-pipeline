import { defineConfig } from '@playwright/test';

const projectId = process.env.E2E_FIREBASE_PROJECT ?? 'laxy-studio-dev';
const firebaseEnv = [
  `VITE_USE_EMULATORS=true`,
  `VITE_USE_AUTH_EMULATOR=true`,
  `VITE_FIREBASE_API_KEY=${process.env.VITE_FIREBASE_API_KEY ?? 'fake-api-key'}`,
  `VITE_FIREBASE_AUTH_DOMAIN=${process.env.VITE_FIREBASE_AUTH_DOMAIN ?? `${projectId}.firebaseapp.com`}`,
  `VITE_FIREBASE_PROJECT_ID=${process.env.VITE_FIREBASE_PROJECT_ID ?? projectId}`,
  `VITE_FIREBASE_STORAGE_BUCKET=${process.env.VITE_FIREBASE_STORAGE_BUCKET ?? `${projectId}.appspot.com`}`,
  `VITE_FIREBASE_MESSAGING_SENDER_ID=${process.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '123456789'}`,
  `VITE_FIREBASE_APP_ID=${process.env.VITE_FIREBASE_APP_ID ?? '1:123456789:web:e2e'}`,
  `VITE_GCP_PROJECT=${process.env.VITE_GCP_PROJECT ?? projectId}`,
  `VITE_GCP_REGION=${process.env.VITE_GCP_REGION ?? 'us-central1'}`,
].join(' ');

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: {
    timeout: 15_000,
  },
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  fullyParallel: false,
  reporter: process.env.CI
    ? [['github'], ['html', { outputFolder: 'playwright-report', open: 'never' }]]
    : [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4173',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  globalSetup: './e2e/global-setup.ts',
  webServer: {
    command: `${firebaseEnv} npm run dev -- --host 127.0.0.1 --port 4173`,
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
