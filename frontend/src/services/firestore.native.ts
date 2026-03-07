// src/services/firestore.native.ts [PRO]
// Android + iOS Firestore implementation using @react-native-firebase/firestore.
// Metro automatically resolves this file instead of firestore.ts on native.
// Exports are identical so all callers work unchanged.

import firestore from '@react-native-firebase/firestore';
import { Workout, Exercise, DailyNutrition, WorkoutProgram } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProgressEntry {
  date: string;
  exerciseId?: string;
  exerciseName?: string;
  oneRepMax?: number;
  totalVolume?: number;
  bodyweight?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TS = () => firestore.FieldValue.serverTimestamp();
const CHUNK = 400;

// ─── Connectivity ─────────────────────────────────────────────────────────────

export const goOnline = async (): Promise<void> => {
  try {
    await firestore().enableNetwork();
  } catch (err) {
    console.warn('[Firestore] goOnline error:', err);
  }
};

export const goOffline = async (): Promise<void> => {
  try {
    await firestore().disableNetwork();
  } catch (err) {
    console.warn('[Firestore] goOffline error:', err);
  }
};

// ─── Workouts ─────────────────────────────────────────────────────────────────

export const saveWorkout = async (userId: string, workout: Workout): Promise<void> => {
  if (!userId) return;
  try {
    await firestore()
      .collection('Users')
      .doc(userId)
      .collection('workouts')
      .doc(workout.workout_id)
      .set({ ...workout, _updatedAt: TS() }, { merge: true });
  } catch (err) {
    console.warn('[Firestore] saveWorkout error:', err);
    throw err;
  }
};

export const saveProgram = async (userId: string, program: WorkoutProgram): Promise<void> => {
  if (!userId) return;
  try {
    await firestore()
      .collection('Users')
      .doc(userId)
      .collection('programs')
      .doc(program.id)
      .set({ ...program, _updatedAt: TS() }, { merge: true });
  } catch (err) {
    console.warn('[Firestore] saveProgram error:', err);
    throw err;
  }
};

export const saveWorkoutsBatch = async (userId: string, workouts: Workout[]): Promise<void> => {
  if (!userId || workouts.length === 0) return;
  try {
    for (let i = 0; i < workouts.length; i += CHUNK) {
      const batch = firestore().batch();
      workouts.slice(i, i + CHUNK).forEach((w) => {
        const ref = firestore()
          .collection('Users')
          .doc(userId)
          .collection('workouts')
          .doc(w.workout_id);
        batch.set(ref, { ...w, _updatedAt: TS() }, { merge: true });
      });
      await batch.commit();
    }
  } catch (err) {
    console.warn('[Firestore] saveWorkoutsBatch error:', err);
    throw err;
  }
};

export const getWorkouts = async (userId: string): Promise<Workout[]> => {
  if (!userId) return [];
  try {
    const snap = await firestore()
      .collection('Users')
      .doc(userId)
      .collection('workouts')
      .get();
    return snap.docs.map((d) => d.data() as Workout);
  } catch (err) {
    console.warn('[Firestore] getWorkouts error:', err);
    return [];
  }
};

// ─── Exercises ────────────────────────────────────────────────────────────────

export const saveExercise = async (userId: string, exercise: Exercise): Promise<void> => {
  if (!userId) return;
  const id = exercise.exercise_id || exercise.id;
  try {
    await firestore()
      .collection('Users')
      .doc(userId)
      .collection('exercises')
      .doc(id)
      .set({ ...exercise, _updatedAt: TS() }, { merge: true });
  } catch (err) {
    console.warn('[Firestore] saveExercise error:', err);
    throw err;
  }
};

export const saveExercisesBatch = async (userId: string, exercises: Exercise[]): Promise<void> => {
  if (!userId || exercises.length === 0) return;
  try {
    for (let i = 0; i < exercises.length; i += CHUNK) {
      const batch = firestore().batch();
      exercises.slice(i, i + CHUNK).forEach((ex) => {
        const id = ex.exercise_id || ex.id;
        const ref = firestore()
          .collection('Users')
          .doc(userId)
          .collection('exercises')
          .doc(id);
        batch.set(ref, { ...ex, _updatedAt: TS() }, { merge: true });
      });
      await batch.commit();
    }
  } catch (err) {
    console.warn('[Firestore] saveExercisesBatch error:', err);
    throw err;
  }
};

export const getExercisesFromFirestore = async (userId: string): Promise<Exercise[]> => {
  if (!userId) return [];
  try {
    const snap = await firestore()
      .collection('Users')
      .doc(userId)
      .collection('exercises')
      .get();
    return snap.docs.map((d) => d.data() as Exercise);
  } catch (err) {
    console.warn('[Firestore] getExercisesFromFirestore error:', err);
    return [];
  }
};

// ─── Progress ─────────────────────────────────────────────────────────────────

export const syncProgress = async (userId: string, progress: ProgressEntry): Promise<void> => {
  if (!userId) return;
  try {
    await firestore()
      .collection('Users')
      .doc(userId)
      .collection('progress')
      .doc(progress.date)
      .set({ ...progress, _updatedAt: TS() }, { merge: true });
  } catch (err) {
    console.warn('[Firestore] syncProgress error:', err);
    throw err;
  }
};

export const syncProgressBatch = async (
  userId: string,
  entries: ProgressEntry[],
): Promise<void> => {
  if (!userId || entries.length === 0) return;
  try {
    const batch = firestore().batch();
    entries.forEach((entry) => {
      const ref = firestore()
        .collection('Users')
        .doc(userId)
        .collection('progress')
        .doc(entry.date);
      batch.set(ref, { ...entry, _updatedAt: TS() }, { merge: true });
    });
    await batch.commit();
  } catch (err) {
    console.warn('[Firestore] syncProgressBatch error:', err);
    throw err;
  }
};

export const getProgress = async (userId: string): Promise<ProgressEntry[]> => {
  if (!userId) return [];
  try {
    const snap = await firestore()
      .collection('Users')
      .doc(userId)
      .collection('progress')
      .get();
    return snap.docs.map((d) => d.data() as ProgressEntry);
  } catch (err) {
    console.warn('[Firestore] getProgress error:', err);
    return [];
  }
};

// ─── Nutrition ────────────────────────────────────────────────────────────────

export const saveDailyNutrition = async (userId: string, data: DailyNutrition): Promise<void> => {
  if (!userId) return;
  try {
    const payload = { ...data } as any;
    delete payload._updatedAt;
    await firestore()
      .collection('Users')
      .doc(userId)
      .collection('nutrition')
      .doc(data.date)
      .set({ ...payload, _updatedAt: TS() });
  } catch (err) {
    console.warn('[Firestore] saveDailyNutrition error:', err);
  }
};

export const getDailyNutritionFromFirestore = async (
  userId: string,
  date: string,
): Promise<DailyNutrition | null> => {
  if (!userId) return null;
  try {
    const snap = await firestore()
      .collection('Users')
      .doc(userId)
      .collection('nutrition')
      .doc(date)
      .get();
    if ((snap as any).exists) {
      const d = snap.data() as any;
      delete d._updatedAt;
      return d as DailyNutrition;
    }
    return null;
  } catch (err) {
    console.warn('[Firestore] getDailyNutritionFromFirestore error:', err);
    return null;
  }
};

export const getAllNutritionFromFirestore = async (
  userId: string,
): Promise<DailyNutrition[]> => {
  if (!userId) return [];
  try {
    const snap = await firestore()
      .collection('Users')
      .doc(userId)
      .collection('nutrition')
      .get();
    return snap.docs.map((d) => {
      const data = d.data() as any;
      delete data._updatedAt;
      return data as DailyNutrition;
    });
  } catch (err) {
    console.warn('[Firestore] getAllNutritionFromFirestore error:', err);
    return [];
  }
};
