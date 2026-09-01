/**
 * Scheduled maintenance.
 *
 * The important one is `expireStaleReservations`: a tester who reserves a slot and then
 * vanishes holds one of the developer's seats hostage. Without this sweep a listing
 * silently stalls, which is the single most common complaint about the reference platform.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import { db, COL, FieldValue, Timestamp } from '../lib/admin.js';
import { releaseSeat, bumpStat } from '../economy/seats.js';
import { ACTIVE_RESERVATION_STATUSES, type AppDoc, type ReservationDoc, type UserDoc } from '../shared.js';

const BATCH_SIZE = 200;

export const expireStaleReservations = onSchedule(
  { schedule: 'every 1 hours', timeZone: 'UTC', retryCount: 2 },
  async () => {
    const now = Timestamp.now();
    const stale = await db
      .collection(COL.reservations)
      .where('status', 'in', ACTIVE_RESERVATION_STATUSES as unknown as string[])
      .where('expiresAt', '<=', now)
      .limit(BATCH_SIZE)
      .get();

    if (stale.empty) {
      logger.info('expireStaleReservations: nothing to do');
      return;
    }

    let expired = 0;
    // One transaction per reservation. Slower than a bulk write, but each expiry moves a
    // seat and touches three documents, so atomicity per reservation is what matters.
    for (const doc of stale.docs) {
      try {
        await db.runTransaction(async (tx) => {
          const fresh = await tx.get(doc.ref);
          if (!fresh.exists) return;
          const res = fresh.data() as ReservationDoc;

          // Re-check under the transaction: the tester may have submitted proof, or a
          // developer may have reviewed it, between the query and now.
          if (!ACTIVE_RESERVATION_STATUSES.includes(res.status)) return;
          const expiresAt = res.expiresAt as unknown as Timestamp;
          if (expiresAt.toMillis() > Date.now()) return;

          const appRef = db.collection(COL.apps).doc(res.appId);
          const ownerRef = db.collection(COL.users).doc(res.ownerUid);
          const [appSnap, ownerSnap] = await Promise.all([tx.get(appRef), tx.get(ownerRef)]);
          if (!appSnap.exists || !ownerSnap.exists) return;

          const app = appSnap.data() as AppDoc;
          const owner = ownerSnap.data() as UserDoc;

          tx.update(doc.ref, { status: 'expired', reviewedAt: FieldValue.serverTimestamp() });

          const nextReserved = Math.max(0, app.seatsReserved - 1);
          const nextStatus =
            app.status === 'full' && app.seatsRequested - nextReserved - app.seatsFilled > 0
              ? 'open'
              : app.status;

          tx.update(appRef, {
            seatsReserved: FieldValue.increment(-1),
            status: nextStatus,
            updatedAt: FieldValue.serverTimestamp(),
          });

          releaseSeat(tx, res.ownerUid, owner.seatBalance, doc.id, 'release_expired');
          bumpStat(tx, res.testerUid, 'reservationsAbandoned');
          expired += 1;
        });
      } catch (err) {
        // One bad reservation must not stop the sweep.
        logger.error('expireStaleReservations: failed', { reservationId: doc.id, err });
      }
    }

    logger.info('expireStaleReservations: done', { scanned: stale.size, expired });
  },
);

/**
 * Reputation is derived, never written by hand. It starts at 50 and moves with behaviour,
 * so `minReputationToList` can gate listing privileges without a manual moderation queue.
 */
export const recomputeReputation = onSchedule(
  { schedule: 'every 24 hours', timeZone: 'UTC' },
  async () => {
    let processed = 0;
    let cursor: FirebaseFirestore.QueryDocumentSnapshot | null = null;

    for (;;) {
      let q = db.collection(COL.users).orderBy('__name__').limit(BATCH_SIZE);
      if (cursor) q = q.startAfter(cursor);
      const page = await q.get();
      if (page.empty) break;

      const batch = db.batch();
      for (const doc of page.docs) {
        const u = doc.data() as UserDoc;
        const s = u.stats ?? {
          appsTested: 0,
          appsPublished: 0,
          proofsApproved: 0,
          proofsRejected: 0,
          reservationsAbandoned: 0,
        };

        const score =
          50 +
          Math.min(30, s.proofsApproved * 3) -
          s.proofsRejected * 5 -
          s.reservationsAbandoned * 4 -
          (u.strikes ?? 0) * 15;

        const reputation = Math.max(0, Math.min(100, Math.round(score)));
        if (reputation !== u.reputation) {
          batch.update(doc.ref, { reputation, updatedAt: FieldValue.serverTimestamp() });
          processed += 1;
        }
      }
      await batch.commit();

      cursor = page.docs[page.docs.length - 1] ?? null;
      if (page.size < BATCH_SIZE) break;
    }

    logger.info('recomputeReputation: done', { updated: processed });
  },
);
