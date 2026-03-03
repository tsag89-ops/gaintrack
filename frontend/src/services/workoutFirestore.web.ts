// src/services/workoutFirestore.web.ts
// Web implementation using Firebase JS SDK (modular v9+).
// Metro picks this file over workoutFirestore.ts for web builds.

import {
  collection,
  doc,
  addDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  limit as fsLimit,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { Workout } from '../types';

function workoutsCol(uid: string) {
  return collection(db, 'users', uid, 'workouts');
}

/**
 * Recursively removes `undefined` values from an object so Firestore
 * doesn't throw "Unsupported field value: undefined".
 * Mirrors JSON serialization (undefined keys are dropped entirely).
 */
function sanitize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_key, val) =>
    val === undefined ? null : val
  )) as T;
}

export async function loadUserWorkouts(
  uid: string,
  limit = 30,
): Promise<Workout[]> {
  const q = query(workoutsCol(uid), orderBy('date', 'desc'), fsLimit(limit));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({
    ...(d.data() as Omit<Workout, 'workout_id'>),
    workout_id: d.id,
  }));
}

export async function createWorkout(
  uid: string,
  data: Omit<Workout, 'workout_id' | 'created_at'>,
): Promise<Workout> {
  // Strip embedded exercise objects (contain undefined fields) — only keep
  // the fields actually needed for display/history.
  const cleanedExercises = (data.exercises ?? []).map((ex: any) => ({
    exercise_id: ex.exercise_id,
    exercise_name: ex.exercise_name,
    notes: ex.notes ?? null,
    sets: (ex.sets ?? []).map((s: any) => ({
      set_id: s.set_id,
      set_number: s.set_number,
      reps: s.reps ?? 0,
      weight: s.weight ?? 0,
      rpe: s.rpe ?? null,
      completed: s.completed ?? false,
      is_warmup: s.is_warmup ?? false,
    })),
  }));

  const payload = sanitize({
    ...data,
    exercises: cleanedExercises,
    created_at: new Date().toISOString(),
    date: data.date ?? new Date().toISOString(),
  });

  const ref = await addDoc(workoutsCol(uid), payload);
  return { ...payload, workout_id: ref.id } as Workout;
}

export async function updateWorkout(
  uid: string,
  workoutId: string,
  updates: Partial<Omit<Workout, 'workout_id' | 'created_at'>>,
): Promise<void> {
  await updateDoc(
    doc(workoutsCol(uid), workoutId),
    updates as Record<string, unknown>,
  );
}

export async function deleteWorkout(
  uid: string,
  workoutId: string,
): Promise<void> {
  await deleteDoc(doc(workoutsCol(uid), workoutId));
}
