'use client';

import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import {
  openSlots,
  reservationId,
  type AppDoc,
  type ReservationDoc,
} from '@a-testers/shared';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { errorMessage, reserveSlot } from '@/lib/callables';
import { TestingSteps } from './testing-steps';

/**
 * The reserve / in-progress panel on an app page.
 *
 * It subscribes to the tester's own reservation rather than reading it once, so the panel
 * updates the moment a developer approves or rejects the proof without a refresh.
 */
export function ReservePanel({ app }: { app: AppDoc }) {
  const { user, profile, loading, signIn } = useAuth();
  const [reservation, setReservation] = useState<ReservationDoc | null>(null);
  const [watching, setWatching] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setReservation(null);
      setWatching(false);
      return;
    }
    setWatching(true);
    return onSnapshot(
      doc(db, 'reservations', reservationId(app.id, user.uid)),
      (snap) => {
        setReservation(snap.exists() ? ({ id: snap.id, ...snap.data() } as ReservationDoc) : null);
        setWatching(false);
      },
      () => setWatching(false),
    );
  }, [user, app.id]);

  if (loading || (user && watching)) {
    return <div className="card h-40 animate-pulse" />;
  }

  if (!user) {
    return (
      <div className="card p-5">
        <h2 className="font-medium">Test this app</h2>
        <p className="mt-1.5 text-sm muted">
          Sign in to reserve a slot. Getting approved on this app earns you one seat towards testers
          for your own.
        </p>
        <button onClick={() => void signIn()} className="btn-primary mt-4 w-full">
          Sign in with Google
        </button>
      </div>
    );
  }

  if (app.ownerUid === user.uid) {
    return (
      <div className="card p-5">
        <h2 className="font-medium">This is your app</h2>
        <p className="mt-1.5 text-sm muted">
          Manage its testers and review incoming proof from your listings page.
        </p>
        <a href="/dashboard/listings" className="btn-secondary mt-4 w-full">
          Go to my apps
        </a>
      </div>
    );
  }

  // An active or completed reservation replaces the reserve button with the next step.
  if (reservation && reservation.status !== 'rejected' && reservation.status !== 'expired' && reservation.status !== 'withdrawn') {
    return <TestingSteps app={app} reservation={reservation} />;
  }

  const slots = openSlots(app);
  const retrying = reservation !== null;

  const onReserve = async () => {
    setBusy(true);
    setError(null);
    try {
      await reserveSlot({ appId: app.id });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card p-5">
      <h2 className="font-medium">{retrying ? 'Try again' : 'Test this app'}</h2>

      {reservation?.status === 'rejected' && reservation.rejectionReason && (
        <p className="mt-2 rounded-lg border border-danger-600/30 bg-danger-600/10 p-3 text-sm">
          <span className="font-medium">Your proof was rejected:</span>{' '}
          <span className="muted">{reservation.rejectionReason}</span>
        </p>
      )}
      {reservation?.status === 'expired' && (
        <p className="mt-2 text-sm muted">
          Your previous reservation expired before proof was submitted. You can reserve the slot again.
        </p>
      )}

      <dl className="mt-4 space-y-2 text-sm">
        <Row label="Slots left" value={slots === 0 ? 'None' : String(slots)} />
        <Row label="You earn" value="1 seat on approval" />
        <Row label="Your balance" value={`${profile?.seatBalance ?? 0} seats`} />
      </dl>

      <button onClick={() => void onReserve()} disabled={busy || slots === 0} className="btn-primary mt-4 w-full">
        {busy ? 'Reserving…' : slots === 0 ? 'No slots left' : 'Reserve a slot'}
      </button>

      {error && <p className="mt-3 text-sm text-danger-400">{error}</p>}

      <p className="mt-3 text-xs muted">
        Reserving holds one of the developer’s seats. If you don’t submit proof in time the slot is
        released automatically.
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="muted">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}
