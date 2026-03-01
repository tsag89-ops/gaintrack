package com.tsag89ops.gaintrack

import android.util.Log
import com.google.firebase.auth.FirebaseAuth

private const val AUTH_TAG = "AuthHelper"

// ─────────────────────────────────────────────────────────────────────────────
// Current user
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the Firebase UID of the currently signed-in user, or **null** if no
 * user is authenticated.
 *
 * Usage:
 *   val uid = getCurrentUid() ?: return   // bail out if not signed in
 *   saveSampleWorkout(uid)
 *
 * TODO: wire this into your full auth flow (Google Sign-In, email/password,
 *       or your own JWT-based solution) when you move past anonymous auth.
 */
fun getCurrentUid(): String? = FirebaseAuth.getInstance().currentUser?.uid

// ─────────────────────────────────────────────────────────────────────────────
// Anonymous sign-in  (TEST-ONLY — replace with real auth flow later)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Signs the user in anonymously via Firebase Authentication and returns the
 * resulting UID through [onResult].
 *
 * [onResult] is called on the main thread with:
 *  - the new UID on success, or
 *  - **null** on failure (error is logged).
 *
 * TODO: remove or gate this behind a debug flag once real authentication
 *       (Google Sign-In, email/password, etc.) is implemented.
 *       Anonymous accounts cannot be recovered if the device is wiped —
 *       always link them to a permanent credential before reaching production.
 */
fun signInAnonymously(onResult: (String?) -> Unit) {
    // TODO (test-only): replace with real auth later — see above.
    FirebaseAuth.getInstance()
        .signInAnonymously()
        .addOnSuccessListener { result ->
            val uid = result.user?.uid
            Log.d(AUTH_TAG, "Anonymous sign-in succeeded — uid=$uid")
            onResult(uid)
        }
        .addOnFailureListener { e ->
            Log.e(AUTH_TAG, "Anonymous sign-in failed", e)
            onResult(null)
        }
}
