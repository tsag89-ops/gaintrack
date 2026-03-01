// frontend/app/hooks/useAuth.ts
// app/hooks/useAuth.ts
import { useEffect, useState } from 'react';
import { getAuth, signOut as firebaseSignOut } from 'firebase/auth';
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
    // Eagerly resolve the current state so components don't flash a logged-out
    // view while the first DeviceEventEmitter event is in flight.
    getAuthState()
      .then((s) =>
        setState({
          ...s,
          status: s.isAuthenticated ? 'authenticated' : 'unauthenticated',
        })
      )
      .catch(() => {
        // Bridge unavailable (e.g. Expo Go / iOS without bridge) — treat as unauthenticated.
        setState({ uid: null, isAuthenticated: false, status: 'unauthenticated' });
      });

    // Subscribe to real-time updates from the native AuthBridgeModule.
    const subscription = addAuthStateListener((s) =>
      setState({
        ...s,
        status: s.isAuthenticated ? 'authenticated' : 'unauthenticated',
      })
    );
    return () => subscription.remove();
  }, []);

  return state;
}
