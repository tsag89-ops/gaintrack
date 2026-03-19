import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../src/store/authStore';
import { useLanguage } from '../../src/context/LanguageContext';

// Callback screen: checks if user is already logged in via local storage.
// With the new local auth flow, login happens directly in login.tsx.
// This screen safely redirects authenticated users to the app,
// or unauthenticated users back to login.
export default function CallbackScreen() {
  const router = useRouter();
  const { t } = useLanguage();
  const { isAuthenticated, isLoading } = useAuthStore();

  useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated) {
      router.replace('/(tabs)');
    } else {
      router.replace('/login');
    }
  }, [isAuthenticated, isLoading]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#4CAF50" />
      <Text style={styles.text}>{t('authCallback.loading')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1A1A1A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    color: '#B0B0B0',
    fontSize: 16,
    marginTop: 16,
  },
});
