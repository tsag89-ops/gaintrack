package com.tsag89ops.gaintrack

import androidx.lifecycle.ViewModel
import com.google.firebase.auth.FirebaseAuth
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

// ─────────────────────────────────────────────────────────────────────────────
// Auth state model
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Simple sealed hierarchy representing the three possible auth states:
 *  - [Loading]        — initial state before Firebase has responded
 *  - [Authenticated]  — a signed-in user exists; exposes [uid]
 *  - [Unauthenticated] — no current user
 *
 * TODO: expand [Authenticated] with display name / email / provider info once
 *       you wire a real sign-in method (Google, email/password, etc.).
 */
sealed class AuthState {
    /** Firebase Auth hasn't emitted yet. */
    object Loading : AuthState()

    /** A Firebase user is signed in. */
    data class Authenticated(val uid: String) : AuthState()

    /** No Firebase user is signed in. */
    object Unauthenticated : AuthState()
}

// ─────────────────────────────────────────────────────────────────────────────
// ViewModel
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lifecycle-aware holder for Firebase auth state.
 *
 * Obtain an instance via [androidx.lifecycle.ViewModelProvider] scoped to
 * your [MainActivity]:
 *
 *   val authViewModel: AuthViewModel by viewModels()
 *
 * Observe [authState] in [MainActivity] to react to sign-in / sign-out:
 *
 *   lifecycleScope.launch {
 *       repeatOnLifecycle(Lifecycle.State.STARTED) {
 *           authViewModel.authState.collect { state -> ... }
 *       }
 *   }
 *
 * The [AuthBridgeModule] independently forwards auth events to the JS layer;
 * this ViewModel is for **native** consumers and for driving [MainActivity]
 * logic (e.g. deciding when to call [setupWorkoutDemo]).
 *
 * TODO: if you add a sign-out or profile-update flow on the native side, add
 *       helper methods here (e.g. signOut()) that call FirebaseAuth and let the
 *       StateFlow propagate the change to all observers automatically.
 */
class AuthViewModel : ViewModel() {

    private val _authState = MutableStateFlow<AuthState>(AuthState.Loading)

    /** Publicly exposed read-only auth state flow. */
    val authState: StateFlow<AuthState> = _authState.asStateFlow()

    // ── Firebase AuthStateListener ────────────────────────────────────────────
    private val authListener = FirebaseAuth.AuthStateListener { auth ->
        _authState.value = if (auth.currentUser != null) {
            AuthState.Authenticated(auth.currentUser!!.uid)
        } else {
            AuthState.Unauthenticated
        }
    }

    init {
        // Firebase calls the listener immediately with the current user (or null),
        // so _authState transitions out of Loading right away on the calling thread.
        FirebaseAuth.getInstance().addAuthStateListener(authListener)
    }

    override fun onCleared() {
        FirebaseAuth.getInstance().removeAuthStateListener(authListener)
        super.onCleared()
    }
}
