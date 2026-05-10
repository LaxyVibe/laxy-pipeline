// ---------------------------------------------------------------------------
// AdminApp — FireCMS root component mounted at /admin
// ---------------------------------------------------------------------------
import '@firecms/ui/index.css';

import {
  FireCMS,
  Scaffold,
  NavigationRoutes,
  AppBar,
  Drawer,
  CircularProgressCenter,
  ModeControllerProvider,
  SnackbarProvider,
  useBuildLocalConfigurationPersistence,
  useBuildNavigationController,
  useBuildModeController,
} from '@firecms/core';

import {
  useFirebaseAuthController,
  useFirestoreDelegate,
  useFirebaseStorageSource,
  useInitialiseFirebase,
} from '@firecms/firebase';

import { laxyAuthenticator, resolveLaxyRoles } from './auth/authenticator';
import { ROUTES } from '../routes';

// Collections
import { tenantsCollection } from './collections/tenants';
import { usersCollection } from './collections/users';
import { featureFlagsCollection } from './collections/featureFlags';
import { subscriptionPlansCollection } from './collections/subscriptionPlans';
import { promptLibraryCollection } from './collections/promptLibrary';
import { auditLogsCollection } from './collections/auditLogs';

// ---------------------------------------------------------------------------
// Firebase config from env (same values as src/firebase.ts)
// ---------------------------------------------------------------------------
const firebaseConfig: Record<string, unknown> = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? '',
};

// Tenants collection with users subcollection
const tenantsWithUsers = {
  ...tenantsCollection,
  subcollections: [usersCollection],
};

// All top-level collections
const collections = [
  tenantsWithUsers,
  featureFlagsCollection,
  subscriptionPlansCollection,
  promptLibraryCollection,
  auditLogsCollection,
];

export default function AdminApp() {
  // ------ Firebase initialisation ------
  const {
    firebaseApp,
    firebaseConfigLoading,
    configError,
  } = useInitialiseFirebase({ firebaseConfig });

  // ------ Auth ------
  const authController = useFirebaseAuthController({
    firebaseApp,
    signInOptions: ['password', 'google.com'],
    defineRolesFor: resolveLaxyRoles,
  });

  // ------ Data sources ------
  const firestoreDelegate = useFirestoreDelegate({
    firebaseApp,
  });

  const storageSource = useFirebaseStorageSource({
    firebaseApp,
  });

  // ------ Navigation ------
  const userConfigPersistence = useBuildLocalConfigurationPersistence();

  const navigationController = useBuildNavigationController({
    collections,
    authController,
    dataSourceDelegate: firestoreDelegate,
    userConfigPersistence,
    basePath: ROUTES.admin,
    baseCollectionPath: ROUTES.adminCollection,
  });

  // ------ Mode (light/dark) ------
  const modeController = useBuildModeController();

  // Loading state
  if (firebaseConfigLoading) {
    return <CircularProgressCenter />;
  }

  if (configError) {
    return <div style={{ padding: 24 }}>Firebase config error: {configError}</div>;
  }

  return (
    <SnackbarProvider>
      <ModeControllerProvider value={modeController}>
        <FireCMS
          authController={authController}
          navigationController={navigationController}
          dataSourceDelegate={firestoreDelegate}
          storageSource={storageSource}
          userConfigPersistence={userConfigPersistence}
        >
          {({ context, loading }) => {
            if (loading) {
              return <CircularProgressCenter />;
            }

            return (
              <Scaffold
                autoOpenDrawer={false}
              >
                <AppBar title="Laxy Admin" />
                <Drawer />
                <NavigationRoutes />
              </Scaffold>
            );
          }}
        </FireCMS>
      </ModeControllerProvider>
    </SnackbarProvider>
  );
}
