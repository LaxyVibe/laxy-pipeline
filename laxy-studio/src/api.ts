// ---------------------------------------------------------------------------
// ADK Pipeline API client + Firebase Storage uploads
// ---------------------------------------------------------------------------

import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
} from 'firebase/storage';
import { initFirebase } from './firebase';

// When VITE_FUNCTIONS_HOST is set (e.g. 'fwnsexu77q-uc.a.run.app'), API calls
// go directly to Cloud Run, bypassing Firebase Hosting's 60-second proxy timeout.
// When not set, falls back to relative '/pipeline/...' paths (Hosting rewrites).
const FUNCTIONS_HOST = import.meta.env.VITE_FUNCTIONS_HOST as string | undefined;

/** Build the full URL for a pipeline endpoint. */
function pipelineUrl(endpoint: string): string {
  if (FUNCTIONS_HOST) {
    // Endpoint is like 'start', 'resume', 'status', 'audio-generate', etc.
    // Cloud Run function name: pipeline-start, pipeline-resume, audio-generate, etc.
    const fnName = endpoint.startsWith('audio-') || endpoint.startsWith('translate-')
      ? endpoint                  // audio-generate, audio-generate-language, translate-language
      : `pipeline-${endpoint}`;   // pipeline-start, pipeline-resume, pipeline-status
    return `https://${fnName}-${FUNCTIONS_HOST}`;
  }
  return `/pipeline/${endpoint}`;
}

// ── Firebase Storage upload ──

export interface UploadAssetResult {
  downloadUrl: string;
  storagePath: string;
}

/**
 * Upload a file to Firebase Storage under `assets/{assetId}/{filename}`.
 * Reports progress via the optional `onProgress` callback (0–100).
 */
export function uploadAssetToStorage(
  file: File,
  assetId: string,
  onProgress?: (pct: number) => void,
): Promise<UploadAssetResult> {
  const { storage } = initFirebase();
  const storagePath = `assets/${assetId}/${file.name}`;
  const storageRef = ref(storage, storagePath);
  const task = uploadBytesResumable(storageRef, file);

  return new Promise((resolve, reject) => {
    task.on(
      'state_changed',
      (snap) => {
        const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
        onProgress?.(pct);
      },
      (err) => reject(err),
      async () => {
        try {
          const downloadUrl = await getDownloadURL(task.snapshot.ref);
          resolve({ downloadUrl, storagePath });
        } catch (err) {
          reject(err);
        }
      },
    );
  });
}

// ── ADK Pipeline types ──

export interface PipelineStep {
  stepId: string;
  label: string;
  status: 'FINISHED' | 'STOPPED' | 'RUNNING' | 'ERROR';
  output?: Record<string, unknown> | null;
}

export interface PipelineResponse {
  sessionId: string;
  checkpointId?: string | null;
  steps: PipelineStep[];
  finalText?: string | null;
  status?: string;
}

/** Upload metadata sent to the pipeline backend */
export interface PipelineUpload {
  data: string;   // base64 data URI
  name: string;   // original filename
  mime: string;   // MIME type
}

// ── Audio generation types ──

export interface AudioFileResult {
  lang: string;
  spotId: string;
  spotNumber?: number;
  title?: string;
  audioUrl: string;
  durationMs: number;
  voiceId?: string;
  model?: string;
  error?: string;
}

export interface SrtFileResult {
  lang: string;
  spotId: string;
  entries: {
    index: number;
    startTime: string;
    endTime: string;
    text: string;
  }[];
  rawSrt: string;
}

export interface AudioGenerateResponse {
  success: boolean;
  audioFiles: AudioFileResult[];
  srtFiles: SrtFileResult[];
  totalAudioFiles: number;
  totalSrtFiles: number;
  error?: string;
}

export interface AudioGenerateRequest {
  sessionId: string;
  scripts: {
    spotId: string;
    spotNumber: number;
    title: string;
    scriptText: string;
  }[];
  voiceId: string;
  languages: string[];
  /** Per-language translated scripts — keys are language codes */
  translations?: Record<string, { spotId: string; translatedText: string }[]>;
  directorNote?: {
    vocalEnvironment: string;
    mission: string;
    pacing: string;
  };
}

// ── helpers ──

export function getExecutedNodes(res: PipelineResponse): string[] {
  return (res.steps ?? []).map((s) => s.label);
}

export function getLastStatus(res: PipelineResponse): string {
  const steps = res.steps ?? [];
  if (steps.length) return steps[steps.length - 1].status;
  // Fallback: derive from session-level status when no steps are present
  return normalizeSessionStatus(res.status);
}

/**
 * Map backend session-level status values to the frontend conventions.
 *
 * Backend uses: "running" | "awaiting_input" | "completed" | "error"
 * Frontend uses: "RUNNING" | "STOPPED" | "FINISHED" | "ERROR"
 */
export function normalizeSessionStatus(status?: string): string {
  switch (status) {
    case 'awaiting_input':
      return 'STOPPED';
    case 'completed':
      return 'FINISHED';
    case 'error':
      return 'ERROR';
    case 'running':
      return 'RUNNING';
    default:
      return 'UNKNOWN';
  }
}

export function getStoppedNodeId(res: PipelineResponse): string | null {
  return res.checkpointId ?? null;
}

export function getNodeOutput(res: PipelineResponse, label: string): unknown {
  const step = (res.steps ?? []).find((s) => s.label === label);
  return step?.output ?? null;
}

/**
 * Poll the pipeline status for reconnection / long-running workflows.
 * Uses the GET /pipeline/status endpoint.
 */
export async function fetchPipelineStatus(
  sessionId: string,
): Promise<PipelineResponse> {
  const res = await fetch(
    `${pipelineUrl('status')}?sessionId=${encodeURIComponent(sessionId)}`,
    {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── API calls ──

/** Convert a File to a base64 data URI string */
function fileToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Context payload sent alongside pipeline start */
export interface PipelineContext {
  venueName?: string;
  coreLanguage?: string;
  supportedLanguages?: string[];
  enabledModules?: string[];
  selectedLayout?: string;
  selectedCharacterId?: string;
  [key: string]: unknown;
}

/**
 * Start the ADK pipeline.
 * If `files` are provided, they are converted to base64 and sent in the
 * `uploads` array so the LLM node receives them as file attachments.
 * If `context` is provided, it is sent alongside so downstream steps
 * can use entity config, language preferences, etc.
 */
export async function startPipeline(
  question: string,
  sessionId: string,
  files?: File[],
  context?: PipelineContext,
): Promise<PipelineResponse> {
  let uploads: PipelineUpload[] | undefined;
  if (files && files.length > 0) {
    uploads = await Promise.all(
      files.map(async (f) => ({
        data: await fileToDataUri(f),
        name: f.name,
        mime: f.type,
      })),
    );
  }

  const body: Record<string, unknown> = {
    question,
    sessionId,
  };
  if (uploads) body.uploads = uploads;
  if (context) body.context = context;

  const res = await fetch(`${pipelineUrl('start')}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * Resume the pipeline from a human gate checkpoint.
 * Feedback can be a plain string or a JSON string containing structured
 * human edits (edited scripts, approved spots, etc.) that the backend
 * will parse and merge into pipeline outputs for downstream steps.
 */
export async function sendHumanInput(
  sessionId: string,
  action: 'approve' | 'reject' | 'proceed',
  checkpointId: string,
  feedback: string,
): Promise<PipelineResponse> {
  const res = await fetch(`${pipelineUrl('resume')}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      checkpointId,
      action: action === 'proceed' ? 'approve' : action,
      feedback,
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * Generate TTS audio for scripts via the dedicated audio endpoint.
 * Calls Gemini TTS on the backend, uploads WAV to Storage, returns URLs.
 */
export async function generateAudio(
  request: AudioGenerateRequest,
): Promise<AudioGenerateResponse> {
  const res = await fetch(`${pipelineUrl('audio-generate')}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error((errBody as Record<string, string>).error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Per-language audio generation ──

export interface AudioGenerateLanguageRequest {
  sessionId: string;
  scripts: Array<{ spotId: string; spotNumber: number; title: string; scriptText: string }>;
  voiceId: string;
  language: string;
  directorNote?: { vocalEnvironment: string; mission: string; pacing: string };
  translations?: Array<{ spotId: string; translatedText: string }>;
}

export interface AudioGenerateLanguageResponse {
  lang: string;
  audioFiles: Array<{
    lang: string;
    spotId: string;
    spotNumber: number;
    title: string;
    audioUrl: string;
    durationMs: number;
    voiceId?: string;
    model?: string;
    error?: string;
  }>;
  srtFiles: Array<{
    lang: string;
    spotId: string;
    entries: Array<{ index: number; startTime: string; endTime: string; text: string }>;
    rawSrt: string;
  }>;
}

export async function generateAudioForLanguage(
  request: AudioGenerateLanguageRequest,
): Promise<AudioGenerateLanguageResponse> {
  const res = await fetch(`${pipelineUrl('audio-generate-language')}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error((errBody as Record<string, string>).error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Per-language translation ──
import type { TranslateLanguageRequest, LanguageTranslation } from './types/translation';

export async function translateLanguage(
  request: TranslateLanguageRequest,
): Promise<LanguageTranslation> {
  const res = await fetch(`${pipelineUrl('translate-language')}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error((errBody as Record<string, string>).error ?? `HTTP ${res.status}`);
  }
  return res.json();
}
