'use client';

import { useMemo, useState } from 'react';
import { collection, orderBy, query, where } from 'firebase/firestore';
import type { ReservationDoc } from '@a-testers/shared';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { useCollection } from '@/lib/use-collection';
import { errorMessage, reviewProof } from '@/lib/callables';

/**
 * Pending proofs across all of the developer's listings.
 *
 * This is the platform's bottleneck: a seat stays held until the developer acts, so the
 * queue is surfaced at the top of the listings page rather than buried per-app.
 */
export function ReviewQueue() {
  const { user } = useAuth();

  const q = useMemo(
    () =>
      user
        ? query(
            collection(db, 'reservations'),
            where('ownerUid', '==', user.uid),
            where('status', '==', 'proof_submitted'),
            orderBy('proofSubmittedAt', 'asc'),
          )
        : null,
    [user],
  );

  const { data: pending, loading, error } = useCollection<ReservationDoc>(q);

  if (loading) return <div className="card h-24 animate-pulse" />;
  if (error) {
    return <p className="card p-4 text-sm text-danger-400">Could not load your review queue: {error.message}</p>;
  }
  if (pending.length === 0) return null;

  return (
    <section>
      <h2 className="text-sm font-medium">
        Proof waiting on you <span className="muted tabular-nums">({pending.length})</span>
      </h2>
      <p className="mt-0.5 text-xs muted">
        Each of these is holding one of your seats. Approving releases it to the tester.
      </p>
      <ul className="mt-3 space-y-3">
        {pending.map((r) => (
          <li key={r.id}>
            <ProofCard reservation={r} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ProofCard({ reservation }: { reservation: ReservationDoc }) {
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const act = async (approve: boolean) => {
    if (!approve && reason.trim().length === 0) {
      setError('Tell the tester what was wrong so they can fix it.');
      return;
    }
    setBusy(approve ? 'approve' : 'reject');
    setError(null);
    try {
      await reviewProof({
        appId: reservation.appId,
        testerUid: reservation.testerUid,
        approve,
        reason: approve ? undefined : reason.trim(),
      });
      // The document leaves the query on success, so the card unmounts itself.
    } catch (err) {
      setError(errorMessage(err));
      setBusy(null);
    }
  };

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-col gap-4 p-4 sm:flex-row">
        {reservation.proofUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <a href={reservation.proofUrl} target="_blank" rel="noopener noreferrer" className="shrink-0">
            <img
              src={reservation.proofUrl}
              alt="Install proof submitted by the tester"
              className="h-40 w-full rounded-lg object-cover sm:w-32"
            />
          </a>
        )}

        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Tester {reservation.testerUid.slice(0, 8)}</p>
          <p className="text-xs muted">App {reservation.appId.slice(0, 8)}</p>

          {reservation.proofNote && (
            <p className="mt-2 rounded-lg p-2.5 text-sm" style={{ background: 'var(--surface)' }}>
              {reservation.proofNote}
            </p>
          )}

          {rejecting && (
            <textarea
              autoFocus
              rows={2}
              maxLength={300}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this proof not acceptable?"
              className="field mt-3 resize-none"
            />
          )}

          {error && <p className="mt-2 text-sm text-danger-400">{error}</p>}

          <div className="mt-3 flex gap-2">
            <button
              onClick={() => void act(true)}
              disabled={busy !== null}
              className="btn-primary flex-1 sm:flex-none"
            >
              {busy === 'approve' ? 'Approving…' : 'Approve'}
            </button>

            {rejecting ? (
              <>
                <button onClick={() => void act(false)} disabled={busy !== null} className="btn-secondary">
                  {busy === 'reject' ? 'Rejecting…' : 'Confirm rejection'}
                </button>
                <button onClick={() => setRejecting(false)} disabled={busy !== null} className="btn-ghost">
                  Cancel
                </button>
              </>
            ) : (
              <button onClick={() => setRejecting(true)} disabled={busy !== null} className="btn-secondary">
                Reject
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
