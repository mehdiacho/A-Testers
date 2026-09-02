'use client';

import { useEffect, useState } from 'react';
import { onSnapshot, type DocumentReference, type DocumentData } from 'firebase/firestore';

/**
 * Firestore hands the client `Timestamp` objects, but the shared domain functions take ISO
 * strings so they stay runtime-agnostic. This is the seam between the two.
 */
export function tsToIso(v: unknown): string | null {
  if (!v) return null;
  if (typeof (v as { toDate?: () => Date }).toDate === 'function') {
    return (v as { toDate: () => Date }).toDate().toISOString();
  }
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string') return v;
  return null;
}

export function tsToDate(v: unknown): Date | null {
  const iso = tsToIso(v);
  return iso ? new Date(iso) : null;
}

export interface DocState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  /** Distinguishes "still loading" from "this document does not exist". */
  missing: boolean;
}

/** Subscribe to a single document. Memoise `ref`, or pass null while it is not ready. */
export function useDoc<T>(ref: DocumentReference<DocumentData> | null): DocState<T> {
  const [state, setState] = useState<DocState<T>>({
    data: null,
    loading: true,
    error: null,
    missing: false,
  });

  useEffect(() => {
    if (!ref) {
      setState({ data: null, loading: false, error: null, missing: false });
      return;
    }
    setState((s) => ({ ...s, loading: true }));

    return onSnapshot(
      ref,
      (snap) => {
        setState({
          data: snap.exists() ? ({ id: snap.id, ...snap.data() } as T) : null,
          loading: false,
          error: null,
          missing: !snap.exists(),
        });
      },
      (error) => setState({ data: null, loading: false, error, missing: false }),
    );
  }, [ref]);

  return state;
}

/** "3 hours ago", "2 days ago" — short enough for a dense table. */
export function timeAgo(v: unknown, now = Date.now()): string {
  const d = tsToDate(v);
  if (!d) return 'never';

  const mins = Math.floor((now - d.getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;

  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
