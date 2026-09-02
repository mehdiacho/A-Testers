/**
 * The reservation lifecycle: reserve → submit proof → review → approved / rejected.
 *
 * Each callable runs the whole transition inside one Firestore transaction, and every
 * transaction follows the same shape: read everything, run the shared guard, then write.
 * Firestore requires all reads to precede all writes, so the reads are deliberately
 * grouped at the top of each handler rather than fetched lazily.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, COL, FieldValue, Timestamp } from '../lib/admin.js';
import { getPlatformConfigTx } from '../lib/config.js';
import { assertGuard, requireAuth, requireString, notFound, invalid } from '../lib/errors.js';
import { holdSeat, releaseSeat, spendHeldSeat, creditSeats, bumpStat } from './seats.js';
import { parseVerifiedInstall } from './install.js';
import {
  ACTIVE_RESERVATION_STATUSES,
  canReserveSlot,
  canReviewProof,
  canSubmitProof,
  openSlots,
  reservationId,
  type AppDoc,
  type ReservationDoc,
  type UserDoc,
} from '../shared.js';
import type { Transaction } from 'firebase-admin/firestore';

const appRef = (id: string) => db.collection(COL.apps).doc(id);
const userRef = (uid: string) => db.collection(COL.users).doc(uid);
const resRef = (id: string) => db.collection(COL.reservations).doc(id);

/** Read a user inside a transaction, failing loudly if the profile is missing. */
async function readUser(tx: Transaction, uid: string): Promise<UserDoc> {
  const snap = await tx.get(userRef(uid));
  if (!snap.exists) notFound('User profile');
  return { uid, ...(snap.data() as Omit<UserDoc, 'uid'>) };
}

async function readApp(tx: Transaction, appId: string): Promise<AppDoc> {
  const snap = await tx.get(appRef(appId));
  if (!snap.exists) notFound('App');
  return { id: appId, ...(snap.data() as Omit<AppDoc, 'id'>) };
}

/**
 * Recompute a listing's status from its counters. An app that fills up shows as `full`
 * and drops back to `open` the moment a slot frees, without the owner touching anything.
 */
function statusForCounters(app: Pick<AppDoc, 'status' | 'seatsRequested'>, reserved: number, filled: number) {
  if (app.status !== 'open' && app.status !== 'full') return app.status;
  return app.seatsRequested - reserved - filled <= 0 ? 'full' : 'open';
}

// ---------------------------------------------------------------------------
// reserveSlot
// ---------------------------------------------------------------------------

export const reserveSlot = onCall({ cors: true }, async (request) => {
  const testerUid = requireAuth(request);
  const appId = requireString((request.data as Record<string, unknown>)?.appId, 'appId', 128);
  const id = reservationId(appId, testerUid);

  return db.runTransaction(async (tx) => {
    // ---- reads ----
    const config = await getPlatformConfigTx(tx);
    const app = await readApp(tx, appId);

    // Guarded here as well as in canReserveSlot so we never issue a self-read of the
    // same user document twice in one transaction.
    if (app.ownerUid === testerUid) {
      throw new HttpsError('failed-precondition', 'You cannot test your own app.', {
        reason: 'own_app',
      });
    }

    const [owner, tester, existingSnap, activeSnap] = await Promise.all([
      readUser(tx, app.ownerUid),
      readUser(tx, testerUid),
      tx.get(resRef(id)),
      tx.get(
        db
          .collection(COL.reservations)
          .where('testerUid', '==', testerUid)
          .where('status', 'in', ACTIVE_RESERVATION_STATUSES as unknown as string[]),
      ),
    ]);

    const existing = existingSnap.exists
      ? (existingSnap.data() as ReservationDoc)
      : null;

    // ---- guard ----
    assertGuard(
      canReserveSlot({
        app,
        owner,
        tester,
        existingReservation: existing,
        testerActiveReservationCount: activeSnap.size,
        config,
      }),
    );

    // ---- writes ----
    const expiresAt = Timestamp.fromMillis(Date.now() + config.reservationTtlHours * 3600 * 1000);

    // A retry after a rejection overwrites the previous document wholesale, so stale
    // proof and rejection fields cannot leak into the new attempt.
    tx.set(resRef(id), {
      appId,
      ownerUid: app.ownerUid,
      testerUid,
      status: 'reserved',
      reservedAt: FieldValue.serverTimestamp(),
      expiresAt,
      proofUrl: null,
      proofNote: null,
      proofSubmittedAt: null,
      verifiedInstall: null,
      reviewedAt: null,
      rejectionReason: null,
      checkins: {},
      lastCheckinAt: null,
      checkinStreak: 0,
    });

    const nextReserved = app.seatsReserved + 1;
    tx.update(appRef(appId), {
      seatsReserved: FieldValue.increment(1),
      status: statusForCounters(app, nextReserved, app.seatsFilled),
      updatedAt: FieldValue.serverTimestamp(),
    });

    holdSeat(tx, app.ownerUid, owner.seatBalance, id);

    return {
      reservationId: id,
      expiresAt: expiresAt.toDate().toISOString(),
      playTestUrl: app.playTestUrl,
      googleGroupUrl: app.googleGroupUrl,
      packageName: app.packageName,
    };
  });
});

// ---------------------------------------------------------------------------
// withdrawReservation
// ---------------------------------------------------------------------------

export const withdrawReservation = onCall({ cors: true }, async (request) => {
  const testerUid = requireAuth(request);
  const appId = requireString((request.data as Record<string, unknown>)?.appId, 'appId', 128);
  const id = reservationId(appId, testerUid);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(resRef(id));
    if (!snap.exists) notFound('Reservation');
    const res = snap.data() as ReservationDoc;

    if (res.testerUid !== testerUid) {
      throw new HttpsError('permission-denied', 'This is not your reservation.');
    }
    // Withdrawal is only offered before proof is submitted; once a developer has a proof
    // in their queue the tester should let it be reviewed rather than yank it away.
    if (res.status !== 'reserved') {
      throw new HttpsError('failed-precondition', 'This reservation can no longer be withdrawn.', {
        reason: 'not_reserved',
      });
    }

    const [app, owner] = await Promise.all([readApp(tx, appId), readUser(tx, res.ownerUid)]);

    tx.update(resRef(id), {
      status: 'withdrawn',
      reviewedAt: FieldValue.serverTimestamp(),
    });

    const nextReserved = Math.max(0, app.seatsReserved - 1);
    tx.update(appRef(appId), {
      seatsReserved: FieldValue.increment(-1),
      status: statusForCounters(app, nextReserved, app.seatsFilled),
      updatedAt: FieldValue.serverTimestamp(),
    });

    releaseSeat(tx, res.ownerUid, owner.seatBalance, id, 'release_withdrawn');
    bumpStat(tx, testerUid, 'reservationsAbandoned');

    return { ok: true };
  });
});

// ---------------------------------------------------------------------------
// submitProof
// ---------------------------------------------------------------------------

/**
 * Proof URLs must point at our own Storage bucket. Accepting an arbitrary https URL
 * would let a tester submit a hotlinked image they can swap out after approval.
 */
function assertOwnStorageUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    invalid('Proof URL is not a valid URL.', 'bad_proof_url');
  }
  const allowed = ['firebasestorage.googleapis.com', 'storage.googleapis.com'];
  if (parsed.protocol !== 'https:' || !allowed.includes(parsed.hostname)) {
    invalid('Upload your screenshot through the app rather than pasting a link.', 'bad_proof_url');
  }
}

export const submitProof = onCall({ cors: true }, async (request) => {
  const testerUid = requireAuth(request);
  const data = (request.data ?? {}) as Record<string, unknown>;
  const appId = requireString(data.appId, 'appId', 128);
  const proofUrl = requireString(data.proofUrl, 'proofUrl', 1500);
  const note = data.note === undefined || data.note === null ? null : requireString(data.note, 'note', 500);

  assertOwnStorageUrl(proofUrl);

  const id = reservationId(appId, testerUid);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(resRef(id));
    if (!snap.exists) notFound('Reservation');
    const res = snap.data() as ReservationDoc;

    if (res.testerUid !== testerUid) {
      throw new HttpsError('permission-denied', 'This is not your reservation.');
    }

    assertGuard(
      canSubmitProof(
        { status: res.status, expiresAt: (res.expiresAt as unknown as Timestamp).toDate().toISOString() },
        new Date(),
      ),
    );

    // The Android client sends what its PackageManager saw. It is stored beside the
    // screenshot as corroboration for the developer, never in place of the review — the
    // seat still only moves when a human approves.
    const appSnap = await tx.get(appRef(appId));
    const verifiedInstall = parseVerifiedInstall(
      data.verifiedInstall,
      (appSnap.data() as AppDoc | undefined)?.packageName ?? '',
    );

    tx.update(resRef(id), {
      status: 'proof_submitted',
      proofUrl,
      proofNote: note,
      proofSubmittedAt: FieldValue.serverTimestamp(),
      ...(verifiedInstall ? { verifiedInstall } : {}),
    });

    return { ok: true };
  });
});

// ---------------------------------------------------------------------------
// reviewProof — the only place a seat actually changes hands
// ---------------------------------------------------------------------------

export const reviewProof = onCall({ cors: true }, async (request) => {
  const reviewerUid = requireAuth(request);
  const data = (request.data ?? {}) as Record<string, unknown>;
  const appId = requireString(data.appId, 'appId', 128);
  const testerUid = requireString(data.testerUid, 'testerUid', 128);
  const approve = data.approve === true;
  const reason =
    data.reason === undefined || data.reason === null ? null : requireString(data.reason, 'reason', 300);

  if (!approve && !reason) {
    invalid('Tell the tester why the proof was rejected.', 'reason_required');
  }

  const id = reservationId(appId, testerUid);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(resRef(id));
    if (!snap.exists) notFound('Reservation');
    const res = snap.data() as ReservationDoc;

    assertGuard(canReviewProof({ status: res.status, ownerUid: res.ownerUid }, reviewerUid));

    const config = await getPlatformConfigTx(tx);
    const [app, owner, tester] = await Promise.all([
      readApp(tx, appId),
      readUser(tx, res.ownerUid),
      readUser(tx, testerUid),
    ]);

    if (approve) {
      tx.update(resRef(id), {
        status: 'approved',
        reviewedAt: FieldValue.serverTimestamp(),
        rejectionReason: null,
      });

      // The owner's seat was debited at hold time; approving only makes it permanent.
      spendHeldSeat(tx, res.ownerUid, owner.seatBalance, id);
      creditSeats(tx, testerUid, tester.seatBalance, 1, 'earn_approval', id);
      bumpStat(tx, testerUid, 'appsTested');
      bumpStat(tx, testerUid, 'proofsApproved');

      const nextReserved = Math.max(0, app.seatsReserved - 1);
      const nextFilled = app.seatsFilled + 1;

      const appUpdate: Record<string, unknown> = {
        seatsReserved: FieldValue.increment(-1),
        seatsFilled: FieldValue.increment(1),
        status: statusForCounters(app, nextReserved, nextFilled),
        updatedAt: FieldValue.serverTimestamp(),
      };
      // The 14-day clock starts with the first approved tester, not at listing time.
      if (!app.testingStartsAt) {
        appUpdate.testingStartsAt = FieldValue.serverTimestamp();
        appUpdate.requiredDays = app.requiredDays || config.requiredDays;
      }
      tx.update(appRef(appId), appUpdate);

      return { ok: true, approved: true, seatsFilled: nextFilled };
    }

    tx.update(resRef(id), {
      status: 'rejected',
      reviewedAt: FieldValue.serverTimestamp(),
      rejectionReason: reason,
    });

    // A rejected proof frees the slot and hands the seat back to the developer.
    releaseSeat(tx, res.ownerUid, owner.seatBalance, id, 'release_rejected');
    bumpStat(tx, testerUid, 'proofsRejected');

    const nextReserved = Math.max(0, app.seatsReserved - 1);
    tx.update(appRef(appId), {
      seatsReserved: FieldValue.increment(-1),
      status: statusForCounters(app, nextReserved, app.seatsFilled),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { ok: true, approved: false };
  });
});

// ---------------------------------------------------------------------------
// recordCheckin — 14-day retention ping
// ---------------------------------------------------------------------------

export const recordCheckin = onCall({ cors: true }, async (request) => {
  const testerUid = requireAuth(request);
  const data = (request.data ?? {}) as Record<string, unknown>;
  const appId = requireString(data.appId, 'appId', 128);
  const id = reservationId(appId, testerUid);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(resRef(id));
    if (!snap.exists) notFound('Reservation');
    const res = snap.data() as ReservationDoc;
    const appSnap = await tx.get(appRef(appId));

    if (res.testerUid !== testerUid) {
      throw new HttpsError('permission-denied', 'This is not your reservation.');
    }
    if (res.status !== 'approved') {
      throw new HttpsError('failed-precondition', 'Check-ins start once your proof is approved.', {
        reason: 'not_approved',
      });
    }

    const today = new Date().toISOString().slice(0, 10);
    if (res.checkins?.[today]) {
      return { ok: true, alreadyCheckedIn: true, streak: res.checkinStreak };
    }

    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const streak = res.checkins?.[yesterday] ? (res.checkinStreak ?? 0) + 1 : 1;

    // A check-in from the phone re-confirms the app is still installed, which is the
    // half of Google's rule a screenshot cannot speak to at all.
    const verifiedInstall = parseVerifiedInstall(
      data.verifiedInstall,
      (appSnap.data() as AppDoc | undefined)?.packageName ?? '',
    );

    tx.update(resRef(id), {
      [`checkins.${today}`]: true,
      lastCheckinAt: FieldValue.serverTimestamp(),
      checkinStreak: streak,
      ...(verifiedInstall ? { verifiedInstall } : {}),
    });

    return { ok: true, alreadyCheckedIn: false, streak };
  });
});

export { openSlots };
