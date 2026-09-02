import { Timestamp } from 'firebase-admin/firestore';
import type { VerifiedInstall } from '../shared.js';

/**
 * Parse the install evidence the Android client sends with a proof or a check-in.
 *
 * Everything in the payload is a claim by the device, so this function's job is to keep
 * the claim inside a known shape and to refuse to take the device's word on the two
 * fields that must not be forgeable:
 *
 *   - `integrityVerdict` is always UNEVALUATED here. It is only ever set by the server
 *     after validating a Play Integrity token, which this phase does not do yet.
 *   - `checkedAt` comes from the server clock. A device with a wound-forward clock must
 *     not be able to backdate an install or stretch a retention window.
 *
 * Returns null for anything unrecognisable rather than throwing: a web tester sends no
 * evidence at all, and an older Android build sending a shape we no longer expect should
 * degrade to "no evidence", not fail the whole submission.
 */
export function parseVerifiedInstall(raw: unknown, packageName: string): VerifiedInstall | null {
  if (raw === null || typeof raw !== 'object') return null;
  const v = raw as Record<string, unknown>;

  // Evidence about a different package is not evidence about this listing.
  if (typeof v.packageName === 'string' && v.packageName !== packageName) return null;

  const installerPackage = str(v.installerPackage, 128);

  return {
    packagePresent: v.installed === true || v.packagePresent === true,
    versionName: str(v.versionName, 64),
    versionCode: int(v.versionCode),
    firstInstallAt: epochToIso(v.firstInstallAt),
    installerPackage,
    // Derived here rather than trusted: the client also sends fromPlayStore, but there is
    // no reason to accept a boolean when the string it comes from is right there.
    fromPlayStore: installerPackage === 'com.android.vending',
    integrityVerdict: 'UNEVALUATED',
    checkedAt: Timestamp.now().toDate().toISOString(),
  };
}

function str(v: unknown, maxLen: number): string | null {
  return typeof v === 'string' && v.length > 0 && v.length <= maxLen ? v : null;
}

function int(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : null;
}

/**
 * The client sends epoch milliseconds because that is what PackageManager returns.
 * A timestamp in the future, or before Android existed, is a broken clock — drop it.
 */
function epochToIso(v: unknown): string | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const ms = Math.trunc(v);
  if (ms < 1_200_000_000_000 || ms > Date.now() + 86_400_000) return null;
  return new Date(ms).toISOString();
}
