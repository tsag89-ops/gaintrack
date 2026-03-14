// src/hooks/usePro.ts
// [PRO] Authoritative pro-status hook.
// Source of truth: user.isPro from authStore (populated from Firestore on login).
// Falls back to AsyncStorage cache on native for offline resilience.

import { useState, useEffect } from 'react';
import { Platform } from 'react-native';
import { useAuthStore } from '../store/authStore';
import { storage } from '../utils/storage';

const PRO_STATUS_KEY = 'gaintrack_pro_status';

export const usePro = () => {
  const user = useAuthStore((state) => state.user);
  const isWeb = Platform.OS === 'web';
  const [asyncIsPro, setAsyncIsPro] = useState(false);
  const [loading, setLoading] = useState(!isWeb);

  useEffect(() => {
    if (isWeb) return;
    storage.getItem(PRO_STATUS_KEY)
      .then((val) => setAsyncIsPro(val === 'true'))
      .finally(() => setLoading(false));
  }, [isWeb]);

  // Firestore-backed user.isPro is the authoritative source on all platforms.
  // AsyncStorage is a native fallback for offline sessions.
  const isPro = user?.isPro ?? (isWeb ? false : asyncIsPro);

  /** Persist pro status — called after a RevenueCat purchase completes */
  const setPro = async (status: boolean): Promise<void> => {
    if (!isWeb) {
      await storage.setItem(PRO_STATUS_KEY, String(status));
      setAsyncIsPro(status);
    }
  };

  return { isPro, loading: isWeb ? false : loading, setPro };
};
