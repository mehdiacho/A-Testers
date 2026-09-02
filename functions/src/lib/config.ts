import { db, COL } from './admin.js';
import { DEFAULT_PLATFORM_CONFIG, type PlatformConfig } from '../shared.js';
import type { Transaction } from 'firebase-admin/firestore';

const CONFIG_DOC = 'platform';
const CACHE_TTL_MS = 60_000;

let cached: { value: PlatformConfig; at: number } | null = null;

function merge(raw: Record<string, unknown> | undefined): PlatformConfig {
  if (!raw) return { ...DEFAULT_PLATFORM_CONFIG };
  const out = { ...DEFAULT_PLATFORM_CONFIG };
  for (const key of Object.keys(DEFAULT_PLATFORM_CONFIG) as (keyof PlatformConfig)[]) {
    const v = raw[key];
    if (typeof v === typeof DEFAULT_PLATFORM_CONFIG[key]) {
      (out as Record<string, unknown>)[key] = v;
    }
  }
  return out;
}

/**
 * Platform config, cached for a minute per instance. Config changes are rare and a stale
 * read for up to 60s is harmless, so this avoids a Firestore read on every single call.
 */
export async function getPlatformConfig(): Promise<PlatformConfig> {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_TTL_MS) return cached.value;

  const snap = await db.collection(COL.config).doc(CONFIG_DOC).get();
  const value = merge(snap.data());
  cached = { value, at: now };
  return value;
}

/** Transaction-safe read, used where the config must be consistent with the rest of the txn. */
export async function getPlatformConfigTx(tx: Transaction): Promise<PlatformConfig> {
  const snap = await tx.get(db.collection(COL.config).doc(CONFIG_DOC));
  return merge(snap.data());
}

export function clearConfigCache(): void {
  cached = null;
}
