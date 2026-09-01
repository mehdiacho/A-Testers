/**
 * App listing lifecycle.
 *
 * Listings are created through a callable rather than a direct client write for two
 * reasons: package-name uniqueness cannot be expressed in security rules, and opening a
 * listing requires a seat check.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, COL, FieldValue } from '../lib/admin.js';
import { getPlatformConfigTx } from '../lib/config.js';
import { assertGuard, requireAuth, requireString, notFound, invalid } from '../lib/errors.js';
import { bumpStat } from '../economy/seats.js';
import {
  canOpenApp,
  hasErrors,
  validateCreateApp,
  type AppDoc,
  type AppStatus,
  type CreateAppInput,
  type UserDoc,
} from '../shared.js';

/**
 * packageIndex/{packageName} — a reservation ticket giving us true uniqueness.
 * A `where('packageName','==',…)` query would race two concurrent creates; creating this
 * document inside the same transaction cannot.
 */
const PACKAGE_INDEX = 'packageIndex';

const appRef = (id: string) => db.collection(COL.apps).doc(id);
const userRef = (uid: string) => db.collection(COL.users).doc(uid);
const pkgRef = (pkg: string) => db.collection(PACKAGE_INDEX).doc(pkg);

export const createApp = onCall({ cors: true }, async (request) => {
  const ownerUid = requireAuth(request);
  const raw = (request.data ?? {}) as Partial<CreateAppInput>;

  const errors = validateCreateApp(raw);
  if (hasErrors(errors)) {
    throw new HttpsError('invalid-argument', 'Please correct the highlighted fields.', {
      reason: 'validation_failed',
      fields: errors,
    });
  }

  const input = raw as CreateAppInput;
  const packageName = input.packageName.trim();

  return db.runTransaction(async (tx) => {
    const config = await getPlatformConfigTx(tx);
    const [ownerSnap, pkgSnap] = await Promise.all([tx.get(userRef(ownerUid)), tx.get(pkgRef(packageName))]);

    if (!ownerSnap.exists) notFound('User profile');
    const owner = ownerSnap.data() as UserDoc;
    if (owner.banned) {
      throw new HttpsError('permission-denied', 'Your account is suspended.');
    }

    if (pkgSnap.exists) {
      const existingOwner = (pkgSnap.data() as { ownerUid?: string }).ownerUid;
      throw new HttpsError(
        'already-exists',
        existingOwner === ownerUid
          ? 'You have already listed this package.'
          : 'That package is already listed by another developer.',
        { reason: 'duplicate_package' },
      );
    }

    const ref = appRef(db.collection(COL.apps).doc().id);

    tx.set(ref, {
      ownerUid,
      name: input.name.trim(),
      packageName,
      shortDescription: input.shortDescription.trim(),
      category: input.category,
      iconUrl: input.iconUrl ?? null,
      playTestUrl: input.playTestUrl.trim(),
      googleGroupUrl: input.googleGroupUrl.trim(),
      // Listings start as drafts. Going live is a separate, seat-checked step.
      status: 'draft' satisfies AppStatus,
      seatsRequested: input.seatsRequested ?? config.requiredTesters,
      seatsReserved: 0,
      seatsFilled: 0,
      testingStartsAt: null,
      requiredDays: config.requiredDays,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    tx.set(pkgRef(packageName), { appId: ref.id, ownerUid, createdAt: FieldValue.serverTimestamp() });
    bumpStat(tx, ownerUid, 'appsPublished');

    return { appId: ref.id, status: 'draft' };
  });
});

const OWNER_TRANSITIONS: Record<string, AppStatus[]> = {
  draft: ['open'],
  open: ['paused'],
  paused: ['open'],
  full: ['paused'],
};

export const setAppStatus = onCall({ cors: true }, async (request) => {
  const uid = requireAuth(request);
  const data = (request.data ?? {}) as Record<string, unknown>;
  const appId = requireString(data.appId, 'appId', 128);
  const next = requireString(data.status, 'status', 32) as AppStatus;

  return db.runTransaction(async (tx) => {
    const config = await getPlatformConfigTx(tx);
    const snap = await tx.get(appRef(appId));
    if (!snap.exists) notFound('App');
    const app = { id: appId, ...(snap.data() as Omit<AppDoc, 'id'>) };

    if (app.ownerUid !== uid) {
      throw new HttpsError('permission-denied', 'This is not your app.');
    }

    const allowed = OWNER_TRANSITIONS[app.status] ?? [];
    if (!allowed.includes(next)) {
      invalid(`You cannot move a ${app.status} listing to ${next}.`, 'bad_transition');
    }

    // Going live is the only transition that costs anything, so it is the only one gated.
    if (next === 'open') {
      const ownerSnap = await tx.get(userRef(uid));
      if (!ownerSnap.exists) notFound('User profile');
      assertGuard(canOpenApp({ app, owner: ownerSnap.data() as UserDoc, config }));
    }

    tx.update(appRef(appId), { status: next, updatedAt: FieldValue.serverTimestamp() });
    return { ok: true, status: next };
  });
});
