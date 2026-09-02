import 'server-only';

/**
 * Server-side Firebase, used by the server components that render the public catalogue.
 *
 * The catalogue is the platform's front door: it is what a developer searching for
 * "google play closed testing testers" lands on, so it is rendered on the server rather
 * than fetched in the browser.
 *
 * Credentials come from Application Default Credentials — automatic on Firebase App
 * Hosting, and locally either from GOOGLE_APPLICATION_CREDENTIALS or the emulator.
 */

import { initializeApp, getApps, getApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function createApp() {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

  // FIRESTORE_EMULATOR_HOST makes the Admin SDK talk to the emulator, and in that mode
  // it must not try to resolve real credentials.
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    return initializeApp({ projectId: projectId ?? 'demo-a-testers' });
  }

  return initializeApp({ credential: applicationDefault(), projectId });
}

const adminApp = getApps().length ? getApp() : createApp();

export const adminDb = getFirestore(adminApp);
