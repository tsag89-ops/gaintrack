import { useAuthStore } from '../store/authStore';

export function useLengthUnit(): 'cm' | 'in' {
  const user = useAuthStore((state) => state.user);
  return user?.units?.height ?? 'cm';
}
