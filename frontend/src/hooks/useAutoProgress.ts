// src/hooks/useAutoProgress.ts
// GainTrack — Calculates auto-progressed weights/reps for the next program session.
//
// Base rule: for every completed cycle/session/week, apply progressionRule.increment
// once. Reps cap at 12 → convert remaining increments to weight progression.

import { useCallback } from 'react';
import { WorkoutProgram, ProgramDay, ProgramExercise, ProgressionRule } from '../types';

/** Apply ProgressionRule to base reps/weight for N completed periods. */
const applyProgression = (
  baseWeight: number,
  baseReps: number,
  rule: ProgressionRule,
  cyclesCompleted: number,
): { weight: number; reps: number } => {
  if (cyclesCompleted <= 0) return { weight: baseWeight, reps: baseReps };

  if (rule.type === 'weight') {
    return {
      weight: Math.round((baseWeight + rule.increment * cyclesCompleted) * 100) / 100,
      reps: baseReps,
    };
  }

  if (rule.type === 'reps') {
    const rawReps = baseReps + rule.increment * cyclesCompleted;
    if (rawReps <= 12) {
      return { weight: baseWeight, reps: Math.min(12, Math.round(rawReps)) };
    }
    // Reps exceeded cap — convert overflow into weight increments (1 rep overflow → 2.5 kg)
    const overflowReps = rawReps - 12;
    return {
      weight: Math.round((baseWeight + overflowReps * 2.5) * 100) / 100,
      reps: 12,
    };
  }

  // 'custom' — treat same as weight
  return {
    weight: Math.round((baseWeight + rule.increment * cyclesCompleted) * 100) / 100,
    reps: baseReps,
  };
};

export const useAutoProgress = () => {
  /**
   * Returns a copy of the ProgramDay at dayIndex with weights/reps
   * already incremented according to each exercise's ProgressionRule
   * and the program's currentCycle (1-indexed).
   *
   * Cycle 1 = no progression (base values).
   * Cycle 2+ = base + (increment × (currentCycle - 1)).
   */
  const calculateNextSession = useCallback(
    (program: WorkoutProgram, dayIndex: number): ProgramDay => {
      const day = program.days[dayIndex];
      if (!day) {
        return { id: 'empty', label: 'Rest', exercises: [] };
      }

      const cyclesCompleted = program.currentCycle - 1; // 0 on first cycle

      const progressedExercises: ProgramExercise[] = day.exercises.map((ex) => {
        const { weight, reps } = applyProgression(
          ex.weight,
          ex.reps,
          ex.progression,
          cyclesCompleted,
        );
        return { ...ex, weight, reps };
      });

      return { ...day, exercises: progressedExercises };
    },
    [],
  );

  return { calculateNextSession };
};
