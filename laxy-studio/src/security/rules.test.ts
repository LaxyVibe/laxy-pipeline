/* @vitest-environment node */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const hasFirestoreEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const hasStorageEmulator = Boolean(process.env.FIREBASE_STORAGE_EMULATOR_HOST);
const shouldRunRulesTests = hasFirestoreEmulator && hasStorageEmulator;
const describeIfEmulator = shouldRunRulesTests ? describe : describe.skip;

let testEnv: RulesTestEnvironment | null = null;

function getTestEnv(): RulesTestEnvironment {
  if (!testEnv) {
    throw new Error(
      'Firebase emulator test environment is not initialized. Run with firebase emulators:exec.',
    );
  }
  return testEnv;
}

function superAdminContext() {
  return getTestEnv().authenticatedContext('super-admin-user', {
    role: 'super-admin',
  });
}

function clientAdminContext(tenantId: string) {
  return getTestEnv().authenticatedContext(`client-admin-${tenantId}`, {
    role: 'client-admin',
    tenantId,
  });
}

function clientEditorContext(tenantId: string) {
  return getTestEnv().authenticatedContext(`client-editor-${tenantId}`, {
    role: 'client-editor',
    tenantId,
  });
}

function signedInContext() {
  return getTestEnv().authenticatedContext('signed-in-user');
}

beforeAll(async () => {
  if (!shouldRunRulesTests) return;

  const [firestoreRules, storageRules] = await Promise.all([
    readFile(path.join(repoRoot, 'firestore.rules'), 'utf8'),
    readFile(path.join(repoRoot, 'storage.rules'), 'utf8'),
  ]);

  testEnv = await initializeTestEnvironment({
    projectId: 'demo-laxy-security-rules',
    firestore: { rules: firestoreRules },
    storage: { rules: storageRules },
  });
});

beforeEach(async () => {
  if (!testEnv) return;
  await testEnv.clearFirestore();
  await testEnv.clearStorage();
});

afterAll(async () => {
  if (!testEnv) return;
  await testEnv.cleanup();
});

describeIfEmulator('Firestore rules', () => {
  it('allows super-admin access to platform collections and denies client-admin access', async () => {
    await getTestEnv().withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc('_platform/system/featureFlags/flag-1').set({
        name: 'new-dashboard',
        enabledGlobally: true,
      });
    });

    await assertSucceeds(
      superAdminContext().firestore().doc('_platform/system/featureFlags/flag-1').get(),
    );
    await assertFails(
      clientAdminContext('tenant-a').firestore().doc('_platform/system/featureFlags/flag-1').get(),
    );
  });

  it('enforces tenant scoping for tenant documents and nested users', async () => {
    await getTestEnv().withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.doc('tenants/tenant-a').set({ companyName: 'Tenant A' });
      await db.doc('tenants/tenant-b').set({ companyName: 'Tenant B' });
      await db.doc('tenants/tenant-a/users/user-1').set({ email: 'user1@a.test' });
      await db.doc('tenants/tenant-b/users/user-2').set({ email: 'user2@b.test' });
    });

    const tenantAAdmin = clientAdminContext('tenant-a').firestore();
    await assertSucceeds(tenantAAdmin.doc('tenants/tenant-a').get());
    await assertFails(tenantAAdmin.doc('tenants/tenant-b').get());

    await assertSucceeds(tenantAAdmin.doc('tenants/tenant-a/users/user-1').get());
    await assertFails(tenantAAdmin.doc('tenants/tenant-b/users/user-2').get());
  });

  it('scopes pipeline session reads by context.tenantId for non-super-admin users', async () => {
    await getTestEnv().withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.doc('pipeline_sessions/sess-a').set({
        context: { tenantId: 'tenant-a' },
        status: 'running',
      });
      await db.doc('pipeline_sessions/sess-b').set({
        context: { tenantId: 'tenant-b' },
        status: 'running',
      });
    });

    const tenantAAdmin = clientAdminContext('tenant-a').firestore();
    await assertSucceeds(tenantAAdmin.doc('pipeline_sessions/sess-a').get());
    await assertFails(tenantAAdmin.doc('pipeline_sessions/sess-b').get());
    await assertSucceeds(superAdminContext().firestore().doc('pipeline_sessions/sess-b').get());
  });

  it('denies unauthenticated reads to protected collections', async () => {
    await getTestEnv().withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc('_platform/system/subscriptionPlans/pro').set({
        name: 'Pro',
      });
    });

    await assertFails(
      getTestEnv().unauthenticatedContext().firestore().doc('_platform/system/subscriptionPlans/pro').get(),
    );
  });
});

describeIfEmulator('Storage rules', () => {
  it('allows authenticated asset uploads but denies unauthenticated uploads', async () => {
    await assertFails(
      getTestEnv().unauthenticatedContext().storage().ref('assets/a1/test.txt').putString('hello').then(() => undefined),
    );

    const authedRef = signedInContext().storage().ref('assets/a1/test.txt');
    await assertSucceeds(authedRef.putString('hello').then(() => undefined));
    await assertSucceeds(authedRef.getMetadata());
  });

  it('allows admin-logo writes only for admin roles', async () => {
    const clientEditorLogoRef = clientEditorContext('tenant-a').storage().ref('tenants/logos/logo.png');
    await assertFails(clientEditorLogoRef.putString('logo').then(() => undefined));

    const clientAdminLogoRef = clientAdminContext('tenant-a').storage().ref('tenants/logos/logo.png');
    await assertSucceeds(clientAdminLogoRef.putString('logo').then(() => undefined));
  });

  it('keeps generated audio write-protected for clients while allowing reads', async () => {
    await getTestEnv().withSecurityRulesDisabled(async (context) => {
      await context.storage().ref('audio/sess-a/en/spot-1.wav').putString('audio-bytes');
    });

    const authedAudioRef = signedInContext().storage().ref('audio/sess-a/en/spot-1.wav');
    await assertSucceeds(authedAudioRef.getMetadata());
    await assertFails(authedAudioRef.putString('tamper').then(() => undefined));
  });
});
