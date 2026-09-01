/**
 * Transactional seat primitives.
 *
 * Every one of these must be called *inside* a Firestore transaction, after the caller
 * has read the user document (so `balanceBefore` is transaction-consistent). They pair a
 * balance mutation with its ledger entry in the same atomic write, which is what makes
 * the ledger trustworthy.
 *
 * Ledger semantics — worth being precise, because holds make this non-obvious:
 *
 *   hold      balance -1, seatsHeld +1   ledger delta -1
 *   release   balance +1, seatsHeld -1   ledger delta +1
 *   spend     balance  0, seatsHeld -1   ledger delta  0   (the hold becomes permanent)
 *   credit    balance +1                 ledger delta +1
 *
 * So the invariant is: sum(ledger deltas for a uid) == user.seatBalance, and
 * user.seatsHeld == the number of active reservations against that user's apps.
 * A delta-0 entry still gets written: it is the audit record of a seat leaving the system.
 */

import { db, COL, FieldValue, Timestamp } from '../lib/admin.js';
import type { LedgerReason } from '../shared.js';
import type { Transaction } from 'firebase-admin/firestore';

interface LedgerWrite {
  tx: Transaction;
  uid: string;
  delta: number;
  reason: LedgerReason;
  refId: string | null;
  balanceAfter: number;
}

function writeLedger({ tx, uid, delta, reason, refId, balanceAfter }: LedgerWrite): void {
  const ref = db.collection(COL.ledger).doc();
  tx.set(ref, {
    uid,
    delta,
    reason,
    refId,
    balanceAfter,
    createdAt: FieldValue.serverTimestamp(),
  });
}

function userRef(uid: string) {
  return db.collection(COL.users).doc(uid);
}

/**
 * Reserve one of the owner's seats against a pending reservation.
 * The caller must already have verified `balanceBefore >= 1` via `canReserveSlot`;
 * this throws rather than letting a balance go negative if that check was skipped.
 */
export function holdSeat(
  tx: Transaction,
  ownerUid: string,
  balanceBefore: number,
  refId: string,
): void {
  if (balanceBefore < 1) {
    throw new Error(`holdSeat: ${ownerUid} has no seats to hold (balance ${balanceBefore})`);
  }
  const balanceAfter = balanceBefore - 1;
  tx.update(userRef(ownerUid), {
    seatBalance: FieldValue.increment(-1),
    seatsHeld: FieldValue.increment(1),
    updatedAt: FieldValue.serverTimestamp(),
  });
  writeLedger({ tx, uid: ownerUid, delta: -1, reason: 'hold_reservation', refId, balanceAfter });
}

/** Give a held seat back to the owner — the reservation was rejected, expired or withdrawn. */
export function releaseSeat(
  tx: Transaction,
  ownerUid: string,
  balanceBefore: number,
  refId: string,
  reason: Extract<
    LedgerReason,
    'release_rejected' | 'release_expired' | 'release_withdrawn' | 'penalty_uninstall'
  >,
): void {
  const balanceAfter = balanceBefore + 1;
  tx.update(userRef(ownerUid), {
    seatBalance: FieldValue.increment(1),
    seatsHeld: FieldValue.increment(-1),
    updatedAt: FieldValue.serverTimestamp(),
  });
  writeLedger({ tx, uid: ownerUid, delta: 1, reason, refId, balanceAfter });
}

/**
 * The hold becomes permanent: the owner's seat is consumed and handed to the tester.
 * Balance does not move here — it moved at hold time — only the held counter clears.
 */
export function spendHeldSeat(
  tx: Transaction,
  ownerUid: string,
  balanceBefore: number,
  refId: string,
): void {
  tx.update(userRef(ownerUid), {
    seatsHeld: FieldValue.increment(-1),
    updatedAt: FieldValue.serverTimestamp(),
  });
  writeLedger({
    tx,
    uid: ownerUid,
    delta: 0,
    reason: 'spend_approval',
    refId,
    balanceAfter: balanceBefore,
  });
}

/** Award seats to a user — normally the tester being approved. */
export function creditSeats(
  tx: Transaction,
  uid: string,
  balanceBefore: number,
  amount: number,
  reason: LedgerReason,
  refId: string | null,
): void {
  if (amount === 0) return;
  const balanceAfter = balanceBefore + amount;
  if (balanceAfter < 0) {
    throw new Error(`creditSeats: would drive ${uid} negative (${balanceBefore} ${amount})`);
  }
  tx.update(userRef(uid), {
    seatBalance: FieldValue.increment(amount),
    updatedAt: FieldValue.serverTimestamp(),
  });
  writeLedger({ tx, uid, delta: amount, reason, refId, balanceAfter });
}

/** Bump a counter under `stats` without clobbering the rest of the map. */
export function bumpStat(
  tx: Transaction,
  uid: string,
  stat: 'appsTested' | 'appsPublished' | 'proofsApproved' | 'proofsRejected' | 'reservationsAbandoned',
  by = 1,
): void {
  tx.update(userRef(uid), {
    [`stats.${stat}`]: FieldValue.increment(by),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export function tsFromNow(msFromNow: number): Timestamp {
  return Timestamp.fromMillis(Date.now() + msFromNow);
}
