// ---------------------------------------------------------------------------
// Audit Logs Collection — FireCMS configuration (read-only)
// ---------------------------------------------------------------------------
import { buildCollection, buildProperty } from '@firecms/core';
import { buildPermissionsFor } from '../auth/permissions';

/**
 * Schema: _platform/system/auditLogs/{logId}
 *
 * Access: read-only for all roles (scoped by tenant for non-Super Admins)
 */
export const auditLogsCollection = buildCollection({
  id: 'auditLogs',
  name: 'Audit Logs',
  singularName: 'Audit Log',
  path: '_platform/system/auditLogs',
  icon: 'History',
  group: 'Monitoring',
  description: 'Read-only audit trail of all role actions',
  permissions: buildPermissionsFor('auditLogs'),

  properties: {
    tenantId: buildProperty({
      name: 'Tenant ID',
      dataType: 'string',
      readOnly: true,
    }),

    userId: buildProperty({
      name: 'User ID',
      dataType: 'string',
      readOnly: true,
    }),

    userEmail: buildProperty({
      name: 'User Email',
      dataType: 'string',
      readOnly: true,
    }),

    action: buildProperty({
      name: 'Action',
      dataType: 'string',
      readOnly: true,
      description: 'e.g. guide.publish, user.invite',
    }),

    resource: buildProperty({
      name: 'Resource',
      dataType: 'string',
      readOnly: true,
      description: 'e.g. guides/abc123',
    }),

    details: buildProperty({
      name: 'Details',
      dataType: 'map',
      keyValue: true,
      readOnly: true,
    }),

    timestamp: buildProperty({
      name: 'Timestamp',
      dataType: 'date',
      readOnly: true,
    }),
  },

  defaultSize: 'l',
  initialSort: ['timestamp', 'desc'],
});
