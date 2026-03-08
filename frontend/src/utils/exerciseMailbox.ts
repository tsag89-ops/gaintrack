// exerciseMailbox.ts
// Module-level mailbox used to pass a selected exercise from the Exercises tab
// back to the active workout screen without complex navigation params.

import { Exercise } from '../types';

let _pending: Exercise | null = null;

/** Stores an exercise to be picked up by the active workout screen. */
export const setPendingExercise = (ex: Exercise): void => {
  _pending = ex;
};

/** Returns (and clears) the pending exercise. Returns null if none. */
export const takePendingExercise = (): Exercise | null => {
  const ex = _pending;
  _pending = null;
  return ex;
};
