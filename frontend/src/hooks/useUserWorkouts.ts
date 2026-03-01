/**
 * useUserWorkouts.ts
 *
 * Fetches the current user's Firestore workout documents and exposes auth
 * state alongside the data so callers have everything in one hook.
 *
 * Depends on:
 *  - useNativeAuthState() — uid + isAuthenticated from the native Auth bridge
 *  - @react-native-firebase/firestore — native Firestore SDK (db from config/firebase)
 *
 * Usage:
 *   const { status, uid, workouts, reload } = useUserWorkouts();
 *
 *   if (status === 'loading') return <Spinner />;
 *   if (!uid) return <LoginPrompt />;
 *   return <WorkoutList workouts={workouts ?? []} />;
 *
 * NOTE: This is a one-shot fetch (no real-time listener) for simplicity.
 *       TODO: switch to db.collection(…).onSnapshot(…) for live updates when
 *             the workout logger screen needs real-time sync.
 *
 * [PRO] Firestore cloud sync — gated by usePro() in pro-only screens.
 */

import { useCallback, useEffect, useState } from 'react';

import { db } from '../config/firebase';
import { useNativeAuthState } from './useAuth';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Minimal workout shape returned by the hook.
 *
 * TODO: replace with the real Workout type from src/types once Firestore
 *       documents match the local schema.
 */
export interface FirestoreWorkout {
  id: string;
  /** ISO-8601 date string, e.g. "2026-03-01T10:00:00Z" */
  date: string;
  /** Display name of the workout, e.g. "Push Day A" */
  name?: string;
  // TODO: add exercises, volume, duration, notes fields as needed
  [key: string]: unknown;
}

type LoadStatus = 'idle' | 'loading' | 'success' | 'error';

export interface UseUserWorkoutsResult {
  /** Mirrors isAuthenticated from useNativeAuthState */
  status: LoadStatus;
  /** Firebase UID of the signed-in user, or null when signed out */
  uid: string | null;
  /** Loaded workouts, or null when not yet fetched / signed out */
  workouts: FirestoreWorkout[] | null;
  /** Trigger a manual re-fetch (e.g. after a new workout is saved) */
  reload: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useUserWorkouts(): UseUserWorkoutsResult {
  const { uid, isAuthenticated } = useNativeAuthState();

  const [workouts, setWorkouts] = useState<FirestoreWorkout[] | null>(null);
  const [status, setStatus] = useState<LoadStatus>('idle');

  const fetchWorkouts = useCallback(async (userId: string) => {
    setStatus('loading');
    try {
      // TODO: adjust subcollection path if your Firestore structure differs.
      //       Current path: users/{uid}/workouts
      const snapshot = await db
        .collection('users')
        .doc(userId)
        .collection('workouts')
        // TODO: add .orderBy('date', 'desc').limit(50) for pagination
        .get();

      const docs: FirestoreWorkout[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<FirestoreWorkout, 'id'>),
      }));

      setWorkouts(docs);
      setStatus('success');
    } catch (err) {
      console.error('[useUserWorkouts] Failed to load workouts:', err);
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !uid) {
      setWorkouts(null);
      setStatus('idle');
      return;
    }
    fetchWorkouts(uid);
  }, [isAuthenticated, uid, fetchWorkouts]);

  const reload = useCallback(() => {
    if (uid) fetchWorkouts(uid);
  }, [uid, fetchWorkouts]);

  return { status, uid, workouts, reload };
}
