'use client';

import { useMemo } from 'react';
import { doc } from 'firebase/firestore';
import { DEFAULT_PLATFORM_CONFIG, type PlatformConfig } from '@a-testers/shared';
import { db } from './firebase';
import { useDoc } from './firestore-utils';

/**
 * Platform config, merged over the defaults. `config/platform` is world-readable and may
 * not exist at all on a fresh project, so a missing document is a normal state rather
 * than an error — the defaults simply apply.
 */
export function usePlatformConfig(): PlatformConfig {
  const ref = useMemo(() => doc(db, 'config', 'platform'), []);
  const { data } = useDoc<Partial<PlatformConfig>>(ref);

  return useMemo(() => {
    if (!data) return DEFAULT_PLATFORM_CONFIG;
    const merged = { ...DEFAULT_PLATFORM_CONFIG };
    for (const key of Object.keys(DEFAULT_PLATFORM_CONFIG) as (keyof PlatformConfig)[]) {
      const v = data[key];
      if (typeof v === typeof DEFAULT_PLATFORM_CONFIG[key]) {
        (merged as Record<string, unknown>)[key] = v;
      }
    }
    return merged;
  }, [data]);
}
