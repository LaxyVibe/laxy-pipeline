// ---------------------------------------------------------------------------
// Permission matrix — per role / per collection
// ---------------------------------------------------------------------------
import type { Permissions, PermissionsBuilder, User } from '@firecms/core';

/** Shorthand permission presets */
const FULL: Permissions = { read: true, create: true, edit: true, delete: true };
const READ_ONLY: Permissions = { read: true, create: false, edit: false, delete: false };
const NO_ACCESS: Permissions = { read: false, create: false, edit: false, delete: false };

type CollectionId =
  | 'tenants'
  | 'users'
  | 'featureFlags'
  | 'subscriptionPlans'
  | 'promptLibrary'
  | 'auditLogs';

/** Recognised Laxy role IDs (mapped to FireCMS Role.id) */
type LaxyRoleId = 'super-admin' | 'client-admin' | 'client-editor';

/**
 * Permission matrix:
 *
 * | Collection        | Super Admin | Client Admin              | Client Editor |
 * |-------------------|-------------|---------------------------|---------------|
 * | tenants           | FULL        | read (own) + edit info    | read-only     |
 * | users             | FULL        | FULL (own tenant)         | read-only     |
 * | featureFlags      | FULL        | NO_ACCESS                 | NO_ACCESS     |
 * | subscriptionPlans | FULL        | READ_ONLY                 | NO_ACCESS     |
 * | promptLibrary     | FULL        | READ_ONLY                 | READ_ONLY     |
 * | auditLogs         | READ_ONLY   | READ_ONLY (own tenant)    | READ_ONLY     |
 */
const PERMISSION_MATRIX: Record<LaxyRoleId, Record<CollectionId, Permissions>> = {
  'super-admin': {
    tenants: FULL,
    users: FULL,
    featureFlags: FULL,
    subscriptionPlans: FULL,
    promptLibrary: FULL,
    auditLogs: READ_ONLY,
  },
  'client-admin': {
    tenants: { read: true, create: false, edit: true, delete: false },
    users: FULL,
    featureFlags: NO_ACCESS,
    subscriptionPlans: READ_ONLY,
    promptLibrary: READ_ONLY,
    auditLogs: READ_ONLY,
  },
  'client-editor': {
    tenants: READ_ONLY,
    users: READ_ONLY,
    featureFlags: NO_ACCESS,
    subscriptionPlans: NO_ACCESS,
    promptLibrary: READ_ONLY,
    auditLogs: READ_ONLY,
  },
};

/**
 * Resolve the Laxy role from the FireCMS user's roles array.
 */
function resolveRole(user: User | null): LaxyRoleId | undefined {
  if (!user?.roles?.length) {
    return undefined;
  }
  // Pick the highest-priority role
  const roleIds = user.roles.map((r) => r.id);
  if (roleIds.includes('super-admin')) return 'super-admin';
  if (roleIds.includes('client-admin')) return 'client-admin';
  if (roleIds.includes('client-editor')) return 'client-editor';
  return undefined;
}

/**
 * Build a PermissionsBuilder for a given collection.
 * Resolves the current user's role and returns the appropriate
 * permissions from the matrix above.
 */
export function buildPermissionsFor(collectionId: CollectionId): PermissionsBuilder {
  return ({ user }) => {
    const role = resolveRole(user);
    if (!role) return NO_ACCESS;
    return PERMISSION_MATRIX[role]?.[collectionId] ?? NO_ACCESS;
  };
}

export { FULL, READ_ONLY, NO_ACCESS };
