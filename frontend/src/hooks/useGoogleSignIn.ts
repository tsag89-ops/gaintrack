// frontend/src/hooks/useGoogleSignIn.ts
// Google Sign-In via expo-auth-session + @react-native-firebase/auth
// Flow: expo-auth-session → Google OAuth (id_token) → Firebase credential → signInWithCredential
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as Google from 'expo-auth-session/providers/google';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import { GoogleAuthProvider } from '@react-native-firebase/auth';
import Constants from 'expo-constants';
import { useAuthStore } from '../store/authStore';
import { auth } from '../config/firebase';

// Required so the browser can close after redirect
WebBrowser.maybeCompleteAuthSession();

// Read from EXPO_PUBLIC_ env vars first (explicit overrides), then fall back
// to values extracted from credential files and injected via app.config.js extra.
const ANDROID_CLIENT_ID: string =
  process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ??
  (Constants.expoConfig?.extra?.googleAndroidClientId as string | undefined) ??
  '';
const IOS_CLIENT_ID: string =
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ??
  (Constants.expoConfig?.extra?.googleIosClientId as string | undefined) ??
  '';
const WEB_CLIENT_ID: string =
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ??
  (Constants.expoConfig?.extra?.googleWebClientId as string | undefined) ??
  '';

/**
 * Returns the reason Google Sign-In cannot proceed, or null if credentials
 * look complete for the current platform.
 */
function getCredentialError(): string | null {
  if (!WEB_CLIENT_ID) {
    return 'Google Sign-In is not configured: EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is missing.';
  }
  if (Platform.OS === 'android' && !ANDROID_CLIENT_ID) {
    return (
      'Google Sign-In is not configured for Android: ' +
      'EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID is missing. ' +
      'Add it to your .env file and re-run `eas build`.'
    );
  }
  if (Platform.OS === 'ios' && !IOS_CLIENT_ID) {
    return (
      'Google Sign-In is not configured for iOS: ' +
      'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID is missing. ' +
      'Add it to your .env file and re-run `eas build`.'
    );
  }
  return null;
}

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

  // Pass all three client IDs so expo-auth-session can select the correct one
  // per platform. Passing undefined is safe here — the crash only happens when
  // promptAsync() is called without a valid platform-appropriate ID, which is
  // guarded in signInWithGoogle() below.
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    webClientId: WEB_CLIENT_ID || undefined,
    androidClientId: ANDROID_CLIENT_ID || undefined,
    iosClientId: IOS_CLIENT_ID || undefined,
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
    const credError = getCredentialError();
    if (credError) {
      setError(credError);
      return;
    }
    if (!request) return;
    setError(null);
    await promptAsync();
  };

  return { signInWithGoogle, loading: isLoading, error, ready: !!request };
}
