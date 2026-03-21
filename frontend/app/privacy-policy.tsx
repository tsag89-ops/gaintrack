import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLanguage } from '../src/context/LanguageContext';

export default function PrivacyPolicyScreen() {
  const { t } = useLanguage();
  const sections = [
    { title: t('privacyPolicy.sections.collect.title'), body: t('privacyPolicy.sections.collect.body') },
    { title: t('privacyPolicy.sections.use.title'), body: t('privacyPolicy.sections.use.body') },
    { title: t('privacyPolicy.sections.ai.title'), body: t('privacyPolicy.sections.ai.body') },
    { title: t('privacyPolicy.sections.sharing.title'), body: t('privacyPolicy.sections.sharing.body') },
    { title: t('privacyPolicy.sections.retention.title'), body: t('privacyPolicy.sections.retention.body') },
    { title: t('privacyPolicy.sections.rights.title'), body: t('privacyPolicy.sections.rights.body') },
    { title: t('privacyPolicy.sections.security.title'), body: t('privacyPolicy.sections.security.body') },
    { title: t('privacyPolicy.sections.contact.title'), body: t('privacyPolicy.sections.contact.body') },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{t('privacyPolicy.title')}</Text>
        <Text style={styles.updated}>{t('privacyPolicy.lastUpdated')}</Text>

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
