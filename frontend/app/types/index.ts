export interface Food {
  id: string;
  name: string;
  protein: number;
  carbs: number;
  fats: number;
  calories: number;
  unit: string;
}

export interface Exercise {
  id: string;
  name: string;
  muscleGroup: string;
  videoUrl: string;
  instructions: string;
}
