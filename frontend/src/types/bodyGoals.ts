// src/types/bodyGoals.ts
// Body composition goal data structure

export interface BodyCompositionGoals {
  targetWeight: number;
  targetBodyFatPercent: number;
  currentBodyFatPercent?: number;
  weeklyWeightChangeGoal: number;   // kg or lbs per week, negative = loss
  targetDate?: string;              // ISO "YYYY-MM-DD", optional
  updatedAt: string;
}
