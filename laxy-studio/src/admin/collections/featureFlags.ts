// ---------------------------------------------------------------------------
// Feature Flags Collection — FireCMS configuration
// ---------------------------------------------------------------------------
import { buildCollection, buildProperty } from '@firecms/core';
import { buildPermissionsFor } from '../auth/permissions';

/**
 * Schema: _platform/system/featureFlags/{flagId}
 *
 * Access: Super Admin only (full CRUD)
 */
export const featureFlagsCollection = buildCollection({
  id: 'featureFlags',
  name: 'Feature Flags',
  singularName: 'Feature Flag',
  path: '_platform/system/featureFlags',
  icon: 'Flag',
  group: 'Platform',
  description: 'Global and per-tenant feature toggles',
  permissions: buildPermissionsFor('featureFlags'),

  properties: {
    name: buildProperty({
      name: 'Flag Name',
      dataType: 'string',
      validation: { required: true, trim: true },
    }),

    description: buildProperty({
      name: 'Description',
      dataType: 'string',
      multiline: true,
    }),

    enabledGlobally: buildProperty({
      name: 'Enabled Globally',
      dataType: 'boolean',
      defaultValue: false,
    }),

    tenantOverrides: buildProperty({
      name: 'Tenant Overrides',
      description: 'Per-tenant enable/disable. Key = tenantId, Value = enabled',
      dataType: 'map',
      keyValue: true,
      spreadChildren: false,
    }),

    createdAt: buildProperty({
      name: 'Created At',
      dataType: 'date',
      autoValue: 'on_create',
    }),

    updatedAt: buildProperty({
      name: 'Updated At',
      dataType: 'date',
      autoValue: 'on_update',
    }),
  },
});
