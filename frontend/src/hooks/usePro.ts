// src/hooks/usePro.ts
// [PRO] Authoritative pro-status hook.
// Source of truth: user.isPro from authStore (populated from Firestore on login).

import { useAuthStore } from '../store/authStore';

export const usePro = () => {
  const user = useAuthStore((state) => state.user);

  // Firestore-backed user.isPro is the authoritative source on all platforms.
  const isPro = Boolean(user?.isPro);

  /**
   * Compatibility API: no local persistence to avoid writable-client entitlement fallback.
   * Actual Pro status should be refreshed through auth/session state.
   */
  const setPro = async (_status: boolean): Promise<void> => Promise.resolve();

  return { isPro, loading: false, setPro };
};
