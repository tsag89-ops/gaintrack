import AsyncStorage from '@react-native-async-storage/async-storage';
import { Food, Exercise } from '../types';
import { seedFoods } from '../data/seedData';
import { EXERCISES } from '../constants/exercises';

const FOODS_KEY            = 'foods';
const EXERCISES_KEY        = 'exercises';
const RECENTLY_USED_KEY    = 'recently_used_exercises';   // string[] of exercise ids
const FAVORITES_KEY        = 'favorite_exercises';        // string[] of exercise ids
const RECENTLY_USED_LIMIT  = 20;

// ─── Seed ────────────────────────────────────────────────────────────────────

export const initializeData = async (): Promise<void> => {
  const [foodsExist, exercisesExist] = await Promise.all([
    AsyncStorage.getItem(FOODS_KEY),
    AsyncStorage.getItem(EXERCISES_KEY),
  ]);

  if (!foodsExist) {
    await AsyncStorage.setItem(FOODS_KEY, JSON.stringify(seedFoods));
  }

  // Always seed from the canonical constants list (replaces old 6-entry seed)
  if (!exercisesExist) {
    await AsyncStorage.setItem(EXERCISES_KEY, JSON.stringify(EXERCISES));
  }
};

// ─── Foods ───────────────────────────────────────────────────────────────────

export const getFoods = async (): Promise<Food[]> => {
  const data = await AsyncStorage.getItem(FOODS_KEY);
  return data ? JSON.parse(data) : [];
};

// ─── Exercises ───────────────────────────────────────────────────────────────

export const getExercises = async (): Promise<Exercise[]> => {
  const data = await AsyncStorage.getItem(EXERCISES_KEY);
  // Fall back to the in-memory constants so the picker always has data
  return data ? JSON.parse(data) : EXERCISES;
};

// ─── Recently Used ────────────────────────────────────────────────────────────

/** Returns up to RECENTLY_USED_LIMIT Exercise objects, most-recent first */
export const getRecentlyUsedExercises = async (): Promise<Exercise[]> => {
  const raw = await AsyncStorage.getItem(RECENTLY_USED_KEY);
  if (!raw) return [];
  const ids: string[] = JSON.parse(raw);
  const all = await getExercises();
  const map: Record<string, Exercise> = Object.fromEntries(all.map((ex) => [ex.id, ex]));
  return ids.map((id) => map[id]).filter(Boolean);
};

/** Records that an exercise was used. Prepends and deduplicates, capped at RECENTLY_USED_LIMIT. */
export const recordRecentlyUsedExercise = async (exerciseId: string): Promise<void> => {
  const raw = await AsyncStorage.getItem(RECENTLY_USED_KEY);
  const ids: string[] = raw ? JSON.parse(raw) : [];
  const deduped = [exerciseId, ...ids.filter((id) => id !== exerciseId)].slice(
    0,
    RECENTLY_USED_LIMIT,
  );
  await AsyncStorage.setItem(RECENTLY_USED_KEY, JSON.stringify(deduped));
};

// ─── Favorites ────────────────────────────────────────────────────────────────

/** Returns the set of favourite exercise ids */
export const getFavoriteIds = async (): Promise<string[]> => {
  const raw = await AsyncStorage.getItem(FAVORITES_KEY);
  return raw ? JSON.parse(raw) : [];
};

/** Toggles an exercise in favourites. Returns the updated id list. */
export const toggleFavoriteExercise = async (exerciseId: string): Promise<string[]> => {
  const ids = await getFavoriteIds();
  const next = ids.includes(exerciseId)
    ? ids.filter((id) => id !== exerciseId)
    : [...ids, exerciseId];
  await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
  return next;
};

/** Returns favourite Exercise objects */
export const getFavoriteExercises = async (): Promise<Exercise[]> => {
  const ids = await getFavoriteIds();
  const all = await getExercises();
  const map: Record<string, Exercise> = Object.fromEntries(all.map((ex) => [ex.id, ex]));
  return ids.map((id) => map[id]).filter(Boolean);
};

