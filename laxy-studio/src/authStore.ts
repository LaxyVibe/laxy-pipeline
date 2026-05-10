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
import { FirebaseError } from 'firebase/app';
import { initFirebase } from './firebase';

function toAuthErrorMessage(err: unknown, fallback: string): string {
  if (!(err instanceof FirebaseError)) {
    return err instanceof Error ? err.message : fallback;
  }

  switch (err.code) {
    case 'auth/configuration-not-found':
      return 'Firebase Authentication 尚未完成初始化。請到 Firebase Console > Authentication 點擊 Get started。';
    case 'auth/operation-not-allowed':
      return '目前未啟用 Email/Password 登入。請到 Firebase Console > Authentication > Sign-in method 開啟。';
    case 'auth/invalid-api-key':
      return 'Firebase API Key 無效，請檢查前端環境變數設定。';
    case 'auth/network-request-failed':
      return '網路連線失敗，請稍後再試。';
    case 'auth/email-already-in-use':
      return '此 Email 已被註冊。';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return '帳號或密碼不正確。';
    case 'auth/invalid-email':
      return 'Email 格式不正確。';
    case 'auth/weak-password':
      return '密碼強度不足，請至少使用 6 碼以上。';
    default:
      return err.message || fallback;
  }
}

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
      const message = toAuthErrorMessage(err, 'Sign-in failed');
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
      const message = toAuthErrorMessage(err, 'Sign-up failed');
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
      const message = toAuthErrorMessage(err, 'Sign-out failed');
      set({ error: message });
    }
  },

  resetPassword: async (email) => {
    const { auth } = initFirebase();
    set({ error: null });
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (err: unknown) {
      const message = toAuthErrorMessage(err, 'Password reset failed');
      set({ error: message });
      throw err;
    }
  },

  clearError: () => set({ error: null }),
}));
