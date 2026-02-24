// Local AsyncStorage-based API - replaces dead Emergent backend
// All data is stored locally on device. No external server required.

import AsyncStorage from '@react-native-async-storage/async-storage';

// Storage keys
const WORKOUTS_KEY = 'gaintrack_workouts';
const EXERCISES_KEY = 'gaintrack_exercises';
const FOODS_KEY = 'gaintrack_foods';
const NUTRITION_KEY = 'gaintrack_nutrition';
const MEASUREMENTS_KEY = 'gaintrack_measurements';

// Helper functions
const getStoredData = async <T,>(key: string): Promise<T[]> => {
  try {
    const data = await AsyncStorage.getItem(key);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error(`Error reading ${key}:`, error);
    return [];
  }
};

const storeData = async <T,>(key: string, data: T[]): Promise<void> => {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(data));
  } catch (error) {
    console.error(`Error storing ${key}:`, error);
  }
};

// Default exercise database (same as backend)
const DEFAULT_EXERCISES = [
  { exercise_id: 'ex_1', name: 'Bench Press', category: 'chest', equipment_required: ['barbell', 'bench'], muscle_groups: ['chest', 'triceps', 'shoulders'], is_compound: true },
  { exercise_id: 'ex_2', name: 'Squats', category: 'legs', equipment_required: ['barbell'], muscle_groups: ['quads', 'glutes', 'hamstrings'], is_compound: true },
  { exercise_id: 'ex_3', name: 'Deadlift', category: 'back', equipment_required: ['barbell'], muscle_groups: ['back', 'hamstrings', 'glutes'], is_compound: true },
  { exercise_id: 'ex_4', name: 'Pull-ups', category: 'back', equipment_required: ['pullup_bar'], muscle_groups: ['lats', 'biceps', 'back'], is_compound: true },
  { exercise_id: 'ex_5', name: 'Overhead Press', category: 'shoulders', equipment_required: ['barbell'], muscle_groups: ['shoulders', 'triceps'], is_compound: true },
  { exercise_id: 'ex_6', name: 'Barbell Rows', category: 'back', equipment_required: ['barbell'], muscle_groups: ['back', 'lats', 'biceps'], is_compound: true },
  { exercise_id: 'ex_7', name: 'Dumbbell Bench Press', category: 'chest', equipment_required: ['dumbbells', 'bench'], muscle_groups: ['chest', 'triceps', 'shoulders'], is_compound: true },
  { exercise_id: 'ex_8', name: 'Dumbbell Rows', category: 'back', equipment_required: ['dumbbells'], muscle_groups: ['back', 'lats', 'biceps'], is_compound: true },
  { exercise_id: 'ex_9', name: 'Dumbbell Shoulder Press', category: 'shoulders', equipment_required: ['dumbbells'], muscle_groups: ['shoulders', 'triceps'], is_compound: true },
  { exercise_id: 'ex_10', name: 'Goblet Squats', category: 'legs', equipment_required: ['dumbbells'], muscle_groups: ['quads', 'glutes'], is_compound: true },
  { exercise_id: 'ex_11', name: 'Romanian Deadlift', category: 'legs', equipment_required: ['barbell'], muscle_groups: ['hamstrings', 'glutes'], is_compound: true },
  { exercise_id: 'ex_12', name: 'Dumbbell Lunges', category: 'legs', equipment_required: ['dumbbells'], muscle_groups: ['quads', 'glutes'], is_compound: true },
  { exercise_id: 'ex_13', name: 'Lateral Raises', category: 'shoulders', equipment_required: ['dumbbells'], muscle_groups: ['side_delts'], is_compound: false },
  { exercise_id: 'ex_14', name: 'Barbell Curls', category: 'arms', equipment_required: ['barbell'], muscle_groups: ['biceps'], is_compound: false },
  { exercise_id: 'ex_15', name: 'Dumbbell Curls', category: 'arms', equipment_required: ['dumbbells'], muscle_groups: ['biceps'], is_compound: false },
  { exercise_id: 'ex_16', name: 'Tricep Dips', category: 'arms', equipment_required: [], muscle_groups: ['triceps'], is_compound: true },
  { exercise_id: 'ex_17', name: 'Push-ups', category: 'chest', equipment_required: [], muscle_groups: ['chest', 'triceps', 'shoulders'], is_compound: true },
  { exercise_id: 'ex_18', name: 'Planks', category: 'core', equipment_required: [], muscle_groups: ['abs', 'core'], is_compound: false },
  { exercise_id: 'ex_19', name: 'Crunches', category: 'core', equipment_required: [], muscle_groups: ['abs'], is_compound: false },
  { exercise_id: 'ex_20', name: 'Leg Raises', category: 'core', equipment_required: ['pullup_bar'], muscle_groups: ['lower_abs'], is_compound: false },
];

// Initialize default exercises
const initializeExercises = async () => {
  const exercises = await getStoredData(EXERCISES_KEY);
  if (exercises.length === 0) {
    await storeData(EXERCISES_KEY, DEFAULT_EXERCISES);
  }
};

initializeExercises();

// Auth API (now uses local storage from authStore)
export const authApi = {
  exchangeSession: async (sessionId: string) => {
    // No-op: auth now handled locally in login.tsx
    throw new Error('Auth is now handled locally. Use login screen.');
  },
};

// Exercise API
export const exerciseApi = {
  getExercises: async (category?: string, equipment?: string) => {
    let exercises = await getStoredData<any>(EXERCISES_KEY);
    if (category) {
      exercises = exercises.filter((ex: any) => ex.category === category);
    }
    if (equipment) {
      const equipmentList = equipment.split(',');
      exercises = exercises.filter((ex: any) =>
        !ex.equipment_required.length || ex.equipment_required.some((eq: string) => equipmentList.includes(eq))
      );
    }
    return exercises;
  },
};

// Workout API
export const workoutApi = {
  getWorkouts: async (limit = 20) => {
    const workouts = await getStoredData<any>(WORKOUTS_KEY);
    return workouts.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, limit);
  },

  createWorkout: async (workout: any) => {
    const workouts = await getStoredData<any>(WORKOUTS_KEY);
    const newWorkout = {
      ...workout,
      workout_id: 'wk_' + Date.now(),
      created_at: new Date().toISOString(),
      date: workout.date || new Date().toISOString(),
    };
    workouts.push(newWorkout);
    await storeData(WORKOUTS_KEY, workouts);
    return newWorkout;
  },

  updateWorkout: async (workoutId: string, updates: any) => {
    const workouts = await getStoredData<any>(WORKOUTS_KEY);
    const index = workouts.findIndex((w: any) => w.workout_id === workoutId);
    if (index >= 0) {
      workouts[index] = { ...workouts[index], ...updates };
      await storeData(WORKOUTS_KEY, workouts);
      return workouts[index];
    }
    throw new Error('Workout not found');
  },

  deleteWorkout: async (workoutId: string) => {
    const workouts = await getStoredData<any>(WORKOUTS_KEY);
    const filtered = workouts.filter((w: any) => w.workout_id !== workoutId);
    await storeData(WORKOUTS_KEY, filtered);
    return { message: 'Workout deleted' };
  },
};

// Food/Nutrition API
export const nutritionApi = {
  getFoods: async (category?: string, search?: string) => {
    let foods = await getStoredData<any>(FOODS_KEY);
    if (category) {
      foods = foods.filter((f: any) => f.category === category);
    }
    if (search) {
      foods = foods.filter((f: any) => f.name.toLowerCase().includes(search.toLowerCase()));
    }
    return foods;
  },

  getDailyNutrition: async (date: string) => {
    const nutrition = await getStoredData<any>(NUTRITION_KEY);
    const found = nutrition.find((n: any) => n.date === date);
    return found || {
      date,
      meals: { breakfast: [], lunch: [], dinner: [], snacks: [] },
      total_calories: 0,
      total_protein: 0,
      total_carbs: 0,
      total_fat: 0,
    };
  },
};

// Measurements API
export const measurementApi = {
  getMeasurements: async (limit = 30) => {
    const measurements = await getStoredData<any>(MEASUREMENTS_KEY);
    return measurements.sort((a: any, b: any) => b.date.localeCompare(a.date)).slice(0, limit);
  },

  createMeasurement: async (measurement: any) => {
    const measurements = await getStoredData<any>(MEASUREMENTS_KEY);
    const existing = measurements.findIndex((m: any) => m.date === measurement.date);
    if (existing >= 0) {
      measurements[existing] = { ...measurements[existing], ...measurement };
    } else {
      measurements.push({
        ...measurement,
        measurement_id: 'bm_' + Date.now(),
        created_at: new Date().toISOString(),
      });
    }
    await storeData(MEASUREMENTS_KEY, measurements);
    return measurements[existing >= 0 ? existing : measurements.length - 1];
  },
};

// User API
export const userApi = {
  updateGoals: async (goals: any) => {
    const userStr = await AsyncStorage.getItem('user');
    if (userStr) {
      const user = JSON.parse(userStr);
      user.goals = goals;
      await AsyncStorage.setItem('user', JSON.stringify(user));
      return { message: 'Goals updated', goals };
    }
    throw new Error('User not found');
  },

  updateEquipment: async (equipment: string[]) => {
    const userStr = await AsyncStorage.getItem('user');
    if (userStr) {
      const user = JSON.parse(userStr);
      user.equipment = equipment;
      await AsyncStorage.setItem('user', JSON.stringify(user));
      return { message: 'Equipment updated', equipment };
    }
    throw new Error('User not found');
  },
};
