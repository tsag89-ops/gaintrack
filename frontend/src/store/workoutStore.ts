import { create } from 'zustand';
import { Workout, WorkoutExercise, WorkoutSet, Exercise } from '../types';

interface WorkoutState {
  workouts: Workout[];
  currentWorkout: Workout | null;
  exercises: Exercise[];
  isLoading: boolean;
  
  setWorkouts: (workouts: Workout[]) => void;
  setCurrentWorkout: (workout: Workout | null) => void;
  setExercises: (exercises: Exercise[]) => void;
  setLoading: (loading: boolean) => void;
  
  addExerciseToWorkout: (exercise: WorkoutExercise) => void;
  updateExerciseInWorkout: (exerciseId: string, sets: WorkoutSet[]) => void;
  removeExerciseFromWorkout: (exerciseId: string) => void;
}

export const useWorkoutStore = create<WorkoutState>((set, get) => ({
  workouts: [],
  currentWorkout: null,
  exercises: [],
  isLoading: false,

  setWorkouts: (workouts) => set({ workouts }),
  setCurrentWorkout: (currentWorkout) => set({ currentWorkout }),
  setExercises: (exercises) => set({ exercises }),
  setLoading: (isLoading) => set({ isLoading }),

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
}));
