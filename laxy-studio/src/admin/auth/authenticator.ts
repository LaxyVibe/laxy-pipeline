// ---------------------------------------------------------------------------
// FireCMS Authenticator — RBAC gate for admin access
// ---------------------------------------------------------------------------
import type { Authenticator, User } from '@firecms/core';

/**
 * Custom claims expected on the Firebase ID token.
 * Set via Firebase Admin SDK (Cloud Function or server).
 */
export interface LaxyCustomClaims {
  role?: 'super-admin' | 'client-admin' | 'client-editor';
  tenantId?: string;
}

/**
 * Read custom claims from the current Firebase ID token.
 */
export async function getCustomClaims(user: User): Promise<LaxyCustomClaims> {
  if (!user.getIdToken) return {};
  try {
    const token = await user.getIdToken(true);
    // Decode JWT payload (claims are in the second segment)
    const payload = JSON.parse(atob(token.split('.')[1]));
    return {
      role: payload.role,
      tenantId: payload.tenantId,
    };
  } catch {
    return {};
  }
}

/**
 * FireCMS Authenticator callback.
 * Returns `true` only if the user has one of the allowed admin roles.
 *
 * During development (no custom claims set yet), any authenticated user
 * is allowed so you can bootstrap the first Super Admin account.
 */
export const laxyAuthenticator: Authenticator = async ({ user }) => {
  if (!user) return false;

  const claims = await getCustomClaims(user);

  // Allow access if the user has any recognised role
  if (claims.role) {
    return ['super-admin', 'client-admin', 'client-editor'].includes(claims.role);
  }

  // Development fallback: allow any authenticated user
  if (import.meta.env.DEV) {
    console.warn(
      '[LaxyAdmin] No custom claims found — granting dev access. Set claims in production.',
    );
    return true;
  }

  return false;
};
