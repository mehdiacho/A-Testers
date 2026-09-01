/**
 * Input validation shared by the web forms and the callable functions, so the client can
 * show inline errors and the server can reject the same payloads without duplicating rules.
 */

import { APP_CATEGORIES, type AppCategory, type CreateAppInput } from './types.js';

export type FieldErrors<T> = Partial<Record<keyof T, string>>;

/** Android application id: dot-separated segments, each starting with a letter. */
const PACKAGE_RE = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/;

export function isValidPackageName(v: string): boolean {
  return PACKAGE_RE.test(v) && v.length <= 155;
}

function isHttpsUrl(v: string, hostSuffixes?: string[]): boolean {
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:') return false;
  if (!hostSuffixes) return true;
  return hostSuffixes.some((s) => u.hostname === s || u.hostname.endsWith(`.${s}`));
}

/**
 * Closed-test opt-in links are served from play.google.com/apps/testing/... — accepting
 * any https URL here would let someone point testers at an arbitrary site.
 */
export function isValidPlayTestUrl(v: string): boolean {
  if (!isHttpsUrl(v, ['play.google.com'])) return false;
  try {
    return new URL(v).pathname.startsWith('/apps/testing/');
  } catch {
    return false;
  }
}

export function isValidGoogleGroupUrl(v: string): boolean {
  return isHttpsUrl(v, ['groups.google.com']);
}

export function validateCreateApp(
  input: Partial<CreateAppInput>,
  limits: { maxSeats: number } = { maxSeats: 50 },
): FieldErrors<CreateAppInput> {
  const errors: FieldErrors<CreateAppInput> = {};

  const name = (input.name ?? '').trim();
  if (name.length < 2) errors.name = 'Enter your app’s name.';
  else if (name.length > 60) errors.name = 'Keep the name under 60 characters.';

  const pkg = (input.packageName ?? '').trim();
  if (!pkg) errors.packageName = 'Enter the package name.';
  else if (!isValidPackageName(pkg)) {
    errors.packageName = 'That is not a valid package name (e.g. com.example.myapp).';
  }

  const desc = (input.shortDescription ?? '').trim();
  if (desc.length < 10) errors.shortDescription = 'Describe your app in at least 10 characters.';
  else if (desc.length > 280) errors.shortDescription = 'Keep the description under 280 characters.';

  if (!input.category || !APP_CATEGORIES.includes(input.category as AppCategory)) {
    errors.category = 'Pick a category.';
  }

  if (!input.playTestUrl || !isValidPlayTestUrl(input.playTestUrl)) {
    errors.playTestUrl = 'Paste the closed-test link from Play Console (play.google.com/apps/testing/…).';
  }

  if (!input.googleGroupUrl || !isValidGoogleGroupUrl(input.googleGroupUrl)) {
    errors.googleGroupUrl = 'Paste your testers’ Google Group link (groups.google.com/…).';
  }

  if (input.seatsRequested !== undefined) {
    const n = input.seatsRequested;
    if (!Number.isInteger(n) || n < 1 || n > limits.maxSeats) {
      errors.seatsRequested = `Request between 1 and ${limits.maxSeats} testers.`;
    }
  }

  return errors;
}

export function hasErrors<T>(e: FieldErrors<T>): boolean {
  return Object.keys(e).length > 0;
}
