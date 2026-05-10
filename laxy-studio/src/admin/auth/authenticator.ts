// ---------------------------------------------------------------------------
// FireCMS Authenticator — RBAC gate for admin access
// ---------------------------------------------------------------------------
import type { Authenticator, Role, User } from '@firecms/core';

/**
 * Custom claims expected on the Firebase ID token.
 * Set via Firebase Admin SDK (Cloud Function or server).
 */
export interface LaxyCustomClaims {
  role?: 'super-admin' | 'client-admin' | 'client-editor';
  tenantId?: string;
}

const ADMIN_ROLES = ['super-admin', 'client-admin', 'client-editor'] as const;

function isRecognisedRole(role: unknown): role is NonNullable<LaxyCustomClaims['role']> {
  return typeof role === 'string' && ADMIN_ROLES.includes(role as NonNullable<LaxyCustomClaims['role']>);
}

function toFireCMSRole(role: NonNullable<LaxyCustomClaims['role']>): Role {
  return {
    id: role,
    name: role,
    isAdmin: role === 'super-admin',
  };
}

export async function resolveLaxyRoles(user: User | null): Promise<Role[]> {
  if (!user) return [];

  const claims = await getCustomClaims(user);
  if (isRecognisedRole(claims.role)) {
    if ((claims.role === 'client-admin' || claims.role === 'client-editor') && !claims.tenantId) {
      console.warn('[LaxyAdmin] Missing tenantId claim for role:', claims.role);
      return [];
    }
    return [toFireCMSRole(claims.role)];
  }

  if (import.meta.env.DEV && import.meta.env.VITE_ALLOW_DEV_ADMIN_BOOTSTRAP === 'true') {
    console.warn(
      '[LaxyAdmin] No custom claims found — granting dev bootstrap access via VITE_ALLOW_DEV_ADMIN_BOOTSTRAP.',
    );
    return [toFireCMSRole('super-admin')];
  }

  return [];
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
 * Returns `true` only if the user has recognised admin role claims.
 *
 * During development, bootstrap access is allowed only when
 * VITE_ALLOW_DEV_ADMIN_BOOTSTRAP is explicitly set to "true".
 */
export const laxyAuthenticator: Authenticator = async ({ user, authController }) => {
  const roles = await resolveLaxyRoles(user);
  authController.setUserRoles?.(roles);
  return roles.length > 0;
};
