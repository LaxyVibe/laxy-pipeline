// ---------------------------------------------------------------------------
// useAutosave — debounced auto-save hook for wizard state
// ---------------------------------------------------------------------------
import { useEffect, useRef } from 'react';
import { useGuidesStore } from '../guidesStore';

/**
 * Watches `isDirty` flag on the guides store and triggers a save after
 * `delayMs` of inactivity. Skips if auto-save is disabled or nothing changed.
 */
export function useAutosave(delayMs = 2000) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const isDirty = useGuidesStore((s) => s.isDirty);
  const autoSaveEnabled = useGuidesStore((s) => s.autoSaveEnabled);
  const saveDraft = useGuidesStore((s) => s.saveDraft);

  useEffect(() => {
    if (!isDirty || !autoSaveEnabled) return;

    timerRef.current = setTimeout(() => {
      saveDraft();
    }, delayMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isDirty, autoSaveEnabled, saveDraft, delayMs]);
}
