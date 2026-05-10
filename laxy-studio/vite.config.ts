import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  // Load VITE_* vars from .env / .env.local so they're available here
  const env = loadEnv(mode, process.cwd(), '')

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
