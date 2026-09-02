import 'server-only';

import type { AppCategory, AppDoc } from '@a-testers/shared';
import { adminDb } from './firebase-admin';

/** Firestore Timestamps are not serialisable across the server/client boundary. */
function serialise(id: string, data: FirebaseFirestore.DocumentData): AppDoc {
  const iso = (v: unknown) =>
    v && typeof (v as { toDate?: () => Date }).toDate === 'function'
      ? (v as { toDate: () => Date }).toDate().toISOString()
      : null;

  return {
    id,
    ownerUid: data.ownerUid,
    name: data.name,
    packageName: data.packageName,
    shortDescription: data.shortDescription,
    category: data.category,
    iconUrl: data.iconUrl ?? null,
    playTestUrl: data.playTestUrl,
    googleGroupUrl: data.googleGroupUrl,
    status: data.status,
    seatsRequested: data.seatsRequested ?? 0,
    seatsReserved: data.seatsReserved ?? 0,
    seatsFilled: data.seatsFilled ?? 0,
    testingStartsAt: iso(data.testingStartsAt),
    requiredDays: data.requiredDays ?? 14,
    createdAt: iso(data.createdAt) ?? new Date(0).toISOString(),
    updatedAt: iso(data.updatedAt) ?? new Date(0).toISOString(),
  };
}

export interface CatalogueResult {
  apps: AppDoc[];
  /** Total listings that have ever been through the platform — social proof on the page. */
  totalListed: number;
}

export async function listOpenApps(
  category?: AppCategory,
  limit = 60,
): Promise<CatalogueResult> {
  let q = adminDb
    .collection('apps')
    .where('status', '==', 'open')
    .orderBy('createdAt', 'desc')
    .limit(limit);

  if (category) {
    q = adminDb
      .collection('apps')
      .where('status', '==', 'open')
      .where('category', '==', category)
      .orderBy('createdAt', 'desc')
      .limit(limit);
  }

  const [snap, countSnap] = await Promise.all([q.get(), adminDb.collection('apps').count().get()]);

  return {
    apps: snap.docs.map((d) => serialise(d.id, d.data())),
    totalListed: countSnap.data().count,
  };
}

export async function getAppById(appId: string): Promise<AppDoc | null> {
  const snap = await adminDb.collection('apps').doc(appId).get();
  if (!snap.exists) return null;
  return serialise(snap.id, snap.data()!);
}

/** Slugs for the public catalogue's static params. */
export async function listOpenAppIds(limit = 200): Promise<string[]> {
  const snap = await adminDb.collection('apps').where('status', '==', 'open').limit(limit).get();
  return snap.docs.map((d) => d.id);
}
