// ---------------------------------------------------------------------------
// useFeatureFlags — read feature flags for conditional rendering
// ---------------------------------------------------------------------------
import { useState, useEffect } from 'react';
import {
  collection,
  getDocs,
  query,
  where,
  onSnapshot,
  type QuerySnapshot,
  type DocumentData,
} from 'firebase/firestore';
import { initFirebase } from '../firebase';

export interface FeatureFlag {
  id: string;
  name: string;
  description: string;
  enabledGlobally: boolean;
  tenantOverrides: Record<string, boolean>;
}

/**
 * Hook that subscribes to the feature flags collection and returns
 * a lookup function `isEnabled(flagName, tenantId?)` that resolves
 * tenant-specific overrides falling back to the global setting.
 */
export function useFeatureFlags() {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { db } = initFirebase();
    const colRef = collection(db, '_platform', 'featureFlags');

    // Real-time subscription
    const unsub = onSnapshot(
      colRef,
      (snapshot: QuerySnapshot<DocumentData>) => {
        const result: FeatureFlag[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          result.push({
            id: doc.id,
            name: data.name ?? '',
            description: data.description ?? '',
            enabledGlobally: data.enabledGlobally ?? false,
            tenantOverrides: data.tenantOverrides ?? {},
          });
        });
        setFlags(result);
        setLoading(false);
      },
      (error) => {
        console.error('[useFeatureFlags] subscription error:', error);
        setLoading(false);
      },
    );

    return unsub;
  }, []);

  /**
   * Check whether a feature flag is enabled.
   * Tenant override takes precedence over the global setting.
   */
  function isEnabled(flagName: string, tenantId?: string): boolean {
    const flag = flags.find((f) => f.name === flagName);
    if (!flag) return false;

    if (tenantId && tenantId in flag.tenantOverrides) {
      return flag.tenantOverrides[tenantId];
    }

    return flag.enabledGlobally;
  }

  return { flags, loading, isEnabled };
}
