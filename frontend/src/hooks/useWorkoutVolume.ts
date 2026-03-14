// frontend/src/hooks/useWorkoutVolume.ts
// AsyncStorage hook — reads workouts and computes volume data.
// Follows storage-agent.md offline-first pattern.

import { useState, useEffect, useCallback } from 'react';
import {
  getWeeklyTotalVolume,
  getMuscleGroupVolumeLatestWeek,
  type VolumeWorkout,
} from '../utils/volumeCalc';
import { storage } from '../utils/storage';

const WORKOUTS_KEY = 'gaintrack_workouts';

export interface VolumeChartData {
  /** { labels, data } for BarChart — last 8 weeks of total volume */
  weekly: { labels: string[]; data: number[] };
  /** { labels, data } for BarChart — per-muscle-group volume this week */
  muscleGroup: { labels: string[]; data: number[] };
}

export interface UseWorkoutVolumeResult {
  volumeData: VolumeChartData | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useWorkoutVolume(): UseWorkoutVolumeResult {
  const [volumeData, setVolumeData] = useState<VolumeChartData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    storage.getItem(WORKOUTS_KEY)
      .then((raw) => {
        if (cancelled) return;
        const parsed = raw ? JSON.parse(raw) : [];
        // Support both raw array and { workouts: [] } envelope
        const arr: VolumeWorkout[] = Array.isArray(parsed)
          ? parsed
          : (parsed?.workouts ?? []);

        setVolumeData({
          weekly: getWeeklyTotalVolume(arr, 8),
          muscleGroup: getMuscleGroupVolumeLatestWeek(arr),
        });
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load workout data.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  return { volumeData, loading, error, refresh };
}
