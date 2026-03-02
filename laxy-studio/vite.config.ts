import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Firebase project ID — used to build the emulator URL path.
// Override with VITE_GCP_PROJECT env var if different.
const GCP_PROJECT = process.env.VITE_GCP_PROJECT || 'demo-laxy'
const GCP_REGION = process.env.VITE_GCP_REGION || 'us-central1'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
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
})
