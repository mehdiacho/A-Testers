/**
 * Seed the emulator with a listing part-way through its 14-day window, so the retention
 * board can be looked at with realistic data — including the case that matters, testers
 * who joined and then went quiet.
 *
 * Run the emulators first, sign in to the web app, then:
 *   node scripts/seed-retention.mjs <ownerUid>
 *
 * The uid is printed in the browser console by the web app, or visible in the Auth
 * emulator UI at http://127.0.0.1:4000/auth.
 */

import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

// Must match the project the emulators were started with, which for `npm run dev:web` is
// the id in web/.env.local rather than the demo id the e2e script uses.
const PROJECT = process.env.SEED_PROJECT_ID ?? 'a-testers-app';
process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';

const ownerUid = process.argv[2];
if (!ownerUid) {
  console.error('Usage: node scripts/seed-retention.mjs <ownerUid>');
  process.exit(1);
}

initializeApp({ projectId: PROJECT });
const db = getFirestore();

const DAY = 24 * 3600 * 1000;
const HOUR = 3600 * 1000;
const now = Date.now();

/** Day 6 of 14. */
const DAY_OF_WINDOW = 6;
const startedAt = now - (DAY_OF_WINDOW - 1) * DAY;
const REQUIRED = 12;

const APP_ID = 'seed-retention-app';

/**
 * Twelve testers: nine checked in today, one yesterday, and two have been silent long
 * enough to cross the 48h at-risk threshold. That is the shape of a window about to fail.
 */
const TESTERS = Array.from({ length: REQUIRED }, (_, i) => {
  const hoursSilent = i < 9 ? 2 + i : i === 9 ? 26 : i === 10 ? 55 : 96;
  return {
    uid: `seed-tester-${String(i + 1).padStart(2, '0')}`,
    displayName: `Tester ${i + 1}`,
    hoursSilent,
  };
});

const utcDateKey = (ms) => new Date(ms).toISOString().slice(0, 10);

async function main() {
  const batch = db.batch();

  // The onUserCreated trigger normally writes this; merge rather than overwrite so a
  // real signed-in developer keeps their seat balance.
  batch.set(
    db.doc(`users/${ownerUid}`),
    {
      seatBalance: 0,
      seatsHeld: 0,
      reputation: 50,
      appsListed: 1,
      testsCompleted: REQUIRED,
      updatedAt: Timestamp.fromMillis(now),
    },
    { merge: true },
  );

  batch.set(db.doc(`apps/${APP_ID}`), {
    ownerUid,
    name: 'Trailhead',
    packageName: 'today.atesters.trailhead',
    shortDescription: 'Offline hiking maps with route recording.',
    description: 'A seeded listing used to exercise the retention board.',
    category: 'travel',
    playTestUrl: 'https://play.google.com/apps/testing/today.atesters.trailhead',
    googleGroupUrl: 'https://groups.google.com/g/atesters-trailhead',
    iconUrl: null,
    status: 'full',
    seatsRequested: REQUIRED,
    seatsReserved: 0,
    seatsFilled: REQUIRED,
    requiredDays: 14,
    testingStartsAt: Timestamp.fromMillis(startedAt),
    createdAt: Timestamp.fromMillis(startedAt - 2 * DAY),
    updatedAt: Timestamp.fromMillis(now),
  });

  for (const t of TESTERS) {
    batch.set(db.doc(`users/${t.uid}`), {
      displayName: t.displayName,
      photoURL: null,
      seatBalance: 1,
      seatsHeld: 0,
      reputation: 50,
      appsListed: 0,
      testsCompleted: 3,
      createdAt: Timestamp.fromMillis(startedAt - 5 * DAY),
      updatedAt: Timestamp.fromMillis(now),
    });

    const lastCheckin = now - t.hoursSilent * HOUR;

    // One check-in per day from the start of the window up to their last active day, so
    // "days in" and the streak agree with the last-seen column.
    const checkins = {};
    for (let ms = startedAt; ms <= lastCheckin; ms += DAY) checkins[utcDateKey(ms)] = true;
    const daysIn = Object.keys(checkins).length;

    batch.set(db.doc(`reservations/${APP_ID}__${t.uid}`), {
      appId: APP_ID,
      ownerUid,
      testerUid: t.uid,
      status: 'approved',
      reservedAt: Timestamp.fromMillis(startedAt - HOUR),
      expiresAt: Timestamp.fromMillis(startedAt + 72 * HOUR),
      proofSubmittedAt: Timestamp.fromMillis(startedAt),
      reviewedAt: Timestamp.fromMillis(startedAt),
      proofUrl: 'https://firebasestorage.googleapis.com/seed/proof.png',
      proofNote: 'Joined the group and installed from the test link.',
      reviewNote: null,
      checkins,
      checkinStreak: daysIn,
      lastCheckinAt: Timestamp.fromMillis(lastCheckin),
      createdAt: Timestamp.fromMillis(startedAt - HOUR),
      updatedAt: Timestamp.fromMillis(lastCheckin),
    });
  }

  await batch.commit();

  const quiet = TESTERS.filter((t) => t.hoursSilent > 48).length;
  console.log(`Seeded apps/${APP_ID} for owner ${ownerUid}`);
  console.log(`  day ${DAY_OF_WINDOW} of 14 · ${REQUIRED} approved testers · ${quiet} gone quiet`);
  console.log(`  http://127.0.0.1:3000/dashboard/listings/${APP_ID}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
