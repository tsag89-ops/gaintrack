import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../src/store/authStore';
import { auth } from '../../src/config/firebase';

// Platform.OS is resolved at bundle time by Metro — safe for SSR + web.
const IS_WEB = Platform.OS === 'web';
function FormWrapper({
  style,
  onSubmit,
  children,
}: {
  style?: any;
  onSubmit?: () => void;
  children: React.ReactNode;
}) {
  if (!IS_WEB) return <View style={style}>{children}</View>;
  return (
    // @ts-ignore
    <form
      onSubmit={(e: any) => { e.preventDefault(); onSubmit?.(); }}
      style={StyleSheet.flatten(style) as any}
    >
      {children}
    </form>
  );
}

const GOOGLE_ERROR_MAP: Record<string, string> = {
  'auth/popup-closed-by-user': 'Sign-in cancelled.',
  'auth/cancelled-popup-request': 'Sign-in cancelled.',
  'auth/popup-blocked': 'Redirecting to Google…',
  'auth/operation-not-allowed': 'Google sign-in is not enabled.',
  'auth/account-exists-with-different-credential': 'Account exists with a different sign-in method.',
  'auth/unauthorized-domain': 'This domain is not authorised for Google sign-in.',
};

export default function LoginScreen() {
  const router = useRouter();
  const { setSession } = useAuthStore();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [redirectChecking, setRedirectChecking] = useState(false);

  const applyGoogleUser = async (firebaseUser: any) => {
    const sessionToken = await firebaseUser.getIdToken();
    await setSession(
      {
        id: firebaseUser.uid,
        user_id: firebaseUser.uid,
        email: firebaseUser.email ?? '',
        name: firebaseUser.displayName ?? '',
        picture: firebaseUser.photoURL ?? null,
        created_at: new Date().toISOString(),
        goals: { daily_calories: 2000, protein_grams: 150, carbs_grams: 200, fat_grams: 65, workouts_per_week: 4 },
        equipment: ['dumbbells', 'barbell', 'pullup_bar'],
      },
      sessionToken,
    );
    router.replace('/(tabs)');
  };

  // Handle redirect result on web (after signInWithRedirect returns)
  useEffect(() => {
    if (!IS_WEB) return;
    let cancelled = false;
    (async () => {
      try {
        setRedirectChecking(true);
        const result = await (auth as any).getGoogleRedirectResult?.();
        if (cancelled || !result) return;
        await applyGoogleUser(result.user);
      } catch (e: any) {
        if (cancelled) return;
        if (e?.code !== 'auth/no-auth-event' && e?.code !== 'auth/null-user') {
          setGoogleError(GOOGLE_ERROR_MAP[e?.code] ?? e?.message ?? 'Google sign-in failed.');
        }
      } finally {
        if (!cancelled) setRedirectChecking(false);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signInWithGoogle = async () => {
    console.log('[Google] button pressed, IS_WEB:', IS_WEB);
    if (!IS_WEB) {
      // Native path: handled separately via expo-auth-session
      Alert.alert('Coming Soon', 'Google sign-in on mobile will be available in the next build.');
      return;
    }
    try {
      setGoogleLoading(true);
      setGoogleError(null);
      const result = await (auth as any).signInWithGoogle();
      console.log('[Google] result:', result);
      if (!result) return; // redirect flow — page will reload
      await applyGoogleUser(result.user);
    } catch (e: any) {
      console.error('[Google] error:', e?.code, e?.message);
      setGoogleError(GOOGLE_ERROR_MAP[e?.code] ?? e?.message ?? `Google sign-in failed (${e?.code ?? 'unknown'})`);
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Missing Info', 'Please enter your email and password.');
      return;
    }
    if (mode === 'signup' && !name.trim()) {
      Alert.alert('Missing Info', 'Please enter your name.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Weak Password', 'Password must be at least 6 characters.');
      return;
    }

    try {
      setIsSubmitting(true);

      let firebaseUser;
      if (mode === 'signup') {
        const cred = await auth.createUserWithEmailAndPassword(
          email.trim().toLowerCase(),
          password,
        );
        await cred.user.updateProfile({ displayName: name.trim() });
        firebaseUser = cred.user;
      } else {
        const cred = await auth.signInWithEmailAndPassword(
          email.trim().toLowerCase(),
          password,
        );
        firebaseUser = cred.user;
      }

      const sessionToken = await firebaseUser.getIdToken();
      const user = {
        id: firebaseUser.uid,
        user_id: firebaseUser.uid,
        email: firebaseUser.email ?? email.trim().toLowerCase(),
        name: firebaseUser.displayName ?? name.trim(),
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
      };
      await setSession(user, sessionToken);
      router.replace('/(tabs)');
    } catch (error: any) {
      console.error('Auth error:', error);
      const msg: Record<string, string> = {
        'auth/user-not-found': 'No account found. Switch to Sign Up.',
        'auth/wrong-password': 'Incorrect password.',
        'auth/email-already-in-use': 'Email already in use. Sign in instead.',
        'auth/invalid-email': 'Invalid email address.',
        'auth/network-request-failed': 'Network error. Check your connection.',
        'auth/too-many-requests': 'Too many attempts. Try again later.',
      };
      Alert.alert('Auth Error', msg[error?.code] ?? error?.message ?? 'Something went wrong.');
    } finally {
      setIsSubmitting(false);
    }
  };


  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <View style={styles.logoContainer}>
              <Ionicons name="fitness" size={60} color="#FF6200" />
            </View>
            <Text style={styles.title}>GainTrack</Text>
            <Text style={styles.subtitle}>Your complete fitness companion</Text>
          </View>

          <View style={styles.features}>
            <View style={styles.featureItem}>
              <Ionicons name="barbell-outline" size={24} color="#FF6200" />
              <Text style={styles.featureText}>Track workouts & progress</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="restaurant-outline" size={24} color="#2196F3" />
              <Text style={styles.featureText}>Log meals & macros</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="trending-up-outline" size={24} color="#FFC107" />
              <Text style={styles.featureText}>Visualize your gains</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="home-outline" size={24} color="#FF6200" />
              <Text style={styles.featureText}>Home gym support</Text>
            </View>
          </View>

          {/* Mode toggle */}
          <View style={styles.modeToggle}>
            <TouchableOpacity
              style={[styles.modeBtn, mode === 'signin' && styles.modeBtnActive]}
              onPress={() => setMode('signin')}
            >
              <Text style={[styles.modeBtnText, mode === 'signin' && styles.modeBtnTextActive]}>
                Sign In
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeBtn, mode === 'signup' && styles.modeBtnActive]}
              onPress={() => setMode('signup')}
            >
              <Text style={[styles.modeBtnText, mode === 'signup' && styles.modeBtnTextActive]}>
                Create Account
              </Text>
            </TouchableOpacity>
          </View>

          <FormWrapper style={styles.form} onSubmit={handleSubmit}>
            {mode === 'signup' && (
              <>
                <Text style={styles.formLabel}>Your Name</Text>
                <TextInput
                  id="name"
                  nativeID="name"
                  style={styles.input}
                  placeholder="e.g. Alex"
                  placeholderTextColor="#B0B0B0"
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                  autoComplete="name"
                />
              </>
            )}
            <Text style={styles.formLabel}>Email Address</Text>
            <TextInput
              id="email"
              nativeID="email"
              style={styles.input}
              placeholder="e.g. alex@email.com"
              placeholderTextColor="#B0B0B0"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />
            <Text style={styles.formLabel}>Password</Text>
            <View style={styles.passwordRow}>
              <TextInput
                id="password"
                nativeID="password"
                style={[styles.input, styles.passwordInput]}
                placeholder="Min. 6 characters"
                placeholderTextColor="#B0B0B0"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              />
              <TouchableOpacity
                style={styles.eyeBtn}
                onPress={() => setShowPassword((v) => !v)}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color="#B0B0B0"
                />
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[styles.enterButton, isSubmitting && styles.enterButtonDisabled]}
              onPress={handleSubmit}
              disabled={isSubmitting}
            >
              <Ionicons name="arrow-forward-circle" size={22} color="#FFFFFF" />
              <Text style={styles.enterButtonText}>
                {isSubmitting
                  ? 'Please wait…'
                  : mode === 'signup'
                  ? 'Create Account'
                  : 'Sign In'}
              </Text>
            </TouchableOpacity>
          </FormWrapper>

          {/* Divider */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Google Sign-In */}
          <TouchableOpacity
            style={[styles.googleButton, (googleLoading || isSubmitting) && styles.enterButtonDisabled]}
            onPress={signInWithGoogle}
            disabled={googleLoading || isSubmitting}
          >
            <Ionicons name="logo-google" size={20} color="#FFFFFF" />
            <Text style={styles.googleButtonText}>
              {googleLoading ? 'Signing in…' : 'Continue with Google'}
            </Text>
          </TouchableOpacity>

          {googleError ? (
            <Text style={styles.errorText}>{googleError}</Text>
          ) : null}

          <Text style={styles.terms}>
            Your data is synced securely via Firebase.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1A1A1A',
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingVertical: 32,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoContainer: {
    width: 100,
    height: 100,
    borderRadius: 24,
    backgroundColor: '#FF620020',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 36,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#B0B0B0',
  },
  features: {
    marginBottom: 28,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    backgroundColor: '#252525',
    padding: 14,
    borderRadius: 12,
  },
  featureText: {
    color: '#FFFFFF',
    fontSize: 15,
    marginLeft: 14,
  },
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: '#252525',
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  modeBtnActive: {
    backgroundColor: '#FF6200',
  },
  modeBtnText: {
    color: '#B0B0B0',
    fontSize: 14,
    fontWeight: '600',
  },
  modeBtnTextActive: {
    color: '#FFFFFF',
  },
  form: {
    marginBottom: 24,
  },
  formLabel: {
    color: '#B0B0B0',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: '#252525',
    color: '#FFFFFF',
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#303030',
    flex: 1,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  passwordInput: {
    marginBottom: 0,
  },
  eyeBtn: {
    position: 'absolute',
    right: 14,
    padding: 4,
  },
  enterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF6200',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 10,
    marginTop: 4,
  },
  enterButtonDisabled: {
    opacity: 0.6,
  },
  enterButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  terms: {
    color: '#B0B0B0',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#303030',
  },
  dividerText: {
    color: '#B0B0B0',
    fontSize: 13,
    marginHorizontal: 12,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2D2D2D',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#303030',
  },
  googleButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  errorText: {
    color: '#F44336',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 12,
  },
});
