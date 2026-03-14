import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function TermsScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Terms of Service</Text>
        <Text style={styles.updated}>Last updated: 2026-03-14</Text>

        <Section title="1. Acceptance">
          By using GainTrack, you agree to these terms. If you do not agree, do not use the app.
        </Section>

        <Section title="2. Fitness and Health Disclaimer">
          GainTrack provides informational tools only and is not medical advice. You are responsible for your training, nutrition, and health decisions.
        </Section>

        <Section title="3. Account and Security">
          You are responsible for keeping your account credentials secure and for activity under your account.
        </Section>

        <Section title="4. Subscriptions">
          Paid features are provided through in-app subscriptions. Billing, renewals, and refunds are handled by the platform store and subscription provider policies.
        </Section>

        <Section title="5. Acceptable Use">
          You agree not to abuse, interfere with, reverse engineer, or misuse the service, including attempting unauthorized access.
        </Section>

        <Section title="6. Termination">
          We may suspend or terminate access for violations of these terms or service abuse.
        </Section>

        <Section title="7. Liability Limitation">
          To the maximum extent permitted by law, GainTrack is provided as-is without warranties, and liability is limited for indirect or consequential damages.
        </Section>

        <Section title="8. Changes">
          We may update these terms. Continued use after updates means you accept the revised terms.
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
