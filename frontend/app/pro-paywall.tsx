// app/pro-paywall.tsx
// [PRO] Paywall screen — displayed when the user taps "Go Pro" on Profile.
//
// Uses RevenueCatUI.Paywall which automatically loads the "default" offering
// you configured in the RevenueCat dashboard. No extra code needed for pricing
// — design the paywall entirely from the RevenueCat dashboard UI.

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import RevenueCatUI from 'react-native-purchases-ui';
import type { PurchasesError } from 'react-native-purchases';
import type { CustomerInfo } from 'react-native-purchases';
import { sendPaywallTelemetry } from '../src/services/notifications';
import {
  buildPaywallExperimentContext,
  getPaywallExperimentAssignment,
  getPaywallVariantCopy,
  type PaywallExperimentAssignment,
} from '../src/services/paywallExperiment';

export default function ProPaywallScreen() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [assignment, setAssignment] = useState<PaywallExperimentAssignment | null>(null);

  useEffect(() => {
    let cancelled = false;

    const bootstrapPaywallExperiment = async () => {
      const resolvedAssignment = await getPaywallExperimentAssignment();
      if (cancelled) {
        return;
      }

      setAssignment(resolvedAssignment);
      sendPaywallTelemetry({
        feature: 'pro_paywall',
        placement: 'full_screen_paywall',
        eventType: 'view',
        context: buildPaywallExperimentContext('screen_mount', resolvedAssignment),
      }).catch(() => null);
    };

    bootstrapPaywallExperiment().catch(() => null);

    return () => {
      cancelled = true;
    };
  }, []);

  function handleDismiss(reason: 'dismiss' | 'cancel' = 'dismiss') {
    if (assignment) {
      sendPaywallTelemetry({
        feature: 'pro_paywall',
        placement: 'full_screen_paywall',
        eventType: 'dismiss',
        context: buildPaywallExperimentContext(reason, assignment),
      }).catch(() => null);
    }
    router.back();
  }

  function handlePurchaseCompleted({ customerInfo }: { customerInfo: CustomerInfo }) {
    // customerInfo already has the updated entitlements — no extra fetch needed.
    // Navigating back triggers useFocusEffect in profile.tsx which calls refresh().
    sendPaywallTelemetry({
      feature: 'pro_paywall',
      placement: 'full_screen_paywall',
      eventType: 'purchase_completed',
      context: assignment
        ? buildPaywallExperimentContext(
            Object.keys(customerInfo?.entitlements?.active ?? {}).join(',') || 'unknown',
            assignment,
          )
        : Object.keys(customerInfo?.entitlements?.active ?? {}).join(',') || 'unknown',
    }).catch(() => null);
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
      <View style={styles.copyCard}>
        <Text style={styles.copyTitle}>{getPaywallVariantCopy(assignment?.variant ?? 'value_first').title}</Text>
        <Text style={styles.copySubtitle}>{getPaywallVariantCopy(assignment?.variant ?? 'value_first').subtitle}</Text>
      </View>
      {/*
        RevenueCatUI.Paywall renders your RevenueCat "default" offering.
        Go to app.revenuecat.com → Paywalls to design it — no code changes needed.
      */}
      <RevenueCatUI.Paywall
        onDismiss={() => handleDismiss('dismiss')}
        onPurchaseCompleted={handlePurchaseCompleted}
        onPurchaseError={handlePurchaseError}
        onPurchaseCancelled={() => handleDismiss('cancel')}
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
  copyCard: {
    backgroundColor: '#252525',
    borderBottomWidth: 1,
    borderBottomColor: '#2D2D2D',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
  },
  copyTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  copySubtitle: {
    color: '#B0B0B0',
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
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

