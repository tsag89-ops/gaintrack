// src/hooks/useHealthTrackIntegration.ts
// Integration layer: Health Connect metrics → GainTrack stores + telemetry

import { useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useHealthConnectMetrics, useTodayHealthMetrics } from './useHealthConnectMetrics';
import { sendHealthIntegrationTelemetry } from '../services/healthSync';
import { useAuthStore } from '../store/authStore';

export interface CachedHealthSnapshot {
  steps: number;
  distance: number;
  calories: number;
  weight: number;
  exercises: number;
  syncedAt: string;
}

const HEALTH_CACHE_KEY = 'gaintrack_health_snapshot';

/**
 * Hook that automatically syncs Health Connect metrics to local store and fires telemetry.
 * Use in your main app layout or root screen for background sync.
 *
 * @param autoSyncIntervalMs - How often to auto-sync (0 to disable)
 * @returns Health metrics snapshot and control functions
 */
export const useHealthTrackIntegration = (autoSyncIntervalMs = 600000) => {
  const { steps, distance, calories, weight, exercises, isLoading, error } =
    useHealthConnectMetrics({
      autoSyncIntervalMs,
      lookbackDays: 7,
    });

  const userId = useAuthStore((state) => state.user?.uid);

  // Persist to AsyncStorage whenever metrics update
  useEffect(() => {
    if (!isLoading && !error && (steps.totalSteps > 0 || weight.recordCount > 0)) {
      const snapshot: CachedHealthSnapshot = {
        steps: steps.totalSteps,
        distance: distance.totalDistance,
        calories: calories.totalCalories,
        weight: weight.latestWeight,
        exercises: exercises.length,
        syncedAt: new Date().toISOString(),
      };

      AsyncStorage.setItem(HEALTH_CACHE_KEY, JSON.stringify(snapshot));

      // Fire telemetry
      if (userId) {
        sendHealthIntegrationTelemetry('google_fit', {
          eventType: 'metrics_synced_to_local_store',
          success: true,
          nativeBridgeAvailable: true,
          providerRecordsRead: steps.recordCount + distance.recordCount + calories.recordCount,
        });
      }
    }
  }, [steps, distance, calories, weight, exercises, isLoading, error, userId]);

  return {
    steps,
    distance,
    calories,
    weight,
    exercises,
    isLoading,
    error,
  };
};

/**
 * Get cached Health Connect snapshot from local storage.
 * Fast, no async bridge calls.
 */
export const getCachedHealthSnapshot = async (): Promise<CachedHealthSnapshot | null> => {
  try {
    const raw = await AsyncStorage.getItem(HEALTH_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

/**
 * Quick access to today's metrics.
 * Use in dashboard cards that update frequently.
 */
export const useTodayHealthCard = () => {
  const { steps, distance, calories, weight, isLoading, error, refetch } =
    useTodayHealthMetrics();

  return {
    stepsDisplay: `${(steps.totalSteps || 0).toLocaleString()} steps`,
    distanceDisplay: `${((distance.totalDistance || 0) / 1000).toFixed(1)} km`,
    caloriesDisplay: `${(calories.totalCalories || 0).toFixed(0)} kcal`,
    weightDisplay: `${(weight.latestWeight || 0).toFixed(1)} kg`,
    isLoading,
    error,
    refetch,
  };
};
