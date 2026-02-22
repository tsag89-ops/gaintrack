import { format, parseISO, isToday, isYesterday } from 'date-fns';
import { WorkoutExercise } from '../types';

export const formatDate = (dateString: string): string => {
  const date = parseISO(dateString);
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  return format(date, 'MMM d, yyyy');
};

export const formatShortDate = (dateString: string): string => {
  return format(parseISO(dateString), 'MMM d');
};

export const getTodayString = (): string => {
  return format(new Date(), 'yyyy-MM-dd');
};

export const calculateWorkoutVolume = (exercises: WorkoutExercise[]): number => {
  let totalVolume = 0;
  for (const exercise of exercises) {
    for (const set of exercise.sets) {
      if (!set.is_warmup) {
        totalVolume += set.weight * set.reps;
      }
    }
  }
  return totalVolume;
};

export const calculateTotalSets = (exercises: WorkoutExercise[]): number => {
  return exercises.reduce((total, ex) => total + ex.sets.filter(s => !s.is_warmup).length, 0);
};

export const formatVolume = (volume: number): string => {
  if (volume >= 1000) {
    return `${(volume / 1000).toFixed(1)}k`;
  }
  return volume.toString();
};

export const getMacroPercentage = (current: number, goal: number): number => {
  if (goal === 0) return 0;
  return Math.min(Math.round((current / goal) * 100), 100);
};

export const getEquipmentLabel = (equipment: string): string => {
  const labels: Record<string, string> = {
    dumbbells: 'Dumbbells',
    barbell: 'Barbell',
    pullup_bar: 'Pull-up Bar',
    bench: 'Bench',
    cables: 'Cables',
    machines: 'Machines',
    kettlebell: 'Kettlebell',
  };
  return labels[equipment] || equipment;
};

export const getCategoryColor = (category: string): string => {
  const colors: Record<string, string> = {
    chest: '#EF4444',
    back: '#3B82F6',
    shoulders: '#F59E0B',
    legs: '#10B981',
    arms: '#8B5CF6',
    core: '#EC4899',
  };
  return colors[category] || '#6B7280';
};

export const getMacroColor = (macro: string): string => {
  const colors: Record<string, string> = {
    protein: '#EF4444',
    carbs: '#3B82F6',
    fat: '#F59E0B',
    calories: '#10B981',
  };
  return colors[macro] || '#6B7280';
};
