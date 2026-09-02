// Must be first: it calls setGlobalOptions, which has to run before any function is
// defined. See lib/options.ts for why this cannot live in index.ts.
import './options.js';

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

// Cloud Functions can reuse a warm instance, so guard against double initialisation.
if (getApps().length === 0) {
  initializeApp();
}

export const db = getFirestore();
export const auth = getAuth();
export { FieldValue, Timestamp };

export const COL = {
  users: 'users',
  apps: 'apps',
  reservations: 'reservations',
  ledger: 'ledger',
  config: 'config',
  reports: 'reports',
} as const;

/** Firestore Timestamps cross the callable boundary as ISO strings. */
export function toIso(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Timestamp) return v.toDate().toISOString();
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string') return v;
  return null;
}

/**
 * Shallow-convert a Firestore document into the ISO-string shape the shared domain types
 * expect. Only the timestamp fields we actually read need converting.
 */
export function isoFields<T extends Record<string, unknown>>(data: T, fields: (keyof T)[]): T {
  const out = { ...data };
  for (const f of fields) {
    if (f in out) (out as Record<string, unknown>)[f as string] = toIso(out[f]);
  }
  return out;
}
