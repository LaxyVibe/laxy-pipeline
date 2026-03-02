// ---------------------------------------------------------------------------
// useTenantScope — filter queries by the current user's tenant
// ---------------------------------------------------------------------------
import { useState, useEffect } from 'react';
import { getCustomClaims, type LaxyCustomClaims } from '../admin/auth/authenticator';
import type { User } from '@firecms/core';

export interface TenantScope {
  /** The tenant ID from custom claims (undefined for Super Admins or if not yet loaded) */
  tenantId: string | undefined;
  /** The role from custom claims */
  role: LaxyCustomClaims['role'];
  /** Whether claims have been resolved */
  loading: boolean;
  /** True if the user is a Super Admin with cross-tenant access */
  isSuperAdmin: boolean;
}

/**
 * Hook that resolves the current user's tenant scope from Firebase custom claims.
 * Use this to scope Firestore queries and restrict UI elements.
 */
export function useTenantScope(user: User | null): TenantScope {
  const [tenantId, setTenantId] = useState<string | undefined>();
  const [role, setRole] = useState<LaxyCustomClaims['role']>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setTenantId(undefined);
      setRole(undefined);
      setLoading(false);
      return;
    }

    let cancelled = false;

    getCustomClaims(user).then((claims) => {
      if (cancelled) return;
      setTenantId(claims.tenantId);
      setRole(claims.role);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [user]);

  return {
    tenantId,
    role,
    loading,
    isSuperAdmin: role === 'super-admin',
  };
}
