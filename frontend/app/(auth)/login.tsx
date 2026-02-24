import React, { useState } from 'react';
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../src/store/authStore';

export default function LoginScreen() {
  const router = useRouter();
  const { setUser, setSessionToken, setLoading } = useAuthStore();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLogin = async () => {
    if (!name.trim() || !email.trim()) {
      Alert.alert('Missing Info', 'Please enter your name and email to continue.');
      return;
    }
    if (!email.includes('@')) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.');
      return;
    }
    try {
      setIsSubmitting(true);
      setLoading(true);
      const userId = 'user_' + email.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const sessionToken = 'local_token_' + Date.now();
      const user = {
        user_id: userId,
        email: email.trim().toLowerCase(),
        name: name.trim(),
        picture: null,
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
      await AsyncStorage.setItem('user', JSON.stringify(user));
      await AsyncStorage.setItem('sessionToken', sessionToken);
      setUser(user);
      setSessionToken(sessionToken);
      setLoading(false);
      router.replace('/(tabs)');
    } catch (error) {
      console.error('Login error:', error);
      Alert.alert('Error', 'Something went wrong. Please try again.');
      setLoading(false);
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
              <Ionicons name="fitness" size={60} color="#10B981" />
            </View>
            <Text style={styles.title}>GainTrack</Text>
            <Text style={styles.subtitle}>Your complete fitness companion</Text>
          </View>

          <View style={styles.features}>
            <View style={styles.featureItem}>
              <Ionicons name="barbell-outline" size={24} color="#10B981" />
              <Text style={styles.featureText}>Track workouts & progress</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="restaurant-outline" size={24} color="#3BB2F6" />
              <Text style={styles.featureText}>Log meals & macros</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="trending-up-outline" size={24} color="#F59E0B" />
              <Text style={styles.featureText}>Visualize your gains</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="home-outline" size={24} color="#8B5CF6" />
              <Text style={styles.featureText}>Home gym support</Text>
            </View>
          </View>

          <View style={styles.form}>
            <Text style={styles.formLabel}>Your Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Alex"
              placeholderTextColor="#6B7280"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              autoComplete="name"
            />
            <Text style={styles.formLabel}>Email Address</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. alex@email.com"
              placeholderTextColor="#6B7280"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />
            <TouchableOpacity
              style={[styles.enterButton, isSubmitting && styles.enterButtonDisabled]}
              onPress={handleLogin}
              disabled={isSubmitting}
            >
              <Ionicons name="arrow-forward-circle" size={22} color="#FFFFFF" />
              <Text style={styles.enterButtonText}>
                {isSubmitting ? 'Loading...' : 'Enter GainTrack'}
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.terms}>
            Your data is stored privately on this device only.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
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
    backgroundColor: '#10B98120',
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
    color: '#9CA3AF',
  },
  features: {
    marginBottom: 36,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    backgroundColor: '#1F2937',
    padding: 14,
    borderRadius: 12,
  },
  featureText: {
    color: '#FFFFFF',
    fontSize: 15,
    marginLeft: 14,
  },
  form: {
    marginBottom: 24,
  },
  formLabel: {
    color: '#9CA3AF',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: '#1F2937',
    color: '#FFFFFF',
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#374151',
  },
  enterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
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
    color: '#6B7280',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
});
