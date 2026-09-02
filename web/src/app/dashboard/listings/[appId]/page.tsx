'use client';

import { use, useMemo } from 'react';
import Link from 'next/link';
import { collection, doc, query, where } from 'firebase/firestore';
import { openSlots, type AppDoc, type ReservationDoc } from '@a-testers/shared';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { useDoc } from '@/lib/firestore-utils';
import { useCollection } from '@/lib/use-collection';
import { usePlatformConfig } from '@/lib/use-platform-config';
import { RequireAuth } from '@/components/require-auth';
import { RetentionBoard } from '@/components/retention-board';

export default function ListingDetailPage({ params }: { params: Promise<{ appId: string }> }) {
  const { appId } = use(params);

  return (
    <RequireAuth blurb="Sign in to see how your testers are holding up.">
      <ListingDetail appId={appId} />
    </RequireAuth>
  );
}

function ListingDetail({ appId }: { appId: string }) {
  const { user } = useAuth();
  const config = usePlatformConfig();

  const appRef = useMemo(() => doc(db, 'apps', appId), [appId]);
  const { data: app, loading, error, missing } = useDoc<AppDoc>(appRef);

  // Only approved reservations count towards the window. `ownerUid` is in the query even
  // though `appId` already implies it: security rules are not filters, so a list is only
  // permitted when the query itself proves every match is readable by the caller.
  // Index: reservations (appId ASC, ownerUid ASC, status ASC).
  const reservationQuery = useMemo(
    () =>
      user
        ? query(
            collection(db, 'reservations'),
            where('appId', '==', appId),
            where('ownerUid', '==', user.uid),
            where('status', '==', 'approved'),
          )
        : null,
    [user, appId],
  );
  const { data: reservations, error: reservationError } = useCollection<ReservationDoc>(reservationQuery);

  if (loading) return <div className="card h-64 animate-pulse" />;

  if (error || missing || !app) {
    return (
      <div className="card p-10 text-center">
        <p className="font-medium">Listing not found</p>
        <p className="mt-2 text-sm muted">It may have been removed, or the link is wrong.</p>
        <Link href="/dashboard/listings" className="btn-secondary mt-6 inline-block">
          Back to my apps
        </Link>
      </div>
    );
  }

  // The rules already deny reading another developer's reservations; this keeps the page
  // from half-rendering when someone follows a link to a listing that is not theirs.
  if (app.ownerUid !== user?.uid) {
    return (
      <div className="card p-10 text-center">
        <p className="font-medium">This is not your listing</p>
        <Link href={`/apps/${appId}`} className="btn-secondary mt-6 inline-block">
          View the public page
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link href="/dashboard/listings" className="text-sm muted hover:text-[color:var(--text)]">
        ← My apps
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{app.name}</h1>
          <p className="truncate font-mono text-sm muted">{app.packageName}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/apps/${appId}`} className="btn-ghost text-xs">
            Public page
          </Link>
          <a href={app.playTestUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary text-xs">
            Play test link
          </a>
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Fact label="Status" value={app.status.replace('_', ' ')} />
        <Fact label="Approved" value={`${app.seatsFilled} / ${app.seatsRequested}`} />
        <Fact label="Pending" value={String(app.seatsReserved)} />
        <Fact label="Slots open" value={String(openSlots(app))} />
      </dl>

      {reservationError && (
        <p className="card p-4 text-sm text-danger-400">Could not load your testers: {reservationError.message}</p>
      )}

      <RetentionBoard app={app} reservations={reservations} config={config} />
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <dt className="text-xs muted">{label}</dt>
      <dd className="mt-1 font-medium capitalize tabular-nums">{value}</dd>
    </div>
  );
}
