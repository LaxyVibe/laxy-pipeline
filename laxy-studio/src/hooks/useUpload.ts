// ---------------------------------------------------------------------------
// useUpload — Firebase Storage upload hook
// ---------------------------------------------------------------------------
import { useCallback, useRef, useState } from 'react';
import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
  type UploadTask,
} from 'firebase/storage';
import { initFirebase } from '../firebase';

export interface UploadResult {
  /** Firebase Storage download URL */
  downloadUrl: string;
  /** Full storage path */
  storagePath: string;
}

export interface UseUploadReturn {
  /** Upload a single File, reporting progress. Returns the download URL. */
  upload: (file: File, storagePath: string) => Promise<UploadResult>;
  /** Upload progress 0–100 (null when idle) */
  progress: number | null;
  /** True while an upload is in flight */
  uploading: boolean;
  /** Error message from the last failed upload */
  error: string | null;
  /** Cancel the current upload */
  cancel: () => void;
}

/**
 * Hook wrapping Firebase Storage `uploadBytesResumable` with progress tracking.
 *
 * Usage:
 * ```ts
 * const { upload, progress, uploading, error, cancel } = useUpload();
 * const { downloadUrl } = await upload(file, `guides/${guideId}/assets/${file.name}`);
 * ```
 */
export function useUpload(): UseUploadReturn {
  const [progress, setProgress] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const taskRef = useRef<UploadTask | null>(null);

  const upload = useCallback(
    (file: File, storagePath: string): Promise<UploadResult> => {
      const { storage } = initFirebase();
      setUploading(true);
      setProgress(0);
      setError(null);

      return new Promise<UploadResult>((resolve, reject) => {
        const storageRef = ref(storage, storagePath);
        const task = uploadBytesResumable(storageRef, file);
        taskRef.current = task;

        task.on(
          'state_changed',
          (snap) => {
            const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
            setProgress(pct);
          },
          (err) => {
            setError(err.message);
            setUploading(false);
            setProgress(null);
            taskRef.current = null;
            reject(err);
          },
          async () => {
            try {
              const downloadUrl = await getDownloadURL(task.snapshot.ref);
              setUploading(false);
              setProgress(100);
              taskRef.current = null;
              resolve({ downloadUrl, storagePath });
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : 'Failed to get download URL';
              setError(message);
              setUploading(false);
              setProgress(null);
              taskRef.current = null;
              reject(err);
            }
          },
        );
      });
    },
    [],
  );

  const cancel = useCallback(() => {
    taskRef.current?.cancel();
    taskRef.current = null;
    setUploading(false);
    setProgress(null);
  }, []);

  return { upload, progress, uploading, error, cancel };
}
