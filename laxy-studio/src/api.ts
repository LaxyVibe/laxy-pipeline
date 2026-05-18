// ---------------------------------------------------------------------------
// ADK Pipeline API client + Firebase Storage uploads
// ---------------------------------------------------------------------------

import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
} from 'firebase/storage';
import { initFirebase } from './firebase';
import {
  parseAudioGenerateLanguageResponse,
  parseAudioGenerateResponse,
  parseLanguageTranslationResponse,
  parsePipelineResponse,
  parsePublishGuideResponse,
  type ContractPipelineResponse,
} from './contracts/pipeline';
import type { TranslateLanguageRequest, LanguageTranslation } from './types/translation';

// When VITE_FUNCTIONS_HOST is set (e.g. 'fwnsexu77q-uc.a.run.app'), API calls
// go directly to Cloud Run, bypassing Firebase Hosting's 60-second proxy timeout.
// When not set, falls back to relative '/pipeline/...' paths (Hosting rewrites).
const FUNCTIONS_HOST = import.meta.env.VITE_FUNCTIONS_HOST as string | undefined;
const TRACE_SESSION_STORAGE_KEY = 'laxy.pipeline.traceSessionId';
let inMemoryTraceSessionId: string | null = null;

interface RequestTraceContext {
  endpoint: string;
  traceSessionId: string;
  requestId: string;
  correlationId: string;
  sessionId?: string;
}

/** Build the full URL for a pipeline endpoint. */
function pipelineUrl(endpoint: string): string {
  if (FUNCTIONS_HOST) {
    // Endpoint is like 'start', 'resume', 'status', 'audio-generate', etc.
    // Cloud Run function name: pipeline-start, pipeline-resume, audio-generate, etc.
    const fnName = endpoint.startsWith('audio-') || endpoint.startsWith('translate-') || endpoint.startsWith('generate-')
      ? endpoint                  // audio-generate, audio-generate-language, translate-language, generate-director-note
      : `pipeline-${endpoint}`;   // pipeline-start, pipeline-resume, pipeline-status
    return `https://${fnName}-${FUNCTIONS_HOST}`;
  }
  return `/pipeline/${endpoint}`;
}

function createTraceId(prefix: string): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getTraceSessionId(): string {
  if (inMemoryTraceSessionId) {
    return inMemoryTraceSessionId;
  }
  const storage = getStorage();
  if (storage) {
    const existing = storage.getItem(TRACE_SESSION_STORAGE_KEY);
    if (existing) {
      inMemoryTraceSessionId = existing;
      return existing;
    }
  }
  const created = createTraceId('trace');
  inMemoryTraceSessionId = created;
  if (storage) {
    storage.setItem(TRACE_SESSION_STORAGE_KEY, created);
  }
  return created;
}

function createRequestTraceContext(endpoint: string, sessionId?: string): RequestTraceContext {
  const traceSessionId = getTraceSessionId();
  const requestId = createTraceId('req');
  return {
    endpoint,
    traceSessionId,
    requestId,
    correlationId: `${traceSessionId}:${requestId}`,
    sessionId,
  };
}

function withTraceHeaders(headers: HeadersInit | undefined, trace: RequestTraceContext): Headers {
  const merged = new Headers(headers ?? {});
  merged.set('X-Request-Id', trace.requestId);
  merged.set('X-Correlation-Id', trace.correlationId);
  merged.set('X-Trace-Session-Id', trace.traceSessionId);
  if (trace.sessionId) {
    merged.set('X-Session-Id', trace.sessionId);
  }
  return merged;
}

function canAttachAuthHeader(): boolean {
  return typeof window !== 'undefined' && Boolean(import.meta.env.VITE_FIREBASE_API_KEY);
}

async function getAuthHeaderValue(): Promise<string | null> {
  if (!canAttachAuthHeader()) return null;
  try {
    const { auth } = initFirebase();
    const user = auth.currentUser;
    if (!user) return null;
    const token = await user.getIdToken();
    return token ? `Bearer ${token}` : null;
  } catch (error) {
    console.warn('[PipelineAPI] Unable to resolve Firebase auth token for request', {
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function fetchWithTrace(
  url: string,
  init: RequestInit,
  trace: RequestTraceContext,
): Promise<Response> {
  const startedAt = Date.now();
  console.info('[PipelineAPI]', {
    event: 'http.request.start',
    endpoint: trace.endpoint,
    requestId: trace.requestId,
    correlationId: trace.correlationId,
    traceSessionId: trace.traceSessionId,
    sessionId: trace.sessionId,
    method: init.method ?? 'GET',
  });

  try {
    const authHeader = await getAuthHeaderValue();
    const mergedHeaders = withTraceHeaders(init.headers, trace);
    if (authHeader && !mergedHeaders.has('Authorization')) {
      mergedHeaders.set('Authorization', authHeader);
    }

    const response = await fetch(url, {
      ...init,
      headers: mergedHeaders,
    });
    const responseCorrelationId = typeof response.headers?.get === 'function'
      ? (response.headers.get('X-Correlation-Id') ?? undefined)
      : undefined;
    console.info('[PipelineAPI]', {
      event: 'http.request.finish',
      endpoint: trace.endpoint,
      requestId: trace.requestId,
      correlationId: responseCorrelationId ?? trace.correlationId,
      traceSessionId: trace.traceSessionId,
      sessionId: trace.sessionId,
      method: init.method ?? 'GET',
      status: response.status,
      durationMs: Date.now() - startedAt,
      ok: response.ok,
    });
    return response;
  } catch (error) {
    console.error('[PipelineAPI]', {
      event: 'http.request.error',
      endpoint: trace.endpoint,
      requestId: trace.requestId,
      correlationId: trace.correlationId,
      traceSessionId: trace.traceSessionId,
      sessionId: trace.sessionId,
      method: init.method ?? 'GET',
      durationMs: Date.now() - startedAt,
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export interface ApiErrorEnvelope {
  code?: string;
  message: string;
  details?: unknown;
  retryable?: boolean;
}

export class ApiRequestError extends Error {
  status: number;
  code?: string;
  details?: unknown;
  retryable: boolean;

  constructor(args: {
    message: string;
    status: number;
    code?: string;
    details?: unknown;
    retryable?: boolean;
  }) {
    super(args.message);
    this.name = 'ApiRequestError';
    this.status = args.status;
    this.code = args.code;
    this.details = args.details;
    this.retryable = Boolean(args.retryable);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function detailToText(details: unknown): string | null {
  if (typeof details === 'string') {
    const trimmed = details.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (Array.isArray(details)) {
    const joined = details
      .map((item) => (typeof item === 'string' ? item : JSON.stringify(item)))
      .join(' | ')
      .trim();
    return joined.length > 0 ? joined : null;
  }
  if (isRecord(details)) {
    try {
      const text = JSON.stringify(details);
      return text.length > 0 ? text : null;
    } catch {
      return null;
    }
  }
  return null;
}

function localizeApiErrorMessage(args: {
  status: number;
  code?: string;
  message: string;
  details?: unknown;
}): string {
  const { status, code, message, details } = args;
  const detailText = detailToText(details);

  if (code === 'AUDIO_GENERATION_FAILED') {
    return detailText
      ? `語音生成失敗：${detailText}`
      : '語音生成失敗，請稍後再試。';
  }

  if (code === 'AUTH_REQUIRED') {
    return '尚未登入或登入已過期，請重新登入後再試。';
  }

  if (code === 'FORBIDDEN_SESSION_TENANT_MISMATCH') {
    return '目前帳號無法存取此音訊工作階段，請確認租戶權限。';
  }

  if (status >= 500 && detailText) {
    return `${message}：${detailText}`;
  }

  return message;
}

async function readJsonSafely(res: Response): Promise<unknown | null> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function toApiRequestError(status: number, payload: unknown): ApiRequestError {
  if (isRecord(payload)) {
    const nested = payload.error;
    if (isRecord(nested) && typeof nested.message === 'string') {
      const code = typeof nested.code === 'string' ? nested.code : undefined;
      const details = nested.details;
      return new ApiRequestError({
        status,
        code,
        message: localizeApiErrorMessage({
          status,
          code,
          message: nested.message,
          details,
        }),
        details,
        retryable: Boolean(nested.retryable),
      });
    }

    if (typeof nested === 'string') {
      return new ApiRequestError({ status, message: nested });
    }

    if (typeof payload.message === 'string') {
      return new ApiRequestError({ status, message: payload.message });
    }
  }

  return new ApiRequestError({ status, message: `HTTP ${status}` });
}

async function assertOkOrThrow(res: Response): Promise<void> {
  if (res.ok) return;
  const payload = await readJsonSafely(res);
  throw toApiRequestError(res.status, payload);
}

function parseContractPayload<T>(
  payload: unknown,
  parser: (value: unknown) => T,
  message: string,
): T {
  try {
    return parser(payload);
  } catch (err) {
    throw new ApiRequestError({
      status: 502,
      code: 'INVALID_RESPONSE_SCHEMA',
      message,
      details: err instanceof Error ? err.message : String(err),
      retryable: true,
    });
  }
}

function parsePipelinePayload(payload: unknown): PipelineResponse {
  return parseContractPayload(payload, parsePipelineResponse, 'Invalid pipeline response shape');
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

export type PipelineResponse = ContractPipelineResponse;
export type PipelineStep = PipelineResponse['steps'][number];

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
    scene: string;
    style: string;
    pacing: string;
    compiledPrompt?: string;
    contentVersion?: string;
    scriptEnhancementLimit?: string;
  };
}

export interface PublishGuideRequest {
  sessionId: string;
  publishId?: string;
  retry?: boolean;
  venueName: string;
  coreLanguage: string;
  supportedLanguages: string[];
  customSlug?: string;
  spotsCount: number;
  scriptsCount: number;
  slideshowsCount: number;
  audioCount: number;
  srtCount: number;
}

export interface PublishGuideResponse {
  success: boolean;
  publishId: string;
  status: 'processing' | 'published' | 'failed';
  guideUrl: string;
  shortUrl: string;
  slug: string;
  qrDataUrl: string;
  publishedAt: number;
  retryable?: boolean;
  attempts?: number;
  maxAttempts?: number;
}

// ── helpers ──

export function getExecutedNodes(res: PipelineResponse): string[] {
  return (res.steps ?? []).map((s) => s.label);
}

export function getExecutedStepIds(res: PipelineResponse): string[] {
  return (res.steps ?? []).map((s) => s.stepId);
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

export function getNodeOutputByStepId(res: PipelineResponse, stepId: string): unknown {
  const step = (res.steps ?? []).find((s) => s.stepId === stepId);
  return step?.output ?? null;
}

export function getNodeOutput(res: PipelineResponse, stepId: string): unknown {
  const step = (res.steps ?? []).find((s) => s.stepId === stepId);
  return step?.output ?? null;
}

export function getNodeOutputByLabel(res: PipelineResponse, label: string): unknown {
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
  const trace = createRequestTraceContext('pipeline.status', sessionId);
  const res = await fetchWithTrace(
    `${pipelineUrl('status')}?sessionId=${encodeURIComponent(sessionId)}`,
    {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    },
    trace,
  );
  await assertOkOrThrow(res);
  const payload = await readJsonSafely(res);
  if (payload == null) {
    throw new ApiRequestError({
      status: 502,
      code: 'INVALID_JSON_RESPONSE',
      message: 'Invalid JSON response body',
      retryable: true,
    });
  }
  return parsePipelinePayload(payload);
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

export interface AudioSessionBootstrapRequest {
  sessionId: string;
  context?: PipelineContext;
}

export interface AudioSessionBootstrapResponse {
  success: boolean;
  sessionId: string;
  status: 'created' | 'exists';
  tenantId?: string;
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
  const trace = createRequestTraceContext('pipeline.start', sessionId);
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
  if (context) {
    body.context = {
      ...context,
      traceSessionId: trace.traceSessionId,
      correlationId: trace.correlationId,
    };
  }

  const res = await fetchWithTrace(`${pipelineUrl('start')}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, trace);
  await assertOkOrThrow(res);
  const payload = await readJsonSafely(res);
  if (payload == null) {
    throw new ApiRequestError({
      status: 502,
      code: 'INVALID_JSON_RESPONSE',
      message: 'Invalid JSON response body',
      retryable: true,
    });
  }
  return parsePipelinePayload(payload);
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
  const trace = createRequestTraceContext('pipeline.resume', sessionId);
  const res = await fetchWithTrace(`${pipelineUrl('resume')}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      checkpointId,
      action: action === 'proceed' ? 'approve' : action,
      feedback,
    }),
  }, trace);
  await assertOkOrThrow(res);
  const payload = await readJsonSafely(res);
  if (payload == null) {
    throw new ApiRequestError({
      status: 502,
      code: 'INVALID_JSON_RESPONSE',
      message: 'Invalid JSON response body',
      retryable: true,
    });
  }
  return parsePipelinePayload(payload);
}

export async function bootstrapAudioSession(
  request: AudioSessionBootstrapRequest,
): Promise<AudioSessionBootstrapResponse> {
  const trace = createRequestTraceContext('pipeline.audio_session_bootstrap', request.sessionId);
  const body: Record<string, unknown> = {
    sessionId: request.sessionId,
  };
  if (request.context) {
    body.context = {
      ...request.context,
      traceSessionId: trace.traceSessionId,
      correlationId: trace.correlationId,
    };
  }

  const res = await fetchWithTrace(`${pipelineUrl('audio-session-bootstrap')}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, trace);
  await assertOkOrThrow(res);
  const payload = await readJsonSafely(res);
  if (!isRecord(payload)) {
    throw new ApiRequestError({
      status: 502,
      code: 'INVALID_JSON_RESPONSE',
      message: 'Invalid JSON response body',
      retryable: true,
    });
  }

  const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : '';
  const status = payload.status === 'created' || payload.status === 'exists' ? payload.status : null;
  if (!sessionId || !status) {
    throw new ApiRequestError({
      status: 502,
      code: 'INVALID_RESPONSE_SCHEMA',
      message: 'Invalid audio session bootstrap response shape',
      retryable: true,
    });
  }

  return {
    success: payload.success !== false,
    sessionId,
    status,
    tenantId: typeof payload.tenantId === 'string' ? payload.tenantId : undefined,
  };
}

export async function publishGuide(
  request: PublishGuideRequest,
): Promise<PublishGuideResponse> {
  const trace = createRequestTraceContext('pipeline.publish', request.sessionId);
  const res = await fetchWithTrace(`${pipelineUrl('publish')}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  }, trace);
  await assertOkOrThrow(res);
  const payload = await readJsonSafely(res);
  if (payload == null) {
    throw new ApiRequestError({
      status: 502,
      code: 'INVALID_JSON_RESPONSE',
      message: 'Invalid JSON response body',
      retryable: true,
    });
  }
  return parseContractPayload(
    payload,
    parsePublishGuideResponse,
    'Invalid publish response shape',
  );
}

export async function fetchPublishStatus(publishId: string): Promise<PublishGuideResponse> {
  const params = new URLSearchParams({ publishId });
  const trace = createRequestTraceContext('pipeline.publish_status');
  const res = await fetchWithTrace(`${pipelineUrl('publish-status')}?${params.toString()}`, {
    method: 'GET',
  }, trace);
  await assertOkOrThrow(res);
  const payload = await readJsonSafely(res);
  if (payload == null) {
    throw new ApiRequestError({
      status: 502,
      code: 'INVALID_JSON_RESPONSE',
      message: 'Invalid JSON response body',
      retryable: true,
    });
  }
  return parseContractPayload(
    payload,
    parsePublishGuideResponse,
    'Invalid publish status response shape',
  );
}

/**
 * Generate TTS audio for scripts via the dedicated audio endpoint.
 * Calls Gemini TTS on the backend, uploads WAV to Storage, returns URLs.
 */
export async function generateAudio(
  request: AudioGenerateRequest,
): Promise<AudioGenerateResponse> {
  const trace = createRequestTraceContext('pipeline.audio_generate', request.sessionId);
  const res = await fetchWithTrace(`${pipelineUrl('audio-generate')}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  }, trace);
  await assertOkOrThrow(res);
  const payload = await readJsonSafely(res);
  if (payload == null) {
    throw new ApiRequestError({
      status: 502,
      code: 'INVALID_JSON_RESPONSE',
      message: 'Invalid JSON response body',
      retryable: true,
    });
  }
  return parseContractPayload(
    payload,
    parseAudioGenerateResponse,
    'Invalid audio generation response shape',
  );
}

// ── Per-language audio generation ──

export interface AudioGenerateLanguageRequest {
  sessionId: string;
  scripts: Array<{ spotId: string; spotNumber: number; title: string; scriptText: string }>;
  voiceId: string;
  language: string;
  directorNote?: {
    scene: string;
    style: string;
    pacing: string;
    compiledPrompt?: string;
    contentVersion?: string;
    scriptEnhancementLimit?: string;
  };
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
  const trace = createRequestTraceContext('pipeline.audio_generate_language', request.sessionId);
  const res = await fetchWithTrace(`${pipelineUrl('audio-generate-language')}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  }, trace);
  await assertOkOrThrow(res);
  const payload = await readJsonSafely(res);
  if (payload == null) {
    throw new ApiRequestError({
      status: 502,
      code: 'INVALID_JSON_RESPONSE',
      message: 'Invalid JSON response body',
      retryable: true,
    });
  }
  return parseContractPayload(
    payload,
    parseAudioGenerateLanguageResponse,
    'Invalid per-language audio response shape',
  );
}

export async function translateLanguage(
  request: TranslateLanguageRequest,
): Promise<LanguageTranslation> {
  const trace = createRequestTraceContext('pipeline.translate_language');
  const res = await fetchWithTrace(`${pipelineUrl('translate-language')}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  }, trace);
  await assertOkOrThrow(res);
  const payload = await readJsonSafely(res);
  if (payload == null) {
    throw new ApiRequestError({
      status: 502,
      code: 'INVALID_JSON_RESPONSE',
      message: 'Invalid JSON response body',
      retryable: true,
    });
  }
  return parseContractPayload(
    payload,
    parseLanguageTranslationResponse,
    'Invalid translation response shape',
  );
}


// ── Director Note AI Generation ──

export interface GenerateDirectorNoteRequest {
  scriptContent: string;
  characterName?: string;
  characterRole?: string;
  contentVersion?: string;
  context?: string;
}

export interface GenerateDirectorNoteResponse {
  success: boolean;
  directorNote: {
    scene: string;
    style: string;
    pacing: string;
  };
}

export async function generateDirectorNote(
  request: GenerateDirectorNoteRequest,
): Promise<GenerateDirectorNoteResponse> {
  const trace = createRequestTraceContext('pipeline.generate_director_note');
  const res = await fetchWithTrace(`${pipelineUrl('generate-director-note')}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  }, trace);
  await assertOkOrThrow(res);
  const payload = await readJsonSafely(res);
  if (payload == null) {
    throw new ApiRequestError({
      status: 502,
      code: 'INVALID_JSON_RESPONSE',
      message: 'Invalid JSON response body',
      retryable: true,
    });
  }
  const data = payload as GenerateDirectorNoteResponse;
  if (!data.directorNote) {
    throw new ApiRequestError({
      status: 502,
      code: 'INVALID_RESPONSE_SHAPE',
      message: 'Missing directorNote in response',
      retryable: true,
    });
  }
  return data;
}


// ── Script Enhancement AI Generation ──

export interface EnhanceScriptRequest {
  scriptContent: string;
  characterName?: string;
  characterRole?: string;
  contextDirective?: string;
}

export interface EnhanceScriptResponse {
  success: boolean;
  enhancedScript: string;
}

export async function enhanceScript(
  request: EnhanceScriptRequest,
): Promise<EnhanceScriptResponse> {
  const trace = createRequestTraceContext('pipeline.enhance_script');
  const res = await fetchWithTrace(`${pipelineUrl('enhance-script')}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  }, trace);
  await assertOkOrThrow(res);
  const payload = await readJsonSafely(res);
  if (payload == null) {
    throw new ApiRequestError({
      status: 502,
      code: 'INVALID_JSON_RESPONSE',
      message: 'Invalid JSON response body',
      retryable: true,
    });
  }
  const data = payload as EnhanceScriptResponse;
  if (!data.enhancedScript && data.enhancedScript !== '') {
    throw new ApiRequestError({
      status: 502,
      code: 'INVALID_RESPONSE_SHAPE',
      message: 'Missing enhancedScript in response',
      retryable: true,
    });
  }
  return data;
}


// ── Japanese Hiragana Narration Conversion ──

export interface GenerateJapaneseHiraganaRequest {
  scriptContent: string;
}

export interface GenerateJapaneseHiraganaResponse {
  success: boolean;
  hiraganaText: string;
}

export async function generateJapaneseHiragana(
  request: GenerateJapaneseHiraganaRequest,
): Promise<GenerateJapaneseHiraganaResponse> {
  const trace = createRequestTraceContext('pipeline.generate_japanese_hiragana');
  const res = await fetchWithTrace(`${pipelineUrl('generate-japanese-hiragana')}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  }, trace);
  await assertOkOrThrow(res);
  const payload = await readJsonSafely(res);
  if (payload == null) {
    throw new ApiRequestError({
      status: 502,
      code: 'INVALID_JSON_RESPONSE',
      message: 'Invalid JSON response body',
      retryable: true,
    });
  }
  const data = payload as GenerateJapaneseHiraganaResponse;
  if (!data.hiraganaText && data.hiraganaText !== '') {
    throw new ApiRequestError({
      status: 502,
      code: 'INVALID_RESPONSE_SHAPE',
      message: 'Missing hiraganaText in response',
      retryable: true,
    });
  }
  return data;
}


// ── Character Generation AI ──

export interface GenerateCharacterRequest {
  designerPrompt: string;
}

export interface GenerateCharacterResponse {
  success: boolean;
  character: {
    name: string;
    role: string;
    avatar: string;
    genderIdentity: 'masculine' | 'feminine' | 'neutral';
    coreTimbre: string;
    personalityDNA: string;
    linguisticFingerprint: string;
    brandPersona: string;
    accent: string;
    staticInstruction: string;
  };
}

export async function generateCharacter(
  request: GenerateCharacterRequest,
): Promise<GenerateCharacterResponse> {
  const trace = createRequestTraceContext('pipeline.generate_character');
  const res = await fetchWithTrace(`${pipelineUrl('generate-character')}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  }, trace);
  await assertOkOrThrow(res);
  const payload = await readJsonSafely(res);
  if (payload == null) {
    throw new ApiRequestError({
      status: 502,
      code: 'INVALID_JSON_RESPONSE',
      message: 'Invalid JSON response body',
      retryable: true,
    });
  }
  const data = payload as GenerateCharacterResponse;
  if (!data.character || !data.character.name) {
    throw new ApiRequestError({
      status: 502,
      code: 'INVALID_RESPONSE_SHAPE',
      message: 'Missing character in response',
      retryable: true,
    });
  }
  return data;
}
