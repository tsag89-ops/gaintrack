import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Workout, WorkoutExercise, WorkoutSet, Exercise } from '../types';
import {
  loadUserWorkouts as fsLoadUserWorkouts,
  createWorkout    as fsCreateWorkout,
  updateWorkout    as fsUpdateWorkout,
  deleteWorkout    as fsDeleteWorkout,
} from '../services/workoutFirestore';
import { enqueueWorkout } from '../services/offlineQueue';

const ACTIVE_WORKOUT_KEY = 'gaintrack_active_workout';

interface WorkoutState {
  workouts: Workout[];
  currentWorkout: Workout | null;
  exercises: Exercise[];
  isLoading: boolean;

  setWorkouts: (workouts: Workout[]) => void;
  setCurrentWorkout: (workout: Workout | null) => void;
  setExercises: (exercises: Exercise[]) => void;
  setLoading: (loading: boolean) => void;

  // ── Local workout initialization ──────────────────────────────────────────
  startWorkout: (name: string) => void;

  // ── In-progress persistence ─────────────────────────────────────────────
  persistInProgress: (workout: Workout, exerciseList: WorkoutExercise[], startedAt: number) => Promise<void>;
  restoreInProgress: () => Promise<{ exerciseList: WorkoutExercise[]; startedAt: number } | null>;
  clearInProgress: () => Promise<void>;

  // ── In-workout local mutations (unchanged) ───────────────────────────────
  addExerciseToWorkout: (exercise: WorkoutExercise) => void;
  updateExerciseInWorkout: (exerciseId: string, sets: WorkoutSet[]) => void;
  removeExerciseFromWorkout: (exerciseId: string) => void;

  // ── Firestore CRUD [PRO] ─────────────────────────────────────────────────
  /**
   * Fetches the user's workouts from Firestore and stores them in the slice.
   * Shows isLoading=true while the request is in flight.
   */
  loadUserWorkouts: (uid: string, limit?: number) => Promise<void>;

  /**
   * Persists a new workout to Firestore and prepends it to the local list.
   * Returns the saved Workout (with Firestore-assigned workout_id).
   *
   * TODO: pass optional `templateId` field once template workouts are added.
   */
  createWorkout: (
    uid: string,
    data: Omit<Workout, 'workout_id' | 'created_at'>,
  ) => Promise<Workout>;

  /**
   * Partially updates a workout in Firestore and syncs the local list.
   *
   * TODO: add optimistic update + rollback on failure for a snappier UI.
   */
  updateWorkout: (
    uid: string,
    workoutId: string,
    updates: Partial<Omit<Workout, 'workout_id' | 'created_at'>>,
  ) => Promise<void>;

  /**
   * Deletes a workout from Firestore and removes it from the local list.
   *
   * TODO: replace with soft-delete (archived flag) for undo support.
   */
  deleteWorkout: (uid: string, workoutId: string) => Promise<void>;
}

export const useWorkoutStore = create<WorkoutState>((set, get) => ({
  workouts: [],
  currentWorkout: null,
  exercises: [],
  isLoading: false,

  setWorkouts:        (workouts)       => set({ workouts }),
  setCurrentWorkout:  (currentWorkout) => set({ currentWorkout }),
  setExercises:       (exercises)      => set({ exercises }),
  setLoading:         (isLoading)      => set({ isLoading }),

  // ── In-progress persistence ─────────────────────────────────────────────

  persistInProgress: async (workout, exerciseList, startedAt) => {
    try {
      await AsyncStorage.setItem(
        ACTIVE_WORKOUT_KEY,
        JSON.stringify({ workout, exerciseList, startedAt }),
      );
    } catch (err) {
      console.warn('[workoutStore] persistInProgress failed:', err);
    }
  },

  restoreInProgress: async () => {
    try {
      const raw = await AsyncStorage.getItem(ACTIVE_WORKOUT_KEY);
      if (!raw) return null;
      const { workout, exerciseList, startedAt } = JSON.parse(raw) as {
        workout: Workout;
        exerciseList: WorkoutExercise[];
        startedAt: number;
      };
      set({ currentWorkout: workout });
      return { exerciseList, startedAt: startedAt ?? Date.now() };
    } catch (err) {
      console.warn('[workoutStore] restoreInProgress failed:', err);
      return null;
    }
  },

  clearInProgress: async () => {
    try {
      await AsyncStorage.removeItem(ACTIVE_WORKOUT_KEY);
    } catch (err) {
      console.warn('[workoutStore] clearInProgress failed:', err);
    }
  },

  // ── In-workout local mutations ─────────────────────────────────────────

  startWorkout: (name) => set({
    currentWorkout: {
      workout_id: Date.now().toString(),
      name,
      date: new Date().toISOString(),
      created_at: new Date().toISOString(),
      exercises: [],
    },
  }),

  addExerciseToWorkout: (exercise) => {
    const current = get().currentWorkout;
    if (current) {
      set({
        currentWorkout: {
          ...current,
          exercises: [...current.exercises, exercise],
        },
      });
    }
  },

  updateExerciseInWorkout: (exerciseId, sets) => {
    const current = get().currentWorkout;
    if (current) {
      set({
        currentWorkout: {
          ...current,
          exercises: current.exercises.map((ex) =>
            ex.exercise_id === exerciseId ? { ...ex, sets } : ex
          ),
        },
      });
    }
  },

  removeExerciseFromWorkout: (exerciseId) => {
    const current = get().currentWorkout;
    if (current) {
      set({
        currentWorkout: {
          ...current,
          exercises: current.exercises.filter((ex) => ex.exercise_id !== exerciseId),
        },
      });
    }
  },

  // ── Firestore CRUD ─────────────────────────────────────────────────────

  loadUserWorkouts: async (uid, limit = 30) => {
    set({ isLoading: true });
    try {
      const workouts = await fsLoadUserWorkouts(uid, limit);
      set({ workouts, isLoading: false });
      await AsyncStorage.setItem('gaintrack_workouts', JSON.stringify(workouts));
    } catch (err) {
      console.error('[workoutStore] loadUserWorkouts failed:', err);
      set({ isLoading: false });
    }
  },

  createWorkout: async (uid, data) => {
    try {
      const saved = await fsCreateWorkout(uid, data);
      set((state) => {
        const updated = [saved, ...state.workouts];
        AsyncStorage.setItem('gaintrack_workouts', JSON.stringify(updated)).catch(() => null);
        return { workouts: updated };
      });
      return saved;
    } catch (err) {
      // Network/Firestore unavailable — save locally with a temp ID and queue
      // for background sync when connectivity is restored.
      console.warn('[workoutStore] Firestore unavailable, queuing workout offline:', err);
      await enqueueWorkout(uid, data);
      const local: Workout = {
        ...data,
        workout_id: `offline_${Date.now()}`,
        created_at: new Date().toISOString(),
      };
      set((state) => {
        const updated = [local, ...state.workouts];
        AsyncStorage.setItem('gaintrack_workouts', JSON.stringify(updated)).catch(() => null);
        return { workouts: updated };
      });
      return local;
    }
  },

  updateWorkout: async (uid, workoutId, updates) => {
    await fsUpdateWorkout(uid, workoutId, updates);
    set((state) => {
      const updated = state.workouts.map((w) =>
        w.workout_id === workoutId ? { ...w, ...updates } : w
      );
      AsyncStorage.setItem('gaintrack_workouts', JSON.stringify(updated)).catch(() => null);
      return { workouts: updated };
    });
  },

  deleteWorkout: async (uid, workoutId) => {
    await fsDeleteWorkout(uid, workoutId);
    set((state) => {
      const updated = state.workouts.filter((w) => w.workout_id !== workoutId);
      AsyncStorage.setItem('gaintrack_workouts', JSON.stringify(updated)).catch(() => null);
      return { workouts: updated };
    });
  },
}));
