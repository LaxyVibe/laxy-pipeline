// ---------------------------------------------------------------------------
// Auth Store — Firebase Authentication state (Zustand)
// ---------------------------------------------------------------------------
import { create } from 'zustand';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  updateProfile,
  type User,
} from 'firebase/auth';
import { initFirebase } from './firebase';

export interface AuthState {
  /** Current Firebase user (null when signed out) */
  user: User | null;
  /** True while the initial onAuthStateChanged hasn't fired yet */
  loading: boolean;
  /** Last auth error message (cleared on next action) */
  error: string | null;

  // Actions
  /** Start listening to auth state changes — call once at app boot */
  listen: () => () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName?: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,
  error: null,

  listen: () => {
    const { auth } = initFirebase();
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      set({ user, loading: false });
    });
    return unsubscribe;
  },

  signIn: async (email, password) => {
    const { auth } = initFirebase();
    set({ error: null });
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Sign-in failed';
      set({ error: message });
      throw err;
    }
  },

  signUp: async (email, password, displayName) => {
    const { auth } = initFirebase();
    set({ error: null });
    try {
      const { user } = await createUserWithEmailAndPassword(auth, email, password);
      if (displayName) {
        await updateProfile(user, { displayName });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Sign-up failed';
      set({ error: message });
      throw err;
    }
  },

  signOut: async () => {
    const { auth } = initFirebase();
    set({ error: null });
    try {
      await firebaseSignOut(auth);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Sign-out failed';
      set({ error: message });
    }
  },

  resetPassword: async (email) => {
    const { auth } = initFirebase();
    set({ error: null });
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Password reset failed';
      set({ error: message });
      throw err;
    }
  },

  clearError: () => set({ error: null }),
}));
