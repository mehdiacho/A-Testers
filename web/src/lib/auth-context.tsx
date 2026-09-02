'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut as fbSignOut,
  type User,
} from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import type { UserDoc } from '@a-testers/shared';
import { auth, db } from './firebase';

interface AuthState {
  user: User | null;
  /** Live profile document — seat balance updates the moment a function commits. */
  profile: UserDoc | null;
  /** True until we know whether anyone is signed in. */
  loading: boolean;
  /** True while the profile document is still being created by the auth trigger. */
  profilePending: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/**
 * Popup sign-in fails outright in some browsers — blockers, in-app webviews, and any
 * context without a usable `window.open`. These are the codes worth retrying by redirect.
 */
const POPUP_FALLBACK_CODES = new Set([
  'auth/popup-blocked',
  'auth/operation-not-supported-in-this-environment',
  'auth/web-storage-unsupported',
  'auth/internal-error',
]);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserDoc | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (!u) setProfile(null);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    // The profile is created by the onUserCreated trigger, so on a first sign-in this
    // subscription fires with a missing document before the write lands. Subscribing
    // rather than reading once means the UI fills in on its own when it arrives.
    return onSnapshot(doc(db, 'users', user.uid), (snap) => {
      setProfile(snap.exists() ? ({ uid: user.uid, ...snap.data() } as UserDoc) : null);
    });
  }, [user]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      profile,
      loading,
      profilePending: Boolean(user) && profile === null,
      signIn: async () => {
        const provider = new GoogleAuthProvider();
        // Testers must join a Google Group to receive the closed test, so a Google
        // account is required anyway — there is no benefit to offering other providers.
        try {
          await signInWithPopup(auth, provider);
        } catch (err) {
          const code = (err as { code?: string }).code ?? '';
          // A blocked popup, or an embedded/in-app browser with no window.open, is not a
          // failure the user can act on — fall through to the redirect flow instead.
          if (POPUP_FALLBACK_CODES.has(code)) {
            await signInWithRedirect(auth, provider);
            return;
          }
          throw err;
        }
      },
      signOut: async () => {
        await fbSignOut(auth);
      },
    }),
    [user, profile, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
