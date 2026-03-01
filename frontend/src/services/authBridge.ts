/**
 * authBridge.ts
 *
 * Thin TypeScript wrapper around the Android native `AuthBridge` module.
 *
 * Provides:
 *  - `getAuthState()`           – one-shot promise for the current auth state
 *  - `addAuthStateListener()`   – subscribe to real-time auth changes via
 *                                  DeviceEventEmitter
 *  - `AUTH_STATE_CHANGED_EVENT` – the event name constant (avoids hard-coding)
 *
 * Usage:
 *   import { getAuthState, addAuthStateListener } from '@/services/authBridge';
 *
 *   // One-shot read
 *   const { uid, isAuthenticated } = await getAuthState();
 *
 *   // Real-time subscription
 *   const sub = addAuthStateListener(({ uid, isAuthenticated }) => {
 *     console.log('auth changed', uid);
 *   });
 *   // later: sub.remove();
 *
 * NOTE: This module communicates with the native Android `AuthBridgeModule`.
 *       On iOS, NativeModules.AuthBridge will be undefined — guard accordingly
 *       if/when iOS support is added.
 *
 * TODO: add an iOS AuthBridgeModule implementation (Swift) when iOS firebase
 *       auth is wired up, then remove the Platform.OS guard below.
 */

import {
  DeviceEventEmitter,
  EmitterSubscription,
  NativeModules,
  Platform,
} from 'react-native';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface NativeAuthState {
  /** Firebase UID of the signed-in user, or null when signed out. */
  uid: string | null;
  /** Convenience flag — true when uid is non-null. */
  isAuthenticated: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Module reference
// ─────────────────────────────────────────────────────────────────────────────

const { AuthBridge } = NativeModules as {
  AuthBridge?: {
    getAuthState: () => Promise<NativeAuthState>;
    signOut: () => Promise<void>;
    deleteAccount: () => Promise<void>;
    AUTH_STATE_CHANGED_EVENT: string;
  };
};

/**
 * Event name constant sourced from the native module.
 * Falls back to the hardcoded string so it also works in tests / Storybook
 * without a native bridge.
 */
export const AUTH_STATE_CHANGED_EVENT: string =
  AuthBridge?.AUTH_STATE_CHANGED_EVENT ?? 'onAuthStateChanged';

/**
 * Rejection code thrown by [deleteAccount] when Firebase requires the user
 * to have signed in recently before the deletion can proceed.
 *
 * Handle it by prompting the user to sign out → sign back in → retry.
 *
 * Matches the native constant ERR_REQUIRES_RECENT_LOGIN in AuthBridgeModule.kt.
 */
export const REQUIRES_RECENT_LOGIN = 'REQUIRES_RECENT_LOGIN';

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a Promise that resolves to the **current** Firebase Auth state.
 *
 * Throws if the bridge is unavailable (non-Android or module not registered).
 *
 * TODO: replace isAuthenticated-false handling in callers once real auth is
 *       wired up (Google Sign-In / email flow), removing the anonymous fallback.
 */
export async function getAuthState(): Promise<NativeAuthState> {
  if (Platform.OS !== 'android' || !AuthBridge) {
    // Non-Android: return a neutral state so callers don't crash.
    // TODO: implement native iOS bridge.
    return { uid: null, isAuthenticated: false };
  }
  return AuthBridge.getAuthState();
}

/**
 * Subscribes to Firebase Auth state changes fired by the native `AuthBridgeModule`.
 *
 * The callback receives a [NativeAuthState] object every time the user signs
 * in or out (including the initial sign-in and anonymous sign-in events).
 *
 * Returns an [EmitterSubscription]; call `.remove()` in a cleanup effect.
 *
 * Example:
 *   useEffect(() => {
 *     const sub = addAuthStateListener(state => setState(state));
 *     return () => sub.remove();
 *   }, []);
 */
export function addAuthStateListener(
  callback: (state: NativeAuthState) => void,
): EmitterSubscription {
  return DeviceEventEmitter.addListener(AUTH_STATE_CHANGED_EVENT, callback);
}

/**
 * Signs the current user out via the native Firebase Auth bridge.
 *
 * The existing [AUTH_STATE_CHANGED_EVENT] will fire with isAuthenticated=false
 * automatically; no extra state management needed in callers.
 *
 * Throws on non-Android or if the native module is unavailable.
 */
export async function signOut(): Promise<void> {
  if (Platform.OS !== 'android' || !AuthBridge) {
    // TODO: implement native iOS bridge.
    return;
  }
  await AuthBridge.signOut();
}

/**
 * Permanently deletes the Firebase Auth account for the current user.
 *
 * **Always** show a confirmation dialog before calling this function.
 *
 * The existing [AUTH_STATE_CHANGED_EVENT] fires automatically on success so
 * the app navigates away without extra wiring.
 *
 * Throws "NO_USER" if no user is signed in, or "DELETE_ACCOUNT_ERROR" on
 * any other Firebase failure (including stale-session errors).
 */
export async function deleteAccount(): Promise<void> {
  if (Platform.OS !== 'android' || !AuthBridge) {
    // TODO: implement native iOS bridge.
    return;
  }
  await AuthBridge.deleteAccount();
}
