import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function PrivacyPolicyScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Privacy Policy</Text>
        <Text style={styles.updated}>Last updated: 2026-03-14</Text>

        <Section title="1. What We Collect">
          We process account data (email, display name), workout and nutrition entries, goals, and app usage data needed to provide core features.
        </Section>

        <Section title="2. How We Use Data">
          Data is used to power workout tracking, nutrition logging, progress analytics, sync, and subscription feature gating.
        </Section>

        <Section title="3. AI Features">
          If you enable AI features, prompt content and AI replies are sent to the configured AI provider for response generation. You can disable AI consent from Profile at any time.
        </Section>

        <Section title="4. Data Sharing">
          We share data only with service providers required to operate GainTrack (for example, authentication, storage, analytics, billing, and AI providers).
        </Section>

        <Section title="5. Data Retention">
          We retain account and app data while your account is active, or as needed to provide services and comply with legal obligations.
        </Section>

        <Section title="6. Your Rights">
          You can request account deletion and data export through in-app controls. Deleting your account permanently removes associated data from active systems, subject to backup retention windows.
        </Section>

        <Section title="7. Security">
          We use transport encryption and access controls designed to protect your data. No system is perfect, but we continuously improve safeguards.
        </Section>

        <Section title="8. Contact">
          For privacy requests, contact the support channel listed in your app store listing.
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.body}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1A1A1A',
  },
  content: {
    padding: 20,
    gap: 14,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
  },
  updated: {
    color: '#B0B0B0',
    fontSize: 13,
  },
  section: {
    backgroundColor: '#252525',
    borderRadius: 12,
    padding: 14,
  },
  sectionTitle: {
    color: '#FF6200',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 8,
  },
  body: {
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 21,
  },
});
