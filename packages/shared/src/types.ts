/**
 * Canonical domain types shared by the web app, the Cloud Functions and (mirrored by
 * hand) the Android client. Nothing in this file may import firebase-admin or
 * firebase/app — it must stay usable from every runtime.
 */

/** Timestamps cross the wire as ISO strings; server code converts to Firestore Timestamp. */
export type IsoDate = string;

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const APP_STATUSES = [
  'draft',
  'pending_review',
  'open',
  'paused',
  'full',
  'completed',
  'rejected',
] as const;
export type AppStatus = (typeof APP_STATUSES)[number];

export const RESERVATION_STATUSES = [
  'reserved',
  'proof_submitted',
  'approved',
  'rejected',
  'expired',
  'withdrawn',
] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

/**
 * A reservation is "active" while it still holds a seat from the app owner.
 * Every other status has already released or spent the hold.
 */
export const ACTIVE_RESERVATION_STATUSES: readonly ReservationStatus[] = [
  'reserved',
  'proof_submitted',
];

export const LEDGER_REASONS = [
  'signup_grant',
  'hold_reservation',
  'spend_approval',
  'earn_approval',
  'release_rejected',
  'release_expired',
  'release_withdrawn',
  'penalty_uninstall',
  'admin_adjust',
] as const;
export type LedgerReason = (typeof LEDGER_REASONS)[number];

export const APP_CATEGORIES = [
  'productivity',
  'games',
  'social',
  'finance',
  'health',
  'education',
  'tools',
  'lifestyle',
  'entertainment',
  'other',
] as const;
export type AppCategory = (typeof APP_CATEGORIES)[number];

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export interface UserStats {
  appsTested: number;
  appsPublished: number;
  proofsApproved: number;
  proofsRejected: number;
  /** Reservations abandoned or expired without proof — drives reputation down. */
  reservationsAbandoned: number;
}

export interface UserDoc {
  uid: string;
  displayName: string;
  photoURL: string | null;
  /** Available seats. Function-only. */
  seatBalance: number;
  /** Seats currently held against pending reservations on this user's apps. Function-only. */
  seatsHeld: number;
  stats: UserStats;
  /** 0-100, derived daily. Gates listing privileges. */
  reputation: number;
  strikes: number;
  banned: boolean;
  isAdmin: boolean;
  createdAt: IsoDate;
  updatedAt: IsoDate;
}

/** users/{uid}/private/contact — never exposed to other users. */
export interface UserPrivateDoc {
  email: string;
  /** Google account used to join closed-test groups. May differ from the login email. */
  playEmail: string | null;
}

export interface AppDoc {
  id: string;
  ownerUid: string;
  name: string;
  packageName: string;
  shortDescription: string;
  category: AppCategory;
  iconUrl: string | null;
  /** Closed-test opt-in link. */
  playTestUrl: string;
  /** Google Group testers must join before the opt-in link works. */
  googleGroupUrl: string;
  status: AppStatus;
  seatsRequested: number;
  /** Slots held by active reservations. Function-only. */
  seatsReserved: number;
  /** Slots converted into approved testers. Function-only. */
  seatsFilled: number;
  testingStartsAt: IsoDate | null;
  requiredDays: number;
  createdAt: IsoDate;
  updatedAt: IsoDate;
}

/**
 * What the Android client observed about the app it is testing.
 *
 * Every field except `integrityVerdict` and `checkedAt` is a *claim made by the device*,
 * not a proof: a rooted phone can tell PackageManager whatever it likes. It raises the
 * cost of faking a test from cropping a screenshot to modifying the OS, and it gives the
 * developer something concrete to review. `integrityVerdict` is the half that cannot be
 * forged, and it is set server-side once a Play Integrity token has been validated.
 */
export interface VerifiedInstall {
  /** Package presence confirmed by the Android client's PackageManager check. */
  packagePresent: boolean;
  versionName: string | null;
  versionCode: number | null;
  firstInstallAt: IsoDate | null;
  /** The installing package. `com.android.vending` is Play; anything else is a sideload. */
  installerPackage: string | null;
  fromPlayStore: boolean;
  /** Play Integrity verdict, when the token could be validated server-side. */
  integrityVerdict: 'MEETS_DEVICE_INTEGRITY' | 'MEETS_BASIC_INTEGRITY' | 'FAILED' | 'UNEVALUATED';
  /** Set from the server clock, never from the device's. */
  checkedAt: IsoDate;
}

export interface ReservationDoc {
  id: string;
  appId: string;
  ownerUid: string;
  testerUid: string;
  status: ReservationStatus;
  reservedAt: IsoDate;
  expiresAt: IsoDate;
  proofUrl: string | null;
  proofNote: string | null;
  proofSubmittedAt: IsoDate | null;
  verifiedInstall: VerifiedInstall | null;
  reviewedAt: IsoDate | null;
  rejectionReason: string | null;
  /** Retention tracking: { "2026-09-01": true, ... } keyed by UTC date. */
  checkins: Record<string, boolean>;
  lastCheckinAt: IsoDate | null;
  checkinStreak: number;
}

export interface LedgerEntry {
  id: string;
  uid: string;
  /** Signed change to seatBalance. */
  delta: number;
  reason: LedgerReason;
  /** Reservation id, app id or admin note depending on reason. */
  refId: string | null;
  balanceAfter: number;
  createdAt: IsoDate;
}

export interface PlatformConfig {
  requiredTesters: number;
  requiredDays: number;
  reservationTtlHours: number;
  signupGrantSeats: number;
  requireFullSeatsUpfront: boolean;
  maxOpenReservationsPerTester: number;
  minReputationToList: number;
}

export const DEFAULT_PLATFORM_CONFIG: PlatformConfig = {
  requiredTesters: 12,
  requiredDays: 14,
  reservationTtlHours: 72,
  signupGrantSeats: 0,
  requireFullSeatsUpfront: false,
  maxOpenReservationsPerTester: 5,
  minReputationToList: 0,
};

// ---------------------------------------------------------------------------
// Callable payloads
// ---------------------------------------------------------------------------

export interface ReserveSlotInput {
  appId: string;
}
export interface SubmitProofInput {
  appId: string;
  proofUrl: string;
  note?: string;
}
export interface ReviewProofInput {
  appId: string;
  testerUid: string;
  approve: boolean;
  reason?: string;
}
export interface CreateAppInput {
  name: string;
  packageName: string;
  shortDescription: string;
  category: AppCategory;
  playTestUrl: string;
  googleGroupUrl: string;
  iconUrl?: string | null;
  seatsRequested?: number;
}
