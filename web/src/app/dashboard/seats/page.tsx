'use client';

import { useMemo } from 'react';
import { collection, limit, orderBy, query, where } from 'firebase/firestore';
import type { LedgerEntry, LedgerReason } from '@a-testers/shared';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { useCollection } from '@/lib/use-collection';
import { RequireAuth } from '@/components/require-auth';

export default function SeatsPage() {
  return (
    <RequireAuth blurb="Every seat you have earned or spent, in order.">
      <Seats />
    </RequireAuth>
  );
}

function Seats() {
  const { user, profile } = useAuth();

  const q = useMemo(
    () =>
      user
        ? query(
            collection(db, 'ledger'),
            where('uid', '==', user.uid),
            orderBy('createdAt', 'desc'),
            limit(100),
          )
        : null,
    [user],
  );

  const { data: entries, loading, error } = useCollection<LedgerEntry>(q);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Seats</h1>
        <p className="mt-1 text-sm muted">
          The ledger is append-only — it is the record if a seat is ever disputed.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <Metric label="Available" value={profile?.seatBalance ?? 0} accent />
        <Metric label="Held by pending testers" value={profile?.seatsHeld ?? 0} />
        <Metric label="Seats earned" value={profile?.stats?.appsTested ?? 0} />
      </div>

      {(profile?.seatsHeld ?? 0) > 0 && (
        <p className="text-sm muted">
          Held seats are committed to testers who have reserved a slot on your apps. They come back
          automatically if a reservation is rejected or expires.
        </p>
      )}

      {error && <p className="card p-4 text-sm text-danger-400">Could not load your ledger: {error.message}</p>}

      {loading ? (
        <div className="card h-48 animate-pulse" />
      ) : entries.length === 0 ? (
        <p className="card p-10 text-center text-sm muted">No seat activity yet.</p>
      ) : (
        <ul className="card divide-y" style={{ borderColor: 'var(--border)' }}>
          {entries.map((e) => (
            <li key={e.id} className="flex items-center gap-4 p-3.5" style={{ borderColor: 'var(--border)' }}>
              <Delta delta={e.delta} />
              <div className="min-w-0 flex-1">
                <p className="text-sm">{REASON_LABEL[e.reason] ?? e.reason}</p>
                <p className="text-xs muted">{formatWhen(e.createdAt)}</p>
              </div>
              <span className="text-xs muted tabular-nums">balance {e.balanceAfter}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const REASON_LABEL: Record<LedgerReason, string> = {
  signup_grant: 'Welcome grant',
  hold_reservation: 'Held for a tester who reserved a slot',
  spend_approval: 'Seat spent — you approved a tester',
  earn_approval: 'Earned — your proof was approved',
  release_rejected: 'Returned — you rejected the proof',
  release_expired: 'Returned — the reservation expired',
  release_withdrawn: 'Returned — the tester withdrew',
  penalty_uninstall: 'Penalty — testing window broken',
  admin_adjust: 'Adjusted by an admin',
};

function Delta({ delta }: { delta: number }) {
  if (delta === 0) {
    // A zero-delta entry records a held seat becoming permanent; the balance already moved.
    return <span className="chip border muted tabular-nums" style={{ borderColor: 'var(--border)' }}>—</span>;
  }
  const up = delta > 0;
  return (
    <span className={`chip border tabular-nums ${up ? 'text-brand-500' : 'text-warn-400'}`} style={{ borderColor: 'var(--border)' }}>
      {up ? '+' : ''}
      {delta}
    </span>
  );
}

function Metric({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="card p-4">
      <p className="text-xs muted">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${accent ? 'text-brand-500' : ''}`}>{value}</p>
    </div>
  );
}

function formatWhen(v: unknown): string {
  const d =
    v && typeof (v as { toDate?: () => Date }).toDate === 'function'
      ? (v as { toDate: () => Date }).toDate()
      : typeof v === 'string'
        ? new Date(v)
        : null;
  return d ? d.toLocaleString() : '';
}
