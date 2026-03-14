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
  videoUrl: string;
  instructions?: string;
}

export interface WorkoutSet {
  set_id: string;
  set_number: number;
  reps: number;
  weight: number;
  rpe?: number;
  completed: boolean;
  is_warmup: boolean;
}

export interface WorkoutExercise {
  exercise_id: string;
  exercise_name: string;
  exercise: Exercise;
  sets: WorkoutSet[];
  notes?: string;
  restSeconds?: number;
  superset_group?: string; // [PRO] shared UUID ties exercises into a superset pair
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

// ─── Programs ─────────────────────────────────────────────────────────────────

export interface ProgressionRule {
  type: 'weight' | 'reps' | 'custom';
  increment: number;      // e.g. 2.5 (kg) or 1 (rep)
  every: 'session' | 'week' | 'cycle';
}

export interface ProgramExercise {
  exerciseName: string;
  sets: number;
  reps: number;
  weight: number;         // base weight
  progression: ProgressionRule;
  setDetails?: Array<{ reps: number; weight: number }>; // per-set individual values
}

export interface ProgramDaySession {
  date: string;
  exercises: Array<{
    exerciseName: string;
    sets: Array<{ weight: number; reps: number; completed: boolean }>;
  }>;
}

export interface ProgramDay {
  id: string;
  label: string;          // e.g. "Day A — Push"
  exercises: ProgramExercise[];
  completedSessions?: ProgramDaySession[];
}

export interface WorkoutProgram {
  id: string;
  name: string;
  daysPerWeek: number;
  days: ProgramDay[];
  currentCycle: number;
  currentDayIndex: number;
  createdAt: string;      // format(date, 'yyyy-MM-dd')
  lastSessionDate?: string; // format(date, 'yyyy-MM-dd')
}

// ─── Physique Progress Photos ─────────────────────────────────────────────────

export interface PhysiqueWorkoutSummary {
  name: string;
  exerciseCount: number;
  totalSets: number;
  totalVolume: number; // kg
}

export interface PhysiquePhoto {
  id: string;               // uuid
  date: string;             // 'yyyy-MM-dd'
  uri: string;              // permanent local file URI (documentDirectory)
  capturedAt: string;       // ISO timestamp
  notes?: string;
  workoutSummary?: PhysiqueWorkoutSummary | null;
}
