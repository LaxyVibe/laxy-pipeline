// ---------------------------------------------------------------------------
// Firebase initialisation — Auth, Firestore, Storage
// ---------------------------------------------------------------------------
import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, type Auth } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, type Firestore } from 'firebase/firestore';
import { getStorage, connectStorageEmulator, type FirebaseStorage } from 'firebase/storage';

// These values should come from environment variables in production.
// Vite exposes `import.meta.env.VITE_*` at build time.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? '',
};

// Singleton instances
let app: FirebaseApp;
let auth: Auth;
let db: Firestore;
let storage: FirebaseStorage;

/**
 * Initialise (or return cached) Firebase services.
 * Safe to call multiple times — only the first call actually creates anything.
 */
export function initFirebase() {
  if (!app) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    storage = getStorage(app);

    // Connect to emulators when running locally.
    // Auth emulator is opt-in to avoid hard failures when localhost:9099 is not running.
    const useEmulators = import.meta.env.DEV && import.meta.env.VITE_USE_EMULATORS === 'true';
    const useAuthEmulator = useEmulators && import.meta.env.VITE_USE_AUTH_EMULATOR === 'true';

    if (useEmulators) {
      if (useAuthEmulator) {
        connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
      }
      connectFirestoreEmulator(db, 'localhost', 8080);
      connectStorageEmulator(storage, 'localhost', 9199);
    }
  }

  return { app, auth, db, storage };
}

// Re-export for convenience — these are lazy; call initFirebase() first.
export { app, auth, db, storage };
