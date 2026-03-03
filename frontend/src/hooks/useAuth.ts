// frontend/app/hooks/useAuth.ts
// app/hooks/useAuth.ts
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { getAuth, signOut as firebaseSignOut, onAuthStateChanged } from 'firebase/auth';
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
      const auth = getAuth();
      // Resolve immediately if already signed in (avoids loading flash).
      if (auth.currentUser) {
        setState({ uid: auth.currentUser.uid, isAuthenticated: true, status: 'authenticated' });
      }
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        setState(
          user
            ? { uid: user.uid, isAuthenticated: true, status: 'authenticated' }
            : { uid: null, isAuthenticated: false, status: 'unauthenticated' },
        );
      });
      return unsubscribe;
    }

    // Android: use native AuthBridgeModule.
    const timeout = new Promise<NativeAuthState>((resolve) =>
      setTimeout(() => resolve({ uid: null, isAuthenticated: false }), 5000)
    );

    Promise.race([getAuthState(), timeout])
      .then((s) =>
        setState({
          ...s,
          status: s.isAuthenticated ? 'authenticated' : 'unauthenticated',
        })
      )
      .catch(() => {
        setState({ uid: null, isAuthenticated: false, status: 'unauthenticated' });
      });

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
