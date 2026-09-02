import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import type { GuardResult } from '../shared.js';

/** Maps a domain guard code onto the closest callable error code. */
const CODE_MAP: Record<string, HttpsError['code']> = {
  tester_banned: 'permission-denied',
  owner_banned: 'permission-denied',
  not_owner: 'permission-denied',
  low_reputation: 'permission-denied',
  own_app: 'failed-precondition',
  app_not_open: 'failed-precondition',
  no_slots: 'resource-exhausted',
  already_reserved: 'already-exists',
  already_tested: 'already-exists',
  already_submitted: 'already-exists',
  too_many_open: 'resource-exhausted',
  owner_insufficient_seats: 'resource-exhausted',
  insufficient_seats: 'failed-precondition',
  not_reserved: 'failed-precondition',
  not_pending: 'failed-precondition',
  expired: 'deadline-exceeded',
};

/** Throws the guard's failure as an HttpsError, preserving the domain code for the UI. */
export function assertGuard(result: GuardResult): asserts result is { ok: true } {
  if (result.ok) return;
  const code = CODE_MAP[result.code] ?? 'failed-precondition';
  throw new HttpsError(code, result.message, { reason: result.code });
}

export function requireAuth(request: CallableRequest): string {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in to continue.');
  return uid;
}

export function requireAdmin(request: CallableRequest): string {
  const uid = requireAuth(request);
  if (request.auth?.token?.admin !== true) {
    throw new HttpsError('permission-denied', 'Admins only.');
  }
  return uid;
}

export function notFound(what: string): never {
  throw new HttpsError('not-found', `${what} not found.`);
}

export function invalid(message: string, reason = 'invalid_argument'): never {
  throw new HttpsError('invalid-argument', message, { reason });
}

/** Narrow an untyped callable payload field to a non-empty string. */
export function requireString(v: unknown, field: string, maxLen = 500): string {
  if (typeof v !== 'string' || v.trim().length === 0) {
    invalid(`"${field}" is required.`, 'missing_field');
  }
  const s = v.trim();
  if (s.length > maxLen) invalid(`"${field}" is too long.`, 'field_too_long');
  return s;
}
