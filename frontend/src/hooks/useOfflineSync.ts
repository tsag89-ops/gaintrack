/**
 * useOfflineSync.ts  [PRO]
 *
 * Flushes the offline workout queue to Firestore whenever the app returns
 * to the foreground (AppState → 'active') or on initial mount.
 *
 * Usage: call useOfflineSync() once from the root layout component.
 */

import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { flushOfflineQueue, getPendingCount } from '../services/offlineQueue';

export function useOfflineSync() {
  const flushing = useRef(false);

  const tryFlush = async () => {
    if (flushing.current) return;
    flushing.current = true;
    try {
      const pending = await getPendingCount();
      if (pending === 0) return;
      const synced = await flushOfflineQueue();
      if (synced > 0) {
        console.log(`[useOfflineSync] Synced ${synced} offline workout(s) to Firestore`);
      }
    } catch (e) {
      console.warn('[useOfflineSync] flush error:', e);
    } finally {
      flushing.current = false;
    }
  };

  useEffect(() => {
    // Attempt flush on mount (app start or screen remount)
    tryFlush();

    // Re-attempt whenever the app comes back to the foreground
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') tryFlush();
    });

    return () => sub.remove();
  }, []);
}
