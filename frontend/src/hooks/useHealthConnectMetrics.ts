import { useCallback, useEffect, useState } from 'react';
import { Platform, useWindowDimensions } from 'react-native';
import {
  CaloriesData,
  DistanceData,
  ExerciseRecord,
  StepsData,
  TimeRange,
  WeightData,
  readDistance,
  readExerciseSessions,
  readExerciseSessionsWithIntensity,
  readSteps,
  readTotalCalories,
  readWeight,
  getAllGrantedPermissions,
  isHealthConnectPermissionGranted,
} from '../services/healthSync';

export interface HealthMetricsSnapshot {
  timestamp: Date;
  steps: StepsData;
  distance: DistanceData;
  calories: CaloriesData;
  weight: WeightData;
  exercises: ExerciseRecord[];
  isLoading: boolean;
  error: string | null;
}

export interface UseHealthConnectMetricsOptions {
  autoSyncIntervalMs?: number; // 0 to disable auto-sync
  lookbackDays?: number; // Default: 7
}

/**
 * Custom hook for easily syncing Health Connect metrics into GainTrack.
 *
 * Usage:
 * ```tsx
 * const { steps, distance, calories, weight, exercises, isLoading, error, refetch } = useHealthConnectMetrics({
 *   autoSyncIntervalMs: 3600000, // 1 hour
 *   lookbackDays: 7,
 * });
 *
 * useEffect(() => {
 *   if (steps.totalSteps > 0) {
 *     // Save to local store
 *     storage.setItem('today_steps', JSON.stringify(steps));
 *   }
 * }, [steps]);
 * ```
 */
export const useHealthConnectMetrics = (
  options: UseHealthConnectMetricsOptions = {},
) => {
  const { autoSyncIntervalMs = 3600000, lookbackDays = 7 } = options;
  const [snapshot, setSnapshot] = useState<HealthMetricsSnapshot>({
    timestamp: new Date(),
    steps: { totalSteps: 0, recordCount: 0, averageStepsPerRecord: 0 },
    distance: { totalDistance: 0, recordCount: 0, averageDistancePerRecord: 0 },
    calories: { totalCalories: 0, recordCount: 0, averageCaloriesPerRecord: 0 },
    weight: { latestWeight: 0, averageWeight: 0, recordCount: 0 },
    exercises: [],
    isLoading: false,
    error: null,
  });

  const calculateTimeRange = useCallback((days: number): TimeRange => {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);
    return { startTime: startDate, endTime: endDate };
  }, []);

  const refetch = useCallback(async () => {
    if (Platform.OS !== 'android') {
      setSnapshot((prev) => ({
        ...prev,
        error: 'Health Connect metrics only available on Android',
      }));
      return;
    }

    setSnapshot((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const timeRange = calculateTimeRange(lookbackDays);

      // Check permissions first
      const permissions = await getAllGrantedPermissions();
      if (permissions.length === 0) {
        throw new Error('No Health Connect permissions granted');
      }

      // Fetch all metrics in parallel
      const [stepsData, distanceData, caloriesData, weightData, exerciseData] = await Promise.all(
        [
          readSteps(timeRange),
          readDistance(timeRange),
          readTotalCalories(timeRange),
          readWeight(timeRange),
          readExerciseSessions(timeRange),
        ],
      );

      setSnapshot({
        timestamp: new Date(),
        steps: stepsData,
        distance: distanceData,
        calories: caloriesData,
        weight: weightData,
        exercises: exerciseData,
        isLoading: false,
        error: null,
      });
    } catch (error: any) {
      console.error('[useHealthConnectMetrics] Sync error:', error?.message);
      setSnapshot((prev) => ({
        ...prev,
        isLoading: false,
        error: error?.message ?? 'Failed to sync health metrics',
      }));
    }
  }, [lookbackDays, calculateTimeRange]);

  // Auto-sync interval
  useEffect(() => {
    if (autoSyncIntervalMs <= 0 || Platform.OS !== 'android') {
      return;
    }

    // Initial fetch
    refetch();

    // Set up interval
    const intervalId = setInterval(() => {
      refetch();
    }, autoSyncIntervalMs);

    return () => clearInterval(intervalId);
  }, [autoSyncIntervalMs, refetch]);

  return {
    ...snapshot,
    refetch,
  };
};

/**
 * Specialized hook for syncing today's metrics only.
 *
 * Usage:
 * ```tsx
 * const { steps, distance, calories, refetch } = useTodayHealthMetrics();
 *
 * // Refetch every 5 minutes
 * useEffect(() => {
 *   const interval = setInterval(() => {
 *     refetch();
 *   }, 5 * 60 * 1000);
 *   return () => clearInterval(interval);
 * }, [refetch]);
 * ```
 */
export const useTodayHealthMetrics = () => {
  const today = useCallback((): TimeRange => {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);
    return { startTime: startDate, endTime: endDate };
  }, []);

  const [metrics, setMetrics] = useState({
    steps: { totalSteps: 0, recordCount: 0, averageStepsPerRecord: 0 },
    distance: { totalDistance: 0, recordCount: 0, averageDistancePerRecord: 0 },
    calories: { totalCalories: 0, recordCount: 0, averageCaloriesPerRecord: 0 },
    weight: { latestWeight: 0, averageWeight: 0, recordCount: 0 },
    isLoading: false,
    error: null as string | null,
  });

  const refetch = useCallback(async () => {
    if (Platform.OS !== 'android') return;

    setMetrics((prev) => ({ ...prev, isLoading: true }));

    try {
      const timeRange = today();
      const [stepsData, distanceData, caloriesData, weightData] = await Promise.all([
        readSteps(timeRange),
        readDistance(timeRange),
        readTotalCalories(timeRange),
        readWeight(timeRange),
      ]);

      setMetrics({
        steps: stepsData,
        distance: distanceData,
        calories: caloriesData,
        weight: weightData,
        isLoading: false,
        error: null,
      });
    } catch (error: any) {
      setMetrics((prev) => ({
        ...prev,
        isLoading: false,
        error: error?.message ?? 'Failed to sync metrics',
      }));
    }
  }, [today]);

  return { ...metrics, refetch };
};

/**
 * Check if a specific Health Connect permission is granted.
 *
 * Usage:
 * ```tsx
 * const { granted, loading } = useHealthConnectPermission('Steps', 'read');
 *
 * if (granted) {
 *   // Permission available
 * } else if (!loading) {
 *   // Permission denied
 * }
 * ```
 */
export const useHealthConnectPermission = (
  recordType: string,
  accessType: 'read' | 'write' = 'read',
) => {
  const [{ granted, loading }, setState] = useState({ granted: false, loading: true });

  useEffect(() => {
    const checkPermission = async () => {
      try {
        const hasPermission = await isHealthConnectPermissionGranted(
          recordType as any,
          accessType,
        );
        setState({ granted: hasPermission, loading: false });
      } catch (error) {
        setState({ granted: false, loading: false });
      }
    };

    if (Platform.OS === 'android') {
      checkPermission();
    } else {
      setState({ granted: false, loading: false });
    }
  }, [recordType, accessType]);

  return { granted, loading };
};
