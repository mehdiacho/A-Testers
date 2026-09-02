'use client';

import { useRef, useState } from 'react';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { utcDateKey, type AppDoc, type ReservationDoc } from '@a-testers/shared';
import { storage } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { errorMessage, recordCheckin, submitProof, withdrawReservation } from '@/lib/callables';

/**
 * What a tester sees once they hold a slot. The four steps mirror what Google actually
 * requires: join the group, install from the closed-test link, prove it, then stay opted
 * in for the 14-day window.
 */
export function TestingSteps({ app, reservation }: { app: AppDoc; reservation: ReservationDoc }) {
  if (reservation.status === 'approved') {
    return <ApprovedPanel app={app} reservation={reservation} />;
  }
  if (reservation.status === 'proof_submitted') {
    return <AwaitingReviewPanel app={app} />;
  }
  return <ReservedPanel app={app} reservation={reservation} />;
}

// ---------------------------------------------------------------------------

function ReservedPanel({ app, reservation }: { app: AppDoc; reservation: ReservationDoc }) {
  const { user } = useAuth();
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const expires = toDate(reservation.expiresAt);

  const onSubmit = async () => {
    if (!file || !user) return;
    setBusy(true);
    setError(null);
    try {
      // Storage rules pin the path to the uploader's uid, so a tester cannot write proof
      // into someone else's folder.
      const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
      const path = `proofs/${user.uid}/${app.id}/${Date.now()}.${ext}`;
      const snap = await uploadBytes(storageRef(storage, path), file, { contentType: file.type });
      const proofUrl = await getDownloadURL(snap.ref);

      await submitProof({ appId: app.id, proofUrl, note: note.trim() || undefined });
    } catch (err) {
      setError(errorMessage(err, 'Upload failed. Check the file and try again.'));
    } finally {
      setBusy(false);
    }
  };

  const onWithdraw = async () => {
    setBusy(true);
    setError(null);
    try {
      await withdrawReservation({ appId: app.id });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-medium">Your slot is held</h2>
        {expires && <Deadline at={expires} />}
      </div>

      <ol className="mt-4 space-y-3 text-sm">
        <Step n={1} title="Join the tester group">
          <a href={app.googleGroupUrl} target="_blank" rel="noopener noreferrer" className="text-brand-500 underline">
            Open the Google Group
          </a>{' '}
          <span className="muted">and join it. The install link will not work until you have.</span>
        </Step>
        <Step n={2} title="Install the closed test">
          <a href={app.playTestUrl} target="_blank" rel="noopener noreferrer" className="text-brand-500 underline">
            Open the opt-in link
          </a>
          <span className="muted">, accept, then install from Play.</span>
        </Step>
        <Step n={3} title="Send proof">
          <span className="muted">A screenshot of the installed app or its Play listing.</span>
        </Step>
      </ol>

      <div className="mt-5 space-y-3">
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="field file:mr-3 file:rounded file:border-0 file:bg-brand-600 file:px-3 file:py-1 file:text-white"
        />
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={500}
          placeholder="Optional note for the developer — a bug you hit, a first impression…"
          className="field resize-none"
        />
        <button onClick={() => void onSubmit()} disabled={!file || busy} className="btn-primary w-full">
          {busy ? 'Uploading…' : 'Submit proof'}
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-danger-400">{error}</p>}

      <button onClick={() => void onWithdraw()} disabled={busy} className="btn-ghost mt-2 w-full text-xs">
        Give up this slot
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------

function AwaitingReviewPanel({ app }: { app: AppDoc }) {
  return (
    <div className="card p-5">
      <h2 className="font-medium">Proof submitted</h2>
      <p className="mt-1.5 text-sm muted">
        {app.name}’s developer has your screenshot. You will earn a seat as soon as they approve it —
        this page updates on its own.
      </p>
      <p className="mt-4 rounded-lg p-3 text-sm muted" style={{ background: 'var(--surface)' }}>
        Keep the app installed and opted in. Google requires {app.requiredDays} continuous days, and
        uninstalling early breaks the developer’s window.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------

function ApprovedPanel({ app, reservation }: { app: AppDoc; reservation: ReservationDoc }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = utcDateKey(new Date());
  const checkedInToday = Boolean(reservation.checkins?.[today]);

  const onCheckin = async () => {
    setBusy(true);
    setError(null);
    try {
      await recordCheckin({ appId: app.id });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const daysDone = Object.keys(reservation.checkins ?? {}).length;

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-medium">Approved — seat earned</h2>
        <span className="chip bg-brand-600/10 text-brand-500">+1 seat</span>
      </div>

      <p className="mt-2 text-sm muted">
        Now stay opted in. Check in each day you use the app so the developer can see the window is
        holding.
      </p>

      <div className="mt-4">
        <div className="flex items-center justify-between text-sm">
          <span className="muted">Days checked in</span>
          <span className="font-medium tabular-nums">
            {daysDone} / {app.requiredDays}
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--border)' }}>
          <div
            className="h-full rounded-full bg-brand-500 transition-all"
            style={{ width: `${Math.min(100, (daysDone / Math.max(1, app.requiredDays)) * 100)}%` }}
          />
        </div>
      </div>

      <button
        onClick={() => void onCheckin()}
        disabled={busy || checkedInToday}
        className={checkedInToday ? 'btn-secondary mt-4 w-full' : 'btn-primary mt-4 w-full'}
      >
        {checkedInToday ? 'Checked in today ✓' : busy ? 'Checking in…' : 'Check in for today'}
      </button>

      {error && <p className="mt-3 text-sm text-danger-400">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        className="grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold muted"
        style={{ background: 'var(--surface)' }}
      >
        {n}
      </span>
      <div>
        <p className="font-medium">{title}</p>
        <p className="mt-0.5">{children}</p>
      </div>
    </li>
  );
}

function Deadline({ at }: { at: Date }) {
  const hours = Math.max(0, Math.round((at.getTime() - Date.now()) / 3_600_000));
  const urgent = hours <= 12;
  return (
    <span className={`chip ${urgent ? 'text-warn-400' : 'muted'}`} title={at.toLocaleString()}>
      {hours >= 24 ? `${Math.floor(hours / 24)}d left` : `${hours}h left`}
    </span>
  );
}

/** Reservation timestamps arrive as Firestore Timestamps from onSnapshot. */
function toDate(v: unknown): Date | null {
  if (!v) return null;
  if (typeof (v as { toDate?: () => Date }).toDate === 'function') return (v as { toDate: () => Date }).toDate();
  if (typeof v === 'string') return new Date(v);
  return null;
}
