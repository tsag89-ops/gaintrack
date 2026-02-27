import React, { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useAuthStore } from '../src/store/authStore';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './constants/ThemeProvider';

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH

export default function RootLayout() {
  const { isLoading, isAuthenticated, loadStoredAuth } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    loadStoredAuth();
  }, []);

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inTabGroup = segments[0] === '(tabs)';

    if (!isAuthenticated && !inAuthGroup) {
      // Redirect to login
      router.replace('/login');
    } else if (isAuthenticated && inAuthGroup) {
      // Redirect to home
      router.replace('/(tabs)');
    }
  }, [isLoading, isAuthenticated, segments]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#10B981" />
      </View>
    );
  }

  return (
    <ThemeProvider>
      <StatusBar style="light" />
      <AuthProvider>
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
        </Stack>
      </AuthProvider>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: '#111827',
    justifyContent: 'center',
    alignItems: 'center',
  },
});