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
  TextInput,
} from 'react-native';
import Constants from 'expo-constants';

function getApiUrl(): string {
  if (Platform.OS === 'web') return '/api/ai-chat';
  const host =
    Constants.expoConfig?.hostUri ??
    Constants.manifest2?.extra?.expoClient?.hostUri ??
    'localhost:8081';
  return `http://${host.split(':')[0]}:8081/api/ai-chat`;
}

const TABS = ['Workout', 'Exercises', 'Nutrition', 'Programs'];

const PROMPTS: Record<string, { system: string; prompt: string }> = {
  Workout: {
    system: 'You are a fitness coach AI for GainTrack app.',
    prompt: 'Suggest a lean bulk workout for today for an 80kg male.',
  },
  Exercises: {
    system: 'You are a fitness coach AI for GainTrack app.',
    prompt: 'Suggest 5 exercises to complement a push day.',
  },
  Nutrition: {
    system: 'You are a nutrition coach AI for GainTrack app.',
    prompt: 'Suggest a macro split for lean bulking at 80kg.',
  },
  Programs: {
    system: 'You are a fitness coach AI for GainTrack app.',
    prompt: 'Suggest a 4-week progressive overload program.',
  },
};

export default function AISuggestions() {
  const [activeTab, setActiveTab] = useState('Workout');
  const [customPrompt, setCustomPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState('');
  const [error, setError] = useState('');

  const generate = async () => {
    setLoading(true);
    setError('');
    setResponse('');
    const payload = customPrompt.trim()
      ? { system: PROMPTS[activeTab].system, prompt: customPrompt.trim() }
      : PROMPTS[activeTab];
    try {
      const res = await fetch(getApiUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data?.choices?.[0]?.message?.content) {
        setResponse(data.choices[0].message.content);
      } else {
        setError('No response from AI. Try again.');
      }
    } catch (e: any) {
      setError(e.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>AI Suggestions</Text>

      <View style={styles.tabRow}>
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => { setActiveTab(tab); setResponse(''); }}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <TextInput
        style={styles.input}
        placeholder={`Ask anything about ${activeTab.toLowerCase()}…`}
        placeholderTextColor="#B0B0B0"
        value={customPrompt}
        onChangeText={setCustomPrompt}
        multiline
        numberOfLines={2}
        returnKeyType="done"
      />

      <TouchableOpacity style={styles.button} onPress={generate} disabled={loading}>
        {loading
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.buttonText}>Generate</Text>
        }
      </TouchableOpacity>

      <ScrollView style={styles.responseBox}>
        {error
          ? <Text style={styles.errorText}>{error}</Text>
          : <Text style={styles.responseText}>{response}</Text>
        }
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: '#1A1A1A', padding: 16 },
  title:           { color: '#fff', fontSize: 22, fontWeight: '700', marginBottom: 16 },
  tabRow:          { flexDirection: 'row', marginBottom: 16, gap: 8 },
  tab:             { flex: 1, padding: 8, borderRadius: 8, backgroundColor: '#252525', alignItems: 'center' },
  tabActive:       { backgroundColor: '#FF6200' },
  tabText:         { color: '#B0B0B0', fontSize: 12, fontWeight: '600' },
  tabTextActive:   { color: '#fff' },
  button:          { backgroundColor: '#FF6200', padding: 14, borderRadius: 10, alignItems: 'center', marginBottom: 16 },
  buttonText:      { color: '#fff', fontWeight: '700', fontSize: 16 },
  input:           { backgroundColor: '#252525', color: '#FFFFFF', borderRadius: 10, borderWidth: 1, borderColor: '#3A3A3A', padding: 12, marginBottom: 12, fontSize: 14, minHeight: 56, textAlignVertical: 'top' },
  responseBox:     { flex: 1, backgroundColor: '#252525', borderRadius: 10, padding: 12 },
  responseText:    { color: '#FFFFFF', fontSize: 14, lineHeight: 22 },
  errorText:       { color: '#F44336', fontSize: 14 },
});




