import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLanguage } from '../src/context/LanguageContext';

export default function TermsScreen() {
  const { t } = useLanguage();
  const sections = [
    { title: t('terms.sections.acceptance.title'), body: t('terms.sections.acceptance.body') },
    { title: t('terms.sections.disclaimer.title'), body: t('terms.sections.disclaimer.body') },
    { title: t('terms.sections.account.title'), body: t('terms.sections.account.body') },
    { title: t('terms.sections.subscriptions.title'), body: t('terms.sections.subscriptions.body') },
    { title: t('terms.sections.use.title'), body: t('terms.sections.use.body') },
    { title: t('terms.sections.termination.title'), body: t('terms.sections.termination.body') },
    { title: t('terms.sections.liability.title'), body: t('terms.sections.liability.body') },
    { title: t('terms.sections.changes.title'), body: t('terms.sections.changes.body') },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{t('terms.title')}</Text>
        <Text style={styles.updated}>{t('terms.lastUpdated')}</Text>

        {sections.map((section) => (
          <Section key={section.title} title={section.title}>
            {section.body}
          </Section>
        ))}
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
