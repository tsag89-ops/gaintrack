// src/hooks/useGoogleSignIn.web.ts
// Web Google Sign-In via Firebase signInWithPopup (with redirect fallback).
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { auth } from '../config/firebase';
import { useAuthStore } from '../store/authStore';

const ERROR_MAP: Record<string, string> = {
  'auth/popup-closed-by-user': 'Sign-in cancelled.',
  'auth/cancelled-popup-request': 'Sign-in cancelled.',
  'auth/popup-blocked': 'Redirecting to Google…',
  'auth/operation-not-allowed': 'Google sign-in is not enabled. Contact support.',
  'auth/account-exists-with-different-credential':
    'An account already exists with this email.',
};

async function applyUser(
  firebaseUser: any,
  setSession: any,
  router: ReturnType<typeof useRouter>,
) {
  const sessionToken = await firebaseUser.getIdToken();
  await setSession(
    {
      id: firebaseUser.uid,
      user_id: firebaseUser.uid,
      email: firebaseUser.email ?? '',
      name: firebaseUser.displayName ?? '',
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
    sessionToken,
  );
  router.replace('/(tabs)');
}

export function useGoogleSignIn() {
  const { setSession } = useAuthStore();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Handle redirect result when returning from Google OAuth page
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const result = await (auth as any).getGoogleRedirectResult();
        if (cancelled || !result) return;
        await applyUser(result.user, setSession, router);
      } catch (e: any) {
        if (cancelled) return;
        // Ignore "no redirect" — that's the normal case on fresh load
        if (e?.code !== 'auth/no-auth-event') {
          console.error('Google redirect result error:', e);
          setError(ERROR_MAP[e?.code] ?? e?.message ?? 'Google sign-in failed.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signInWithGoogle = async () => {
    try {
      setLoading(true);
      setError(null);
      console.log('[Google] signInWithGoogle called');
      const result = await (auth as any).signInWithGoogle();
      console.log('[Google] result:', result);
      if (!result) {
        console.log('[Google] no result — redirect in progress');
        return; // redirect in progress — page will reload
      }
      console.log('[Google] got user, applying session...');
      await applyUser(result.user, setSession, router);
      console.log('[Google] session applied, navigating...');
    } catch (e: any) {
      console.error('[Google] sign-in error:', e?.code, e?.message, e);
      setError(ERROR_MAP[e?.code] ?? e?.message ?? `Google sign-in failed (${e?.code ?? 'unknown'})`);
      setLoading(false);
    }
  };

  return { signInWithGoogle, loading, error, ready: true };
}
