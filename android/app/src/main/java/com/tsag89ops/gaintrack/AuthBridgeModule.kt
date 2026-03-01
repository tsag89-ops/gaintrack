package com.tsag89ops.gaintrack

import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseAuthRecentLoginRequiredException

private const val MODULE_TAG  = "AuthBridgeModule"

/**
 * Rejection code emitted when Firebase requires a recent sign-in before
 * the account-deletion operation can proceed.
 * Mirrored as [REQUIRES_RECENT_LOGIN] in authBridge.ts so JS can match it.
 */
private const val ERR_REQUIRES_RECENT_LOGIN = "REQUIRES_RECENT_LOGIN"
private const val MODULE_NAME = "AuthBridge"

// ─────────────────────────────────────────────────────────────────────────────
// Event names exported to JS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Emitted to the JS layer whenever Firebase Auth fires an [AuthStateListener].
 *
 * Payload (WritableMap):
 *   {
 *     uid:             string | null,   // null when signed out
 *     isAuthenticated: boolean
 *   }
 *
 * JS usage:
 *   import { DeviceEventEmitter } from 'react-native';
 *   DeviceEventEmitter.addListener(AUTH_STATE_CHANGED_EVENT, handler);
 *
 * Or use the authBridge.ts helper / useNativeAuthState() hook directly.
 */
const val AUTH_STATE_CHANGED_EVENT = "onAuthStateChanged"

// ─────────────────────────────────────────────────────────────────────────────
// Bridge module
// ─────────────────────────────────────────────────────────────────────────────

/**
 * React Native native module that bridges Firebase Auth state to the JS layer.
 *
 * Accessible from JS as:
 *   import { NativeModules } from 'react-native';
 *   const { AuthBridge } = NativeModules;
 *   AuthBridge.getAuthState().then(({ uid, isAuthenticated }) => ...);
 *
 * Real-time updates arrive via [DeviceEventEmitter] with event name
 * [AUTH_STATE_CHANGED_EVENT].
 *
 * TODO: when you add Google Sign-In or email/password auth on the native side,
 *       add @ReactMethod functions here (e.g. signOut()) that the JS layer can
 *       invoke to trigger auth transitions.
 */
class AuthBridgeModule(
    private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = MODULE_NAME

    // ── Auth state listener ───────────────────────────────────────────────────

    private val authListener = FirebaseAuth.AuthStateListener { auth ->
        val user = auth.currentUser
        Log.d(MODULE_TAG, "Auth state changed — uid=${user?.uid}")
        emitAuthState(user?.uid)
    }

    /**
     * Called by the RN framework after the JS bundle loads and the module is
     * active. Register the listener here (not in init {}) so that the
     * [ReactApplicationContext] is fully initialised before we emit.
     */
    override fun initialize() {
        super.initialize()
        FirebaseAuth.getInstance().addAuthStateListener(authListener)
    }

    /**
     * Called when the React instance is torn down (e.g. reload in dev mode).
     * Remove the listener to prevent leaks.
     */
    override fun invalidate() {
        FirebaseAuth.getInstance().removeAuthStateListener(authListener)
        super.invalidate()
    }

    // ── Exported constants ────────────────────────────────────────────────────

    /**
     * Exported to JS as:
     *   AuthBridge.AUTH_STATE_CHANGED_EVENT  →  "onAuthStateChanged"
     *
     * Use this constant in JS to subscribe to [DeviceEventEmitter] so that
     * event names are never hard-coded on both sides.
     */
    override fun getConstants(): Map<String, Any> = mapOf(
        "AUTH_STATE_CHANGED_EVENT" to AUTH_STATE_CHANGED_EVENT
    )

    // ── React methods (callable from JS) ─────────────────────────────────────

    /**
     * Returns a Promise that resolves to the current auth state object:
     *   { uid: string | null, isAuthenticated: boolean }
     *
     * JS:
     *   const state = await AuthBridge.getAuthState();
     */
    @ReactMethod
    fun getAuthState(promise: Promise) {
        try {
            val uid = FirebaseAuth.getInstance().currentUser?.uid
            val map = Arguments.createMap().apply {
                if (uid != null) putString("uid", uid) else putNull("uid")
                putBoolean("isAuthenticated", uid != null)
            }
            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("AUTH_ERROR", e.message, e)
        }
    }

    /**
     * Permanently deletes the current Firebase Auth account.
     *
     * Intended for the "Delete my account" button in the profile screen.
     * The caller **must** show a confirmation dialog before invoking this method.
     *
     * On success the Promise resolves with null and the existing
     * [AuthStateListener] automatically emits [AUTH_STATE_CHANGED_EVENT] with
     * `isAuthenticated = false`, so the JS layer transitions to the login screen
     * without any extra wiring.
     *
     * On failure the Promise rejects with code "DELETE_ACCOUNT_ERROR".
     * Common failure: Firebase requires a recent sign-in; if the user's session
     * is stale, re-authenticate first (FirebaseAuthRecentLoginRequiredException).
     *
     * JS:
     *   await AuthBridge.deleteAccount();
     */
    @ReactMethod
    fun deleteAccount(promise: Promise) {
        val user = FirebaseAuth.getInstance().currentUser
        if (user == null) {
            promise.reject("NO_USER", "No authenticated user to delete")
            return
        }
        user.delete()
            .addOnSuccessListener {
                Log.d(MODULE_TAG, "deleteAccount() — account deleted")
                promise.resolve(null)
            }
            .addOnFailureListener { e ->
                if (e is FirebaseAuthRecentLoginRequiredException) {
                    Log.w(MODULE_TAG, "deleteAccount() requires recent login")
                    promise.reject(
                        ERR_REQUIRES_RECENT_LOGIN,
                        "Please sign out and sign back in, then try deleting your account again.",
                        e
                    )
                } else {
                    Log.e(MODULE_TAG, "deleteAccount() failed: ${e.message}", e)
                    promise.reject("DELETE_ACCOUNT_ERROR", e.message, e)
                }
            }
    }

    /**
     * Signs the current user out of Firebase Auth and resolves the Promise on
     * success, or rejects it with error code "SIGN_OUT_ERROR" on failure.
     *
     * JS:
     *   await AuthBridge.signOut();
     *
     * After sign-out Firebase emits an [AuthStateListener] event which will
     * propagate to the JS layer via [AUTH_STATE_CHANGED_EVENT] automatically.
     */
    @ReactMethod
    fun signOut(promise: Promise) {
        try {
            FirebaseAuth.getInstance().signOut()
            Log.d(MODULE_TAG, "signOut() called — user signed out")
            promise.resolve(null)
        } catch (e: Exception) {
            Log.e(MODULE_TAG, "signOut() failed: ${e.message}", e)
            promise.reject("SIGN_OUT_ERROR", e.message, e)
        }
    }

    /**
     * Required stub for [com.facebook.react.modules.core.RCTEventEmitter].
     * RN calls this when the JS side calls addListener on a NativeEventEmitter.
     * No-op here because we use [DeviceEventEmitter] (no native NativeEventEmitter needed).
     *
     * TODO: if you switch to NativeEventEmitter on the JS side, track the count
     *       here and only attach the Firebase listener when count > 0.
     */
    @ReactMethod
    fun addListener(@Suppress("UNUSED_PARAMETER") eventName: String) { /* no-op */ }

    /**
     * Required stub; pair of [addListener].
     */
    @ReactMethod
    fun removeListeners(@Suppress("UNUSED_PARAMETER") count: Int) { /* no-op */ }

    // ── Internal helpers ──────────────────────────────────────────────────────

    private fun emitAuthState(uid: String?) {
        if (!reactContext.hasActiveReactInstance()) return
        val payload = Arguments.createMap().apply {
            if (uid != null) putString("uid", uid) else putNull("uid")
            putBoolean("isAuthenticated", uid != null)
        }
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(AUTH_STATE_CHANGED_EVENT, payload)
    }
}
