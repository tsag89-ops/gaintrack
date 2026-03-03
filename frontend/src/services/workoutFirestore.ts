/**
 * workoutFirestore.ts
 *
 * Pure Firestore CRUD for the users/{uid}/workouts sub-collection.
 *
 * Uses @react-native-firebase/firestore (native module, auto-initialised from
 * google-services.json — no manual initializeApp() needed).
 *
 * All functions accept a `uid` parameter so they can be called from any
 * context without relying on global auth state.
 *
 * Firestore path:  users/{uid}/workouts/{workoutId}
 *
 * [PRO] Cloud sync — gate calls with usePro() in UI when required.
 */

import firestore, {
  FirebaseFirestoreTypes,
} from '@react-native-firebase/firestore';
import { Workout } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Returns the workouts sub-collection ref for a given user. */
function workoutsCol(uid: string) {
  return firestore().collection('users').doc(uid).collection('workouts');
}

/** Maps a Firestore doc snapshot to a typed Workout with the doc id as workout_id. */
function docToWorkout(
  doc: FirebaseFirestoreTypes.QueryDocumentSnapshot | FirebaseFirestoreTypes.DocumentSnapshot,
): Workout {
  const data = doc.data() as Omit<Workout, 'workout_id'>;
  return { ...data, workout_id: doc.id };
}

// ─────────────────────────────────────────────────────────────────────────────
// CRUD
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Loads the most recent workouts for a user, ordered by date descending.
 *
 * TODO: create a Firestore composite index on (date DESC) in
 *       firestore.indexes.json if you add additional .where() filters later
 *       (e.g. filtering by muscle group or date range).
 *
 * TODO: increase `limit` or add cursor-based pagination for users with large
 *       workout histories.
 */
export async function loadUserWorkouts(
  uid: string,
  limit = 30,
): Promise<Workout[]> {
  const snapshot = await workoutsCol(uid)
    // TODO: add .where('archived', '==', false) once you add soft-delete support
    .orderBy('date', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs.map(docToWorkout);
}

/**
 * Creates a new workout document for the user.
 *
 * `workout_id` and `created_at` are generated here — do not pass them in `data`.
 *
 * TODO: add a `version: 1` field to the document so you can migrate the
 *       schema in future without breaking existing documents.
 */
export async function createWorkout(
  uid: string,
  data: Omit<Workout, 'workout_id' | 'created_at'>,
): Promise<Workout> {
  // Strip embedded exercise objects (contain undefined fields) — only keep
  // the fields actually needed for display/history.
  const cleanedExercises = (data.exercises ?? []).map((ex: any) => ({
    exercise_id: ex.exercise_id,
    exercise_name: ex.exercise_name,
    notes: ex.notes ?? null,
    sets: (ex.sets ?? []).map((s: any) => ({
      set_id: s.set_id,
      set_number: s.set_number,
      reps: s.reps ?? 0,
      weight: s.weight ?? 0,
      rpe: s.rpe ?? null,
      completed: s.completed ?? false,
      is_warmup: s.is_warmup ?? false,
    })),
  }));

  // JSON round-trip strips any remaining undefined values (Firestore rejects them).
  const payload = JSON.parse(JSON.stringify({
    ...data,
    exercises: cleanedExercises,
    created_at: new Date().toISOString(),
    date: data.date ?? new Date().toISOString(),
  }));

  const ref = await workoutsCol(uid).add(payload);

  return { ...payload, workout_id: ref.id };
}

/**
 * Partially updates an existing workout document.
 *
 * Only the fields present in `updates` are written (Firestore merge/update).
 *
 * TODO: use a Firestore transaction here if you later add concurrent writes
 *       (e.g. a coach editing a client's workout at the same time).
 */
export async function updateWorkout(
  uid: string,
  workoutId: string,
  updates: Partial<Omit<Workout, 'workout_id' | 'created_at'>>,
): Promise<void> {
  await workoutsCol(uid).doc(workoutId).update(updates as Record<string, unknown>);
}

/**
 * Hard-deletes a workout document.
 *
 * TODO: replace with a soft-delete (set `archived: true`) if you want to
 *       support undo or an audit trail.
 */
export async function deleteWorkout(uid: string, workoutId: string): Promise<void> {
  await workoutsCol(uid).doc(workoutId).delete();
}
