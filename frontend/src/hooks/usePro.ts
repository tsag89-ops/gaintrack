// src/hooks/usePro.ts
// Stub hook — swap body for real RevenueCat calls when configured
// All Pro-gated code should reference: const { isPro } = usePro();
// [PRO]

import { useState, useEffect } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PRO_STATUS_KEY = 'gaintrack_pro_status';

export const usePro = () => {
  const isWeb = Platform.OS === 'web';
  const [isPro, setIsPro] = useState(false);
  const [loading, setLoading] = useState(!isWeb);

  useEffect(() => {
    if (isWeb) return;
    AsyncStorage.getItem(PRO_STATUS_KEY)
      .then((val) => setIsPro(val === 'true'))
      .finally(() => setLoading(false));
  }, [isWeb]);

  // Web: RevenueCat / IAP not available — always Free.
  if (isWeb) {
    return { isPro: false, loading: false, setPro: async (_: boolean) => {} };
  }

  /** Persist pro status — replace with RevenueCat purchase flow */
  const setPro = async (status: boolean): Promise<void> => {
    await AsyncStorage.setItem(PRO_STATUS_KEY, String(status));
    setIsPro(status);
  };

  return { isPro, loading, setPro };
};
