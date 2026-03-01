// src/hooks/useProStatus.ts
// [PRO] Real RevenueCat hook — reads live entitlement state.
//
// The existing src/hooks/usePro.ts (AsyncStorage stub) is left untouched;
// existing code that imports usePro still works. This new hook is used
// wherever you need accurate purchase state from RevenueCat.

import { useState, useEffect, useCallback } from 'react';
import { getCustomerInfo, hasProEntitlement } from '../services/revenueCat';

export interface ProStatus {
  isPro: boolean;
  loading: boolean;
  /** Non-null when the RevenueCat fetch failed (e.g. offline, not configured). */
  error: string | null;
  /** Call this after a purchase completes to refresh the status immediately. */
  refresh: () => Promise<void>;
}

export function useProStatus(): ProStatus {
  const [isPro, setIsPro] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const info = await getCustomerInfo();
      setIsPro(hasProEntitlement(info));
    } catch (err: any) {
      // This is non-fatal — if RevenueCat isn't configured yet (e.g. missing
      // API key in dev), the user simply appears as Free.
      setError(err?.message ?? 'Could not load subscription status.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { isPro, loading, error, refresh };
}
