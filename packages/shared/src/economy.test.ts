import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canOpenApp,
  canReserveSlot,
  canReviewProof,
  canSubmitProof,
  computeRetention,
  openSlots,
  parseReservationId,
  reservationId,
} from './economy.js';
import { DEFAULT_PLATFORM_CONFIG, type AppDoc, type PlatformConfig, type UserDoc } from './types.js';

const NOW = new Date('2026-09-01T12:00:00.000Z');
const iso = (d: Date) => d.toISOString();
const hoursFrom = (base: Date, h: number) => new Date(base.getTime() + h * 3600_000);

function makeApp(over: Partial<AppDoc> = {}): AppDoc {
  return {
    id: 'app1',
    ownerUid: 'owner',
    name: 'Test App',
    packageName: 'com.example.app',
    shortDescription: 'An app that does a thing.',
    category: 'productivity',
    iconUrl: null,
    playTestUrl: 'https://play.google.com/apps/testing/com.example.app',
    googleGroupUrl: 'https://groups.google.com/g/example-testers',
    status: 'open',
    seatsRequested: 12,
    seatsReserved: 0,
    seatsFilled: 0,
    testingStartsAt: null,
    requiredDays: 14,
    createdAt: iso(NOW),
    updatedAt: iso(NOW),
    ...over,
  };
}

function makeUser(uid: string, over: Partial<UserDoc> = {}): UserDoc {
  return {
    uid,
    displayName: uid,
    photoURL: null,
    seatBalance: 5,
    seatsHeld: 0,
    stats: {
      appsTested: 0,
      appsPublished: 0,
      proofsApproved: 0,
      proofsRejected: 0,
      reservationsAbandoned: 0,
    },
    reputation: 50,
    strikes: 0,
    banned: false,
    isAdmin: false,
    createdAt: iso(NOW),
    updatedAt: iso(NOW),
    ...over,
  };
}

const config: PlatformConfig = { ...DEFAULT_PLATFORM_CONFIG };

function reserve(over: {
  app?: Partial<AppDoc>;
  owner?: Partial<UserDoc>;
  tester?: Partial<UserDoc>;
  existing?: { status: AppDoc['status'] } | null;
  activeCount?: number;
  config?: Partial<PlatformConfig>;
} = {}) {
  return canReserveSlot({
    app: makeApp(over.app),
    owner: makeUser('owner', over.owner),
    tester: makeUser('tester', over.tester),
    existingReservation: (over.existing ?? null) as never,
    testerActiveReservationCount: over.activeCount ?? 0,
    config: { ...config, ...over.config },
  });
}

function denialCode(r: ReturnType<typeof canReserveSlot>): string {
  assert.equal(r.ok, false, 'expected the guard to deny');
  return (r as { ok: false; code: string }).code;
}

// ---------------------------------------------------------------------------

test('reservationId is deterministic and round-trips', () => {
  const id = reservationId('app1', 'tester');
  assert.equal(id, 'app1__tester');
  assert.deepEqual(parseReservationId(id), { appId: 'app1', testerUid: 'tester' });
  assert.equal(parseReservationId('malformed'), null);
});

test('openSlots accounts for both reserved and filled seats', () => {
  assert.equal(openSlots({ seatsRequested: 12, seatsReserved: 3, seatsFilled: 4 }), 5);
  // Never negative, even if counters drift.
  assert.equal(openSlots({ seatsRequested: 12, seatsReserved: 20, seatsFilled: 0 }), 0);
});

test('a happy-path reservation is allowed', () => {
  assert.deepEqual(reserve(), { ok: true });
});

test('you cannot test your own app', () => {
  assert.equal(denialCode(reserve({ tester: { uid: 'owner' } })), 'own_app');
});

test('only open listings accept testers', () => {
  for (const status of ['draft', 'paused', 'full', 'completed', 'rejected'] as const) {
    assert.equal(denialCode(reserve({ app: { status } })), 'app_not_open', status);
  }
});

test('a full listing has no slots', () => {
  assert.equal(
    denialCode(reserve({ app: { seatsRequested: 12, seatsReserved: 6, seatsFilled: 6 } })),
    'no_slots',
  );
});

test('an active reservation cannot be duplicated', () => {
  assert.equal(denialCode(reserve({ existing: { status: 'reserved' } as never })), 'already_reserved');
  assert.equal(
    denialCode(reserve({ existing: { status: 'proof_submitted' } as never })),
    'already_reserved',
  );
});

test('an already-approved app cannot be tested twice', () => {
  assert.equal(denialCode(reserve({ existing: { status: 'approved' } as never })), 'already_tested');
});

test('a rejected or expired reservation may be retried', () => {
  for (const status of ['rejected', 'expired', 'withdrawn'] as const) {
    assert.deepEqual(reserve({ existing: { status } as never }), { ok: true }, status);
  }
});

test('the open-reservation cap is enforced', () => {
  const at = config.maxOpenReservationsPerTester;
  assert.deepEqual(reserve({ activeCount: at - 1 }), { ok: true });
  assert.equal(denialCode(reserve({ activeCount: at })), 'too_many_open');
});

test('a developer with no seats cannot take on a tester', () => {
  // This is invariant 3: the hold is refused rather than driving the balance negative.
  assert.equal(denialCode(reserve({ owner: { seatBalance: 0 } })), 'owner_insufficient_seats');
});

test('banned accounts are blocked on both sides', () => {
  assert.equal(denialCode(reserve({ tester: { banned: true } })), 'tester_banned');
  assert.equal(denialCode(reserve({ owner: { banned: true } })), 'owner_banned');
});

// ---------------------------------------------------------------------------

test('opening a listing needs one seat by default', () => {
  const app = makeApp({ status: 'draft' });
  assert.deepEqual(canOpenApp({ app, owner: makeUser('owner', { seatBalance: 1 }), config }), { ok: true });

  const broke = canOpenApp({ app, owner: makeUser('owner', { seatBalance: 0 }), config });
  assert.equal(denialCode(broke as never), 'insufficient_seats');
});

test('requireFullSeatsUpfront makes the developer pay for every slot', () => {
  const strict: PlatformConfig = { ...config, requireFullSeatsUpfront: true };
  const app = makeApp({ status: 'draft', seatsRequested: 12 });

  assert.equal(
    denialCode(canOpenApp({ app, owner: makeUser('owner', { seatBalance: 11 }), config: strict }) as never),
    'insufficient_seats',
  );
  assert.deepEqual(
    canOpenApp({ app, owner: makeUser('owner', { seatBalance: 12 }), config: strict }),
    { ok: true },
  );
});

test('reputation gates listing when configured', () => {
  const gated: PlatformConfig = { ...config, minReputationToList: 40 };
  const app = makeApp({ status: 'draft' });
  assert.equal(
    denialCode(canOpenApp({ app, owner: makeUser('owner', { reputation: 30 }), config: gated }) as never),
    'low_reputation',
  );
});

// ---------------------------------------------------------------------------

test('proof can only be submitted against a live reservation', () => {
  const future = iso(hoursFrom(NOW, 24));
  assert.deepEqual(canSubmitProof({ status: 'reserved', expiresAt: future }, NOW), { ok: true });

  assert.equal(
    denialCode(canSubmitProof({ status: 'proof_submitted', expiresAt: future }, NOW) as never),
    'already_submitted',
  );
  assert.equal(
    denialCode(canSubmitProof({ status: 'approved', expiresAt: future }, NOW) as never),
    'not_reserved',
  );
  assert.equal(
    denialCode(canSubmitProof({ status: 'reserved', expiresAt: iso(hoursFrom(NOW, -1)) }, NOW) as never),
    'expired',
  );
});

test('only the app owner reviews a pending proof', () => {
  assert.deepEqual(canReviewProof({ status: 'proof_submitted', ownerUid: 'owner' }, 'owner'), { ok: true });
  assert.equal(
    denialCode(canReviewProof({ status: 'proof_submitted', ownerUid: 'owner' }, 'someone') as never),
    'not_owner',
  );
  assert.equal(
    denialCode(canReviewProof({ status: 'reserved', ownerUid: 'owner' }, 'owner') as never),
    'not_pending',
  );
});

// ---------------------------------------------------------------------------

test('retention reports day 0 before testing starts', () => {
  const r = computeRetention({ app: makeApp(), approved: [], config, now: NOW });
  assert.equal(r.dayOfWindow, 0);
  assert.equal(r.windowComplete, false);
  assert.equal(r.eligibleForProduction, false);
});

test('retention counts a tester quiet for over 48h as at risk', () => {
  const app = makeApp({ testingStartsAt: iso(hoursFrom(NOW, -24 * 5)) });
  const approved = [
    { lastCheckinAt: iso(hoursFrom(NOW, -2)) }, // active
    { lastCheckinAt: iso(hoursFrom(NOW, -47)) }, // just inside the window
    { lastCheckinAt: iso(hoursFrom(NOW, -72)) }, // gone quiet
    { lastCheckinAt: null }, // never checked in
  ];

  const r = computeRetention({ app, approved, config, now: NOW });
  assert.equal(r.dayOfWindow, 6, 'day 6 of the window');
  assert.equal(r.activeTesters, 2);
  assert.equal(r.atRiskTesters, 2);
  assert.equal(r.windowComplete, false);
});

test('production eligibility needs a complete window AND enough active testers', () => {
  const app = makeApp({ testingStartsAt: iso(hoursFrom(NOW, -24 * 14)) });
  const active = () => ({ lastCheckinAt: iso(hoursFrom(NOW, -1)) });

  const short = computeRetention({
    app,
    approved: Array.from({ length: 11 }, active),
    config,
    now: NOW,
  });
  assert.equal(short.windowComplete, true);
  assert.equal(short.eligibleForProduction, false, '11 testers is one short of 12');

  const enough = computeRetention({
    app,
    approved: Array.from({ length: 12 }, active),
    config,
    now: NOW,
  });
  assert.equal(enough.eligibleForProduction, true);

  // 12 approved but three have gone quiet — the window has not really been met.
  const leaky = computeRetention({
    app,
    approved: [
      ...Array.from({ length: 9 }, active),
      ...Array.from({ length: 3 }, () => ({ lastCheckinAt: iso(hoursFrom(NOW, -96)) })),
    ],
    config,
    now: NOW,
  });
  assert.equal(leaky.activeTesters, 9);
  assert.equal(leaky.eligibleForProduction, false);
});
