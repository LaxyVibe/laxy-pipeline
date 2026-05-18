import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const REQUIRED_FIREBASE_ENV_KEYS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
] as const

function assertRequiredFirebaseEnv(mode: string, env: Record<string, string>) {
  if (mode === 'test') return

  const missing = REQUIRED_FIREBASE_ENV_KEYS.filter((key) => !env[key]?.trim())
  if (missing.length > 0) {
    throw new Error(
      `Missing required Firebase env vars for laxy-studio: ${missing.join(', ')}. `
      + 'Populate laxy-studio/.env.local or export the VITE_FIREBASE_* variables before building.',
    )
  }
}

export default defineConfig(({ mode }) => {
  // Load VITE_* vars from .env / .env.local so they're available here
  const env = loadEnv(mode, process.cwd(), '')
  assertRequiredFirebaseEnv(mode, env)

  const GCP_PROJECT = env.VITE_GCP_PROJECT || 'laxy-pipeline-dev'
  const GCP_REGION  = env.VITE_GCP_REGION  || 'us-central1'

  return {
    plugins: [react()],
    test: {
      exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
    },
    server: {
      port: 5173,
      proxy: {
        '/pipeline/audio-generate-language': {
          target: 'http://127.0.0.1:5001',
          changeOrigin: true,
          rewrite: () => `/${GCP_PROJECT}/${GCP_REGION}/audio_generate_language`,
        },
        '/pipeline/audio-session-bootstrap': {
          target: 'http://127.0.0.1:5001',
          changeOrigin: true,
          rewrite: () => `/${GCP_PROJECT}/${GCP_REGION}/audio_session_bootstrap`,
        },
        '/pipeline/audio-generate': {
          target: 'http://127.0.0.1:5001',
          changeOrigin: true,
          rewrite: () => `/${GCP_PROJECT}/${GCP_REGION}/audio_generate`,
        },
        '/pipeline/translate-language': {
          target: 'http://127.0.0.1:5001',
          changeOrigin: true,
          rewrite: () => `/${GCP_PROJECT}/${GCP_REGION}/translate_language`,
        },
        '/pipeline': {
          target: 'http://127.0.0.1:5001',
          changeOrigin: true,
          rewrite: (path) => {
            // /pipeline/start  → /{project}/{region}/pipeline_start
            // /pipeline/resume → /{project}/{region}/pipeline_resume
            // /pipeline/status → /{project}/{region}/pipeline_status
            const action = path.split('/').pop()          // "start" | "resume" | "status"
            return `/${GCP_PROJECT}/${GCP_REGION}/pipeline_${action}`
          },
        },
      },
    },
  }
})
