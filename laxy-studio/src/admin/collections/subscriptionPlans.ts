// ---------------------------------------------------------------------------
// Subscription Plans Collection — FireCMS configuration
// ---------------------------------------------------------------------------
import { buildCollection, buildProperty } from '@firecms/core';
import { buildPermissionsFor } from '../auth/permissions';

/**
 * Schema: _platform/system/subscriptionPlans/{planId}
 *
 * Access:
 *  - Super Admin: full CRUD
 *  - Client Admin: read-only
 *  - Client Editor: no access
 */
export const subscriptionPlansCollection = buildCollection({
  id: 'subscriptionPlans',
  name: 'Subscription Plans',
  singularName: 'Subscription Plan',
  path: '_platform/system/subscriptionPlans',
  icon: 'CreditCard',
  group: 'Billing',
  description: 'Plan definitions — tiers, limits and pricing',
  permissions: buildPermissionsFor('subscriptionPlans'),

  properties: {
    name: buildProperty({
      name: 'Plan Name',
      dataType: 'string',
      validation: { required: true },
      enumValues: [
        { id: 'Free', label: 'Free' },
        { id: 'Starter', label: 'Starter' },
        { id: 'Pro', label: 'Pro' },
        { id: 'Enterprise', label: 'Enterprise' },
      ],
    }),

    maxExperiences: buildProperty({
      name: 'Max Experiences',
      dataType: 'number',
      validation: { required: true, positive: true, integer: true },
    }),

    maxStorageBytes: buildProperty({
      name: 'Max Storage (bytes)',
      dataType: 'number',
      validation: { required: true, positive: true },
    }),

    maxUsers: buildProperty({
      name: 'Max Users',
      dataType: 'number',
      validation: { required: true, positive: true, integer: true },
    }),

    enabledFeatures: buildProperty({
      name: 'Enabled Features',
      dataType: 'array',
      of: {
        dataType: 'string',
      },
      description: 'Feature identifiers included in this plan',
    }),

    priceMonthly: buildProperty({
      name: 'Monthly Price',
      dataType: 'number',
      validation: { min: 0 },
    }),

    priceYearly: buildProperty({
      name: 'Yearly Price',
      dataType: 'number',
      validation: { min: 0 },
    }),

    currency: buildProperty({
      name: 'Currency',
      dataType: 'string',
      enumValues: [
        { id: 'USD', label: 'USD' },
        { id: 'EUR', label: 'EUR' },
        { id: 'JPY', label: 'JPY' },
        { id: 'THB', label: 'THB' },
        { id: 'GBP', label: 'GBP' },
      ],
      validation: { required: true },
    }),

    sortOrder: buildProperty({
      name: 'Sort Order',
      dataType: 'number',
      validation: { integer: true },
    }),

    active: buildProperty({
      name: 'Active',
      dataType: 'boolean',
      defaultValue: true,
    }),
  },
});
