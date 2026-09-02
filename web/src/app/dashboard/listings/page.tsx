'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { collection, orderBy, query, where } from 'firebase/firestore';
import { openSlots, type AppDoc, type AppStatus } from '@a-testers/shared';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { useCollection } from '@/lib/use-collection';
import { errorMessage, setAppStatus } from '@/lib/callables';
import { RequireAuth } from '@/components/require-auth';
import { CreateAppForm } from '@/components/create-app-form';
import { ReviewQueue } from '@/components/review-queue';

export default function ListingsPage() {
  return (
    <RequireAuth blurb="List your app and manage the testers working through it.">
      <Listings />
    </RequireAuth>
  );
}

function Listings() {
  const { user, profile } = useAuth();
  const [showForm, setShowForm] = useState(false);

  const q = useMemo(
    () =>
      user
        ? query(collection(db, 'apps'), where('ownerUid', '==', user.uid), orderBy('updatedAt', 'desc'))
        : null,
    [user],
  );

  const { data: apps, loading, error } = useCollection<AppDoc>(q);
  const seats = profile?.seatBalance ?? 0;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My apps</h1>
          <p className="mt-1 text-sm muted">
            Each tester who joins one of your tracks costs a seat, held until you review their proof.
          </p>
        </div>
        <button onClick={() => setShowForm((v) => !v)} className={showForm ? 'btn-secondary' : 'btn-primary'}>
          {showForm ? 'Cancel' : 'List an app'}
        </button>
      </header>

      {seats === 0 && (
        <p className="card border-warn-600/30 bg-warn-600/5 p-4 text-sm">
          <span className="font-medium">You have no seats.</span>{' '}
          <span className="muted">
            You can create a draft listing, but opening it to testers needs at least one seat.
          </span>{' '}
          <Link href="/apps" className="text-brand-500 underline">
            Test an app to earn one
          </Link>
          .
        </p>
      )}

      {showForm && <CreateAppForm onCreated={() => setShowForm(false)} />}

      <ReviewQueue />

      {error && <p className="card p-4 text-sm text-danger-400">Could not load your apps: {error.message}</p>}

      {loading ? (
        <div className="card h-40 animate-pulse" />
      ) : apps.length === 0 ? (
        !showForm && (
          <div className="card p-10 text-center">
            <p className="font-medium">No listings yet</p>
            <p className="mx-auto mt-2 max-w-md text-sm muted">
              Add your closed-test link and Google Group, and testers from the community can start
              joining your track.
            </p>
            <button onClick={() => setShowForm(true)} className="btn-primary mt-6">
              List an app
            </button>
          </div>
        )
      ) : (
        <ul className="space-y-3">
          {apps.map((app) => (
            <li key={app.id}>
              <ListingRow app={app} seats={seats} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const NEXT_STATUS: Partial<Record<AppStatus, { to: AppStatus; label: string }>> = {
  draft: { to: 'open', label: 'Open to testers' },
  open: { to: 'paused', label: 'Pause' },
  paused: { to: 'open', label: 'Reopen' },
  full: { to: 'paused', label: 'Pause' },
};

function ListingRow({ app, seats }: { app: AppDoc; seats: number }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const action = NEXT_STATUS[app.status];
  const progress = Math.min(100, (app.seatsFilled / Math.max(1, app.seatsRequested)) * 100);

  // Opening a listing is the one transition that spends a seat, so it is disabled rather
  // than left to fail server-side with an error the developer has to read.
  const blocked = action?.to === 'open' && seats < 1;

  const onToggle = async () => {
    if (!action) return;
    setBusy(true);
    setError(null);
    try {
      await setAppStatus({ appId: app.id, status: action.to });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-medium">{app.name}</h3>
            <StatusChip status={app.status} />
          </div>
          <p className="truncate font-mono text-xs muted">{app.packageName}</p>
        </div>

        <div className="flex items-center gap-2">
          <Link href={`/apps/${app.id}`} className="btn-ghost text-xs">
            View
          </Link>
          <Link href={`/dashboard/listings/${app.id}`} className="btn-secondary text-xs">
            {app.testingStartsAt ? 'Retention' : 'Manage'}
          </Link>
          {action && (
            <button
              onClick={() => void onToggle()}
              disabled={busy || blocked}
              title={blocked ? 'You need at least one seat to open a listing.' : undefined}
              className="btn-secondary text-xs"
            >
              {busy ? '…' : action.label}
            </button>
          )}
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between text-xs">
          <span className="muted">
            {app.seatsFilled} of {app.seatsRequested} testers approved
            {app.seatsReserved > 0 && <> · {app.seatsReserved} pending</>}
          </span>
          <span className="muted tabular-nums">{openSlots(app)} slots open</span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--border)' }}>
          <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-danger-400">{error}</p>}
    </div>
  );
}

const STATUS_STYLE: Record<AppStatus, string> = {
  draft: 'muted',
  pending_review: 'text-warn-400',
  open: 'text-brand-500',
  paused: 'text-warn-400',
  full: 'text-brand-500',
  completed: 'muted',
  rejected: 'text-danger-400',
};

function StatusChip({ status }: { status: AppStatus }) {
  return (
    <span className={`chip border capitalize ${STATUS_STYLE[status]}`} style={{ borderColor: 'var(--border)' }}>
      {status.replace('_', ' ')}
    </span>
  );
}
