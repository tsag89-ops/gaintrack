import { create } from 'zustand';
import { format } from 'date-fns';
import { WorkoutProgram } from '../types';
import { getPrograms, saveProgram, deleteProgram } from '../services/storage';

interface ProgramState {
  programs: WorkoutProgram[];
  isLoading: boolean;
  hasLoaded: boolean;

  loadPrograms: (force?: boolean) => Promise<void>;
  saveOne: (program: WorkoutProgram) => Promise<void>;
  removeOne: (id: string) => Promise<void>;
  advanceProgramDay: (id: string) => Promise<void>;
}

export const useProgramStore = create<ProgramState>((set, get) => ({
  programs: [],
  isLoading: true,
  hasLoaded: false,

  loadPrograms: async (force = false) => {
    if (!force && get().hasLoaded) {
      return;
    }

    set({ isLoading: true });
    try {
      const stored = await getPrograms();
      set({ programs: stored, hasLoaded: true });
    } catch (err) {
      console.warn('[programStore] loadPrograms error:', err);
    } finally {
      set({ isLoading: false });
    }
  },

  saveOne: async (program) => {
    await saveProgram(program);
    set((state) => {
      const idx = state.programs.findIndex((p) => p.id === program.id);
      return {
        programs:
          idx >= 0
            ? state.programs.map((p) => (p.id === program.id ? program : p))
            : [...state.programs, program],
      };
    });
  },

  removeOne: async (id) => {
    await deleteProgram(id);
    set((state) => ({
      programs: state.programs.filter((p) => p.id !== id),
    }));
  },

  advanceProgramDay: async (id) => {
    const all = await getPrograms();
    const program = all.find((p) => p.id === id);
    if (!program) {
      return;
    }

    const nextDayIndex = program.currentDayIndex + 1;
    const cycleComplete = nextDayIndex >= program.daysPerWeek;
    const updated: WorkoutProgram = {
      ...program,
      currentDayIndex: cycleComplete ? 0 : nextDayIndex,
      currentCycle: cycleComplete ? program.currentCycle + 1 : program.currentCycle,
      lastSessionDate: format(new Date(), 'yyyy-MM-dd'),
    };

    await saveProgram(updated);
    set((state) => ({
      programs: state.programs.map((p) => (p.id === id ? updated : p)),
    }));
  },
}));
