// src/services/firestore.ts [PRO]
// Firestore FREE tier sync — Users/{userId}/workouts|exercises|progress
// Firestore free quota: 50k reads / 20k writes / 1 GB storage per day

import {
  collection,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  getDocs,
  writeBatch,
  enableNetwork,
  disableNetwork,
  serverTimestamp,
  QuerySnapshot,
  DocumentData,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { Workout, Exercise, DailyNutrition, WorkoutProgram } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProgressEntry {
  date: string;                // ISO date key e.g. "2026-03-01"
  exerciseId?: string;
  exerciseName?: string;
  oneRepMax?: number;          // Brzycki 1RM in kg/lb
  totalVolume?: number;        // kg × reps summed across all sets
  bodyweight?: number;
}

// ─── Connectivity ─────────────────────────────────────────────────────────────

/** Re-enable Firestore network (exits offline mode). [PRO] */
export const goOnline = async (): Promise<void> => {
  try {
    if (!db) return;
    await enableNetwork(db);
  } catch (err) {
    console.warn('[Firestore] goOnline error:', err);
  }
};

/** Pause Firestore network — reads/writes queue locally until goOnline(). [PRO] */
export const goOffline = async (): Promise<void> => {
  try {
    if (!db) return;
    await disableNetwork(db);
  } catch (err) {
    console.warn('[Firestore] goOffline error:', err);
  }
};

// ─── Workouts ─────────────────────────────────────────────────────────────────

/**
 * Upserts a single workout document.
 * Path: Users/{userId}/workouts/{workoutId}
 * [PRO]
 */
export const saveWorkout = async (
  userId: string,
  workout: Workout,
): Promise<void> => {
  if (!db || !userId) return;
  try {
    const ref = doc(db, 'Users', userId, 'workouts', workout.workout_id);
    await setDoc(ref, { ...workout, _updatedAt: serverTimestamp() }, { merge: true });
  } catch (err) {
    console.warn('[Firestore] saveWorkout error:', err);
    throw err;
  }
};

/**
 * Upserts a workout program to Firestore.
 * Path: Users/{userId}/programs/{programId}
 * [PRO]
 */
export const saveProgram = async (
  userId: string,
  program: WorkoutProgram,
): Promise<void> => {
  if (!db || !userId) return;
  try {
    const ref = doc(db, 'Users', userId, 'programs', program.id);
    await setDoc(ref, { ...program, _updatedAt: serverTimestamp() }, { merge: true });
  } catch (err) {
    console.warn('[Firestore] saveProgram error:', err);
    throw err;
  }
};



/**
 * Batch-upserts up to N workouts atomically (chunked at 400 to stay under
 * Firestore's 500-operation-per-batch limit).
 * [PRO]
 */
export const saveWorkoutsBatch = async (
  userId: string,
  workouts: Workout[],
): Promise<void> => {
  if (!db || !userId || workouts.length === 0) return;
  const CHUNK = 400;
  try {
    for (let i = 0; i < workouts.length; i += CHUNK) {
      const batch = writeBatch(db);
      workouts.slice(i, i + CHUNK).forEach((w) => {
        const ref = doc(db, 'Users', userId, 'workouts', w.workout_id);
        batch.set(ref, { ...w, _updatedAt: serverTimestamp() }, { merge: true });
      });
      await batch.commit();
    }
  } catch (err) {
    console.warn('[Firestore] saveWorkoutsBatch error:', err);
    throw err;
  }
};

/**
 * Fetches all workout documents for the user.
 * [PRO]
 */
export const getWorkouts = async (userId: string): Promise<Workout[]> => {
  if (!db || !userId) return [];
  try {
    const snap: QuerySnapshot<DocumentData> = await getDocs(
      collection(db, 'Users', userId, 'workouts'),
    );
    return snap.docs.map((d) => d.data() as Workout);
  } catch (err) {
    console.warn('[Firestore] getWorkouts error:', err);
    return [];
  }
};

// ─── Exercises ────────────────────────────────────────────────────────────────

/**
 * Upserts a single custom exercise document.
 * Path: Users/{userId}/exercises/{exerciseId}
 * [PRO]
 */
export const saveExercise = async (
  userId: string,
  exercise: Exercise,
): Promise<void> => {
  if (!db || !userId) return;
  const id = exercise.exercise_id || exercise.id;
  try {
    const ref = doc(db, 'Users', userId, 'exercises', id);
    await setDoc(
      ref,
      { ...exercise, _updatedAt: serverTimestamp() },
      { merge: true },
    );
  } catch (err) {
    console.warn('[Firestore] saveExercise error:', err);
    throw err;
  }
};

/**
 * Batch-upserts multiple custom exercises atomically.
 * [PRO]
 */
export const saveExercisesBatch = async (
  userId: string,
  exercises: Exercise[],
): Promise<void> => {
  if (!db || !userId || exercises.length === 0) return;
  const CHUNK = 400;
  try {
    for (let i = 0; i < exercises.length; i += CHUNK) {
      const batch = writeBatch(db);
      exercises.slice(i, i + CHUNK).forEach((ex) => {
        const id = ex.exercise_id || ex.id;
        const ref = doc(db, 'Users', userId, 'exercises', id);
        batch.set(
          ref,
          { ...ex, _updatedAt: serverTimestamp() },
          { merge: true },
        );
      });
      await batch.commit();
    }
  } catch (err) {
    console.warn('[Firestore] saveExercisesBatch error:', err);
    throw err;
  }
};

/**
 * Fetches all custom exercises for the user.
 * [PRO]
 */
export const getExercisesFromFirestore = async (
  userId: string,
): Promise<Exercise[]> => {
  if (!db || !userId) return [];
  try {
    const snap: QuerySnapshot<DocumentData> = await getDocs(
      collection(db, 'Users', userId, 'exercises'),
    );
    return snap.docs.map((d) => d.data() as Exercise);
  } catch (err) {
    console.warn('[Firestore] getExercisesFromFirestore error:', err);
    return [];
  }
};

// ─── Progress ─────────────────────────────────────────────────────────────────

/**
 * Upserts a single progress entry keyed by date.
 * Path: Users/{userId}/progress/{date}
 * [PRO]
 */
export const syncProgress = async (
  userId: string,
  progress: ProgressEntry,
): Promise<void> => {
  if (!db || !userId) return;
  try {
    const ref = doc(db, 'Users', userId, 'progress', progress.date);
    await setDoc(
      ref,
      { ...progress, _updatedAt: serverTimestamp() },
      { merge: true },
    );
  } catch (err) {
    console.warn('[Firestore] syncProgress error:', err);
    throw err;
  }
};

/**
 * Batch-syncs multiple progress entries.
 * [PRO]
 */
export const syncProgressBatch = async (
  userId: string,
  entries: ProgressEntry[],
): Promise<void> => {
  if (!db || !userId || entries.length === 0) return;
  try {
    const batch = writeBatch(db);
    entries.forEach((entry) => {
      const ref = doc(db, 'Users', userId, 'progress', entry.date);
      batch.set(
        ref,
        { ...entry, _updatedAt: serverTimestamp() },
        { merge: true },
      );
    });
    await batch.commit();
  } catch (err) {
    console.warn('[Firestore] syncProgressBatch error:', err);
    throw err;
  }
};

/**
 * Fetches all progress entries for the user.
 * [PRO]
 */
export const getProgress = async (userId: string): Promise<ProgressEntry[]> => {
  if (!db || !userId) return [];
  try {
    const snap: QuerySnapshot<DocumentData> = await getDocs(
      collection(db, 'Users', userId, 'progress'),
    );
    return snap.docs.map((d) => d.data() as ProgressEntry);
  } catch (err) {
    console.warn('[Firestore] getProgress error:', err);
    return [];
  }
};
// ─── Nutrition ────────────────────────────────────────────────────────────────

/**
 * Overwrites a daily nutrition document (full replace — totals always consistent).
 * Path: Users/{userId}/nutrition/{date}
 * [PRO]
 */
export const saveDailyNutrition = async (
  userId: string,
  data: DailyNutrition,
): Promise<void> => {
  if (!db || !userId) return;
  try {
    const ref = doc(db, 'Users', userId, 'nutrition', data.date);
    // Strip internal Firestore metadata before writing
    const { ...payload } = data as any;
    delete payload._updatedAt;
    await setDoc(ref, { ...payload, _updatedAt: serverTimestamp() });
  } catch (err) {
    console.warn('[Firestore] saveDailyNutrition error:', err);
  }
};

/**
 * Fetches a single daily nutrition document by date.
 * Returns null if the document does not exist.
 * [PRO]
 */
export const getDailyNutritionFromFirestore = async (
  userId: string,
  date: string,
): Promise<DailyNutrition | null> => {
  if (!db || !userId) return null;
  try {
    const ref = doc(db, 'Users', userId, 'nutrition', date);
    const snap = await getDoc(ref);
    if (snap.exists()) {
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

/**
 * Fetches all daily nutrition documents for the user.
 * Used for bulk restore / cross-device initial sync.
 * [PRO]
 */
export const getAllNutritionFromFirestore = async (
  userId: string,
): Promise<DailyNutrition[]> => {
  if (!db || !userId) return [];
  try {
    const snap = await getDocs(
      collection(db, 'Users', userId, 'nutrition'),
    );
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

// ─── Account Deletion Helpers ────────────────────────────────────────────────

const deleteCollectionDocs = async (
  userId: string,
  root: 'Users' | 'users',
  subcollection: string,
): Promise<void> => {
  if (!db) return;

  const snap = await getDocs(collection(db, root, userId, subcollection));
  if (snap.empty) return;

  const CHUNK = 400;
  const docs = snap.docs;
  for (let i = 0; i < docs.length; i += CHUNK) {
    const batch = writeBatch(db);
    docs.slice(i, i + CHUNK).forEach((item) => {
      batch.delete(item.ref);
    });
    await batch.commit();
  }
};

/**
 * Deletes user-scoped Firestore data before account removal.
 * Best effort across both `Users` and `users` roots for legacy compatibility.
 */
export const deleteUserCloudData = async (userId: string): Promise<void> => {
  if (!db || !userId) return;

  const subcollections = ['workouts', 'exercises', 'progress', 'nutrition', 'programs', 'macros'];

  for (const root of ['Users', 'users'] as const) {
    for (const subcollection of subcollections) {
      try {
        await deleteCollectionDocs(userId, root, subcollection);
      } catch (err) {
        console.warn(`[Firestore] delete collection ${root}/${userId}/${subcollection} failed:`, err);
      }
    }

    try {
      await deleteDoc(doc(db, root, userId));
    } catch (err) {
      console.warn(`[Firestore] delete profile ${root}/${userId} failed:`, err);
    }
  }
};