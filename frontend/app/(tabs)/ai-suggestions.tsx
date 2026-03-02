// app/(tabs)/ai-suggestions.tsx

import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  SafeAreaView,
  Platform,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type TabKey = 'workout' | 'exercises' | 'nutrition' | 'programs';

interface TabConfig {
  key: TabKey;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  system: string;
  prompt: string;
}

const TABS: TabConfig[] = [
  {
    key: 'workout',
    label: 'Workout',
    icon: 'barbell-outline',
    system: 'You are an expert personal trainer. Give concise, actionable advice.',
    prompt: 'Suggest today\'s workout based on lean bulking for 80kg male',
  },
  {
    key: 'exercises',
    label: 'Exercises',
    icon: 'fitness-outline',
    system: 'You are a strength and conditioning coach. Be specific and practical.',
    prompt: 'Suggest 5 exercises to complement a push day',
  },
  {
    key: 'nutrition',
    label: 'Nutrition',
    icon: 'nutrition-outline',
    system: 'You are a sports nutritionist. Give clear macro targets.',
    prompt: 'Suggest macro split for lean bulking 80kg male',
  },
  {
    key: 'programs',
    label: 'Programs',
    icon: 'calendar-outline',
    system: 'You are a programming expert for strength training. Be structured.',
    prompt: 'Suggest a 4-week progressive overload program',
  },
];

export default function AISuggestionsScreen() {
  const [activeTab, setActiveTab] = useState<TabKey>('workout');
  const [responses, setResponses] = useState<Partial<Record<TabKey, string>>>({});
  const [loading, setLoading] = useState<Partial<Record<TabKey, boolean>>>({});
  const [errors, setErrors] = useState<Partial<Record<TabKey, string>>>({});

  const currentTab = TABS.find((t) => t.key === activeTab)!;

  const generate = async () => {
    setLoading((prev) => ({ ...prev, [activeTab]: true }));
    setErrors((prev) => ({ ...prev, [activeTab]: undefined }));
    try {
      const res = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: currentTab.prompt,
          system: currentTab.system,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Request failed');
      const text: string =
        data?.choices?.[0]?.message?.content ?? 'No response received.';
      setResponses((prev) => ({ ...prev, [activeTab]: text }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      setErrors((prev) => ({ ...prev, [activeTab]: msg }));
    } finally {
      setLoading((prev) => ({ ...prev, [activeTab]: false }));
    }
  };

  const isLoading = !!loading[activeTab];
  const response = responses[activeTab];
  const error = errors[activeTab];

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#1A1A1A" />

      {/* ── Header ── */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>AI Suggestions</Text>
        <View style={styles.betaBadge}>
          <Text style={styles.betaText}>BETA</Text>
        </View>
      </View>

      {/* ── Section tabs ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabBar}
      >
        {TABS.map((tab) => {
          const active = tab.key === activeTab;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tabChip, active && styles.tabChipActive]}
              onPress={() => setActiveTab(tab.key)}
              activeOpacity={0.75}
            >
              <Ionicons
                name={tab.icon}
                size={15}
                color={active ? '#FF6200' : '#B0B0B0'}
                style={{ marginRight: 5 }}
              />
              <Text style={[styles.tabChipText, active && styles.tabChipTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── Content ── */}
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Prompt preview card */}
        <View style={styles.promptCard}>
          <Text style={styles.promptLabel}>Prompt</Text>
          <Text style={styles.promptText}>{currentTab.prompt}</Text>
        </View>

        {/* Generate button */}
        <TouchableOpacity
          style={[styles.generateBtn, isLoading && styles.generateBtnDisabled]}
          onPress={generate}
          disabled={isLoading}
          activeOpacity={0.8}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="sparkles" size={17} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.generateBtnText}>Generate</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Error state */}
        {error && !isLoading && (
          <View style={styles.errorCard}>
            <Ionicons name="alert-circle-outline" size={18} color="#F44336" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Loading state */}
        {isLoading && (
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color="#FF6200" />
            <Text style={styles.loadingText}>Thinking…</Text>
          </View>
        )}

        {/* Response card */}
        {response && !isLoading && (
          <View style={styles.responseCard}>
            <View style={styles.responseHeader}>
              <Ionicons name="sparkles" size={14} color="#FF6200" />
              <Text style={styles.responseHeaderText}>AI Response</Text>
            </View>
            <Text style={styles.responseText}>{response}</Text>
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#1A1A1A',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#252525',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
  },
  betaBadge: {
    backgroundColor: '#FF620022',
    borderWidth: 1,
    borderColor: '#FF620055',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  betaText: {
    color: '#FF6200',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  tabBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  tabChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#252525',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tabChipActive: {
    borderColor: '#FF6200',
    backgroundColor: '#FF620015',
  },
  tabChipText: {
    color: '#B0B0B0',
    fontSize: 13,
    fontWeight: '600',
  },
  tabChipTextActive: {
    color: '#FF6200',
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  promptCard: {
    backgroundColor: '#252525',
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
  },
  promptLabel: {
    color: '#B0B0B0',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  promptText: {
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 20,
  },
  generateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF6200',
    borderRadius: 12,
    paddingVertical: 14,
    marginBottom: 16,
  },
  generateBtnDisabled: {
    opacity: 0.6,
  },
  generateBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#F4433615',
    borderWidth: 1,
    borderColor: '#F4433633',
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
  },
  errorText: {
    color: '#F44336',
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },
  loadingCard: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 32,
  },
  loadingText: {
    color: '#B0B0B0',
    fontSize: 14,
  },
  responseCard: {
    backgroundColor: '#252525',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#FF620033',
  },
  responseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  responseHeaderText: {
    color: '#FF6200',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  responseText: {
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 22,
  },
});

