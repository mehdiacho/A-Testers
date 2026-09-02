/**
 * Profile bootstrap. The user document is created here rather than by the client, because
 * a client-created profile could seed itself a seat balance.
 *
 * This uses the v1 auth trigger deliberately: the v2 equivalent (`beforeUserCreated`) is a
 * blocking function that requires Identity Platform, which is more than this needs.
 *
 * Note that it runs in us-central1 while every callable runs in europe-west1.
 * `setGlobalOptions` only applies to v2 functions, and Firebase Auth background triggers
 * are us-central1-only regardless. That is fine — nothing latency-sensitive depends on it.
 */

import functionsV1 from 'firebase-functions/v1';
import { db, COL, FieldValue } from '../lib/admin.js';
import { getPlatformConfig } from '../lib/config.js';

export const onUserCreated = functionsV1.auth.user().onCreate(async (user) => {
  const config = await getPlatformConfig();
  const now = FieldValue.serverTimestamp();
  const grant = Math.max(0, config.signupGrantSeats);

  const userRef = db.collection(COL.users).doc(user.uid);
  const batch = db.batch();

  batch.set(userRef, {
    displayName: user.displayName || `tester-${user.uid.slice(0, 6)}`,
    photoURL: user.photoURL ?? null,
    seatBalance: grant,
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
    createdAt: now,
    updatedAt: now,
  });

  batch.set(userRef.collection('private').doc('contact'), {
    email: user.email ?? null,
    // Testers must join a Google Group, so the Play account defaults to the sign-in email.
    playEmail: user.email ?? null,
  });

  if (grant > 0) {
    batch.set(db.collection(COL.ledger).doc(), {
      uid: user.uid,
      delta: grant,
      reason: 'signup_grant',
      refId: null,
      balanceAfter: grant,
      createdAt: now,
    });
  }

  await batch.commit();
});
