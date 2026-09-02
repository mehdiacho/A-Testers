/**
 * Cloud Functions entry point.
 *
 * Everything that moves a seat is a callable, never a client write — see firestore.rules.
 */

// Global options (region, concurrency) are applied in lib/options.ts, which lib/admin.ts
// imports. They cannot be set here: ESM evaluates the re-exports below before this
// module's body, so the functions would already be defined by the time it ran.

// Reservation lifecycle — the seat economy.
export {
  reserveSlot,
  withdrawReservation,
  submitProof,
  reviewProof,
  recordCheckin,
} from './economy/reservations.js';

// Listing lifecycle.
export { createApp, setAppStatus } from './http/apps.js';

// Triggers.
export { onUserCreated } from './triggers/users.js';
export { expireStaleReservations, recomputeReputation } from './triggers/scheduled.js';
