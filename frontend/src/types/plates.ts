// src/types/plates.ts
// Shared types for the Plate Calculator feature.
// Used by plateCalculator.ts, usePlateCalculator.ts, PlateBarVisual.tsx, and plates.tsx.

/** Weight unit — 'kg' for metric, 'lb' for imperial */
export type Unit = 'kg' | 'lb';

/**
 * A plate denomination and how many single plates the user owns in total.
 * e.g. { weight: 20, count: 8 } means the user has 8 × 20 kg plates total.
 */
export type Plate = { weight: number; count: number };

/**
 * How many of a given plate weight get placed on ONE side of the bar.
 * Both sides always carry identical plates (symmetric barbells only).
 */
export type PlateSideConfig = { weight: number; countPerSide: number };

/**
 * Result produced by the greedy plate-calculator algorithm.
 */
export type PlateCalcResult = {
  /** true when achievedTotal exactly matches the original targetWeight */
  success: boolean;
  /** Plates to load on each side of the bar, sorted largest-first */
  platesPerSide: PlateSideConfig[];
  /** Actual loaded total: barWeight + 2 × Σ(weight × countPerSide) */
  achievedTotal: number;
  /** How far off we are: positive = under target, negative = over target */
  missing?: number;
};
