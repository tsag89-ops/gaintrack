import AsyncStorage from '@react-native-async-storage/async-storage';
import { Food, Exercise, Workout, WorkoutProgram, PhysiquePhoto } from '../types';
import { seedFoods } from '../data/seedData';
import { EXERCISES } from '../constants/exercises';
import {
  saveWorkout as fsSaveWorkout,
  saveExercise as fsSaveExercise,
  syncProgress as fsSyncProgress,
  ProgressEntry,
} from './firestore'; // [PRO]

const FOODS_KEY            = 'foods';
const EXERCISES_KEY        = 'exercises';
const WORKOUTS_KEY         = 'workouts';
const RECENTLY_USED_KEY    = 'recently_used_exercises';   // string[] of exercise ids
const FAVORITES_KEY        = 'favorite_exercises';        // string[] of exercise ids
const RECENTLY_USED_LIMIT  = 20;
const PRO_STATUS_KEY       = 'gaintrack_pro_status';
const USER_KEY             = 'user';
const STORAGE_TIMEOUT_MS   = 8000;

const withStorageTimeout = async <T,>(operation: Promise<T>, label: string): Promise<T> => {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(`${label} timed out after ${STORAGE_TIMEOUT_MS}ms`));
        }, STORAGE_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
};

const getItem = (key: string) => withStorageTimeout(AsyncStorage.getItem(key), `AsyncStorage.getItem(${key})`);
const setItem = (key: string, value: string) => withStorageTimeout(AsyncStorage.setItem(key, value), `AsyncStorage.setItem(${key})`);

// ─── Helpers (non-hook context) ───────────────────────────────────────────────

/** Reads the stored Pro status without requiring a hook. */
const _isPro = async (): Promise<boolean> => {
  const val = await getItem(PRO_STATUS_KEY);
  return val === 'true';
};

/** Reads the stored user id without requiring a hook. */
const _getUserId = async (): Promise<string | null> => {
  const raw = await getItem(USER_KEY);
  if (!raw) return null;
  try {
    const user = JSON.parse(raw) as { id?: string; user_id?: string };
    return user.id ?? user.user_id ?? null;
  } catch {
    return null;
  }
};

// ─── Seed ────────────────────────────────────────────────────────────────────

export const initializeData = async (): Promise<void> => {
  const [foodsExist, exercisesExist] = await Promise.all([
    getItem(FOODS_KEY),
    getItem(EXERCISES_KEY),
  ]);

  if (!foodsExist) {
    await setItem(FOODS_KEY, JSON.stringify(seedFoods));
  }

  // Always seed from the canonical constants list (replaces old 6-entry seed)
  if (!exercisesExist) {
    await setItem(EXERCISES_KEY, JSON.stringify(EXERCISES));
  }
};

// ─── Foods ───────────────────────────────────────────────────────────────────

export const getFoods = async (): Promise<Food[]> => {
  const data = await getItem(FOODS_KEY);
  return data ? JSON.parse(data) : [];
};

// ─── Exercises ───────────────────────────────────────────────────────────────

export const getExercises = async (): Promise<Exercise[]> => {
  const data = await getItem(EXERCISES_KEY);
  // Fall back to the in-memory constants so the picker always has data
  return data ? JSON.parse(data) : EXERCISES;
};

// ─── Recently Used ────────────────────────────────────────────────────────────

/** Returns up to RECENTLY_USED_LIMIT Exercise objects, most-recent first */
export const getRecentlyUsedExercises = async (): Promise<Exercise[]> => {
  const raw = await getItem(RECENTLY_USED_KEY);
  if (!raw) return [];
  const ids: string[] = JSON.parse(raw);
  const all = await getExercises();
  const map: Record<string, Exercise> = Object.fromEntries(all.map((ex) => [ex.id, ex]));
  return ids.map((id) => map[id]).filter(Boolean);
};

/** Records that an exercise was used. Prepends and deduplicates, capped at RECENTLY_USED_LIMIT. */
export const recordRecentlyUsedExercise = async (exerciseId: string): Promise<void> => {
  const raw = await getItem(RECENTLY_USED_KEY);
  const ids: string[] = raw ? JSON.parse(raw) : [];
  const deduped = [exerciseId, ...ids.filter((id) => id !== exerciseId)].slice(
    0,
    RECENTLY_USED_LIMIT,
  );
  await setItem(RECENTLY_USED_KEY, JSON.stringify(deduped));
};

// ─── Favorites ────────────────────────────────────────────────────────────────

/** Returns the set of favourite exercise ids */
export const getFavoriteIds = async (): Promise<string[]> => {
  const raw = await getItem(FAVORITES_KEY);
  return raw ? JSON.parse(raw) : [];
};

/** Toggles an exercise in favourites. Returns the updated id list. */
export const toggleFavoriteExercise = async (exerciseId: string): Promise<string[]> => {
  const ids = await getFavoriteIds();
  const next = ids.includes(exerciseId)
    ? ids.filter((id) => id !== exerciseId)
    : [...ids, exerciseId];
  await setItem(FAVORITES_KEY, JSON.stringify(next));
  return next;
};

/** Returns favourite Exercise objects */
export const getFavoriteExercises = async (): Promise<Exercise[]> => {
  const ids = await getFavoriteIds();
  const all = await getExercises();
  const map: Record<string, Exercise> = Object.fromEntries(all.map((ex) => [ex.id, ex]));
  return ids.map((id) => map[id]).filter(Boolean);
};

// ─── Workouts ─────────────────────────────────────────────────────────────────

/** Returns all locally stored workouts, newest first. */
export const getWorkoutsLocal = async (): Promise<Workout[]> => {
  const data = await getItem(WORKOUTS_KEY);
  return data ? JSON.parse(data) : [];
};

/**
 * Saves a workout to AsyncStorage and, if the user is Pro, syncs it to
 * Firestore in the background (fire-and-forget — never blocks the UI).
 * [PRO] Firestore sync
 */
export const saveWorkout = async (workout: Workout): Promise<void> => {
  const existing = await getWorkoutsLocal();
  const idx = existing.findIndex((w) => w.workout_id === workout.workout_id);
  const updated =
    idx >= 0
      ? existing.map((w) => (w.workout_id === workout.workout_id ? workout : w))
      : [workout, ...existing];
  await setItem(WORKOUTS_KEY, JSON.stringify(updated));

  // [PRO] background Firestore sync
  const [pro, userId] = await Promise.all([_isPro(), _getUserId()]);
  if (pro && userId) {
    fsSaveWorkout(userId, workout).catch((err) =>
      console.warn('[Storage] Firestore saveWorkout sync error:', err),
    );
  }
};

/**
 * Deletes a workout from AsyncStorage by id.
 * No Firestore delete — soft-delete pattern keeps cloud history intact.
 */
export const deleteWorkout = async (workoutId: string): Promise<void> => {
  const existing = await getWorkoutsLocal();
  const updated = existing.filter((w) => w.workout_id !== workoutId);
  await setItem(WORKOUTS_KEY, JSON.stringify(updated));
};

// ─── Custom Exercise write (with Firestore sync) ──────────────────────────────

/**
 * Persists a custom exercise to AsyncStorage and syncs to Firestore if Pro.
 * [PRO] Firestore sync
 */
export const saveCustomExercise = async (exercise: Exercise): Promise<void> => {
  const existing = await getExercises();
  const id = exercise.exercise_id || exercise.id;
  const idx = existing.findIndex((ex) => (ex.exercise_id || ex.id) === id);
  const updated =
    idx >= 0
      ? existing.map((ex) => ((ex.exercise_id || ex.id) === id ? exercise : ex))
      : [exercise, ...existing];
  await setItem(EXERCISES_KEY, JSON.stringify(updated));

  // [PRO] background Firestore sync
  const [pro, userId] = await Promise.all([_isPro(), _getUserId()]);
  if (pro && userId) {
    fsSaveExercise(userId, exercise).catch((err) =>
      console.warn('[Storage] Firestore saveExercise sync error:', err),
    );
  }
};

// ─── Progress write (with Firestore sync) ─────────────────────────────────────

/**
 * Saves a progress entry to AsyncStorage and syncs to Firestore if Pro.
 * Keyed by entry.date (ISO string). [PRO] Firestore sync
 */
export const saveProgress = async (entry: ProgressEntry): Promise<void> => {
  const raw = await getItem('progress');
  const existing: ProgressEntry[] = raw ? JSON.parse(raw) : [];
  const idx = existing.findIndex((p) => p.date === entry.date);
  const updated =
    idx >= 0
      ? existing.map((p) => (p.date === entry.date ? { ...p, ...entry } : p))
      : [entry, ...existing];
  await setItem('progress', JSON.stringify(updated));

  // [PRO] background Firestore sync
  const [pro, userId] = await Promise.all([_isPro(), _getUserId()]);
  if (pro && userId) {
    fsSyncProgress(userId, entry).catch((err) =>
      console.warn('[Storage] Firestore syncProgress error:', err),
    );
  }
};

/** Reads all locally stored progress entries. */
export const getProgressLocal = async (): Promise<ProgressEntry[]> => {
  const raw = await getItem('progress');
  return raw ? JSON.parse(raw) : [];
};

// ─── Programs ─────────────────────────────────────────────────────────────────

const PROGRAMS_KEY = 'programs_v1';

/** Returns all locally stored programs. */
export const getPrograms = async (): Promise<WorkoutProgram[]> => {
  const data = await getItem(PROGRAMS_KEY);
  return data ? JSON.parse(data) : [];
};

/**
 * Upserts a program by id. Creates if not found, replaces if found.
 * [PRO] Firestore sync: users/{userId}/programs/{programId}
 */
export const saveProgram = async (program: WorkoutProgram): Promise<void> => {
  const all = await getPrograms();
  const idx = all.findIndex((p) => p.id === program.id);
  const updated =
    idx >= 0 ? all.map((p) => (p.id === program.id ? program : p)) : [...all, program];
  await setItem(PROGRAMS_KEY, JSON.stringify(updated));

  // [PRO] background Firestore sync
  const [pro, userId] = await Promise.all([_isPro(), _getUserId()]);
  if (pro && userId) {
    try {
      const { saveProgram: fsSaveProg } = await import('./firestore');
      fsSaveProg(userId, program).catch((err) =>
        console.warn('[Storage] Firestore saveProgram sync error:', err),
      );
    } catch {
      // firestore not available — ok
    }
  }
};

/** Deletes a program by id from local storage. */
export const deleteProgram = async (id: string): Promise<void> => {
  const all = await getPrograms();
  await setItem(PROGRAMS_KEY, JSON.stringify(all.filter((p) => p.id !== id)));
};

// ─── Physique Progress Photos ─────────────────────────────────────────────────

const PHYSIQUE_PHOTOS_KEY = 'gaintrack_physique_photos';
export const MAX_PHOTOS_PER_DAY = 5;

/** Returns all physique photos, newest first. */
export const getPhysiquePhotos = async (): Promise<PhysiquePhoto[]> => {
  const raw = await getItem(PHYSIQUE_PHOTOS_KEY);
  return raw ? JSON.parse(raw) : [];
};

/** Returns photos for a specific date ('yyyy-MM-dd'). */
export const getPhysiquePhotosForDate = async (date: string): Promise<PhysiquePhoto[]> => {
  const all = await getPhysiquePhotos();
  return all.filter((p) => p.date === date);
};

/**
 * Saves a physique photo entry. Enforces MAX_PHOTOS_PER_DAY limit.
 * Throws if limit is reached for that day.
 */
export const savePhysiquePhoto = async (photo: PhysiquePhoto): Promise<void> => {
  const all = await getPhysiquePhotos();
  const dayPhotos = all.filter((p) => p.date === photo.date);
  if (dayPhotos.length >= MAX_PHOTOS_PER_DAY) {
    throw new Error(`Maximum ${MAX_PHOTOS_PER_DAY} photos allowed per day.`);
  }
  const updated = [photo, ...all];
  await setItem(PHYSIQUE_PHOTOS_KEY, JSON.stringify(updated));
};

/** Deletes a physique photo entry by id. Does NOT delete the file — caller handles that. */
export const deletePhysiquePhoto = async (id: string): Promise<void> => {
  const all = await getPhysiquePhotos();
  const updated = all.filter((p) => p.id !== id);
  await setItem(PHYSIQUE_PHOTOS_KEY, JSON.stringify(updated));
};

