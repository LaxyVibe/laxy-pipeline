// ---------------------------------------------------------------------------
// ADK Pipeline API client + Firebase Storage uploads
// ---------------------------------------------------------------------------

import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
} from 'firebase/storage';
import { initFirebase } from './firebase';

const PIPELINE_BASE = '/pipeline';

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

// ── helpers ──

export function getExecutedNodes(res: PipelineResponse): string[] {
  return (res.steps ?? []).map((s) => s.label);
}

export function getLastStatus(res: PipelineResponse): string {
  const steps = res.steps ?? [];
  return steps.length ? steps[steps.length - 1].status : 'UNKNOWN';
}

export function getStoppedNodeId(res: PipelineResponse): string | null {
  return res.checkpointId ?? null;
}

export function getNodeOutput(res: PipelineResponse, label: string): unknown {
  const step = (res.steps ?? []).find((s) => s.label === label);
  return step?.output ?? null;
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

/**
 * Start the ADK pipeline.
 * If `files` are provided, they are converted to base64 and sent in the
 * `uploads` array so the LLM node receives them as file attachments.
 */
export async function startPipeline(
  question: string,
  sessionId: string,
  files?: File[],
): Promise<PipelineResponse> {
  // Build uploads array from raw File objects
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

  const res = await fetch(`${PIPELINE_BASE}/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * Resume the pipeline from a human gate checkpoint.
 * Maps old 'proceed'/'reject' to new 'approve'/'reject' actions.
 */
export async function sendHumanInput(
  sessionId: string,
  action: 'approve' | 'reject' | 'proceed',
  checkpointId: string,
  feedback: string,
): Promise<PipelineResponse> {
  const res = await fetch(`${PIPELINE_BASE}/resume`, {
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
