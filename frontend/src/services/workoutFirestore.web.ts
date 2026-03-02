// src/services/workoutFirestore.web.ts
// Web stub — @react-native-firebase/firestore unavailable in server/web bundle.

import { Workout } from '../types';

export async function loadUserWorkouts(_uid: string, _limit?: number): Promise<Workout[]> {
  return [];
}

export async function createWorkout(
  _uid: string,
  _data: Omit<Workout, 'workout_id' | 'created_at'>,
): Promise<Workout> {
  throw new Error('Not available on web');
}

export async function updateWorkout(
  _uid: string,
  _workoutId: string,
  _updates: Partial<Omit<Workout, 'workout_id' | 'created_at'>>,
): Promise<void> {}

export async function deleteWorkout(_uid: string, _workoutId: string): Promise<void> {}
