'use client';

import { useEffect, useState } from 'react';
import { onSnapshot, type Query, type DocumentData } from 'firebase/firestore';

export interface CollectionState<T> {
  data: T[];
  loading: boolean;
  error: Error | null;
}

/**
 * Subscribe to a Firestore query. The caller must memoise `query` (or pass `null` while
 * its inputs are not ready) — an unmemoised query object would resubscribe every render.
 */
export function useCollection<T>(query: Query<DocumentData> | null): CollectionState<T> {
  const [state, setState] = useState<CollectionState<T>>({ data: [], loading: true, error: null });

  useEffect(() => {
    if (!query) {
      setState({ data: [], loading: false, error: null });
      return;
    }
    setState((s) => ({ ...s, loading: true }));

    return onSnapshot(
      query,
      (snap) => {
        setState({
          data: snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T),
          loading: false,
          error: null,
        });
      },
      (error) => setState({ data: [], loading: false, error }),
    );
  }, [query]);

  return state;
}
