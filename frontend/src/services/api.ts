import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User, Workout, Exercise, Food, DailyNutrition, UserGoals, MealEntry } from '../types';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('sessionToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auth APIs
export const authApi = {
  exchangeSession: async (sessionId: string): Promise<{ user: User; session_token: string }> => {
    const response = await api.post('/auth/session', { session_id: sessionId });
    return response.data;
  },

  getMe: async (): Promise<User> => {
    const response = await api.get('/auth/me');
    return response.data;
  },

  logout: async (): Promise<void> => {
    await api.post('/auth/logout');
  },
};

// User APIs
export const userApi = {
  updateGoals: async (goals: UserGoals): Promise<{ goals: UserGoals }> => {
    const response = await api.put('/user/goals', goals);
    return response.data;
  },

  updateEquipment: async (equipment: string[]): Promise<{ equipment: string[] }> => {
    const response = await api.put('/user/equipment', { equipment });
    return response.data;
  },
};

// Exercise APIs
export const exerciseApi = {
  getAll: async (category?: string): Promise<Exercise[]> => {
    const params = category ? { category } : {};
    const response = await api.get('/exercises', { params });
    return response.data;
  },

  getForUser: async (category?: string): Promise<Exercise[]> => {
    const params = category ? { category } : {};
    const response = await api.get('/exercises/for-user', { params });
    return response.data;
  },
};

// Workout APIs
export const workoutApi = {
  getAll: async (limit = 20, skip = 0): Promise<Workout[]> => {
    const response = await api.get('/workouts', { params: { limit, skip } });
    return response.data;
  },

  get: async (workoutId: string): Promise<Workout> => {
    const response = await api.get(`/workouts/${workoutId}`);
    return response.data;
  },

  create: async (workout: Partial<Workout>): Promise<Workout> => {
    const response = await api.post('/workouts', workout);
    return response.data;
  },

  update: async (workoutId: string, workout: Partial<Workout>): Promise<Workout> => {
    const response = await api.put(`/workouts/${workoutId}`, workout);
    return response.data;
  },

  delete: async (workoutId: string): Promise<void> => {
    await api.delete(`/workouts/${workoutId}`);
  },

  getWarmupSets: async (workingWeight: number, exerciseName: string) => {
    const response = await api.post('/workouts/warmup-sets', {
      working_weight: workingWeight,
      exercise_name: exerciseName,
    });
    return response.data;
  },
};

// Food APIs
export const foodApi = {
  getAll: async (category?: string, search?: string): Promise<Food[]> => {
    const params: any = {};
    if (category) params.category = category;
    if (search) params.search = search;
    const response = await api.get('/foods', { params });
    return response.data;
  },
};

// Nutrition APIs
export const nutritionApi = {
  getDaily: async (date: string): Promise<DailyNutrition> => {
    const response = await api.get(`/nutrition/${date}`);
    return response.data;
  },

  addMealEntry: async (
    date: string,
    mealType: string,
    entry: Omit<MealEntry, 'food_id'> & { food_id: string }
  ): Promise<DailyNutrition> => {
    const response = await api.post(`/nutrition/${date}/meal`, {
      meal_type: mealType,
      ...entry,
    });
    return response.data;
  },

  removeMealEntry: async (
    date: string,
    mealType: string,
    index: number
  ): Promise<DailyNutrition> => {
    const response = await api.delete(`/nutrition/${date}/meal/${mealType}/${index}`);
    return response.data;
  },
};

// Stats APIs
export const statsApi = {
  getWorkoutVolume: async (days = 30) => {
    const response = await api.get('/stats/workout-volume', { params: { days } });
    return response.data;
  },

  getNutritionAdherence: async (days = 7) => {
    const response = await api.get('/stats/nutrition-adherence', { params: { days } });
    return response.data;
  },

  getCalendarData: async (year: number, month: number) => {
    const response = await api.get(`/calendar/${year}/${month}`);
    return response.data;
  },
};

// Progression AI APIs
export const progressionApi = {
  getSuggestions: async () => {
    const response = await api.get('/progression/suggestions');
    return response.data;
  },

  getExerciseProgression: async (exerciseName: string) => {
    const response = await api.get(`/progression/exercise/${encodeURIComponent(exerciseName)}`);
    return response.data;
  },
};

// Body Measurements APIs
export const measurementsApi = {
  getAll: async (limit = 30) => {
    const response = await api.get('/measurements', { params: { limit } });
    return response.data;
  },

  get: async (date: string) => {
    const response = await api.get(`/measurements/${date}`);
    return response.data;
  },

  create: async (measurement: any) => {
    const response = await api.post('/measurements', measurement);
    return response.data;
  },

  delete: async (date: string) => {
    const response = await api.delete(`/measurements/${date}`);
    return response.data;
  },

  getProgress: async (days = 90) => {
    const response = await api.get('/measurements/stats/progress', { params: { days } });
    return response.data;
  },
};

export default api;
