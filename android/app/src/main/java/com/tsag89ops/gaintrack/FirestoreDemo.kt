package com.tsag89ops.gaintrack

import android.util.Log
import com.google.firebase.firestore.ListenerRegistration

// ─────────────────────────────────────────────────────────────────────────────
// Data model
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lightweight representation of a GainTrack workout document stored under
 * users/{uid}/workouts/{workoutId}.
 *
 * TODO: replace these fields with your real workout model once the data layer
 *       is finalised (exercises as typed objects, sets/reps/weight, RPE, etc.).
 */
data class Workout(
    val name: String,
    val durationSecs: Int,
    val exercises: List<String>,
    val timestamp: Long = System.currentTimeMillis(),
) {
    /** Serialise to a plain Map for Firestore. */
    fun toMap(): Map<String, Any> = mapOf(
        "name"         to name,
        "durationSecs" to durationSecs,
        "exercises"    to exercises,
        "timestamp"    to timestamp,
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// Private constants
// ─────────────────────────────────────────────────────────────────────────────

private const val TAG        = "FirestoreDemo"
private const val COLLECTION = "workouts"

// ─────────────────────────────────────────────────────────────────────────────
// Write
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Merge-write a sample workout document for [uid].
 *
 * Call [getCurrentUid] from AuthHelper and pass that uid into this function:
 *   val uid = getCurrentUid() ?: return
 *   saveSampleWorkout(uid)
 *
 * TODO: replace the hard-coded [Workout] below with the active session data
 *       that the user just logged (pull from your WorkoutViewModel / store).
 * TODO: replace "sample_workout" docId with a real ID, e.g. a UUID or the
 *       Firestore auto-generated ID from your workout session.
 */
fun saveSampleWorkout(uid: String) {
    val workout = Workout(
        name          = "Sample Push Day",
        durationSecs  = 3600,
        exercises     = listOf("Bench Press", "Overhead Press", "Tricep Dips"),
    )

    FirestoreHelper.set(
        uid        = uid,
        collection = COLLECTION,
        docId      = "sample_workout",
        data       = workout.toMap(),
        onSuccess  = { Log.d(TAG, "[$uid] workout saved") },
        onError    = { Log.e(TAG, "[$uid] save failed", it) },
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// Read once
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch the sample workout document once for [uid].
 * [onResult] receives a raw field map, or **null** if the document doesn't exist.
 *
 * Call [getCurrentUid] from AuthHelper and pass that uid into this function:
 *   val uid = getCurrentUid() ?: return
 *   loadWorkoutOnce(uid) { data -> ... }
 *
 * TODO: swap "sample_workout" for the real workout ID you want to load, or
 *       convert to a collection query when listing all workouts.
 */
fun loadWorkoutOnce(uid: String, onResult: (Map<String, Any>?) -> Unit) {
    FirestoreHelper.get(
        uid        = uid,
        collection = COLLECTION,
        docId      = "sample_workout",
        onResult   = onResult,
        onError    = { Log.e(TAG, "[$uid] load failed", it) },
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// Live listener
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Subscribe to real-time updates of the sample workout document for [uid].
 *
 * Returns a [ListenerRegistration] whose [ListenerRegistration.remove] method
 * **must** be called when the subscriber is no longer active (e.g. in
 * Activity.onDestroy) to prevent memory / connection leaks.
 *
 * [onChange] is invoked on the main thread with the current field map each
 * time the document changes, or **null** if deleted.
 *
 * Call [getCurrentUid] from AuthHelper and pass that uid into this function:
 *   val uid = getCurrentUid() ?: return
 *   workoutListener = startWorkoutListener(uid) { data -> ... }
 *
 * TODO: replace "sample_workout" with the real document ID, or convert to a
 *       collection listener when you want live updates for all workouts.
 * TODO: once connected to React Native, emit changes via DeviceEventManagerModule
 *       so the JS layer can re-render without polling.
 *
 * TODO: replace sample workout data with real GainTrack session data.
 */
fun startWorkoutListener(
    uid: String,
    onChange: (Map<String, Any>?) -> Unit,
): ListenerRegistration = FirestoreHelper.listen(
    uid        = uid,
    collection = COLLECTION,
    docId      = "sample_workout",
    onChange   = onChange,
    onError    = { Log.e(TAG, "[$uid] listener error", it) },
)
