import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { authApi } from '../../src/services/api';
import { useAuthStore } from '../../src/store/authStore';

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH

export default function CallbackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const hasProcessed = useRef(false);
  const { setUser, setSessionToken, setLoading } = useAuthStore();

  useEffect(() => {
    const processAuth = async () => {
      // Prevent double processing
      if (hasProcessed.current) return;
      hasProcessed.current = true;

      try {
        // Get session_id from params or URL hash
        let sessionId = params.session_id as string;
        
        if (!sessionId && typeof window !== 'undefined') {
          const hash = window.location.hash;
          const match = hash.match(/session_id=([^&]+)/);
          sessionId = match ? match[1] : '';
        }

        if (!sessionId) {
          console.error('No session_id found');
          router.replace('/login');
          return;
        }

        // Exchange session_id for session data
        const data = await authApi.exchangeSession(sessionId);
        
        // Store user and token
        setUser(data.user);
        setSessionToken(data.session_token);
        
        // Navigate to main app
        router.replace('/(tabs)');
      } catch (error) {
        console.error('Auth callback error:', error);
        router.replace('/login');
      } finally {
        setLoading(false);
      }
    };

    processAuth();
  }, []);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#10B981" />
      <Text style={styles.text}>Signing you in...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    color: '#9CA3AF',
    fontSize: 16,
    marginTop: 16,
  },
});
