'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { collection, orderBy, query, where } from 'firebase/firestore';
import type { ReservationDoc, ReservationStatus } from '@a-testers/shared';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { useCollection } from '@/lib/use-collection';
import { RequireAuth } from '@/components/require-auth';

export default function DashboardPage() {
  return (
    <RequireAuth blurb="Track the apps you are testing and the seats you have earned.">
      <MyTesting />
    </RequireAuth>
  );
}

function MyTesting() {
  const { user, profile } = useAuth();

  const q = useMemo(
    () =>
      user
        ? query(
            collection(db, 'reservations'),
            where('testerUid', '==', user.uid),
            orderBy('reservedAt', 'desc'),
          )
        : null,
    [user],
  );

  const { data: reservations, loading, error } = useCollection<ReservationDoc>(q);

  const active = reservations.filter((r) => r.status === 'reserved' || r.status === 'proof_submitted');
  const approved = reservations.filter((r) => r.status === 'approved');
  const closed = reservations.filter((r) => ['rejected', 'expired', 'withdrawn'].includes(r.status));

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">My testing</h1>
        <p className="mt-1 text-sm muted">
          Every approved test earns one seat. Spend seats to get testers for your own app.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-4">
        <Metric label="Seats available" value={profile?.seatBalance ?? 0} accent />
        <Metric label="Apps tested" value={profile?.stats?.appsTested ?? 0} />
        <Metric label="In progress" value={active.length} />
        <Metric label="Reputation" value={profile?.reputation ?? 0} />
      </div>

      {error && (
        <p className="card p-4 text-sm text-danger-400">Could not load your tests: {error.message}</p>
      )}

      {loading ? (
        <div className="card h-40 animate-pulse" />
      ) : reservations.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <Section title="In progress" hint="Finish these to earn your seats." items={active} />
          <Section title="Holding the window" hint="Keep these installed and check in daily." items={approved} />
          <Section title="Closed" items={closed} muted />
        </>
      )}
    </div>
  );
}

function Section({
  title,
  hint,
  items,
  muted,
}: {
  title: string;
  hint?: string;
  items: ReservationDoc[];
  muted?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <section>
      <h2 className="text-sm font-medium">
        {title} <span className="muted tabular-nums">({items.length})</span>
      </h2>
      {hint && <p className="mt-0.5 text-xs muted">{hint}</p>}
      <ul className={`mt-3 space-y-2 ${muted ? 'opacity-70' : ''}`}>
        {items.map((r) => (
          <li key={r.id}>
            <ReservationRow reservation={r} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ReservationRow({ reservation }: { reservation: ReservationDoc }) {
  const daysDone = Object.keys(reservation.checkins ?? {}).length;

  return (
    <Link
      href={`/apps/${reservation.appId}`}
      className="card flex items-center gap-4 p-4 transition-colors hover:border-brand-500"
    >
      <div className="min-w-0 flex-1">
        {/* The app name lives on the app document; the reservation only carries ids, so
            the row links through rather than duplicating (and staling) the name here. */}
        <p className="truncate text-sm font-medium">App {reservation.appId.slice(0, 8)}</p>
        <p className="text-xs muted">
          {reservation.status === 'approved'
            ? `${daysDone} ${daysDone === 1 ? 'day' : 'days'} checked in`
            : describe(reservation.status)}
        </p>
      </div>
      <StatusChip status={reservation.status} />
    </Link>
  );
}

function describe(status: ReservationStatus): string {
  switch (status) {
    case 'reserved':
      return 'Install the app and send proof';
    case 'proof_submitted':
      return 'Waiting on the developer';
    case 'rejected':
      return 'Proof was rejected';
    case 'expired':
      return 'Reservation expired';
    case 'withdrawn':
      return 'You gave up this slot';
    default:
      return '';
  }
}

const CHIP: Record<ReservationStatus, string> = {
  reserved: 'text-warn-400',
  proof_submitted: 'text-warn-400',
  approved: 'text-brand-500',
  rejected: 'text-danger-400',
  expired: 'muted',
  withdrawn: 'muted',
};

const LABEL: Record<ReservationStatus, string> = {
  reserved: 'Action needed',
  proof_submitted: 'In review',
  approved: 'Approved',
  rejected: 'Rejected',
  expired: 'Expired',
  withdrawn: 'Withdrawn',
};

function StatusChip({ status }: { status: ReservationStatus }) {
  return <span className={`chip border ${CHIP[status]}`} style={{ borderColor: 'var(--border)' }}>{LABEL[status]}</span>;
}

function Metric({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="card p-4">
      <p className="text-xs muted">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${accent ? 'text-brand-500' : ''}`}>{value}</p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="card p-10 text-center">
      <p className="font-medium">You haven’t tested anything yet</p>
      <p className="mx-auto mt-2 max-w-md text-sm muted">
        New accounts start with zero seats — that is the whole point of the exchange. Test an app to
        earn your first one.
      </p>
      <Link href="/apps" className="btn-primary mt-6">
        Find an app to test
      </Link>
    </div>
  );
}
