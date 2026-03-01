// frontend/src/hooks/useGoogleSignIn.ts
// Google Sign-In via expo-auth-session + @react-native-firebase/auth
// Flow: expo-auth-session → Google OAuth (id_token) → Firebase credential → signInWithCredential
import { useEffect, useState } from 'react';
import * as Google from 'expo-auth-session/providers/google';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import { GoogleAuthProvider } from '@react-native-firebase/auth';
import Constants from 'expo-constants';
import { useAuthStore } from '../store/authStore';
import { auth } from '../config/firebase';

// Required so the browser can close after redirect
WebBrowser.maybeCompleteAuthSession();

const WEB_CLIENT_ID: string =
  (Constants.expoConfig?.extra?.googleWebClientId as string | undefined) ?? '';

/**
 * Returns `{ signInWithGoogle, loading, error }`.
 * Call `signInWithGoogle()` in a button press handler.
 */
export function useGoogleSignIn() {
  const { setSession } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // SHA-256 nonce for id_token verification
  const [nonce] = useState(() => Crypto.randomUUID());
  const [hashedNonce, setHashedNonce] = useState<string>('');

  useEffect(() => {
    Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce).then(
      setHashedNonce,
    );
  }, [nonce]);

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    webClientId: WEB_CLIENT_ID,
    // On Android/iOS the webClientId is sufficient; add expoClientId for
    // Expo Go testing if you have a separate "Web" client in Google Cloud.
    extraParams: hashedNonce ? { nonce: hashedNonce } : {},
  });

  // Handle OAuth response
  useEffect(() => {
    if (response?.type !== 'success') return;

    const idToken = response.params?.id_token;
    if (!idToken) {
      setError('No id_token received from Google.');
      setIsLoading(false);
      return;
    }

    (async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Build Firebase credential using the raw nonce
        const credential = GoogleAuthProvider.credential(idToken, null);
        const userCred = await auth.signInWithCredential(credential);
        const firebaseUser = userCred.user;

        const sessionToken = await firebaseUser.getIdToken();
        await setSession(
          {
            id: firebaseUser.uid,
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
          } as any,
          sessionToken,
        );
      } catch (e: any) {
        console.error('[Google Sign-In] Firebase error:', e);
        setError(e?.message ?? 'Google Sign-In failed.');
      } finally {
        setIsLoading(false);
      }
    })();
  }, [response]);

  const signInWithGoogle = async () => {
    if (!WEB_CLIENT_ID || WEB_CLIENT_ID.includes('YOUR_WEB')) {
      setError('Google Web Client ID is not configured in app.json extra.googleWebClientId');
      return;
    }
    if (!request) return;
    setError(null);
    await promptAsync();
  };

  return { signInWithGoogle, loading: isLoading, error, ready: !!request };
}
