// src/hooks/useWeightUnit.ts
// Returns the user's preferred weight unit ('kg' | 'lbs'), reactively pulled from
// the Zustand authStore so it updates the instant the user changes it in Profile.

import { useAuthStore } from '../store/authStore';

export function useWeightUnit(): 'kg' | 'lbs' {
  const user = useAuthStore((state) => state.user);
  return user?.units?.weight ?? 'kg';
}
