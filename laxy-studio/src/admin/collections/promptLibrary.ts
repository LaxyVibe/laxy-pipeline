// ---------------------------------------------------------------------------
// Prompt Library Collection — FireCMS configuration
// ---------------------------------------------------------------------------
import { buildCollection, buildProperty } from '@firecms/core';
import { buildPermissionsFor } from '../auth/permissions';

/**
 * Schema: _platform/promptLibrary/{promptId}
 *
 * Access:
 *  - Super Admin: full CRUD
 *  - Client Admin / Editor: read-only (prompts consumed via ADK pipeline)
 */
export const promptLibraryCollection = buildCollection({
  id: 'promptLibrary',
  name: 'Prompt Library',
  singularName: 'Prompt Template',
  path: '_platform/promptLibrary',
  icon: 'AutoFixHigh',
  group: 'AI Config',
  description: 'Master prompt templates for pipeline modules',
  permissions: buildPermissionsFor('promptLibrary'),

  properties: {
    name: buildProperty({
      name: 'Prompt Name',
      dataType: 'string',
      validation: { required: true, trim: true },
    }),

    module: buildProperty({
      name: 'Module',
      dataType: 'string',
      enumValues: [
        { id: 'ingestion', label: 'Ingestion' },
        { id: 'script', label: 'Script Generation' },
        { id: 'translation', label: 'Translation' },
        { id: 'audio', label: 'Audio Production' },
        { id: 'director-note', label: 'Director Note' },
      ],
      validation: { required: true },
    }),

    tags: buildProperty({
      name: 'Tags',
      dataType: 'array',
      of: {
        dataType: 'string',
      },
    }),

    version: buildProperty({
      name: 'Version',
      dataType: 'number',
      validation: { required: true, positive: true, integer: true },
      defaultValue: 1,
    }),

    content: buildProperty({
      name: 'Prompt Content',
      dataType: 'string',
      multiline: true,
      validation: { required: true },
      columnWidth: 400,
    }),

    isActive: buildProperty({
      name: 'Active',
      dataType: 'boolean',
      defaultValue: true,
    }),

    createdBy: buildProperty({
      name: 'Created By',
      dataType: 'string',
      readOnly: true,
      description: 'User ID of the creator',
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
