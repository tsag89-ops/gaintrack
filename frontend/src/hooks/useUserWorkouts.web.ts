// src/hooks/useUserWorkouts.web.ts
// Web stub — native Firestore unavailable in server/web bundle.

export interface FirestoreWorkout {
  id: string;
  date: string;
  name?: string;
  [key: string]: unknown;
}

type LoadStatus = 'idle' | 'loading' | 'success' | 'error';

export interface UseUserWorkoutsResult {
  status: LoadStatus;
  uid: string | null;
  workouts: FirestoreWorkout[] | null;
  reload: () => void;
}

export function useUserWorkouts(): UseUserWorkoutsResult {
  return { status: 'idle', uid: null, workouts: null, reload: () => {} };
}
