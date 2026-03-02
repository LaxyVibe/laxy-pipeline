// ---------------------------------------------------------------------------
// useFirestore — generic Firestore CRUD hook
// ---------------------------------------------------------------------------
import { useCallback, useEffect, useState } from 'react';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  type QueryConstraint,
  type DocumentData,
  serverTimestamp,
} from 'firebase/firestore';
import { initFirebase } from '../firebase';

export interface UseFirestoreOptions {
  /** Subscribe to real-time updates instead of a one-time fetch */
  realtime?: boolean;
}

/**
 * Generic Firestore CRUD operations for a given collection.
 *
 * Usage:
 * ```ts
 * const { data, loading, error, create, update, remove } = useFirestore<Guide>('guides');
 * ```
 */
export function useFirestore<T extends DocumentData & { id?: string }>(
  collectionName: string,
  constraints: QueryConstraint[] = [],
  options: UseFirestoreOptions = {},
) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { db } = initFirebase();
  const colRef = collection(db, collectionName);

  // ── List / subscribe ──
  useEffect(() => {
    setLoading(true);
    setError(null);

    if (options.realtime) {
      const q = query(colRef, ...constraints);
      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const docs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as T));
          setData(docs);
          setLoading(false);
        },
        (err) => {
          setError(err.message);
          setLoading(false);
        },
      );
      return unsubscribe;
    }

    // One-time fetch
    const q = query(colRef, ...constraints);
    getDocs(q)
      .then((snapshot) => {
        const docs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as T));
        setData(docs);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionName, options.realtime]);

  // ── Get single document ──
  const get = useCallback(
    async (docId: string): Promise<T | null> => {
      const snap = await getDoc(doc(db, collectionName, docId));
      return snap.exists() ? ({ id: snap.id, ...snap.data() } as T) : null;
    },
    [db, collectionName],
  );

  // ── Create / overwrite ──
  const create = useCallback(
    async (docId: string, payload: Omit<T, 'id'>) => {
      await setDoc(doc(db, collectionName, docId), {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    },
    [db, collectionName],
  );

  // ── Update (merge) ──
  const update = useCallback(
    async (docId: string, payload: Partial<T>) => {
      await updateDoc(doc(db, collectionName, docId), {
        ...payload,
        updatedAt: serverTimestamp(),
      });
    },
    [db, collectionName],
  );

  // ── Delete ──
  const remove = useCallback(
    async (docId: string) => {
      await deleteDoc(doc(db, collectionName, docId));
    },
    [db, collectionName],
  );

  return { data, loading, error, get, create, update, remove };
}
