// ---------------------------------------------------------------------------
// Tenants Collection — FireCMS configuration
// ---------------------------------------------------------------------------
import { buildCollection, buildProperty } from '@firecms/core';
import { buildPermissionsFor } from '../auth/permissions';

/**
 * Schema: tenants/{tenantId}
 *
 * Access:
 *  - Super Admin: full CRUD
 *  - Client Admin: read own tenant, edit info fields only
 *  - Client Editor: read-only
 */
export const tenantsCollection = buildCollection({
  id: 'tenants',
  name: 'Tenants',
  singularName: 'Tenant',
  path: 'tenants',
  icon: 'Business',
  group: 'Platform',
  description: 'Manage tenant (client) accounts',
  permissions: buildPermissionsFor('tenants'),

  properties: {
    companyName: buildProperty({
      name: 'Company Name',
      dataType: 'string',
      validation: { required: true, trim: true },
    }),

    logo: buildProperty({
      name: 'Logo',
      dataType: 'string',
      storage: {
        storagePath: 'tenants/logos',
        acceptedFiles: ['image/*'],
        maxSize: 2 * 1024 * 1024, // 2 MB
      },
    }),

    billingInfo: buildProperty({
      name: 'Billing Information',
      dataType: 'map',
      properties: {
        contactEmail: {
          name: 'Contact Email',
          dataType: 'string',
          validation: { required: true, email: true },
        },
        address: {
          name: 'Address',
          dataType: 'string',
          multiline: true,
        },
        taxId: {
          name: 'Tax ID',
          dataType: 'string',
        },
      },
    }),

    timezone: buildProperty({
      name: 'Timezone',
      dataType: 'string',
      enumValues: [
        { id: 'Asia/Tokyo', label: 'Asia/Tokyo' },
        { id: 'Asia/Bangkok', label: 'Asia/Bangkok' },
        { id: 'Asia/Singapore', label: 'Asia/Singapore' },
        { id: 'Asia/Hong_Kong', label: 'Asia/Hong Kong' },
        { id: 'Asia/Seoul', label: 'Asia/Seoul' },
        { id: 'Europe/London', label: 'Europe/London' },
        { id: 'Europe/Paris', label: 'Europe/Paris' },
        { id: 'America/New_York', label: 'America/New York' },
        { id: 'America/Los_Angeles', label: 'America/Los Angeles' },
        { id: 'Australia/Sydney', label: 'Australia/Sydney' },
      ],
      validation: { required: true },
    }),

    defaultLanguage: buildProperty({
      name: 'Default Language',
      dataType: 'string',
      enumValues: [
        { id: 'en', label: 'English' },
        { id: 'ja', label: 'Japanese' },
        { id: 'ko', label: 'Korean' },
        { id: 'zh-TW', label: 'Chinese Traditional' },
        { id: 'zh-CN', label: 'Chinese Simplified' },
        { id: 'fr', label: 'French' },
        { id: 'de', label: 'German' },
        { id: 'es', label: 'Spanish' },
        { id: 'th', label: 'Thai' },
      ],
      validation: { required: true },
    }),

    supportedLanguages: buildProperty({
      name: 'Supported Languages',
      dataType: 'array',
      of: {
        dataType: 'string',
        enumValues: [
          { id: 'en', label: 'English' },
          { id: 'ja', label: 'Japanese' },
          { id: 'ko', label: 'Korean' },
          { id: 'zh-TW', label: 'Chinese Traditional' },
          { id: 'zh-CN', label: 'Chinese Simplified' },
          { id: 'fr', label: 'French' },
          { id: 'de', label: 'German' },
          { id: 'es', label: 'Spanish' },
          { id: 'th', label: 'Thai' },
          { id: 'vi', label: 'Vietnamese' },
          { id: 'id', label: 'Indonesian' },
          { id: 'ms', label: 'Malay' },
          { id: 'ar', label: 'Arabic' },
          { id: 'ru', label: 'Russian' },
        ],
      },
    }),

    defaultAudioSettings: buildProperty({
      name: 'Default Audio Settings',
      description: 'Used by Quick Process (Phase 2)',
      dataType: 'map',
      properties: {
        characterId: {
          name: 'Character ID',
          dataType: 'string',
        },
        voiceId: {
          name: 'Voice ID',
          dataType: 'string',
        },
        contextNote: {
          name: 'Context Note',
          dataType: 'string',
          multiline: true,
        },
      },
    }),

    subscriptionTier: buildProperty({
      name: 'Subscription Tier',
      dataType: 'string',
      enumValues: [
        { id: 'free', label: 'Free' },
        { id: 'starter', label: 'Starter' },
        { id: 'pro', label: 'Pro' },
        { id: 'enterprise', label: 'Enterprise' },
      ],
      validation: { required: true },
    }),

    quotas: buildProperty({
      name: 'Quotas',
      dataType: 'map',
      properties: {
        maxExperiences: {
          name: 'Max Experiences',
          dataType: 'number',
          validation: { required: true, min: 0 },
        },
        maxStorageBytes: {
          name: 'Max Storage (bytes)',
          dataType: 'number',
          validation: { required: true, min: 0 },
        },
        maxUsers: {
          name: 'Max Users',
          dataType: 'number',
          validation: { required: true, min: 1 },
        },
      },
    }),

    status: buildProperty({
      name: 'Status',
      dataType: 'string',
      enumValues: [
        { id: 'active', label: 'Active', color: 'greenDark' },
        { id: 'suspended', label: 'Suspended', color: 'orangeDark' },
        { id: 'deactivated', label: 'Deactivated', color: 'redDark' },
      ],
      validation: { required: true },
    }),

    enabledModules: buildProperty({
      name: 'Enabled Modules',
      dataType: 'array',
      of: {
        dataType: 'string',
        enumValues: [
          { id: 'guide', label: 'Audio Guide' },
          { id: 'chatbot', label: 'Q&A Chatbot' },
          { id: 'navigation', label: 'AR Navigation' },
          { id: 'ticketing', label: 'Ticketing' },
        ],
      },
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
