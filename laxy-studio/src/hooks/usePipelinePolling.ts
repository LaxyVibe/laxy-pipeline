// ---------------------------------------------------------------------------
// usePipelinePolling — poll backend for pipeline status on long-running runs
// ---------------------------------------------------------------------------
import { useEffect, useRef, useCallback, useState } from 'react';
import { fetchPipelineStatus, getLastStatus, type PipelineResponse } from '../api';
import { usePipelineSync } from './usePipelineSync';

const DEFAULT_INTERVAL_MS = 5_000;
const MAX_CONSECUTIVE_ERRORS = 5;

/**
 * Poll `GET /pipeline/status?sessionId=...` at a regular interval while
 * the pipeline is active. Automatically stops when the pipeline reaches
 * a STOPPED (human gate) or FINISHED state, or after too many consecutive
 * failures.
 *
 * Usage:
 *   const { isPolling, lastResponse, error, startPolling, stopPolling } = usePipelinePolling();
 *   startPolling('session-abc');
 */
export function usePipelinePolling(intervalMs = DEFAULT_INTERVAL_MS) {
  const [isPolling, setIsPolling] = useState(false);
  const [lastResponse, setLastResponse] = useState<PipelineResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionRef = useRef<string | null>(null);
  const errorCountRef = useRef(0);
  const { applyResponse } = usePipelineSync();

  const stopPolling = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsPolling(false);
    sessionRef.current = null;
    errorCountRef.current = 0;
  }, []);

  const poll = useCallback(async () => {
    const sid = sessionRef.current;
    if (!sid) return;

    try {
      const res = await fetchPipelineStatus(sid);
      setLastResponse(res);
      setError(null);
      errorCountRef.current = 0;
      applyResponse(res);

      const status = getLastStatus(res);
      if (status === 'STOPPED' || status === 'FINISHED' || status === 'ERROR') {
        stopPolling();
      }
    } catch (err: unknown) {
      errorCountRef.current += 1;
      const msg = err instanceof Error ? err.message : 'Polling failed';
      console.warn(`[usePipelinePolling] Poll error (${errorCountRef.current}/${MAX_CONSECUTIVE_ERRORS}):`, msg);
      if (errorCountRef.current >= MAX_CONSECUTIVE_ERRORS) {
        setError(`Pipeline polling failed after ${MAX_CONSECUTIVE_ERRORS} attempts: ${msg}`);
        stopPolling();
      }
    }
  }, [applyResponse, stopPolling]);

  const startPolling = useCallback(
    (sessionId: string) => {
      // Stop any existing polling
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      sessionRef.current = sessionId;
      setIsPolling(true);
      setError(null);
      errorCountRef.current = 0;
      // Immediate first poll, then interval
      poll();
      timerRef.current = setInterval(poll, intervalMs);
    },
    [poll, intervalMs],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  return { isPolling, lastResponse, error, startPolling, stopPolling };
}
