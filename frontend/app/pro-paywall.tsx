// app/pro-paywall.tsx
// [PRO] Paywall screen — displayed when the user taps "Go Pro" on Profile.
//
// Uses RevenueCatUI.Paywall which automatically loads the "default" offering
// you configured in the RevenueCat dashboard. No extra code needed for pricing
// — design the paywall entirely from the RevenueCat dashboard UI.

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import RevenueCatUI, { type PAYWALL_RESULT } from 'react-native-purchases-ui';
import type { PurchasesError } from 'react-native-purchases';

export default function ProPaywallScreen() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function handleDismiss() {
    router.back();
  }

  function handlePurchaseCompleted() {
    // Purchase succeeded — navigate back so profile.tsx re-fetches isPro.
    router.back();
  }

  function handlePurchaseError({ error: purchaseError }: { error: PurchasesError }) {
    setError((purchaseError as any)?.message ?? 'Purchase failed. Please try again.');
  }

  if (error) {
    return (
      <SafeAreaView style={styles.center}>
        <Ionicons name="alert-circle-outline" size={48} color="#F44336" />
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => setError(null)}>
          <Text style={styles.retryText}>Try Again</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.backButton} onPress={handleDismiss}>
          <Text style={styles.backText}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Loading overlay — shown until RevenueCatUI.Paywall signals it's ready */}
      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#FF6200" />
          <Text style={styles.loadingText}>Loading plans…</Text>
        </View>
      )}

      {/*
        RevenueCatUI.Paywall renders your RevenueCat "default" offering.
        Go to app.revenuecat.com → Paywalls to design it — no code changes needed.
      */}
      <RevenueCatUI.Paywall
        onDismiss={handleDismiss}
        onPurchaseCompleted={handlePurchaseCompleted}
        onPurchaseError={handlePurchaseError}
        onPurchaseCancelled={handleDismiss}
        style={{ flex: 1 }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1A1A1A',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#1A1A1A',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  loadingText: {
    color: '#B0B0B0',
    marginTop: 12,
    fontSize: 14,
  },
  center: {
    flex: 1,
    backgroundColor: '#1A1A1A',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  errorText: {
    color: '#F44336',
    fontSize: 15,
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 28,
    lineHeight: 22,
  },
  retryButton: {
    backgroundColor: '#FF6200',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 12,
    width: '100%',
    alignItems: 'center',
  },
  retryText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  backButton: {
    paddingVertical: 14,
    width: '100%',
    alignItems: 'center',
  },
  backText: {
    color: '#B0B0B0',
    fontSize: 15,
  },
});

