// app/(tabs)/ai-suggestions.tsx
// AI Coach chat tab — context-aware prompts, conversation history,
// markdown rendering, typing indicator, smart errors, free/pro gating.

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
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
import { format } from 'date-fns';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import Markdown from 'react-native-markdown-display';
import { useAuthStore } from '../../src/store/authStore';
import { usePro } from '../../src/hooks/usePro';
import type { BodyCompositionGoals } from '../../src/types/bodyGoals';
import { AISuggestionCard } from '../../src/components/AISuggestionCard';
import { useAISuggestions } from '../../src/hooks/useAISuggestions'; // [PRO]
import { storage } from '../../src/utils/storage';
import { sendEngagementTelemetry, sendPaywallTelemetry } from '../../src/services/notifications';
import { useLanguage } from '../../src/context/LanguageContext';
import {
  type HealthProvider,
  getHealthSyncSettings,
  getHealthSyncSnapshot,
  getProviderLabel,
  getSupportedProvidersForDevice,
} from '../../src/services/healthSync'; // [PRO]

// ── Constants ──────────────────────────────────────────────────────────────────
const AI_HISTORY_KEY   = 'gaintrack_ai_history';
const AI_USAGE_KEY     = 'gaintrack_ai_usage';
const AI_CONSENT_KEY   = 'gaintrack_ai_consent';
const BODY_GOALS_KEY   = 'gaintrack_body_goals';
const BODYWEIGHT_KEY   = 'gaintrack_bodyweight';
const MEASUREMENTS_KEY = 'gaintrack_measurements';
const WORKOUTS_KEY     = 'gaintrack_workouts';
const NUTRITION_KEY    = 'gaintrack_nutrition';
const MAX_CONTEXT      = 10;
const MAX_HISTORY      = 20;
const AI_REQUEST_TIMEOUT_MS = 12000;
const PRO_DAILY_AI_CHAT_LIMIT = 2; // [PRO]

// ── Static coaching suggestions (free = first 4, pro-locked = rest) ──────────
const STATIC_SUGGESTIONS = [
  {
    id: 'tip1',
    category: 'exercise',
    isProLocked: false,
  },
  {
    id: 'tip2',
    category: 'nutrition',
    isProLocked: false,
  },
  {
    id: 'tip3',
    category: 'program',
    isProLocked: false,
  },
  {
    id: 'tip4',
    category: 'exercise',
    isProLocked: false,
  },
  {
    id: 'tip5',
    category: 'superset',
    isProLocked: true,
  },
  {
    id: 'tip6',
    category: 'nutrition',
    isProLocked: true,
  },
  {
    id: 'tip7',
    category: 'program',
    isProLocked: true,
  },
  {
    id: 'tip8',
    category: 'exercise',
    isProLocked: true,
  },
] as const;

// ── Types ──────────────────────────────────────────────────────────────────────
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'error';
  content: string;   // error role: stores original prompt for retry
  errorType?: 'network' | 'rate_limit' | 'no_api_key' | 'unknown';
  errorDetail?: string; // [DEBUG] raw error detail shown on-screen
  timestamp: number;
}

interface DailyUsage {
  date: string;
  count: number;
}

// ── Quick suggestion chips ─────────────────────────────────────────────────────
const CHIPS = [
  'analyzeWeeklyWorkout',
  'proteinGoals',
  'suggestWorkoutToday',
  'bodyGoalTrack',
] as const;

// ── API URL helper ─────────────────────────────────────────────────────────────
// Returns null in native production builds where the Expo server route is gone.
function getApiUrl(): string | null {
  if (Platform.OS === 'web') return '/api/ai-chat';
  const apiBase = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (apiBase) {
    return `${apiBase.replace(/\/$/, '')}/api/ai-chat`;
  }
  const host =
    Constants.expoConfig?.hostUri ??
    (Constants as any).manifest2?.extra?.expoClient?.hostUri;
  if (host) return `http://${host.split(':')[0]}:8081/api/ai-chat`;
  return null; // production APK/IPA
}

async function fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
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
  const { t, locale } = useLanguage();

  // Chat state
  const [messages,    setMessages]    = useState<ChatMessage[]>([]);
  const [input,       setInput]       = useState('');
  const [isLoading,   setIsLoading]   = useState(false);
  const [dailyUsage,  setDailyUsage]  = useState<DailyUsage>({ date: '', count: 0 });

  // Consent gate — null = not yet loaded, false = not given, true = given
  const [consentGiven, setConsentGiven] = useState<boolean | null>(null);

  // Active tab: 'suggestions' | 'chat'
  const [activeTab, setActiveTab] = useState<'suggestions' | 'chat'>('suggestions');

  // Context data for system prompt
  const [bodyGoals,       setBodyGoals]       = useState<BodyCompositionGoals | null>(null);
  const [latestBodyWt,    setLatestBodyWt]     = useState<number | null>(null);
  const [recentWorkouts,  setRecentWorkouts]   = useState<any[]>([]);
  const [recentNutrition, setRecentNutrition]  = useState<any[]>([]);
  const [healthCoachingTips, setHealthCoachingTips] = useState<Array<{ id: string; title: string; body: string }>>([]); // [PRO]

  // [PRO] AI personalised picks — fetched once on mount, cached 24 h
  const aiPicksContext = useMemo(() => ({
    recentWorkouts,
    goals: user?.goals
      ? t('aiSuggestions.workoutsPerWeekGoal', { count: user.goals.workouts_per_week ?? 4 })
      : t('aiSuggestions.generalFitnessGoal'),
    calories: user?.goals?.daily_calories,
  }), [recentWorkouts, user?.goals, t]); // eslint-disable-line react-hooks/exhaustive-deps
  const fallbackSuggestions = useMemo(() => ([
    {
      id: '1',
      category: 'exercise' as const,
      title: t('aiSuggestions.fallback.exerciseTitle'),
      description: t('aiSuggestions.fallback.exerciseDescription'),
      isProOnly: false,
    },
    {
      id: '2',
      category: 'superset' as const,
      title: t('aiSuggestions.fallback.supersetTitle'),
      description: t('aiSuggestions.fallback.supersetDescription'),
      isProOnly: false,
    },
    {
      id: '3',
      category: 'nutrition' as const,
      title: t('aiSuggestions.fallback.nutritionTitle'),
      description: t('aiSuggestions.fallback.nutritionDescription'),
      isProOnly: false,
    },
    {
      id: '4',
      category: 'program' as const,
      title: t('aiSuggestions.fallback.programTitle'),
      description: t('aiSuggestions.fallback.programDescription'),
      isProOnly: true,
    },
  ]), [t]);
  const {
    suggestions: aiSuggestions,
    loading: aiPicksLoading,
    refresh: refreshAIPicks,
  } = useAISuggestions(aiPicksContext, {
    fallbackSuggestions,
    errorMessage: t('aiSuggestions.errors.somethingWentWrong'),
    cacheScopeKey: locale,
  }); // [PRO]

  const scrollRef    = useRef<ScrollView>(null);
  const today        = format(new Date(), 'yyyy-MM-dd');
  const isTodayUsage = dailyUsage.date === today;
  const usedToday = isTodayUsage ? dailyUsage.count : 0;
  const remainingToday = Math.max(0, PRO_DAILY_AI_CHAT_LIMIT - usedToday);
  const canSend      = isPro && consentGiven === true && remainingToday > 0;
  const chipsVisible = messages.length === 0 && !isLoading;

  // ── Load consent state on mount and on every tab focus ───────────────────────
  useFocusEffect(
    useCallback(() => {
      storage.getItem(AI_CONSENT_KEY)
        .then((val) => setConsentGiven(val === 'true'))
        .catch(() => setConsentGiven(false));
    }, []),
  );

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
        storage.getItem(AI_HISTORY_KEY),
        storage.getItem(AI_USAGE_KEY),
        storage.getItem(BODY_GOALS_KEY),
        storage.getItem(BODYWEIGHT_KEY),
        storage.getItem(MEASUREMENTS_KEY),
        storage.getItem(WORKOUTS_KEY),
        storage.getItem(NUTRITION_KEY),
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

      // [PRO] Build health-sync-aware coaching prompts from latest snapshots.
      const providers = getSupportedProvidersForDevice();
      const healthSettings = await getHealthSyncSettings();
      const tips: Array<{ id: string; title: string; body: string }> = [];

      if (!healthSettings.consentGiven && providers.length > 0) {
        tips.push({
          id: 'health-consent',
          title: t('aiSuggestions.health.enableSyncTitle'),
          body: t('aiSuggestions.health.enableSyncBody'),
        });
      }

      for (const provider of providers) {
        const snapshot = await getHealthSyncSnapshot(provider);
        const providerState = healthSettings.providers[provider as HealthProvider];
        const providerLabel = getProviderLabel(provider as HealthProvider);

        if (!providerState?.connected) {
          tips.push({
            id: `health-connect-${provider}`,
            title: t('aiSuggestions.health.providerNotConnectedTitle', { provider: providerLabel }),
            body: t('aiSuggestions.health.providerNotConnectedBody', { provider: providerLabel }),
          });
          continue;
        }

        if (!snapshot) {
          tips.push({
            id: `health-sync-${provider}`,
            title: t('aiSuggestions.health.firstSyncTitle', { provider: providerLabel }),
            body: t('aiSuggestions.health.firstSyncBody', { provider: providerLabel }),
          });
          continue;
        }

        const readCount = Number(snapshot.snapshot.providerRecordsRead ?? 0);
        const workoutsImported = Number(snapshot.snapshot.workoutsImported ?? 0);
        const nutritionImported = Number(snapshot.snapshot.nutritionDaysImported ?? 0);
        const syncedAtMs = new Date(snapshot.syncedAt).getTime();
        const daysSinceSync = Number.isFinite(syncedAtMs)
          ? Math.max(0, Math.floor((Date.now() - syncedAtMs) / (1000 * 60 * 60 * 24)))
          : 99;

        if (daysSinceSync >= 4) {
          tips.push({
            id: `health-stale-${provider}`,
            title: t('aiSuggestions.health.syncStaleTitle', { provider: providerLabel }),
            body: t('aiSuggestions.health.syncStaleBody', { days: daysSinceSync }),
          });
        } else {
          tips.push({
            id: `health-ready-${provider}`,
            title: t('aiSuggestions.health.signalReadyTitle', { provider: providerLabel }),
            body: t('aiSuggestions.health.signalReadyBody', { records: readCount.toLocaleString(), workouts: workoutsImported, nutrition: nutritionImported }),
          });
        }
      }

      setHealthCoachingTips(tips.slice(0, 3));
    } catch (e) {
      console.error('[AISuggestions] loadAll error:', e);
      console.error(t('aiSuggestions.loadAllErrorLog'), e);
    }
  };

  // ── Build context-aware system prompt ─────────────────────────────────────
  const buildSystemPrompt = useCallback((): string => {
    const weeklyGoal   = bodyGoals?.weeklyWeightChangeGoal ?? 0;
    const derivedPhase = weeklyGoal < -0.25 ? 'Cutting' : weeklyGoal > 0.1 ? 'Bulking' : 'Maintenance';
    const wUnit        = (user as any)?.units?.weight ?? 'kg';

    // Truncate to prevent token overflow on free models (context limit ~4k tokens)
    const truncate = (obj: unknown, maxLen = 600): string => {
      const s = JSON.stringify(obj);
      return s.length > maxLen ? s.slice(0, maxLen) + '...' : s;
    };

    return `You are GainTrack AI, a personal fitness and nutrition coach.

User profile:
- Name: ${user?.name ?? 'User'}
- Goals: ${truncate(user?.goals ?? {})}
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

Recent workouts (last 3): ${truncate(recentWorkouts)}
Recent nutrition (last 3 days): ${truncate(recentNutrition)}

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

    setIsLoading(true);

    // Build API context (last MAX_CONTEXT non-error messages)
    const context = newMessages
      .filter((m) => m.role !== 'error')
      .slice(-MAX_CONTEXT)
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    try {
      const serverUrl = getApiUrl();
      const body = JSON.stringify({
        system: buildSystemPrompt(),
        messages: context,
        prompt: text,
        usageType: 'coach_chat', // [PRO] consumed by API daily cap guard
      });

      if (!serverUrl) {
        throw Object.assign(new Error('no_api_key'), { errorType: 'no_api_key' as const, detail: t('aiSuggestions.aiEndpointNotConfigured') });
      }

      const res = await fetchWithTimeout(serverUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });

      // [PRO] Keep local counter in sync for successful/processable requests.
      if (isPro && res.status !== 429) {
        const newUsage: DailyUsage = { date: today, count: usedToday + 1 };
        setDailyUsage(newUsage);
        storage.setItem(AI_USAGE_KEY, JSON.stringify(newUsage)).catch(() => {});
      }

      if (res.status === 429) {
        let detail = '';
        try {
          const rateBody = await res.json();
          if (rateBody?.code === 'daily_limit_exceeded') {
            detail = t('aiSuggestions.errors.dailyCapReachedDetail', { limit: PRO_DAILY_AI_CHAT_LIMIT });
          }
        } catch {
          detail = '';
        }
        throw Object.assign(new Error('rate_limit'), {
          errorType: 'rate_limit' as const,
          detail,
        });
      }
      if (res.status === 401 || res.status === 403) {
        throw Object.assign(new Error('no_api_key'), { errorType: 'no_api_key' as const });
      }
      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        console.error('[AI] direct fallback error', res.status, errBody.slice(0, 300));
        throw Object.assign(new Error('unknown'), { errorType: 'unknown' as const, detail: `${res.status}: ${errBody.slice(0, 120)}` });
      }

      const data = await res.json();
      const content: string | undefined = data?.choices?.[0]?.message?.content;
      if (!content) {
        console.error('[AI] empty content in response', JSON.stringify(data).slice(0, 300));
        throw Object.assign(new Error('unknown'), { errorType: 'unknown' as const, detail: `empty content: ${JSON.stringify(data).slice(0, 120)}` });
      }

      const aiMsg: ChatMessage = {
        id: `${Date.now() + 1}`,
        role: 'assistant',
        content,
        timestamp: Date.now(),
      };
      const finalMessages = [...newMessages, aiMsg];
      setMessages(finalMessages);
      storage.setItem(
        AI_HISTORY_KEY,
        JSON.stringify(finalMessages.slice(-MAX_HISTORY)),
      ).catch(() => {});
    } catch (e: any) {
      const errorType: ChatMessage['errorType'] = e?.errorType ?? 'network';
      const errorDetail = e?.detail ?? e?.message ?? String(e);
      const errMsg: ChatMessage = {
        id: `${Date.now() + 1}`,
        role: 'error',
        content: text,   // store prompt for retry
        errorType,
        errorDetail,
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
    await storage.removeItem(AI_HISTORY_KEY);
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  // ── Consent handlers ──────────────────────────────────────────────────────
  const handleConsentAgree = async () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await storage.setItem(AI_CONSENT_KEY, 'true');
    setConsentGiven(true);
  };

  const handleConsentDecline = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setConsentGiven(false);
    // Stay on suggestions tab — AI features remain disabled
    setActiveTab('suggestions');
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>{t('aiSuggestions.title')}</Text>
          {isPro && (
            <View style={styles.proBadge}>
              <Text style={styles.proBadgeText}>{t('progressTab.proBadge')}</Text>
            </View>
          )}
        </View>
        {activeTab === 'chat' && messages.length > 0 && (
          <TouchableOpacity
            onPress={clearChat}
            style={styles.clearBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="trash-outline" size={20} color="#B0B0B0" />
          </TouchableOpacity>
        )}
      </View>

      {/* ──── AI DATA CONSENT MODAL ──── */}
      {consentGiven === false && (
        <View style={styles.consentOverlay}>
          <View style={styles.consentCard}>
            <Ionicons name="shield-checkmark-outline" size={40} color="#FF6200" />
            <Text style={styles.consentTitle}>{t('aiSuggestions.consentTitle')}</Text>
            <ScrollView style={{ maxHeight: 340, width: '100%' }} showsVerticalScrollIndicator={true}>
              <Text style={styles.consentBody}>
                {t('aiSuggestions.consentBody')}
              </Text>
            </ScrollView>
            <TouchableOpacity style={styles.consentAgreeBtn} onPress={handleConsentAgree} activeOpacity={0.85}>
              <Text style={styles.consentAgreeBtnText}>{t('aiSuggestions.consentAgree')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.consentDeclineBtn} onPress={handleConsentDecline} activeOpacity={0.85}>
              <Text style={styles.consentDeclineBtnText}>{t('aiSuggestions.consentDecline')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Segment control: Tips | AI Chat */}
      <View style={styles.segmentRow}>
        <TouchableOpacity
          style={[styles.segment, activeTab === 'suggestions' && styles.segmentActive]}
          onPress={() => {
            if (Platform.OS !== 'web') Haptics.selectionAsync();
            sendEngagementTelemetry({
              feature: 'ai_suggestions',
              action: 'tab_opened',
              context: 'suggestions',
            }).catch(() => null);
            setActiveTab('suggestions');
          }}
          activeOpacity={0.8}
        >
          <Ionicons
            name="bulb-outline"
            size={14}
            color={activeTab === 'suggestions' ? '#FFFFFF' : '#B0B0B0'}
          />
          <Text style={[styles.segmentText, activeTab === 'suggestions' && styles.segmentTextActive]} numberOfLines={1}>
            {t('aiSuggestions.tipsTab')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.segment, activeTab === 'chat' && styles.segmentActive]}
          onPress={() => {
            if (Platform.OS !== 'web') Haptics.selectionAsync();
            if (!isPro) {
              sendPaywallTelemetry({
                feature: 'ai_chat',
                placement: 'ai_chat_tab_lock',
                eventType: 'view',
                context: 'chat_tab_tap',
              }).catch(() => null);
            }
            if (!consentGiven) { setConsentGiven(false); return; }
            sendEngagementTelemetry({
              feature: 'ai_suggestions',
              action: 'tab_opened',
              context: 'chat',
            }).catch(() => null);
            setActiveTab('chat');
          }}
          activeOpacity={0.8}
        >
          <Ionicons
            name="chatbubble-ellipses-outline"
            size={14}
            color={activeTab === 'chat' ? '#FFFFFF' : '#B0B0B0'}
          />
          <Text style={[styles.segmentText, activeTab === 'chat' && styles.segmentTextActive]} numberOfLines={1}>
            {t('aiSuggestions.chatTab')}
          </Text>
          {!isPro && (
            <Ionicons name="lock-closed" size={11} color={activeTab === 'chat' ? '#FFFFFF' : '#FF6200'} style={{ marginLeft: 2 }} />
          )}
        </TouchableOpacity>
      </View>

      {/* ──── SUGGESTIONS TAB ──── */}
      {activeTab === 'suggestions' && (
        <ScrollView
          style={styles.messages}
          contentContainerStyle={[styles.messagesContent, { paddingBottom: 32 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* ── AI Picks (Pro only) ── [PRO] ─────────────────────────── */}
          {isPro && (
            <>
              <View style={styles.aiPicksHeader}>
                <Text style={styles.sectionLabel}>{t('aiSuggestions.aiPicks')}</Text>
                <TouchableOpacity
                  onPress={refreshAIPicks}
                  disabled={aiPicksLoading}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons
                    name="refresh"
                    size={16}
                    color={aiPicksLoading ? '#444' : '#FF6200'}
                  />
                </TouchableOpacity>
              </View>
              {aiPicksLoading ? (
                <View style={styles.aiPicksSkeleton}>
                  <View style={styles.skeletonLine} />
                  <View style={[styles.skeletonLine, { width: '60%' }]} />
                </View>
              ) : (
                aiSuggestions.map((s) => (
                  <AISuggestionCard
                    key={s.id}
                    id={s.id}
                    category={s.category}
                    title={s.title}
                    description={s.description}
                    isProLocked={false}
                  />
                ))
              )}

              {healthCoachingTips.length > 0 && (
                <>
                  <Text style={[styles.sectionLabel, { marginTop: 6 }]}>{t('aiSuggestions.healthSyncCoaching')}</Text>
                  {healthCoachingTips.map((tip) => (
                    <View key={tip.id} style={styles.healthTipCard}>
                      <Text style={styles.healthTipTitle}>{tip.title}</Text>
                      <Text style={styles.healthTipBody}>{tip.body}</Text>
                    </View>
                  ))}
                </>
              )}
            </>
          )}

          <Text style={styles.sectionLabel}>{t('aiSuggestions.coachingTips')}</Text>
          {STATIC_SUGGESTIONS.map((s) => (
            <AISuggestionCard
              key={s.id}
              id={s.id}
              category={s.category}
              title={t(`aiSuggestions.static.${s.id}.title`)}
              description={t(`aiSuggestions.static.${s.id}.description`)}
              isProLocked={s.isProLocked && !isPro}
              onPressUpgrade={() => {
                sendPaywallTelemetry({
                  feature: 'ai_suggestions',
                  placement: 'suggestion_card_lock',
                  eventType: 'cta_click',
                  context: s.id,
                }).catch(() => null);
                router.push('/pro-paywall');
              }}
            />
          ))}
          {!isPro && (
            <View style={styles.upgradeCard}>
              <Ionicons name="sparkles" size={24} color="#FF6200" />
              <Text style={styles.upgradeTitle}>{t('aiSuggestions.unlockAllTitle')}</Text>
              <Text style={styles.upgradeSubtitle}>
                {t('aiSuggestions.unlockAllSubtitle')}
              </Text>
              <TouchableOpacity
                style={styles.goProBtn}
                onPress={() => {
                  sendPaywallTelemetry({
                    feature: 'ai_suggestions',
                    placement: 'tips_upgrade_card',
                    eventType: 'cta_click',
                    context: 'tips_upgrade',
                  }).catch(() => null);
                  router.push('/pro-paywall');
                }}
              >
                <Text style={styles.goProBtnText}>{t('aiSuggestions.goProPrice')}</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      )}

      {/* ──── CHAT TAB — free users: paywall ──── */}
      {activeTab === 'chat' && !isPro && (
        <View style={styles.chatPaywall}>
          <Ionicons name="chatbubble-ellipses-outline" size={48} color="#FF6200" />
          <Text style={[styles.upgradeTitle, { marginTop: 16 }]}>{t('aiSuggestions.chatProFeatureTitle')}</Text>
          <Text style={styles.upgradeSubtitle}>
            {t('aiSuggestions.chatProFeatureSubtitle')}
          </Text>
          <TouchableOpacity
            style={[styles.goProBtn, { marginTop: 20 }]}
            onPress={() => {
              sendPaywallTelemetry({
                feature: 'ai_chat',
                placement: 'chat_paywall_screen',
                eventType: 'cta_click',
                context: 'chat_upgrade',
              }).catch(() => null);
              router.push('/pro-paywall');
            }}
          >
            <Text style={styles.goProBtnText}>{t('aiSuggestions.goProPrice')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.backToTipsBtn}
            onPress={() => setActiveTab('suggestions')}
          >
            <Text style={styles.backToTipsBtnText}>{t('aiSuggestions.backToFreeTips')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ──── CHAT TAB — Pro users: full chat ──── */}
      {activeTab === 'chat' && isPro && (
        <>
          <View style={styles.usageBar}>
            <Text style={styles.usageText}>
              {t('aiSuggestions.usageBar', { used: usedToday, limit: PRO_DAILY_AI_CHAT_LIMIT, remaining: remainingToday })}
            </Text>
          </View>

          <ScrollView
            ref={scrollRef}
            style={styles.messages}
            contentContainerStyle={styles.messagesContent}
            keyboardShouldPersistTaps="handled"
          >
            {chipsVisible && (
              <View style={styles.chips}>
                <Text style={styles.chipsLabel}>{t('aiSuggestions.quickPrompts')}</Text>
                <View style={styles.chipsRow}>
                  {CHIPS.map((chip) => (
                    <TouchableOpacity
                      key={chip}
                      onPress={() => sendMessage(t(`aiSuggestions.chips.${chip}`))}
                      activeOpacity={0.7}
                    >
                      <View style={styles.chip}>
                        <Text style={styles.chipText}>{t(`aiSuggestions.chips.${chip}`)}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

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
                      <View style={styles.errorHeader}>
                        <Ionicons name="warning-outline" size={16} color="#F44336" />
                        <Text style={styles.errorTitle}>
                          {msg.errorType === 'rate_limit'
                            ? t('aiSuggestions.errors.tooManyRequests')
                            : msg.errorType === 'no_api_key'
                            ? t('aiSuggestions.errors.aiNotConfigured')
                            : msg.errorType === 'network'
                            ? t('aiSuggestions.errors.connectionError')
                            : t('aiSuggestions.errors.somethingWentWrong')}
                        </Text>
                      </View>
                      <Text style={styles.errorText}>
                        {msg.errorType === 'rate_limit'
                          ? t('aiSuggestions.errors.tryAgain30s')
                          : msg.errorType === 'no_api_key'
                          ? t('aiSuggestions.errors.contactSupport')
                          : msg.errorType === 'network'
                          ? t('aiSuggestions.errors.networkReachability')
                          : t('aiSuggestions.errors.unexpectedError')}
                        {msg.errorDetail ? `\n\n${msg.errorDetail}` : ''}
                      </Text>
                      {canRetry && (
                        <Text style={styles.errorRetry}>{t('aiSuggestions.errors.tapToRetry')}</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                );
              }

              return (
                <View key={msg.id} style={styles.aiRow}>
                  <View style={styles.aiBubble}>
                    <Markdown style={markdownStyles}>{msg.content}</Markdown>
                  </View>
                </View>
              );
            })}

            {isLoading && (
              <View style={styles.aiRow}>
                <TypingIndicator />
              </View>
            )}
          </ScrollView>

          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
          >
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                value={input}
                onChangeText={setInput}
                placeholder={t('aiSuggestions.askPlaceholder')}
                placeholderTextColor="#555"
                multiline
                maxLength={600}
                returnKeyType="default"
              />
              <TouchableOpacity
                style={[styles.sendBtn, (!input.trim() || isLoading || !canSend) && styles.sendBtnDisabled]}
                onPress={() => sendMessage()}
                disabled={!input.trim() || isLoading || !canSend}
              >
                <Ionicons name="send" size={18} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </>
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
  aiPicksHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  aiPicksSkeleton: {
    backgroundColor: '#252525',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    gap: 10,
  },
  skeletonLine: {
    height: 14,
    borderRadius: 7,
    backgroundColor: '#3a3a3a',
    width: '100%',
  },
  healthTipCard: {
    backgroundColor: '#252525',
    borderWidth: 1,
    borderColor: '#2D2D2D',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  healthTipTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  healthTipBody: {
    color: '#B0B0B0',
    fontSize: 13,
    lineHeight: 19,
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
    flexDirection: 'column',
    gap: 8,
  },
  chip: {
    borderWidth: 1.5,
    borderColor: '#FF6200',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: 'transparent',
    alignSelf: 'flex-start',
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
    flexDirection: 'column',
    gap: 6,
    backgroundColor: '#252525',
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#F44336',
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: '88%',
  },
  errorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  errorTitle: {
    color: '#F44336',
    fontSize: 14,
    fontWeight: '700',
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 13,
    lineHeight: 19,
  },
  errorRetry: {
    color: '#FF6200',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
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
  // ── Segment control ────────────────────────────────────────────────────────
  segmentRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#252525',
    borderRadius: 12,
    padding: 3,
    gap: 3,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    borderRadius: 10,
  },
  segmentActive: {
    backgroundColor: '#FF6200',
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#B0B0B0',
  },
  segmentTextActive: {
    color: '#FFFFFF',
  },
  // ── Suggestions tab extras ─────────────────────────────────────────────────
  sectionLabel: {
    color: '#B0B0B0',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  // ── Chat paywall (full-screen centred card) ────────────────────────────────
  chatPaywall: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  // ── Consent overlay ──────────────────────────────────────────────────────
  consentOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(26,26,26,0.97)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    zIndex: 100,
  },
  consentCard: {
    backgroundColor: '#252525',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    gap: 14,
    width: '100%',
    maxWidth: 420,
    maxHeight: '90%',
  },
  consentTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  consentBody: {
    color: '#B0B0B0',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'left',
    width: '100%',
  },
  consentAgreeBtn: {
    backgroundColor: '#FF6200',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
    marginTop: 4,
  },
  consentAgreeBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  consentDeclineBtn: {
    paddingVertical: 10,
    width: '100%',
    alignItems: 'center',
  },
  consentDeclineBtnText: {
    color: '#B0B0B0',
    fontSize: 14,
  },
  backToTipsBtn: {
    marginTop: 12,
    paddingVertical: 8,
  },
  backToTipsBtnText: {
    color: '#B0B0B0',
    fontSize: 14,
    fontWeight: '500',
  },
});