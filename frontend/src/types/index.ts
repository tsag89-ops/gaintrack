// User
export interface User {
  id: string;
  user_id: string;
  email: string;
  name: string;
  picture: string | null;
  created_at: string;
  goals?: {
    daily_calories: number;
    protein_grams: number;
    carbs_grams: number;
    fat_grams: number;
    workouts_per_week: number;
  };
  equipment?: string[];
}

// Food & Nutrition
export interface Food {
  id: string;
  food_id: string;
  name: string;
  protein: number;
  carbs: number;
  fats: number;
  fat: number;
  calories: number;
  unit: string;
  serving_size?: number;
  category?: string;
}

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snacks';

export interface MealEntry {
  id: string;
  food_id: string;
  food: Food;
  meal_type: MealType;
  quantity: number;
  date: string;
}

export interface DailyNutrition {
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

// Exercise & Workout
export interface Exercise {
  id: string;
  exercise_id: string;
  name: string;
  muscleGroup: string;
  muscle_groups: string[];
  category: string;
  equipment_required: string[];
  is_compound: boolean;
  videoUrl?: string;
  instructions?: string;
}

export interface WorkoutSet {
  set_id: string;
  reps: number;
  weight: number;
  completed: boolean;
}

export interface WorkoutExercise {
  exercise_id: string;
  exercise: Exercise;
  sets: WorkoutSet[];
  notes?: string;
}

export interface Workout {
  workout_id: string;
  name: string;
  date: string;
  duration?: number;
  notes?: string;
  exercises: WorkoutExercise[];
  created_at: string;
}
