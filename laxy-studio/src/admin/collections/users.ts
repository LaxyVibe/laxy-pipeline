// ---------------------------------------------------------------------------
// Users Collection — FireCMS configuration
// ---------------------------------------------------------------------------
import { buildCollection, buildProperty } from '@firecms/core';
import { buildPermissionsFor } from '../auth/permissions';

/**
 * Schema: tenants/{tenantId}/users/{userId}
 *
 * This collection is defined as a sub-collection of the Tenants collection
 * and is also registered at the top level for Super Admins who need
 * cross-tenant user management.
 *
 * Access:
 *  - Super Admin: full CRUD on all tenants
 *  - Client Admin: CRUD within own tenant
 *  - Client Editor: read own profile only
 */
export const usersCollection = buildCollection({
  id: 'users',
  name: 'Users',
  singularName: 'User',
  path: 'users',
  icon: 'People',
  group: 'Platform',
  description: 'Manage users within tenants',
  permissions: buildPermissionsFor('users'),

  properties: {
    email: buildProperty({
      name: 'Email',
      dataType: 'string',
      validation: { required: true, email: true },
    }),

    displayName: buildProperty({
      name: 'Display Name',
      dataType: 'string',
      validation: { required: true, trim: true },
    }),

    avatarUrl: buildProperty({
      name: 'Avatar',
      dataType: 'string',
      storage: {
        storagePath: 'users/avatars',
        acceptedFiles: ['image/*'],
        maxSize: 1024 * 1024, // 1 MB
      },
    }),

    role: buildProperty({
      name: 'Role',
      dataType: 'string',
      enumValues: [
        { id: 'client-admin', label: 'Client Admin' },
        { id: 'client-editor', label: 'Client Editor' },
      ],
      validation: { required: true },
    }),

    status: buildProperty({
      name: 'Status',
      dataType: 'string',
      enumValues: [
        { id: 'active', label: 'Active', color: 'greenDark' },
        { id: 'invited', label: 'Invited', color: 'blueDark' },
        { id: 'deactivated', label: 'Deactivated', color: 'redDark' },
      ],
      validation: { required: true },
    }),

    invitedAt: buildProperty({
      name: 'Invited At',
      dataType: 'date',
    }),

    lastLoginAt: buildProperty({
      name: 'Last Login',
      dataType: 'date',
      readOnly: true,
    }),

    createdAt: buildProperty({
      name: 'Created At',
      dataType: 'date',
      autoValue: 'on_create',
    }),
  },
});
