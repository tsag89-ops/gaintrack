import { NativeModules, Platform } from 'react-native';
import { Workout } from '../types';
import { calculateWorkoutVolume } from '../utils/helpers';

type WidgetBridgeNative = {
  updateStats: (weeklyVolume: number, workoutsCount: number, lastUpdated: string) => void;
  clearStats: () => void;
};

const bridge: WidgetBridgeNative | undefined =
  Platform.OS === 'android'
    ? (NativeModules.GainTrackWidgetBridge as WidgetBridgeNative | undefined)
    : undefined;

const START_OF_DAY_HOUR = 0;

const getStartOfWindow = (): Date => {
  const today = new Date();
  today.setHours(START_OF_DAY_HOUR, 0, 0, 0);
  const windowStart = new Date(today);
  windowStart.setDate(today.getDate() - 6);
  return windowStart;
};

const safeDate = (value: string | undefined): Date | null => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

export const syncWorkoutWidget = async (workouts: Workout[]): Promise<void> => {
  if (!bridge) return;

  try {
    const windowStart = getStartOfWindow();
    const relevant = workouts.filter((workout) => {
      if (workout.archived) return false;
      const date = safeDate(workout.date);
      return Boolean(date && date >= windowStart);
    });

    const weeklyVolume = relevant.reduce(
      (sum, workout) => sum + calculateWorkoutVolume(workout.exercises ?? []),
      0,
    );

    const lastUpdated = new Date().toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });

    bridge.updateStats(weeklyVolume, relevant.length, lastUpdated);
  } catch (err) {
    console.warn('[WidgetBridge] failed to sync widget stats:', err);
  }
};

export const clearWorkoutWidget = async (): Promise<void> => {
  if (!bridge) return;

  try {
    bridge.clearStats();
  } catch (err) {
    console.warn('[WidgetBridge] failed to clear widget stats:', err);
  }
};
