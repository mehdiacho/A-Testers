'use client';

import type { ReactNode } from 'react';
import { useAuth } from '@/lib/auth-context';

/** Client-side gate for the dashboards. Real enforcement is in firestore.rules. */
export function RequireAuth({ children, blurb }: { children: ReactNode; blurb?: string }) {
  const { user, loading, profilePending, signIn } = useAuth();

  if (loading) {
    return <div className="card h-48 animate-pulse" />;
  }

  if (!user) {
    return (
      <div className="card p-10 text-center">
        <h1 className="font-medium">Sign in to continue</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm muted">
          {blurb ?? 'Your seats, your tests and your listings all live behind your account.'}
        </p>
        <button onClick={() => void signIn()} className="btn-primary mt-6">
          Sign in with Google
        </button>
      </div>
    );
  }

  // The profile document is created by a background trigger, so a first-time user can
  // land here a beat before it exists.
  if (profilePending) {
    return (
      <div className="card p-10 text-center">
        <p className="font-medium">Setting up your account…</p>
        <p className="mt-2 text-sm muted">This takes a second.</p>
      </div>
    );
  }

  return <>{children}</>;
}
