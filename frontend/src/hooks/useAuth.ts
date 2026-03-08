// frontend/app/hooks/useAuth.ts
// app/hooks/useAuth.ts
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { getAuth, signOut as firebaseSignOut, onAuthStateChanged } from 'firebase/auth';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { NativeAuthState } from '../services/authBridge';

export function useAuth() {
  const signOut = async () => {
    try {
      const auth = getAuth();
      await firebaseSignOut(auth);
    } catch (e) {
      // ignore — logout still proceeds via authStore
      console.warn('Firebase signOut skipped:', e);
    }
  };

  return { signOut };
}

// ─────────────────────────────────────────────────────────────────────────────
// Native auth state hook
// ─────────────────────────────────────────────────────────────────────────────

export type NativeAuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

export interface NativeAuthStateWithStatus extends NativeAuthState {
  /**
   * 'loading'        — getAuthState() promise has not yet resolved; do not
   *                    render auth-gated routes to avoid flashing the wrong stack.
   * 'authenticated'  — Firebase currentUser is non-null.
   * 'unauthenticated'— Firebase currentUser is null (signed out / never signed in).
   */
  status: NativeAuthStatus;
}

/**
 * Subscribes to Firebase Auth state changes forwarded from the Android native
 * [AuthBridgeModule] via [DeviceEventEmitter].
 *
 * Returns `{ uid, isAuthenticated, status }` where `status` starts as
 * `'loading'` until the bridge resolves, then becomes `'authenticated'` or
 * `'unauthenticated'`. This prevents the root navigator from flashing the
 * wrong stack on cold start.
 *
 * Example:
 *   const { status, uid } = useNativeAuthState();
 *   if (status === 'loading') return <Splash />;
 *   if (status === 'unauthenticated') return <LoginScreen />;
 */
export function useNativeAuthState(): NativeAuthStateWithStatus {
  const [state, setState] = useState<NativeAuthStateWithStatus>({
    uid: null,
    isAuthenticated: false,
    status: 'loading',
  });

  useEffect(() => {
    // On web: use Firebase JS SDK directly.
    if (Platform.OS === 'web') {
      // Ensure Firebase app is initialized (firebase.ts never calls initializeApp on native)
      if (getApps().length === 0) {
        initializeApp({
          apiKey:            process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
          authDomain:        process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
          projectId:         process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
          storageBucket:     process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
          messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
          appId:             process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
        });
      }

      let unsubscribe: (() => void) | undefined;
      // Safety net — if onAuthStateChanged never fires within 6 s, unblock the app
      const timer = setTimeout(() => {
        setState({ uid: null, isAuthenticated: false, status: 'unauthenticated' });
      }, 6000);

      try {
        const auth = getApps().length > 0 ? getAuth(getApp()) : getAuth();
        // Resolve immediately if already signed in (avoids loading flash).
        if (auth.currentUser) {
          clearTimeout(timer);
          setState({ uid: auth.currentUser.uid, isAuthenticated: true, status: 'authenticated' });
        }
        unsubscribe = onAuthStateChanged(auth, (user) => {
          clearTimeout(timer);
          setState(
            user
              ? { uid: user.uid, isAuthenticated: true, status: 'authenticated' }
              : { uid: null, isAuthenticated: false, status: 'unauthenticated' },
          );
        });
      } catch (e) {
        clearTimeout(timer);
        console.warn('[useAuth] Firebase web SDK error:', e);
        setState({ uid: null, isAuthenticated: false, status: 'unauthenticated' });
      }

      return () => { clearTimeout(timer); unsubscribe?.(); };
    }

    // Native (Android + iOS): subscribe directly to @react-native-firebase/auth.
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const rnFirebaseAuth = require('@react-native-firebase/auth').default;

      // ✅ Safety net: give AsyncStorage (loadStoredAuth) time to restore
      // the cached session before we declare the user unauthenticated.
      // If Firebase resolves as authenticated within this window, the timer
      // is cancelled immediately and we never show the login screen.
      let resolved = false;
      const timer = setTimeout(() => {
        if (!resolved) {
          console.warn('[useAuth] Native auth state timeout — defaulting to unauthenticated');
          resolved = true;
          setState({ uid: null, isAuthenticated: false, status: 'unauthenticated' });
        }
      }, 3000); // 3 seconds is enough for rnFirebase to restore a persisted session

      const unsubscribe = rnFirebaseAuth().onAuthStateChanged((firebaseUser: any) => {
        // Only act on the FIRST non-null result or after timer expires.
        // Subsequent null fires (e.g. token refresh) must not redirect to login.
        if (firebaseUser) {
          clearTimeout(timer);
          resolved = true;
          setState({ uid: firebaseUser.uid, isAuthenticated: true, status: 'authenticated' });
        } else if (resolved) {
          // Already resolved (authenticated or timed out) — a null here means
          // a real sign-out happened, so update state correctly.
          setState({ uid: null, isAuthenticated: false, status: 'unauthenticated' });
        }
        // If not yet resolved + firebaseUser is null: wait for the timer —
        // this is the cold-start window where AsyncStorage may still be loading.
      });

      return () => {
        clearTimeout(timer);
        unsubscribe();
      };
    } catch (e) {
      console.warn('[useAuth] rnFirebase auth listener error:', e);
      setState({ uid: null, isAuthenticated: false, status: 'unauthenticated' });
    }
  }, []);

  return state;
}
