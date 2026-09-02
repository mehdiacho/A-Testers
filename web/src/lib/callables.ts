'use client';

/**
 * Typed wrappers around the callable functions. These are the only way the client can
 * move a seat — `firestore.rules` denies direct writes to every field they touch.
 */

import { httpsCallable, type FunctionsError } from 'firebase/functions';
import type { CreateAppInput, AppStatus } from '@a-testers/shared';
import { functions } from './firebase';

function call<Req, Res>(name: string) {
  const fn = httpsCallable<Req, Res>(functions, name);
  return async (data: Req): Promise<Res> => (await fn(data)).data;
}

export const reserveSlot = call<
  { appId: string },
  {
    reservationId: string;
    expiresAt: string;
    playTestUrl: string;
    googleGroupUrl: string;
    packageName: string;
  }
>('reserveSlot');

export const withdrawReservation = call<{ appId: string }, { ok: true }>('withdrawReservation');

export const submitProof = call<{ appId: string; proofUrl: string; note?: string }, { ok: true }>(
  'submitProof',
);

export const reviewProof = call<
  { appId: string; testerUid: string; approve: boolean; reason?: string },
  { ok: true; approved: boolean; seatsFilled?: number }
>('reviewProof');

export const recordCheckin = call<
  { appId: string },
  { ok: true; alreadyCheckedIn: boolean; streak: number }
>('recordCheckin');

export const createApp = call<CreateAppInput, { appId: string; status: AppStatus }>('createApp');

export const setAppStatus = call<{ appId: string; status: AppStatus }, { ok: true; status: AppStatus }>(
  'setAppStatus',
);

/** Domain error code from a callable, e.g. `owner_insufficient_seats`. */
export function errorReason(err: unknown): string | null {
  const details = (err as FunctionsError)?.details as { reason?: string } | undefined;
  return details?.reason ?? null;
}

/** Field-level validation errors returned by createApp. */
export function errorFields(err: unknown): Record<string, string> | null {
  const details = (err as FunctionsError)?.details as { fields?: Record<string, string> } | undefined;
  return details?.fields ?? null;
}

export function errorMessage(err: unknown, fallback = 'Something went wrong. Try again.'): string {
  const msg = (err as { message?: string })?.message;
  if (!msg) return fallback;
  // The SDK prefixes uncaught internal errors; those are not worth showing verbatim.
  return msg.startsWith('INTERNAL') ? fallback : msg;
}
