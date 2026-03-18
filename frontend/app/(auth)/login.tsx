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
import rnFirebaseAuth from '@react-native-firebase/auth';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import FormWrapper from '../../src/components/FormWrapper';
import { sendEngagementTelemetry } from '../../src/services/notifications';
import { useLanguage } from '../../src/context/LanguageContext';

export default function LoginScreen() {
  const router = useRouter();
  const { setSession } = useAuthStore();
  const { t } = useLanguage();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);

  const googleErrorMap: Record<string, string> = {
    'auth/popup-closed-by-user': t('login.googleErrors.popupClosed'),
    'auth/cancelled-popup-request': t('login.googleErrors.popupCancelled'),
    'auth/popup-blocked': t('login.googleErrors.popupBlocked'),
    'auth/operation-not-allowed': t('login.googleErrors.operationNotAllowed'),
    'auth/account-exists-with-different-credential': t('login.googleErrors.accountExists'),
    'auth/unauthorized-domain': t('login.googleErrors.unauthorizedDomain'),
  };

  useEffect(() => {
    sendEngagementTelemetry({
      feature: 'auth',
      action: 'login_screen_view',
      context: mode,
    });
  }, []);

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
    sendEngagementTelemetry({
      feature: 'auth',
      action: 'google_auth_success',
      context: Platform.OS,
    });
    router.replace('/(tabs)');
  };

  // Handle redirect result on web (after signInWithRedirect returns)
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let cancelled = false;
    (async () => {
      try {
        const result = await (auth as any).getGoogleRedirectResult?.();
        if (cancelled || !result) return;
        await applyGoogleUser(result.user);
      } catch (e: any) {
        if (cancelled) return;
        if (e?.code !== 'auth/no-auth-event' && e?.code !== 'auth/null-user') {
          setGoogleError(googleErrorMap[e?.code] ?? e?.message ?? t('login.googleErrors.failed'));
        }
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signInWithGoogle = async () => {
    console.log('[Google] button pressed, platform:', Platform.OS);
    sendEngagementTelemetry({
      feature: 'auth',
      action: 'google_auth_attempt',
      context: Platform.OS,
    });

    // ── Native (Android / iOS) ────────────────────────────────────────────────
    if (Platform.OS !== 'web') {
      try {
        setGoogleLoading(true);
        setGoogleError(null);
        await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
        const response = await GoogleSignin.signIn();
        if (response.type !== 'success') return; // user cancelled
        const { idToken } = response.data;
        if (!idToken) throw new Error('No idToken returned from Google Sign-In.');
        const credential = rnFirebaseAuth.GoogleAuthProvider.credential(idToken);
        const userCredential = await auth.signInWithCredential(credential);
        await applyGoogleUser(userCredential.user);
      } catch (e: any) {
        if (e?.code === statusCodes.SIGN_IN_CANCELLED) return;
        console.error('[Google native] error:', e?.code, e?.message);
        sendEngagementTelemetry({
          feature: 'auth',
          action: 'google_auth_failed',
          context: e?.code ?? 'native_unknown',
        });
        setGoogleError(e?.message ?? t('login.googleErrors.failed'));
      } finally {
        setGoogleLoading(false);
      }
      return;
    }

    // ── Web ───────────────────────────────────────────────────────────────────
    try {
      setGoogleLoading(true);
      setGoogleError(null);
      const result = await (auth as any).signInWithGoogle();
      console.log('[Google web] result:', result);
      if (!result) return; // redirect flow — page will reload
      await applyGoogleUser(result.user);
    } catch (e: any) {
      console.error('[Google web] error:', e?.code, e?.message);
      sendEngagementTelemetry({
        feature: 'auth',
        action: 'google_auth_failed',
        context: e?.code ?? 'web_unknown',
      });
      setGoogleError(googleErrorMap[e?.code] ?? e?.message ?? `${t('login.googleErrors.failed')} (${e?.code ?? 'unknown'})`);
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert(t('login.missingInfoTitle'), t('login.missingEmailPassword'));
      return;
    }
    if (mode === 'signup' && !name.trim()) {
      Alert.alert(t('login.missingInfoTitle'), t('login.missingName'));
      return;
    }
    if (password.length < 6) {
      Alert.alert(t('login.weakPasswordTitle'), t('login.weakPasswordMessage'));
      return;
    }

    try {
      setIsSubmitting(true);
      sendEngagementTelemetry({
        feature: 'auth',
        action: mode === 'signup' ? 'email_signup_attempt' : 'email_signin_attempt',
        context: Platform.OS,
      });

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
      sendEngagementTelemetry({
        feature: 'auth',
        action: mode === 'signup' ? 'email_signup_success' : 'email_signin_success',
        context: Platform.OS,
      });
      router.replace('/(tabs)');
    } catch (error: any) {
      console.error('Auth error:', error);
      sendEngagementTelemetry({
        feature: 'auth',
        action: mode === 'signup' ? 'email_signup_failed' : 'email_signin_failed',
        context: error?.code ?? 'auth_unknown',
      });
      const msg: Record<string, string> = {
        'auth/user-not-found': t('login.authErrors.userNotFound'),
        'auth/wrong-password': t('login.authErrors.wrongPassword'),
        'auth/email-already-in-use': t('login.authErrors.emailInUse'),
        'auth/invalid-email': t('login.authErrors.invalidEmail'),
        'auth/network-request-failed': t('login.authErrors.network'),
        'auth/too-many-requests': t('login.authErrors.tooManyRequests'),
      };
      Alert.alert(t('login.authErrorTitle'), msg[error?.code] ?? error?.message ?? t('login.authErrors.unknown'));
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
            <Text style={styles.title}>{t('login.title')}</Text>
            <Text style={styles.subtitle}>{t('login.subtitle')}</Text>
          </View>

          <View style={styles.features}>
            <View style={styles.featureItem}>
              <Ionicons name="barbell-outline" size={24} color="#FF6200" />
              <Text style={styles.featureText}>{t('login.featureWorkouts')}</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="restaurant-outline" size={24} color="#2196F3" />
              <Text style={styles.featureText}>{t('login.featureMeals')}</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="trending-up-outline" size={24} color="#FFC107" />
              <Text style={styles.featureText}>{t('login.featureGains')}</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="home-outline" size={24} color="#FF6200" />
              <Text style={styles.featureText}>{t('login.featureHomeGym')}</Text>
            </View>
          </View>

          {/* Mode toggle */}
          <View style={styles.modeToggle}>
            <TouchableOpacity
              style={[styles.modeBtn, mode === 'signin' && styles.modeBtnActive]}
              onPress={() => {
                setMode('signin');
                sendEngagementTelemetry({
                  feature: 'auth',
                  action: 'mode_switch',
                  context: 'signin',
                });
              }}
            >
              <Text style={[styles.modeBtnText, mode === 'signin' && styles.modeBtnTextActive]}>
                {t('login.signIn')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeBtn, mode === 'signup' && styles.modeBtnActive]}
              onPress={() => {
                setMode('signup');
                sendEngagementTelemetry({
                  feature: 'auth',
                  action: 'mode_switch',
                  context: 'signup',
                });
              }}
            >
              <Text style={[styles.modeBtnText, mode === 'signup' && styles.modeBtnTextActive]}>
                {t('login.createAccount')}
              </Text>
            </TouchableOpacity>
          </View>

          <FormWrapper style={styles.form} onSubmit={handleSubmit}>
            {mode === 'signup' && (
              <>
                <Text style={styles.formLabel}>{t('login.yourName')}</Text>
                <TextInput
                  id="name"
                  nativeID="name"
                  style={styles.input}
                  placeholder={t('login.yourNamePlaceholder')}
                  placeholderTextColor="#B0B0B0"
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                  autoComplete="name"
                />
              </>
            )}
            <Text style={styles.formLabel}>{t('login.emailAddress')}</Text>
            <TextInput
              id="email"
              nativeID="email"
              style={styles.input}
              placeholder={t('login.emailPlaceholder')}
              placeholderTextColor="#B0B0B0"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />
            <Text style={styles.formLabel}>{t('login.password')}</Text>
            <View style={styles.passwordRow}>
              <TextInput
                id="password"
                nativeID="password"
                style={[styles.input, styles.passwordInput]}
                placeholder={t('login.passwordPlaceholder')}
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
                  ? t('login.pleaseWait')
                  : mode === 'signup'
                  ? t('login.createAccount')
                  : t('login.signIn')}
              </Text>
            </TouchableOpacity>
          </FormWrapper>

          {/* Divider */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>{t('common.or')}</Text>
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
              {googleLoading ? t('login.signingIn') : t('login.continueWithGoogle')}
            </Text>
          </TouchableOpacity>

          {googleError ? (
            <Text style={styles.errorText}>{googleError}</Text>
          ) : null}

          <Text style={styles.terms}>
            {t('login.byContinuing')}{' '}
            <Text style={styles.termsLink} onPress={() => router.push('/terms' as any)}>
              {t('login.terms')}
            </Text>{' '}
            and{' '}
            <Text style={styles.termsLink} onPress={() => router.push('/privacy-policy' as any)}>
              {t('login.privacyPolicy')}
            </Text>
            .
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
    alignItems: 'flex-start',
    marginBottom: 10,
    backgroundColor: '#252525',
    padding: 14,
    borderRadius: 12,
  },
  featureText: {
    color: '#FFFFFF',
    fontSize: 15,
    marginLeft: 14,
    flex: 1,
    flexShrink: 1,
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
    textAlign: 'center',
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
  termsLink: {
    color: '#FF6200',
    fontWeight: '700',
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
    flexShrink: 1,
    textAlign: 'center',
  },
  errorText: {
    color: '#F44336',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 12,
  },
});
