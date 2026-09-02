import { setGlobalOptions } from 'firebase-functions/v2';

/**
 * Global function options.
 *
 * This lives in its own module, imported by `lib/admin.ts`, for a reason that is easy to
 * get wrong: ESM evaluates a module's imports and `export … from` re-exports *before* its
 * own body. Calling `setGlobalOptions` in the body of index.ts therefore runs it after
 * every function has already been defined, and the options are silently ignored — the
 * functions deploy to the default us-central1 instead.
 *
 * Because every function module imports `lib/admin.ts`, and that imports this, the call
 * is guaranteed to happen first regardless of import order in index.ts.
 */
setGlobalOptions({
  region: 'europe-west1',
  maxInstances: 20,
});

export const REGION = 'europe-west1';
