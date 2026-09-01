/**
 * Cloud Functions entry point.
 *
 * Everything that moves a seat is a callable, never a client write — see firestore.rules.
 */

import { setGlobalOptions } from 'firebase-functions/v2';

setGlobalOptions({
  region: 'europe-west1',
  maxInstances: 20,
});

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
