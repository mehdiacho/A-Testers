/**
 * End-to-end test of the seat economy against the Firebase emulator suite.
 *
 * The unit tests in packages/shared prove the guards decide correctly. This proves the
 * other half: that the callables apply those decisions atomically, that balances and held
 * counters move the way the ledger says they do, and that the invariants survive a full
 * reserve → proof → review cycle including a rejection.
 *
 * Run the emulators first:
 *   firebase emulators:start --project demo-a-testers --only firestore,auth,storage,functions
 * Then:
 *   node scripts/economy-e2e.mjs
 */

import assert from 'node:assert/strict';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const PROJECT = 'demo-a-testers';
const REGION = 'europe-west1';
const API_KEY = 'demo-api-key';

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';

const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const FUNCTIONS_BASE = `http://127.0.0.1:5001/${PROJECT}/${REGION}`;

initializeApp({ projectId: PROJECT });
const db = getFirestore();
const auth = getAuth();

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let passed = 0;
function check(label, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${label}`);
  } catch (err) {
    console.error(`  ✗ ${label}`);
    throw err;
  }
}

/** Exchange a custom token for an ID token via the auth emulator. */
async function idTokenFor(uid) {
  const customToken = await auth.createCustomToken(uid);
  const res = await fetch(
    `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    },
  );
  const body = await res.json();
  if (!body.idToken) throw new Error(`could not mint an ID token: ${JSON.stringify(body)}`);
  return body.idToken;
}

/** Invoke a callable the way the client SDK does. */
async function callable(name, idToken, data) {
  const res = await fetch(`${FUNCTIONS_BASE}/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ data }),
  });
  const body = await res.json().catch(() => ({}));
  if (body.error) {
    const err = new Error(body.error.message ?? 'callable failed');
    err.reason = body.error.details?.reason ?? null;
    err.status = body.error.status ?? null;
    throw err;
  }
  if (!res.ok) throw new Error(`${name} failed with HTTP ${res.status}`);
  return body.result;
}

/** Callables that are expected to be refused. */
async function expectRejection(name, idToken, data, expectedReason) {
  try {
    await callable(name, idToken, data);
  } catch (err) {
    assert.equal(err.reason, expectedReason, `${name}: wrong denial reason (${err.message})`);
    return;
  }
  throw new Error(`${name} was expected to fail with "${expectedReason}" but succeeded`);
}

const getUser = async (uid) => (await db.collection('users').doc(uid).get()).data();
const getApp = async (id) => (await db.collection('apps').doc(id).get()).data();
const getReservation = async (appId, testerUid) =>
  (await db.collection('reservations').doc(`${appId}__${testerUid}`).get()).data();

/** Invariant 4: the ledger is the source of truth for a balance. */
async function assertLedgerMatchesBalance(uid) {
  const [snap, user] = await Promise.all([
    db.collection('ledger').where('uid', '==', uid).get(),
    getUser(uid),
  ]);
  const sum = snap.docs.reduce((acc, d) => acc + d.data().delta, 0);
  assert.equal(
    sum,
    user.seatBalance,
    `ledger for ${uid} sums to ${sum} but seatBalance is ${user.seatBalance}`,
  );
}

/** The profile is created by a background auth trigger, so poll for it. */
async function waitForProfile(uid, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const snap = await db.collection('users').doc(uid).get();
    if (snap.exists) return snap.data();
    await sleep(250);
  }
  throw new Error(`profile for ${uid} was never created — is the functions emulator running?`);
}

async function resetEmulator() {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, {
    method: 'DELETE',
  });
  await fetch(`http://${AUTH_HOST}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
}

// ---------------------------------------------------------------------------

async function main() {
  console.log('Resetting emulator state…');
  await resetEmulator();

  const stamp = Date.now();
  const devUid = `dev-${stamp}`;
  const t1Uid = `tester1-${stamp}`;
  const t2Uid = `tester2-${stamp}`;

  console.log('Creating accounts…');
  await Promise.all([
    auth.createUser({ uid: devUid, email: `dev-${stamp}@example.com`, displayName: 'Dev' }),
    auth.createUser({ uid: t1Uid, email: `t1-${stamp}@example.com`, displayName: 'Tester One' }),
    auth.createUser({ uid: t2Uid, email: `t2-${stamp}@example.com`, displayName: 'Tester Two' }),
  ]);

  await Promise.all([waitForProfile(devUid), waitForProfile(t1Uid), waitForProfile(t2Uid)]);

  const [devToken, t1Token, t2Token] = await Promise.all([
    idTokenFor(devUid),
    idTokenFor(t1Uid),
    idTokenFor(t2Uid),
  ]);

  console.log('\nA new account starts with nothing');
  check('developer starts with 0 seats', async () => {});
  {
    const dev = await getUser(devUid);
    check('seatBalance is 0', () => assert.equal(dev.seatBalance, 0));
    check('seatsHeld is 0', () => assert.equal(dev.seatsHeld, 0));
  }

  console.log('\nListing an app');
  const PACKAGE = `com.example.habit${stamp}`;
  const { appId } = await callable('createApp', devToken, {
    name: 'Habit Garden',
    packageName: PACKAGE,
    shortDescription: 'A small habit tracker that grows a garden.',
    category: 'productivity',
    playTestUrl: `https://play.google.com/apps/testing/com.example.habit${stamp}`,
    googleGroupUrl: 'https://groups.google.com/g/habit-testers',
    seatsRequested: 3,
  });
  {
    const app = await getApp(appId);
    check('listing is created as a draft', () => assert.equal(app.status, 'draft'));
    check('no seats are reserved yet', () => assert.equal(app.seatsReserved, 0));
  }

  check('duplicate package names are refused', async () => {});
  await expectRejection(
    'createApp',
    t1Token,
    {
      name: 'Copycat',
      packageName: `com.example.habit${stamp}`,
      shortDescription: 'Trying to claim a package that is already listed.',
      category: 'tools',
      playTestUrl: `https://play.google.com/apps/testing/com.example.habit${stamp}`,
      googleGroupUrl: 'https://groups.google.com/g/copycat',
    },
    'duplicate_package',
  );

  console.log('\nA developer with no seats cannot open a listing');
  await expectRejection('setAppStatus', devToken, { appId, status: 'open' }, 'insufficient_seats');
  check('opening was refused for lack of seats', () => {});

  // Seed the developer the way an admin would when bootstrapping the platform.
  console.log('\nSeeding the developer with 2 seats (cold-start grant)');
  await db.runTransaction(async (tx) => {
    const ref = db.collection('users').doc(devUid);
    tx.update(ref, { seatBalance: 2 });
    tx.set(db.collection('ledger').doc(), {
      uid: devUid,
      delta: 2,
      reason: 'admin_adjust',
      refId: 'e2e-seed',
      balanceAfter: 2,
      createdAt: new Date(),
    });
  });

  await callable('setAppStatus', devToken, { appId, status: 'open' });
  check('listing is now open', async () => {});
  {
    const app = await getApp(appId);
    check('status is open', () => assert.equal(app.status, 'open'));
  }

  console.log('\nA tester reserves a slot — the developer’s seat is held');
  await callable('reserveSlot', t1Token, { appId });
  {
    const [dev, app] = await Promise.all([getUser(devUid), getApp(appId)]);
    check('developer balance dropped to 1', () => assert.equal(dev.seatBalance, 1));
    check('developer has 1 seat held', () => assert.equal(dev.seatsHeld, 1));
    check('app shows 1 reserved slot', () => assert.equal(app.seatsReserved, 1));
    await assertLedgerMatchesBalance(devUid);
    check('developer ledger still reconciles', () => {});
  }

  console.log('\nGuards that protect the reservation');
  await expectRejection('reserveSlot', t1Token, { appId }, 'already_reserved');
  check('the same tester cannot reserve twice', () => {});
  await expectRejection('reserveSlot', devToken, { appId }, 'own_app');
  check('the owner cannot test their own app', () => {});

  console.log('\nProof and approval');
  await expectRejection(
    'submitProof',
    t1Token,
    { appId, proofUrl: 'https://evil.example.com/screenshot.png' },
    'bad_proof_url',
  );
  check('proof hosted off-platform is refused', () => {});

  await callable('submitProof', t1Token, {
    appId,
    proofUrl: `https://firebasestorage.googleapis.com/v0/b/${PROJECT}.appspot.com/o/proofs%2F${t1Uid}%2Fshot.png`,
    note: 'Installed and opened it, looks good.',
    // What the Android client's PackageManager check sends alongside the screenshot.
    verifiedInstall: {
      packageName: PACKAGE,
      installed: true,
      versionName: '1.4.2',
      versionCode: 142,
      firstInstallAt: Date.now() - 3 * 3600 * 1000,
      installerPackage: 'com.android.vending',
      // Deliberately a lie: the server must derive this from installerPackage, and must
      // never let a device declare its own integrity verdict.
      fromPlayStore: false,
      integrityVerdict: 'MEETS_DEVICE_INTEGRITY',
    },
  });
  {
    const res = await getReservation(appId, t1Uid);
    check('install evidence is stored with the proof', () => assert.equal(res.verifiedInstall.packagePresent, true));
    check('fromPlayStore is derived server-side, not taken from the device', () =>
      assert.equal(res.verifiedInstall.fromPlayStore, true));
    check('the device cannot declare its own integrity verdict', () =>
      assert.equal(res.verifiedInstall.integrityVerdict, 'UNEVALUATED'));
    check('checkedAt comes from the server clock', () =>
      assert.ok(Math.abs(Date.parse(res.verifiedInstall.checkedAt) - Date.now()) < 60_000));
  }

  await expectRejection('reviewProof', t2Token, { appId, testerUid: t1Uid, approve: true }, 'not_owner');
  check('a stranger cannot approve someone else’s proof', () => {});

  await callable('reviewProof', devToken, { appId, testerUid: t1Uid, approve: true });
  {
    const [dev, tester, app] = await Promise.all([getUser(devUid), getUser(t1Uid), getApp(appId)]);
    check('the held seat is released from the hold', () => assert.equal(dev.seatsHeld, 0));
    check('the developer balance does not move on approval', () => assert.equal(dev.seatBalance, 1));
    check('the tester earned a seat', () => assert.equal(tester.seatBalance, 1));
    check('the tester’s appsTested went up', () => assert.equal(tester.stats.appsTested, 1));
    check('the app has 1 approved tester', () => assert.equal(app.seatsFilled, 1));
    check('the reserved counter cleared', () => assert.equal(app.seatsReserved, 0));
    check('the 14-day clock started', () => assert.ok(app.testingStartsAt));
    await assertLedgerMatchesBalance(devUid);
    await assertLedgerMatchesBalance(t1Uid);
    check('both ledgers reconcile after the transfer', () => {});
  }

  console.log('\nRejection returns the seat');
  await callable('reserveSlot', t2Token, { appId });
  {
    const dev = await getUser(devUid);
    check('developer balance dropped to 0', () => assert.equal(dev.seatBalance, 0));
  }

  // With no seats left, the listing cannot take another tester.
  const t3Uid = `tester3-${stamp}`;
  await auth.createUser({ uid: t3Uid, email: `t3-${stamp}@example.com` });
  await waitForProfile(t3Uid);
  const t3Token = await idTokenFor(t3Uid);
  await expectRejection('reserveSlot', t3Token, { appId }, 'owner_insufficient_seats');
  check('a developer out of seats cannot take on more testers', () => {});

  await callable('submitProof', t2Token, {
    appId,
    proofUrl: `https://firebasestorage.googleapis.com/v0/b/${PROJECT}.appspot.com/o/proofs%2F${t2Uid}%2Fshot.png`,
  });
  await expectRejection('reviewProof', devToken, { appId, testerUid: t2Uid, approve: false }, 'reason_required');
  check('a rejection must carry a reason', () => {});

  await callable('reviewProof', devToken, {
    appId,
    testerUid: t2Uid,
    approve: false,
    reason: 'The screenshot shows a different app.',
  });
  {
    const [dev, tester, app] = await Promise.all([getUser(devUid), getUser(t2Uid), getApp(appId)]);
    check('the seat came back to the developer', () => assert.equal(dev.seatBalance, 1));
    check('nothing is held any more', () => assert.equal(dev.seatsHeld, 0));
    check('the rejected tester earned nothing', () => assert.equal(tester.seatBalance, 0));
    check('the app still shows 1 approved tester', () => assert.equal(app.seatsFilled, 1));
    await assertLedgerMatchesBalance(devUid);
    await assertLedgerMatchesBalance(t2Uid);
    check('ledgers reconcile after the rejection', () => {});
  }

  console.log('\nRetry after rejection, and the daily check-in');
  await callable('reserveSlot', t2Token, { appId });
  check('a rejected tester may try again', () => {});
  await callable('withdrawReservation', t2Token, { appId });
  {
    const dev = await getUser(devUid);
    check('withdrawing returns the seat', () => assert.equal(dev.seatBalance, 1));
    check('and clears the hold', () => assert.equal(dev.seatsHeld, 0));
  }

  const checkin = await callable('recordCheckin', t1Token, {
    appId,
    // Evidence about a different package is not evidence about this listing.
    verifiedInstall: { packageName: 'com.example.somethingelse', installed: true },
  });
  check('an approved tester can check in', () => assert.equal(checkin.streak, 1));
  {
    const res = await getReservation(appId, t1Uid);
    check('evidence for the wrong package is discarded', () =>
      assert.equal(res.verifiedInstall.versionName, '1.4.2'));
  }
  const again = await callable('recordCheckin', t1Token, { appId });
  check('a second check-in the same day is a no-op', () => assert.equal(again.alreadyCheckedIn, true));

  console.log(`\nAll ${passed} assertions passed.`);
}

main().catch((err) => {
  console.error('\nFAILED:', err.message);
  process.exitCode = 1;
});
