// src/hooks/usePrograms.ts
// GainTrack — CRUD hook for WorkoutPrograms (AsyncStorage + Firestore [PRO])

import { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { WorkoutProgram } from '../types';
import {
  getPrograms,
  saveProgram,
  deleteProgram,
} from '../services/storage';

export const usePrograms = () => {
  const [programs, setPrograms] = useState<WorkoutProgram[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const stored = await getPrograms();
      setPrograms(stored);
    } catch (err) {
      console.warn('[usePrograms] load error:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /** Upsert a program (create or update). */
  const saveOne = useCallback(async (program: WorkoutProgram): Promise<void> => {
    await saveProgram(program);
    setPrograms((prev) => {
      const idx = prev.findIndex((p) => p.id === program.id);
      return idx >= 0
        ? prev.map((p) => (p.id === program.id ? program : p))
        : [...prev, program];
    });
  }, []);

  /** Remove a program by id. */
  const removeOne = useCallback(async (id: string): Promise<void> => {
    await deleteProgram(id);
    setPrograms((prev) => prev.filter((p) => p.id !== id));
  }, []);

  /**
   * Advance to the next day in a program.
   * Wraps currentDayIndex back to 0 and increments currentCycle on full-cycle completion.
   * Also stamps lastSessionDate with today's local date.
   */
  const advanceProgramDay = useCallback(async (id: string): Promise<void> => {
    const all = await getPrograms();
    const program = all.find((p) => p.id === id);
    if (!program) return;

    const nextDayIndex = program.currentDayIndex + 1;
    const cycleComplete = nextDayIndex >= program.daysPerWeek;
    const updated: WorkoutProgram = {
      ...program,
      currentDayIndex: cycleComplete ? 0 : nextDayIndex,
      currentCycle: cycleComplete ? program.currentCycle + 1 : program.currentCycle,
      lastSessionDate: format(new Date(), 'yyyy-MM-dd'),
    };
    await saveProgram(updated);
    setPrograms((prev) => prev.map((p) => (p.id === id ? updated : p)));
  }, []);

  return { programs, isLoading, reload: load, saveOne, removeOne, advanceProgramDay };
};
