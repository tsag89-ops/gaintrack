/**
 * offlineQueue.ts
 *
 * Stores workouts that failed to reach Firestore (e.g. no network) in
 * AsyncStorage, then re-attempts them when connectivity is restored.
 *
 * Queue format — AsyncStorage key: gaintrack_offline_queue
 *   Array<QueuedWorkout>
 *
 * [PRO] Firestore sync — callers should guard with usePro() where required.
 */

import { Workout } from '../types';
import { createWorkout as fsCreateWorkout } from './workoutFirestore';
import { storage } from '../utils/storage';

const QUEUE_KEY = 'gaintrack_offline_queue';

export interface QueuedWorkout {
  uid: string;
  data: Omit<Workout, 'workout_id' | 'created_at'>;
  queuedAt: string;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function readQueue(): Promise<QueuedWorkout[]> {
  try {
    const raw = await storage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueuedWorkout[]) : [];
  } catch {
    return [];
  }
}

async function writeQueue(queue: QueuedWorkout[]): Promise<void> {
  await storage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Adds a workout to the local sync queue. */
export async function enqueueWorkout(
  uid: string,
  data: Omit<Workout, 'workout_id' | 'created_at'>,
): Promise<void> {
  const queue = await readQueue();
  queue.push({ uid, data, queuedAt: new Date().toISOString() });
  await writeQueue(queue);
  console.log(`[OfflineQueue] enqueued workout — queue size: ${queue.length}`);
}

/** Returns the number of workouts waiting to be synced. */
export async function getPendingCount(): Promise<number> {
  const queue = await readQueue();
  return queue.length;
}

/**
 * Attempts to push every queued workout to Firestore.
 * Items that succeed are removed; items that fail stay in the queue.
 *
 * Returns the number of workouts successfully synced.
 */
export async function flushOfflineQueue(): Promise<number> {
  const queue = await readQueue();
  if (queue.length === 0) return 0;

  console.log(`[OfflineQueue] flushing ${queue.length} queued workout(s)…`);

  const remaining: QueuedWorkout[] = [];
  let synced = 0;

  for (const item of queue) {
    try {
      await fsCreateWorkout(item.uid, item.data);
      synced++;
    } catch (err) {
      console.warn('[OfflineQueue] retry failed — keeping in queue:', err);
      remaining.push(item);
    }
  }

  await writeQueue(remaining);

  if (synced > 0) {
    console.log(`[OfflineQueue] synced ${synced} workout(s); ${remaining.length} still pending`);
  }

  return synced;
}
