// src/hooks/usePrograms.ts
// GainTrack — CRUD hook for WorkoutPrograms (shared Zustand state)

import { useCallback, useEffect } from 'react';
import { useProgramStore } from '../store/programStore';

export const usePrograms = () => {
  const programs = useProgramStore((state) => state.programs);
  const isLoading = useProgramStore((state) => state.isLoading);
  const hasLoaded = useProgramStore((state) => state.hasLoaded);
  const loadPrograms = useProgramStore((state) => state.loadPrograms);
  const saveOne = useProgramStore((state) => state.saveOne);
  const removeOne = useProgramStore((state) => state.removeOne);
  const advanceProgramDay = useProgramStore((state) => state.advanceProgramDay);

  useEffect(() => {
    if (!hasLoaded) {
      loadPrograms();
    }
  }, [hasLoaded, loadPrograms]);

  const reload = useCallback(() => {
    loadPrograms(true);
  }, [loadPrograms]);

  return {
    programs,
    isLoading,
    reload,
    saveOne,
    removeOne,
    advanceProgramDay,
  };
};
