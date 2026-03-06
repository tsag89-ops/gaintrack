// src/services/firestore.web.ts
// Web/server stub — Firestore native calls are no-ops in the web/server bundle.
// Metro prefers .web.ts over .ts automatically.

import { Workout, Exercise, DailyNutrition } from '../types';

export interface ProgressEntry {
  date: string;
  exerciseId?: string;
  exerciseName?: string;
  oneRepMax?: number;
  totalVolume?: number;
  bodyweight?: number;
}

export const goOnline = async (): Promise<void> => {};
export const goOffline = async (): Promise<void> => {};

export const saveWorkout = async (_userId: string, _workout: Workout): Promise<void> => {};
export const saveWorkoutsBatch = async (_userId: string, _workouts: Workout[]): Promise<void> => {};
export const getWorkouts = async (_userId: string): Promise<Workout[]> => [];

export const saveExercise = async (_userId: string, _exercise: Exercise): Promise<void> => {};
export const saveExercisesBatch = async (_userId: string, _exercises: Exercise[]): Promise<void> => {};
export const getExercisesFromFirestore = async (_userId: string): Promise<Exercise[]> => [];

export const syncProgress = async (_userId: string, _progress: ProgressEntry): Promise<void> => {};
export const syncProgressBatch = async (_userId: string, _entries: ProgressEntry[]): Promise<void> => {};
export const getProgress = async (_userId: string): Promise<ProgressEntry[]> => [];

export const saveDailyNutrition = async (_userId: string, _data: DailyNutrition): Promise<void> => {};
export const getDailyNutritionFromFirestore = async (_userId: string, _date: string): Promise<DailyNutrition | null> => null;
export const getAllNutritionFromFirestore = async (_userId: string): Promise<DailyNutrition[]> => [];

export const updateUserProfile = async (_userId: string, _data: Record<string, unknown>): Promise<void> => {};
