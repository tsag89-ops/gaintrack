import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, TouchableOpacity, View, Text } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useNativeAuthState } from '../src/hooks/useAuth';
import { AuthProvider } from '../src/context/AuthContext';
import { ThemeProvider } from '../src/constants/ThemeProvider';
import AuthSplash from '../src/components/AuthSplash';
import { initRevenueCat } from '../src/services/revenueCat'; // [PRO]
import { colors } from '../src/constants/theme';

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: string }
> {
  state = { hasError: false, error: '' };
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }
  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, justifyContent: 'center',
                       alignItems: 'center', backgroundColor: '#000', padding: 20 }}>
          <Text style={{ color: '#FF6200', fontSize: 18,
                         fontWeight: 'bold', marginBottom: 12 }}>
            Something went wrong
          </Text>
          <Text style={{ color: '#fff', fontSize: 13,
                         textAlign: 'center', marginBottom: 24 }}>
            {this.state.error}
          </Text>
          <TouchableOpacity onPress={() => this.setState({ hasError: false, error: '' })}>
            <Text style={{ color: '#FF6200' }}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH

export default function RootLayout() {
  const { status } = useNativeAuthState();
  const segments = useSegments();
  const router = useRouter();
  // Prevent hydration mismatch (#418): auth state is unknown during SSR;
  // defer conditional rendering until after client mount.
  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => { setHasMounted(true); }, []);

  // [PRO] Initialise RevenueCat once on app start (anonymous session).
  // The API key is read from EXPO_PUBLIC_REVENUECAT_API_KEY in your .env file.
  // A userId is NOT passed here — RevenueCat generates an anonymous ID.
  // To link purchases to a logged-in user, call identifyUser(userId) from
  // src/services/revenueCat.ts after authentication succeeds.
  useEffect(() => {
    // Only initialize RevenueCat on native platforms — web billing requires a
    // different key and RevenueCat.configure() crashes on web.
    if (Platform.OS !== 'web') {
      initRevenueCat();
    }
  }, []);

  useEffect(() => {
    // While the bridge is resolving, hold — never redirect on 'loading'.
    if (status === 'loading') return;

    const inAuthGroup = segments[0] === '(auth)';

    if (status === 'unauthenticated' && !inAuthGroup) {
      router.replace('/login');
    } else if (status === 'authenticated' && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [status, segments]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <ThemeProvider>
      <AuthProvider>
        <StatusBar style="light" />
        {/* Stack always renders so expo-router can mark navigation ready
            and dismiss the native splash screen automatically.
            backgroundColor on screenOptions prevents the SSR default
            rgba(242,242,242) from causing a React #418 hydration mismatch. */}
        <ErrorBoundary>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="workout/[id]" options={{ presentation: 'card' }} />
          <Stack.Screen name="workout/new" options={{ presentation: 'modal' }} />
          <Stack.Screen name="add-food" options={{ presentation: 'modal' }} />
          <Stack.Screen name="programs" options={{ presentation: 'card' }} />
          <Stack.Screen name="progression" options={{ presentation: 'card' }} />
          <Stack.Screen name="measurements" options={{ presentation: 'card' }} />
          <Stack.Screen name="notifications" options={{ presentation: 'card' }} />
          <Stack.Screen name="body-composition-goal" options={{ presentation: 'card' }} />
          <Stack.Screen name="body-goals" options={{ presentation: 'card' }} />
          <Stack.Screen name="pro-paywall" options={{ presentation: 'modal', headerShown: false }} />
        </Stack>
        </ErrorBoundary>
        {/* AuthSplash overlays on top while auth is still resolving, preventing
            any auth-gated screen from flashing before the redirect fires.
            `hasMounted` guard ensures the SSR HTML (no overlay) matches the
            first client render, preventing React hydration mismatch #418. */}
        {hasMounted && status === 'loading' && (
          <View style={StyleSheet.absoluteFill}>
            <AuthSplash />
          </View>
        )}
      </AuthProvider>
    </ThemeProvider>
    </GestureHandlerRootView>
  );
}

