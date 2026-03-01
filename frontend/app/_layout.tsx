import React, { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useNativeAuthState } from '../src/hooks/useAuth';
import { AuthProvider } from '../src/context/AuthContext';
import { ThemeProvider } from '../src/constants/ThemeProvider';
import AuthSplash from '../src/components/AuthSplash';
import { initRevenueCat } from '../src/services/revenueCat'; // [PRO]

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH

export default function RootLayout() {
  const { status } = useNativeAuthState();
  const segments = useSegments();
  const router = useRouter();

  // [PRO] Initialise RevenueCat once on app start (anonymous session).
  // The API key is read from EXPO_PUBLIC_REVENUECAT_API_KEY in your .env file.
  // A userId is NOT passed here — RevenueCat generates an anonymous ID.
  // To link purchases to a logged-in user, call identifyUser(userId) from
  // src/services/revenueCat.ts after authentication succeeds.
  useEffect(() => {
    initRevenueCat();
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
        {status === 'loading' ? (
          // Hold on the splash/loader so neither stack flashes during bridge init
          <AuthSplash />
        ) : (
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="workout/[id]" options={{ presentation: 'card' }} />
            <Stack.Screen name="workout/new" options={{ presentation: 'modal' }} />
            <Stack.Screen name="add-food" options={{ presentation: 'modal' }} />
            <Stack.Screen name="programs" options={{ presentation: 'card' }} />
            <Stack.Screen name="progression" options={{ presentation: 'card' }} />
            <Stack.Screen name="measurements" options={{ presentation: 'card' }} />
            <Stack.Screen name="notifications" options={{ presentation: 'card' }} />
            <Stack.Screen name="pro-paywall" options={{ presentation: 'modal', headerShown: false }} />
          </Stack>
        )}
      </AuthProvider>
    </ThemeProvider>
    </GestureHandlerRootView>
  );
}

