// app/(tabs)/ai-suggestions.tsx
// AI Coach chat tab — context-aware prompts, conversation history,
// markdown rendering, typing indicator, smart errors, free/pro gating.

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Platform,
  Animated,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { format } from 'date-fns';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import Markdown from 'react-native-markdown-display';
import { useAuthStore } from '../../src/store/authStore';
import { usePro } from '../../src/hooks/usePro';
import type { BodyCompositionGoals } from '../../src/types/bodyGoals';

// ── Constants ──────────────────────────────────────────────────────────────────
const AI_HISTORY_KEY   = 'gaintrack_ai_history';
const AI_USAGE_KEY     = 'gaintrack_ai_usage';
const BODY_GOALS_KEY   = 'gaintrack_body_goals';
const BODYWEIGHT_KEY   = 'gaintrack_bodyweight';
const MEASUREMENTS_KEY = 'gaintrack_measurements';
const WORKOUTS_KEY     = 'gaintrack_workouts';
const NUTRITION_KEY    = 'gaintrack_nutrition';
const FREE_LIMIT       = 5;
const MAX_CONTEXT      = 10;
const MAX_HISTORY      = 20;

// ── Types ──────────────────────────────────────────────────────────────────────
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'error';
  content: string;   // error role: stores original prompt for retry
  errorType?: 'network' | 'rate_limit' | 'no_api_key' | 'unknown';
  timestamp: number;
}

interface DailyUsage {
  date: string;
  count: number;
}

// ── Quick suggestion chips ─────────────────────────────────────────────────────
const CHIPS = [
  'Analyze my workout this week',
  'Am I hitting my protein goals?',
  'Suggest a workout for today',
  'Am I on track for my body goal?',
] as const;

// ── API URL helper ─────────────────────────────────────────────────────────────
function getApiUrl(): string {
  if (Platform.OS === 'web') return '/api/ai-chat';
  const host =
    Constants.expoConfig?.hostUri ??
    (Constants as any).manifest2?.extra?.expoClient?.hostUri ??
    'localhost:8081';
  return `http://${host.split(':')[0]}:8081/api/ai-chat`;
}

// ── Typing indicator ───────────────────────────────────────────────────────────
function TypingIndicator() {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim1 = Animated.loop(
      Animated.sequence([
        Animated.timing(dot1, { toValue: -7, duration: 280, useNativeDriver: true }),
        Animated.timing(dot1, { toValue: 0,  duration: 280, useNativeDriver: true }),
      ]),
    );
    const anim2 = Animated.loop(
      Animated.sequence([
        Animated.timing(dot2, { toValue: -7, duration: 280, useNativeDriver: true }),
        Animated.timing(dot2, { toValue: 0,  duration: 280, useNativeDriver: true }),
      ]),
    );
    const anim3 = Animated.loop(
      Animated.sequence([
        Animated.timing(dot3, { toValue: -7, duration: 280, useNativeDriver: true }),
        Animated.timing(dot3, { toValue: 0,  duration: 280, useNativeDriver: true }),
      ]),
    );
    const t1 = setTimeout(() => anim1.start(), 0);
    const t2 = setTimeout(() => anim2.start(), 140);
    const t3 = setTimeout(() => anim3.start(), 280);
    return () => {
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);
      anim1.stop(); anim2.stop(); anim3.stop();
    };
  }, [dot1, dot2, dot3]);

  return (
    <View style={styles.typingBubble}>
      {([dot1, dot2, dot3] as Animated.Value[]).map((dot, i) => (
        <Animated.View key={i} style={[styles.typingDot, { transform: [{ translateY: dot }] }]} />
      ))}
    </View>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────────
export default function AISuggestions() {
  const router    = useRouter();
  const { user }  = useAuthStore();
  const { isPro } = usePro();

  // Chat state
  const [messages,    setMessages]    = useState<ChatMessage[]>([]);
  const [input,       setInput]       = useState('');
  const [isLoading,   setIsLoading]   = useState(false);
  const [dailyUsage,  setDailyUsage]  = useState<DailyUsage>({ date: '', count: 0 });

  // Context data for system prompt
  const [bodyGoals,       setBodyGoals]       = useState<BodyCompositionGoals | null>(null);
  const [latestBodyWt,    setLatestBodyWt]     = useState<number | null>(null);
  const [recentWorkouts,  setRecentWorkouts]   = useState<any[]>([]);
  const [recentNutrition, setRecentNutrition]  = useState<any[]>([]);

  const scrollRef    = useRef<ScrollView>(null);
  const today        = format(new Date(), 'yyyy-MM-dd');
  const canSend      = isPro || dailyUsage.count < FREE_LIMIT;
  const chipsVisible = messages.length === 0 && !isLoading;

  // ── Load all data on mount ─────────────────────────────────────────────────
  useEffect(() => { loadAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-scroll when messages change ──────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(t);
  }, [messages, isLoading]);

  const loadAll = async () => {
    try {
      const [histRaw, usageRaw, goalsRaw, bwRaw, mRaw, wRaw, nRaw] = await Promise.all([
        AsyncStorage.getItem(AI_HISTORY_KEY),
        AsyncStorage.getItem(AI_USAGE_KEY),
        AsyncStorage.getItem(BODY_GOALS_KEY),
        AsyncStorage.getItem(BODYWEIGHT_KEY),
        AsyncStorage.getItem(MEASUREMENTS_KEY),
        AsyncStorage.getItem(WORKOUTS_KEY),
        AsyncStorage.getItem(NUTRITION_KEY),
      ]);

      if (histRaw)  setMessages(JSON.parse(histRaw));

      if (usageRaw) {
        const u: DailyUsage = JSON.parse(usageRaw);
        setDailyUsage(u.date === today ? u : { date: today, count: 0 });
      } else {
        setDailyUsage({ date: today, count: 0 });
      }

      if (goalsRaw) setBodyGoals(JSON.parse(goalsRaw));

      // Body weight: try gaintrack_bodyweight, fall back to measurements
      let bw: number | null = null;
      if (bwRaw) {
        const parsed = JSON.parse(bwRaw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const sorted = [...parsed].sort(
            (a: any, b: any) => (b.date ?? '').localeCompare(a.date ?? ''),
          );
          bw = sorted[0]?.weight ?? sorted[0]?.value ?? null;
        } else if (typeof parsed === 'number') {
          bw = parsed;
        }
      }
      if (bw === null && mRaw) {
        const mArr: any[] = JSON.parse(mRaw);
        if (mArr.length > 0) {
          const sorted = [...mArr].sort((a, b) => b.date.localeCompare(a.date));
          bw = sorted[0]?.weight ?? sorted[0]?.bodyweight ?? null;
        }
      }
      setLatestBodyWt(bw);

      if (wRaw) {
        const wArr: any[] = JSON.parse(wRaw);
        setRecentWorkouts(
          [...wArr]
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .slice(0, 3),
        );
      }
      if (nRaw) {
        const nArr: any[] = JSON.parse(nRaw);
        setRecentNutrition(
          [...nArr]
            .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
            .slice(0, 3),
        );
      }
    } catch (e) {
      console.error('[AISuggestions] loadAll error:', e);
    }
  };

  // ── Build context-aware system prompt ─────────────────────────────────────
  const buildSystemPrompt = useCallback((): string => {
    const weeklyGoal   = bodyGoals?.weeklyWeightChangeGoal ?? 0;
    const derivedPhase = weeklyGoal < -0.25 ? 'Cutting' : weeklyGoal > 0.1 ? 'Bulking' : 'Maintenance';
    const wUnit        = (user as any)?.units?.weight ?? 'kg';

    return `You are GainTrack AI, a personal fitness and nutrition coach.

User profile:
- Name: ${user?.name ?? 'User'}
- Goals: ${JSON.stringify(user?.goals ?? {})}
- Equipment: ${(user as any)?.equipment?.join(', ') || 'not set'}
- Units: ${wUnit}

Body composition goals:
- Current weight: ${latestBodyWt != null ? `${latestBodyWt} ${wUnit}` : 'not logged'}
- Target weight: ${bodyGoals?.targetWeight ?? 'not set'}
- Current body fat: ${bodyGoals?.currentBodyFatPercent ?? 'not set'}%
- Target body fat: ${bodyGoals?.targetBodyFatPercent ?? 'not set'}%
- Weekly change goal: ${bodyGoals?.weeklyWeightChangeGoal ?? 'not set'} ${wUnit}/week
- Phase: ${derivedPhase}
- Projected goal date: ${bodyGoals?.targetDate ?? 'not set'}

Recent workouts (last 3): ${JSON.stringify(recentWorkouts)}
Recent nutrition (last 3 days): ${JSON.stringify(recentNutrition)}

Always give specific, personalized advice referencing the user's actual data, current phase, and progress toward their body composition goal. Never give generic responses.`;
  }, [user, bodyGoals, latestBodyWt, recentWorkouts, recentNutrition]);

  // ── Send message ───────────────────────────────────────────────────────────
  const sendMessage = async (promptText?: string) => {
    const text = (promptText ?? input).trim();
    if (!text || isLoading || !canSend) return;

    setInput('');
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const userMsg: ChatMessage = {
      id: `${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);

    // Track usage for free users
    if (!isPro) {
      const newUsage: DailyUsage = { date: today, count: dailyUsage.count + 1 };
      setDailyUsage(newUsage);
      AsyncStorage.setItem(AI_USAGE_KEY, JSON.stringify(newUsage)).catch(() => {});
    }

    setIsLoading(true);

    // Build API context (last MAX_CONTEXT non-error messages)
    const context = newMessages
      .filter((m) => m.role !== 'error')
      .slice(-MAX_CONTEXT)
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    try {
      const res = await fetch(getApiUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system: buildSystemPrompt(),
          messages: context,
          prompt: text,
        }),
      });

      if (res.status === 429) {
        throw Object.assign(new Error('rate_limit'), { errorType: 'rate_limit' as const });
      }
      if (res.status === 401 || res.status === 403) {
        throw Object.assign(new Error('no_api_key'), { errorType: 'no_api_key' as const });
      }
      if (!res.ok) {
        throw Object.assign(new Error('unknown'), { errorType: 'unknown' as const });
      }

      const data = await res.json();
      const content: string | undefined = data?.choices?.[0]?.message?.content;
      if (!content) throw Object.assign(new Error('unknown'), { errorType: 'unknown' as const });

      const aiMsg: ChatMessage = {
        id: `${Date.now() + 1}`,
        role: 'assistant',
        content,
        timestamp: Date.now(),
      };
      const finalMessages = [...newMessages, aiMsg];
      setMessages(finalMessages);
      AsyncStorage.setItem(
        AI_HISTORY_KEY,
        JSON.stringify(finalMessages.slice(-MAX_HISTORY)),
      ).catch(() => {});
    } catch (e: any) {
      const errorType: ChatMessage['errorType'] = e?.errorType ?? 'network';
      const errMsg: ChatMessage = {
        id: `${Date.now() + 1}`,
        role: 'error',
        content: text,   // store prompt for retry
        errorType,
        timestamp: Date.now(),
      };
      setMessages([...newMessages, errMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  // ── Retry an error message ─────────────────────────────────────────────────
  const retryMessage = (originalPrompt: string) => {
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      return last?.role === 'error' ? prev.slice(0, -1) : prev;
    });
    sendMessage(originalPrompt);
  };

  // ── Clear chat ─────────────────────────────────────────────────────────────
  const clearChat = async () => {
    setMessages([]);
    await AsyncStorage.removeItem(AI_HISTORY_KEY);
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const showUpgradeCard = !isPro && dailyUsage.count >= FREE_LIMIT;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>AI Coach</Text>
          {isPro && (
            <View style={styles.proBadge}>
              <Text style={styles.proBadgeText}>PRO</Text>
            </View>
          )}
        </View>
        {messages.length > 0 && (
          <TouchableOpacity
            onPress={clearChat}
            style={styles.clearBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="trash-outline" size={20} color="#B0B0B0" />
          </TouchableOpacity>
        )}
      </View>

      {/* Message list */}
      <ScrollView
        ref={scrollRef}
        style={styles.messages}
        contentContainerStyle={styles.messagesContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Quick chips (shown when chat is empty) */}
        {chipsVisible && (
          <View style={styles.chips}>
            <Text style={styles.chipsLabel}>Quick prompts</Text>
            <View style={styles.chipsRow}>
              {CHIPS.map((chip) => (
                <TouchableOpacity
                  key={chip}
                  style={styles.chip}
                  onPress={() => sendMessage(chip)}
                >
                  <Text style={styles.chipText}>{chip}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Messages */}
        {messages.map((msg) => {
          if (msg.role === 'user') {
            return (
              <View key={msg.id} style={styles.userRow}>
                <View style={styles.userBubble}>
                  <Text style={styles.userText}>{msg.content}</Text>
                </View>
              </View>
            );
          }

          if (msg.role === 'error') {
            const canRetry = msg.errorType !== 'no_api_key';
            return (
              <View key={msg.id} style={styles.aiRow}>
                <TouchableOpacity
                  style={styles.errorBubble}
                  onPress={() => canRetry && retryMessage(msg.content)}
                  disabled={!canRetry}
                  activeOpacity={canRetry ? 0.7 : 1}
                >
                  <Ionicons name="warning-outline" size={16} color="#F44336" />
                  <Text style={styles.errorText}>
                    {msg.errorType === 'rate_limit'
                      ? 'Too many requests — try again in 30 seconds'
                      : msg.errorType === 'no_api_key'
                      ? 'AI not configured. Contact support.'
                      : msg.errorType === 'network'
                      ? "Couldn't reach AI. Tap to retry."
                      : 'Something went wrong. Tap to retry.'}
                  </Text>
                </TouchableOpacity>
              </View>
            );
          }

          // assistant — rendered as markdown
          return (
            <View key={msg.id} style={styles.aiRow}>
              <View style={styles.aiBubble}>
                <Markdown style={markdownStyles}>{msg.content}</Markdown>
              </View>
            </View>
          );
        })}

        {/* Typing indicator */}
        {isLoading && (
          <View style={styles.aiRow}>
            <TypingIndicator />
          </View>
        )}
      </ScrollView>

      {/* Free usage counter */}
      {!isPro && !showUpgradeCard && (
        <View style={styles.usageBar}>
          <Text style={styles.usageText}>
            {dailyUsage.count} / {FREE_LIMIT} AI messages used today
          </Text>
        </View>
      )}

      {/* Upgrade card (replaces input when limit reached) */}
      {showUpgradeCard && (
        <View style={styles.upgradeCard}>
          <Ionicons name="lock-closed" size={24} color="#FF6200" />
          <Text style={styles.upgradeTitle}>Daily limit reached</Text>
          <Text style={styles.upgradeSubtitle}>
            {"You've used your 5 free AI messages today.\nUpgrade to Pro for unlimited AI coaching."}
          </Text>
          <TouchableOpacity
            style={styles.goProBtn}
            onPress={() => router.push('/pro-paywall')}
          >
            <Text style={styles.goProBtnText}>Go Pro — $4.99 / year</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Input */}
      {!showUpgradeCard && (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={input}
              onChangeText={setInput}
              placeholder="Ask your AI coach…"
              placeholderTextColor="#555"
              multiline
              maxLength={600}
              returnKeyType="default"
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!input.trim() || isLoading) && styles.sendBtnDisabled]}
              onPress={() => sendMessage()}
              disabled={!input.trim() || isLoading}
            >
              <Ionicons name="send" size={18} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

// ── Markdown styles ────────────────────────────────────────────────────────────
const markdownStyles = {
  body:              { color: '#FFFFFF', fontSize: 15, lineHeight: 22 },
  heading1:          { color: '#FF6200', fontSize: 20, fontWeight: '700' as const, marginBottom: 8 },
  heading2:          { color: '#FF6200', fontSize: 17, fontWeight: '700' as const, marginBottom: 6 },
  heading3:          { color: '#FF6200', fontSize: 15, fontWeight: '700' as const },
  bullet_list_icon:  { color: '#FF6200' },
  ordered_list_icon: { color: '#FF6200' },
  fence:             { backgroundColor: '#1A1A1A', padding: 8, borderRadius: 8 },
  code_block:        { backgroundColor: '#1A1A1A', padding: 8, borderRadius: 6 },
  code_inline:       { backgroundColor: '#1A1A1A', color: '#FFD4B3', paddingHorizontal: 4 },
  strong:            { color: '#FFD4B3' },
  em:                { color: '#B0B0B0' },
  blockquote:        { backgroundColor: '#1A1A1A', borderLeftColor: '#FF6200', borderLeftWidth: 3, paddingLeft: 12 },
};

// ── Styles ─────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1A1A1A',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#252525',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  proBadge: {
    backgroundColor: '#FF6200',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  proBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  clearBtn: {
    padding: 8,
  },
  messages: {
    flex: 1,
  },
  messagesContent: {
    padding: 16,
    paddingBottom: 8,
    flexGrow: 1,
  },
  chips: {
    marginBottom: 24,
  },
  chipsLabel: {
    color: '#B0B0B0',
    fontSize: 13,
    marginBottom: 10,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1.5,
    borderColor: '#FF6200',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: 'transparent',
  },
  chipText: {
    color: '#FF6200',
    fontSize: 13,
    fontWeight: '500',
  },
  userRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 12,
  },
  userBubble: {
    backgroundColor: '#FF6200',
    borderRadius: 18,
    borderBottomRightRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: '80%',
  },
  userText: {
    color: '#FFFFFF',
    fontSize: 15,
    lineHeight: 22,
  },
  aiRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  aiBubble: {
    backgroundColor: '#252525',
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: '88%',
  },
  errorBubble: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#252525',
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#F44336',
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: '88%',
  },
  errorText: {
    color: '#F44336',
    fontSize: 14,
    lineHeight: 20,
    flex: 1,
  },
  typingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#252525',
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 16,
    paddingVertical: 14,
    minWidth: 64,
  },
  typingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#B0B0B0',
  },
  usageBar: {
    paddingHorizontal: 20,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: '#252525',
  },
  usageText: {
    color: '#B0B0B0',
    fontSize: 12,
    textAlign: 'center',
  },
  upgradeCard: {
    margin: 16,
    backgroundColor: '#252525',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    gap: 8,
  },
  upgradeTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    marginTop: 4,
  },
  upgradeSubtitle: {
    color: '#B0B0B0',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  goProBtn: {
    backgroundColor: '#FF6200',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 8,
  },
  goProBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#252525',
  },
  input: {
    flex: 1,
    backgroundColor: '#252525',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: '#FFFFFF',
    fontSize: 15,
    maxHeight: 100,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FF6200',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
  },
  sendBtnDisabled: {
    backgroundColor: '#2D2D2D',
  },
});