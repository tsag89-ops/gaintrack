// src/hooks/useAuth.web.ts
// Web-specific auth state — uses Firebase onAuthStateChanged instead of the
// native AuthBridgeModule, which is unavailable in the browser environment.
// Metro automatically picks this file over useAuth.ts on web builds.

import { useEffect, useState } from 'react';
import { getAuth, onAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth';
import { useAuthStore } from '../store/authStore';

// ─── Re-export types so _layout.tsx import stays identical ───────────────────
export type NativeAuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

export interface NativeAuthState {
  uid: string | null;
  isAuthenticated: boolean;
}

export interface NativeAuthStateWithStatus extends NativeAuthState {
  status: NativeAuthStatus;
}

// ─── useAuth (sign-out helper — same API as native version) ──────────────────
export function useAuth() {
  const signOut = async () => {
    try {
      await firebaseSignOut(getAuth());
    } catch (e) {
      console.warn('[useAuth.web] signOut skipped:', e);
    }
  };
  return { signOut };
}

// ─── useNativeAuthState ───────────────────────────────────────────────────────
/**
 * Web replacement for the native AuthBridge-based hook.
 *
 * Subscribes to Firebase's onAuthStateChanged so the root layout redirect
 * guard works correctly after Google / email sign-in on web.
 *
 * Also syncs the authStore so user data is available throughout the app
 * without requiring a separate `loadStoredAuth()` call on web.
 */
export function useNativeAuthState(): NativeAuthStateWithStatus {
  const [state, setState] = useState<NativeAuthStateWithStatus>({
    uid: null,
    isAuthenticated: false,
    status: 'loading',
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(getAuth(), async (firebaseUser) => {
      if (firebaseUser) {
        // Sync authStore imperatively (no hook subscription needed) so that
        // profile screens and other store consumers see the logged-in user.
        const { isAuthenticated, setSession } = useAuthStore.getState();
        if (!isAuthenticated) {
          try {
            const token = await firebaseUser.getIdToken();
            await setSession(
              {
                id: firebaseUser.uid,
                // @ts-ignore — extra fields tolerated by store
                user_id: firebaseUser.uid,
                email: firebaseUser.email ?? '',
                name: firebaseUser.displayName ?? '',
                // @ts-ignore
                picture: firebaseUser.photoURL ?? null,
                created_at: new Date().toISOString(),
                goals: {
                  daily_calories: 2000,
                  protein_grams: 150,
                  carbs_grams: 200,
                  fat_grams: 65,
                  workouts_per_week: 4,
                },
                equipment: ['dumbbells', 'barbell', 'pullup_bar'],
              },
              token,
            );
          } catch (e) {
            console.warn('[useAuth.web] setSession error:', e);
          }
        }
        setState({ uid: firebaseUser.uid, isAuthenticated: true, status: 'authenticated' });
      } else {
        setState({ uid: null, isAuthenticated: false, status: 'unauthenticated' });
      }
    });

    return () => unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return state;
}
