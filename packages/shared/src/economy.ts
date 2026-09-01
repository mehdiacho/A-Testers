/**
 * Pure seat-economy logic. No I/O, no Firebase — so the Cloud Functions and the web app
 * apply exactly the same rules, and so all of it is unit-testable in isolation.
 *
 * The functions here decide *whether* a transition is allowed. Applying it atomically is
 * the caller's job (see functions/src/economy/).
 */

import {
  ACTIVE_RESERVATION_STATUSES,
  type AppDoc,
  type PlatformConfig,
  type ReservationDoc,
  type UserDoc,
} from './types.js';

/** Deterministic reservation id — gives us "one active reservation per pair" for free. */
export function reservationId(appId: string, testerUid: string): string {
  return `${appId}__${testerUid}`;
}

export function parseReservationId(id: string): { appId: string; testerUid: string } | null {
  const parts = id.split('__');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return { appId: parts[0], testerUid: parts[1] };
}

export type GuardResult = { ok: true } | { ok: false; code: string; message: string };

const deny = (code: string, message: string): GuardResult => ({ ok: false, code, message });
const ALLOW: GuardResult = { ok: true };

export function isReservationActive(r: Pick<ReservationDoc, 'status'>): boolean {
  return ACTIVE_RESERVATION_STATUSES.includes(r.status);
}

export function openSlots(app: Pick<AppDoc, 'seatsRequested' | 'seatsReserved' | 'seatsFilled'>): number {
  return Math.max(0, app.seatsRequested - app.seatsReserved - app.seatsFilled);
}

/**
 * Can `tester` take a slot on `app`?
 *
 * `owner` is the app owner, whose seat is the one being held — the tester spends nothing.
 * `existingReservation` is the tester's prior reservation on this same app, if any: a
 * rejected or expired one may be retried, an active one may not be duplicated.
 */
export function canReserveSlot(params: {
  app: AppDoc;
  owner: Pick<UserDoc, 'seatBalance' | 'banned'>;
  tester: Pick<UserDoc, 'uid' | 'banned' | 'reputation'>;
  existingReservation: Pick<ReservationDoc, 'status'> | null;
  testerActiveReservationCount: number;
  config: PlatformConfig;
}): GuardResult {
  const { app, owner, tester, existingReservation, testerActiveReservationCount, config } = params;

  if (tester.banned) return deny('tester_banned', 'Your account is suspended.');
  if (owner.banned) return deny('owner_banned', 'This app is unavailable.');
  if (app.ownerUid === tester.uid) return deny('own_app', 'You cannot test your own app.');
  if (app.status !== 'open') return deny('app_not_open', 'This app is not accepting testers.');
  if (openSlots(app) < 1) return deny('no_slots', 'This app has no open slots left.');

  if (existingReservation) {
    if (isReservationActive(existingReservation)) {
      return deny('already_reserved', 'You already have a slot on this app.');
    }
    if (existingReservation.status === 'approved') {
      return deny('already_tested', 'You have already tested this app.');
    }
    // rejected / expired / withdrawn fall through — a retry is allowed.
  }

  if (testerActiveReservationCount >= config.maxOpenReservationsPerTester) {
    return deny(
      'too_many_open',
      `You already have ${config.maxOpenReservationsPerTester} tests in progress. Finish one first.`,
    );
  }

  // The owner pays. A hold is refused rather than allowed to drive the balance negative.
  if (owner.seatBalance < 1) {
    return deny('owner_insufficient_seats', 'This developer has run out of seats.');
  }

  return ALLOW;
}

/** Does this developer have enough seats to open a listing? */
export function canOpenApp(params: {
  app: Pick<AppDoc, 'seatsRequested' | 'seatsFilled' | 'seatsReserved' | 'status'>;
  owner: Pick<UserDoc, 'seatBalance' | 'banned' | 'reputation'>;
  config: PlatformConfig;
}): GuardResult {
  const { app, owner, config } = params;

  if (owner.banned) return deny('owner_banned', 'Your account is suspended.');
  if (owner.reputation < config.minReputationToList) {
    return deny('low_reputation', 'Your reputation is too low to list an app right now.');
  }

  const needed = config.requireFullSeatsUpfront ? openSlots(app) : 1;
  if (owner.seatBalance < needed) {
    return deny(
      'insufficient_seats',
      config.requireFullSeatsUpfront
        ? `You need ${needed} seats to open this listing; you have ${owner.seatBalance}.`
        : 'You need at least 1 seat to open a listing. Test someone else’s app to earn one.',
    );
  }

  return ALLOW;
}

export function canSubmitProof(r: Pick<ReservationDoc, 'status' | 'expiresAt'>, now: Date): GuardResult {
  if (r.status === 'proof_submitted') return deny('already_submitted', 'Your proof is awaiting review.');
  if (r.status !== 'reserved') return deny('not_reserved', 'This reservation is no longer open.');
  if (new Date(r.expiresAt).getTime() <= now.getTime()) {
    return deny('expired', 'This reservation has expired. Reserve the slot again.');
  }
  return ALLOW;
}

export function canReviewProof(
  r: Pick<ReservationDoc, 'status' | 'ownerUid'>,
  reviewerUid: string,
): GuardResult {
  if (r.ownerUid !== reviewerUid) return deny('not_owner', 'Only the app owner can review this proof.');
  if (r.status !== 'proof_submitted') return deny('not_pending', 'There is no proof awaiting review.');
  return ALLOW;
}

// ---------------------------------------------------------------------------
// 14-day retention window
// ---------------------------------------------------------------------------

export function utcDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export interface RetentionStatus {
  /** 1-based day of the testing window; 0 before it starts. */
  dayOfWindow: number;
  totalDays: number;
  windowComplete: boolean;
  /** Approved testers who have checked in within the last 48h. */
  activeTesters: number;
  /** Approved testers who have gone quiet and put the window at risk. */
  atRiskTesters: number;
  requiredTesters: number;
  /** True when the window has run its course with enough active testers throughout. */
  eligibleForProduction: boolean;
}

/**
 * Summarise where an app stands against Google's "N testers opted in for D continuous
 * days" rule. A tester silent for more than 48h is treated as at risk, since the whole
 * failure mode of the reference platform is discovering drop-outs only on the last day.
 */
export function computeRetention(params: {
  app: Pick<AppDoc, 'testingStartsAt' | 'requiredDays'>;
  approved: Pick<ReservationDoc, 'lastCheckinAt'>[];
  config: PlatformConfig;
  now: Date;
}): RetentionStatus {
  const { app, approved, config, now } = params;
  const totalDays = app.requiredDays || config.requiredDays;

  let dayOfWindow = 0;
  if (app.testingStartsAt) {
    const started = new Date(app.testingStartsAt).getTime();
    const elapsedMs = now.getTime() - started;
    dayOfWindow = elapsedMs < 0 ? 0 : Math.floor(elapsedMs / 86_400_000) + 1;
  }

  const staleCutoff = now.getTime() - 48 * 3600 * 1000;
  let activeTesters = 0;
  for (const r of approved) {
    const last = r.lastCheckinAt ? new Date(r.lastCheckinAt).getTime() : 0;
    if (last >= staleCutoff) activeTesters += 1;
  }

  const windowComplete = dayOfWindow >= totalDays;

  return {
    dayOfWindow,
    totalDays,
    windowComplete,
    activeTesters,
    atRiskTesters: approved.length - activeTesters,
    requiredTesters: config.requiredTesters,
    eligibleForProduction: windowComplete && activeTesters >= config.requiredTesters,
  };
}
