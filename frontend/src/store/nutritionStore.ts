import { create } from 'zustand';
import { DailyNutrition, Food, MealEntry, MealType } from '../types';

interface NutritionState {
  todayNutrition: DailyNutrition | null;
  foods: Food[];
  isLoading: boolean;
  selectedDate: string;
  
  setTodayNutrition: (nutrition: DailyNutrition | null) => void;
  setFoods: (foods: Food[]) => void;
  setLoading: (loading: boolean) => void;
  setSelectedDate: (date: string) => void;
}

export const useNutritionStore = create<NutritionState>((set) => ({
  todayNutrition: null,
  foods: [],
  isLoading: false,
  selectedDate: new Date().toISOString().split('T')[0],

  setTodayNutrition: (nutrition) => set({ todayNutrition: nutrition }),
  setFoods: (foods) => set({ foods }),
  setLoading: (isLoading) => set({ isLoading }),
  setSelectedDate: (date) => set({ selectedDate: date }),
}));
