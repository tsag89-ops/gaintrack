package com.tsag89ops.gaintrack

import android.os.Build
import android.os.Bundle
import android.util.Log

import androidx.activity.viewModels
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import com.google.firebase.firestore.ListenerRegistration

import expo.modules.ReactActivityDelegateWrapper
import kotlinx.coroutines.launch

// AuthHelper top-level functions (getCurrentUid, signInAnonymously) are
// in the same package — no explicit import needed.

class MainActivity : ReactActivity() {

  // ── AuthViewModel — lifecycle-aware holder for Firebase Auth state ────────
  private val authViewModel: AuthViewModel by viewModels()

  // ── Firestore listener handle — removed in onDestroy to avoid leaks ──────
  private var workoutListener: ListenerRegistration? = null

  // Tracks whether the DEBUG demo has already been launched for this session
  // (prevents re-running if auth state emits more than once while Loading).
  private var demoStarted = false

  override fun onCreate(savedInstanceState: Bundle?) {
    // Set the theme to AppTheme BEFORE onCreate to support
    // coloring the background, status bar, and navigation bar.
    // This is required for expo-splash-screen.
    setTheme(R.style.AppTheme)
    super.onCreate(null)

    // ── Observe AuthViewModel (DEBUG only) ───────────────────────────────────
    // When the auth state transitions to Authenticated, run the workout demo.
    // Release builds skip this block entirely.
    if (BuildConfig.DEBUG) {
      // Collect the StateFlow; repeatOnLifecycle ensures collection stops
      // when the activity goes to background and resumes on STARTED.
      lifecycleScope.launch {
        repeatOnLifecycle(Lifecycle.State.STARTED) {
          authViewModel.authState.collect { state ->
            when (state) {
              is AuthState.Loading -> {
                // Firebase hasn't responded yet — nothing to do.
              }
              is AuthState.Authenticated -> {
                if (!demoStarted) {
                  demoStarted = true
                  setupWorkoutDemo(state.uid)
                }
              }
              is AuthState.Unauthenticated -> {
                // No current user — trigger anonymous sign-in for local testing.
                // TODO (test-only): replace with real auth flow before production.
                signInAnonymously { uid ->
                  if (uid == null) {
                    Log.e("MainActivity", "Anonymous sign-in failed")
                  }
                  // On success, Firebase emits a new AuthStateListener event which
                  // flows through AuthViewModel → authState → Authenticated branch above.
                }
              }
            }
          }
        }
      }
    }
    // ─────────────────────────────────────────────────────────────────────────
  }

  /** Remove the Firestore listener to prevent memory / connection leaks. */
  override fun onDestroy() {
    workoutListener?.remove()
    workoutListener = null
    super.onDestroy()
  }

  /**
   * Runs the three Firestore smoke-test operations for the given authenticated [uid].
   *
   * Called from onCreate once a real Firebase UID is available (either an
   * existing session or a freshly completed anonymous sign-in).
   *
   * TODO (test-only): remove or replace with real GainTrack workout session data
   *       when the full auth + data layer is wired up.
   */
  private fun setupWorkoutDemo(uid: String) {
    // 1) Write a sample workout document.
    // TODO: replace with real GainTrack session data.
    saveSampleWorkout(uid)

    // 2) Read it back once for round-trip verification.
    loadWorkoutOnce(uid) { data ->
      Log.d("MainActivity", "Loaded workout: $data")
    }

    // 3) Start a live listener; keep the registration for cleanup in onDestroy.
    workoutListener = startWorkoutListener(uid) { data ->
      Log.d("MainActivity", "Workout listener update: $data")
      // TODO: forward 'data' to React Native via DeviceEventManagerModule,
      //       or push to a ViewModel / LiveData for the native UI layer.
    }
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "main"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate {
    return ReactActivityDelegateWrapper(
          this,
          BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,
          object : DefaultReactActivityDelegate(
              this,
              mainComponentName,
              fabricEnabled
          ){})
  }

  /**
    * Align the back button behavior with Android S
    * where moving root activities to background instead of finishing activities.
    * @see <a href="https://developer.android.com/reference/android/app/Activity#onBackPressed()">onBackPressed</a>
    */
  override fun invokeDefaultOnBackPressed() {
      if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.R) {
          if (!moveTaskToBack(false)) {
              // For non-root activities, use the default implementation to finish them.
              super.invokeDefaultOnBackPressed()
          }
          return
      }

      // Use the default back button implementation on Android S
      // because it's doing more than [Activity.moveTaskToBack] in fact.
      super.invokeDefaultOnBackPressed()
  }
}
