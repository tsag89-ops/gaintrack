// User types
export interface User {
  user_id: string;
  email: string;
  name: string;
  picture?: string;
  created_at: string;
  goals?: UserGoals;
  equipment?: string[];
}

export interface UserGoals {
  daily_calories: number;
  protein_grams: number;
  carbs_grams: number;
  fat_grams: number;
  workouts_per_week: number;
}

// Exercise types
export interface Exercise {
  exercise_id: string;
  name: string;
  category: string;
  equipment_required: string[];
  muscle_groups: string[];
  is_compound: boolean;
}

// Workout types
export interface WorkoutSet {
  set_number: number;
  weight: number;
  reps: number;
  rpe?: number;
  is_warmup: boolean;
}

export interface WorkoutExercise {
  exercise_id: string;
  exercise_name: string;
  sets: WorkoutSet[];
  notes?: string;
}

export interface Workout {
  workout_id: string;
  user_id: string;
  date: string;
  name: string;
  exercises: WorkoutExercise[];
  duration_minutes?: number;
  notes?: string;
  created_at: string;
}

// Food types
export interface Food {
  food_id: string;
  name: string;
  category: string;
  serving_size: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
}

export interface MealEntry {
  food_id: string;
  food_name: string;
  servings: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface DailyNutrition {
  nutrition_id?: string;
  user_id: string;
  date: string;
  meals: {
    breakfast: MealEntry[];
    lunch: MealEntry[];
    dinner: MealEntry[];
    snacks: MealEntry[];
  };
  total_calories: number;
  total_protein: number;
  total_carbs: number;
  total_fat: number;
}

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snacks';
