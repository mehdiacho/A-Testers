'use client';

/**
 * Browser-side Firebase. Everything here is public by design — the config keys identify
 * the project, they do not authorise anything. Access control lives in firestore.rules.
 */

import { initializeApp, getApps, getApp, type FirebaseOptions } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
import { getStorage, connectStorageEmulator } from 'firebase/storage';

/**
 * Fallback so a checkout with no `.env.local` still builds and still runs against the
 * emulator suite. `demo-` project ids are the emulator's own convention and can never
 * reach real Firebase infrastructure, so this cannot silently talk to production.
 */
const DEMO_CONFIG: FirebaseOptions = {
  apiKey: 'demo-api-key',
  authDomain: 'demo-a-testers.firebaseapp.com',
  projectId: 'demo-a-testers',
  storageBucket: 'demo-a-testers.appspot.com',
  messagingSenderId: '000000000000',
  appId: '1:000000000000:web:0000000000000000000000',
};

const configured = Boolean(process.env.NEXT_PUBLIC_FIREBASE_API_KEY);

if (!configured && typeof window !== 'undefined') {
  console.warn(
    '[a-testers] No NEXT_PUBLIC_FIREBASE_* config found — using the demo project. ' +
      'Copy web/.env.example to web/.env.local and fill it in.',
  );
}

const config: FirebaseOptions = configured
  ? {
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    }
  : DEMO_CONFIG;

/** Functions are deployed to europe-west1 (see functions/src/index.ts). */
export const FUNCTIONS_REGION = 'europe-west1';

const app = getApps().length ? getApp() : initializeApp(config);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, FUNCTIONS_REGION);
export const storage = getStorage(app);

// Emulator wiring. Guarded by a module-level flag because Fast Refresh re-runs this file
// and connecting twice throws.
declare global {
  // eslint-disable-next-line no-var
  var __ateEmulatorsConnected: boolean | undefined;
}

if (process.env.NEXT_PUBLIC_USE_EMULATORS === 'true' && !globalThis.__ateEmulatorsConnected) {
  globalThis.__ateEmulatorsConnected = true;
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  connectStorageEmulator(storage, '127.0.0.1', 9199);
}

export default app;
