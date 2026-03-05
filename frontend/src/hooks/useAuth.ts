// frontend/app/hooks/useAuth.ts
// app/hooks/useAuth.ts
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { getAuth, signOut as firebaseSignOut, onAuthStateChanged } from 'firebase/auth';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  addAuthStateListener,
  getAuthState,
  NativeAuthState,
} from '../services/authBridge';

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
    // On web (and iOS without native bridge): use Firebase JS SDK directly.
    if (Platform.OS !== 'android') {
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

    // Android: use native AuthBridgeModule (with 4 s safety timeout).
    let resolved = false;
    const safetyTimer = setTimeout(() => {
      if (!resolved) setState({ uid: null, isAuthenticated: false, status: 'unauthenticated' });
    }, 4000);

    Promise.race([getAuthState(), new Promise<NativeAuthState>((res) => setTimeout(() => res({ uid: null, isAuthenticated: false }), 4000))])
      .then((s) => {
        resolved = true;
        clearTimeout(safetyTimer);
        setState({ ...s, status: s.isAuthenticated ? 'authenticated' : 'unauthenticated' });
      })
      .catch(() => {
        resolved = true;
        clearTimeout(safetyTimer);
        setState({ uid: null, isAuthenticated: false, status: 'unauthenticated' });
      });

    const subscription = addAuthStateListener((s) =>
      setState({
        ...s,
        status: s.isAuthenticated ? 'authenticated' : 'unauthenticated',
      })
    );
    return () => { clearTimeout(safetyTimer); subscription.remove(); };
  }, []);

  return state;
}
