// app/(tabs)/index.tsx
// GainTrack — Hevy-style Home Dashboard

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Dimensions,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { BarChart } from 'react-native-chart-kit';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useWorkoutStore } from '../../src/store/workoutStore';
import { useNativeAuthState } from '../../src/hooks/useAuth';
import { useAuthStore } from '../../src/store/authStore';
import { WorkoutCard } from '../../src/components/WorkoutCard';
import { Badge } from '../../src/components/ui/Badge';
import { Card } from '../../src/components/ui/Card';
import { usePro } from '../../src/hooks/usePro';
import { Workout } from '../../src/types';
import { theme } from '../../src/constants/theme';
import { BUILD_LABEL } from '../../src/constants/build';
import {
  calculateWorkoutVolume,
  formatVolume,
} from '../../src/utils/helpers';
import { format, subDays, parseISO, isSameDay } from 'date-fns';
import { sendEngagementTelemetry } from '../../src/services/notifications';

const SCREEN_WIDTH = Dimensions.get('window').width;

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Returns the last 7 day labels + volume sums from workout list */
function buildWeeklyChartData(workouts: Workout[]) {
  // Skip workouts with zero total volume
  const validWorkouts = workouts.filter(
    (w) => calculateWorkoutVolume(w.exercises ?? []) > 0,
  );
  const days = Array.from({ length: 7 }, (_, i) => subDays(new Date(), 6 - i));
  const labels = days.map((d) => format(d, 'EEE').slice(0, 1)); // M T W …
  const data = days.map((day) => {
    const dayWorkouts = validWorkouts.filter((w) => {
      try {
        return isSameDay(parseISO(w.date), day);
      } catch {
        return false;
      }
    });
    return dayWorkouts.reduce(
      (sum, w) => sum + calculateWorkoutVolume(w.exercises),
      0,
    );
  });
  // Normalise to kg-thousands so bars fit; fall back to 0 if all empty
  const max = Math.max(...data, 1);
  return { labels, data, max };
}

function buildWindowStats(workouts: Workout[], start: Date, end: Date) {
  const windowWorkouts = workouts.filter((w) => {
    try {
      const d = parseISO(w.date);
      return d >= start && d <= end && calculateWorkoutVolume(w.exercises ?? []) > 0;
    } catch {
      return false;
    }
  });

  const volume = windowWorkouts.reduce((sum, workout) => sum + calculateWorkoutVolume(workout.exercises ?? []), 0);
  const workoutDays = new Set(
    windowWorkouts.map((workout) => {
      try {
        return format(parseISO(workout.date), 'yyyy-MM-dd');
      } catch {
        return '';
      }
    }).filter(Boolean),
  ).size;

  return { volume, workoutDays, workouts: windowWorkouts.length };
}

/** Consecutive-day workout streak ending today */
function calcStreak(workouts: Workout[]): number {
  // Only count workouts with actual volume
  const validWorkouts = workouts.filter(
    (w) => calculateWorkoutVolume(w.exercises ?? []) > 0,
  );
  const dates = new Set(
    validWorkouts.map((w) => {
      try {
        return format(parseISO(w.date), 'yyyy-MM-dd');
      } catch {
        return '';
      }
    }),
  );
  let streak = 0;
  let cursor = new Date();
  while (dates.has(format(cursor, 'yyyy-MM-dd'))) {
    streak++;
    cursor = subDays(cursor, 1);
  }
  return streak;
}

const MILESTONE_STEPS = [1, 5, 10, 25, 50, 100, 200];

function getMilestoneProgress(totalWorkouts: number) {
  const next = MILESTONE_STEPS.find((step) => totalWorkouts < step) ?? MILESTONE_STEPS[MILESTONE_STEPS.length - 1];
  const previous = [...MILESTONE_STEPS].reverse().find((step) => step <= totalWorkouts) ?? 0;
  const span = Math.max(next - previous, 1);
  const progress = Math.min(Math.max((totalWorkouts - previous) / span, 0), 1);
  return { previous, next, progress };
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const router = useRouter();
  const { workouts, isLoading, loadUserWorkouts, deleteWorkout, clearInProgress } = useWorkoutStore();
  const { user } = useAuthStore();
  const { uid } = useNativeAuthState();
  const { isPro } = usePro();
  const [refreshing, setRefreshing] = useState(false);
  const [resumeWorkoutName, setResumeWorkoutName] = useState<string | null>(null);
  const [nutritionTrackedDays, setNutritionTrackedDays] = useState(0);

  useEffect(() => {
    sendEngagementTelemetry({
      feature: 'home',
      action: 'screen_view',
      context: 'tabs_index',
    });
  }, []);

  // ── Check for persisted in-progress workout on every focus ────────────────
  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem('gaintrack_active_workout').then((raw) => {
        if (raw) {
          try {
            const { workout } = JSON.parse(raw);
            setResumeWorkoutName(workout?.name ?? 'In-progress workout');
          } catch {
            setResumeWorkoutName(null);
          }
        } else {
          setResumeWorkoutName(null);
        }
      });
    }, []),
  );

  // ── Data fetch — Firestore-backed via uid ──────────────────────────────────
  const fetchWorkouts = useCallback(async () => {
    if (!uid) return; // not signed in yet; _layout will redirect
    await loadUserWorkouts(uid);
  }, [uid, loadUserWorkouts]);

  useFocusEffect(
    useCallback(() => {
      fetchWorkouts();
    }, [fetchWorkouts]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchWorkouts();
    setRefreshing(false);
  };

  // ── Derived data ──────────────────────────────────────────────────────────
  const recentWorkouts = useMemo(
    () =>
      [...workouts]
        .filter((w) => {
          const exercises = w.exercises ?? [];
          // Exclude empty skeleton workouts (no exercises and zero volume)
          return !(exercises.length === 0 && calculateWorkoutVolume(exercises) === 0);
        })
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 5),
    [workouts],
  );

  const { labels: chartLabels, data: chartData, max: chartMax } =
    useMemo(() => buildWeeklyChartData(workouts), [workouts]);

  const streak = useMemo(() => calcStreak(workouts), [workouts]);

  const totalVolumeThisWeek = useMemo(
    () => chartData.reduce((s, v) => s + v, 0),
    [chartData],
  );
  const workoutDaysThisWeek = useMemo(
    () => chartData.filter((value) => value > 0).length,
    [chartData],
  );
  const hasActiveWorkout = Boolean(resumeWorkoutName);
  const completedWorkoutsCount = useMemo(
    () => workouts.filter((w) => calculateWorkoutVolume(w.exercises ?? []) > 0).length,
    [workouts],
  );
  const milestone = useMemo(
    () => getMilestoneProgress(completedWorkoutsCount),
    [completedWorkoutsCount],
  );
  const weeklyConsistencyScore = useMemo(
    () => workoutDaysThisWeek + nutritionTrackedDays,
    [workoutDaysThisWeek, nutritionTrackedDays],
  );
  const workedOutToday = useMemo(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
    return workouts.some((workout) => {
      const date = workout?.date ? format(new Date(workout.date), 'yyyy-MM-dd') : '';
      return date === today && calculateWorkoutVolume(workout.exercises ?? []) > 0;
    });
  }, [workouts]);
  const streakAtRisk = streak > 0 && !workedOutToday;

  const weeklyDeltaRecap = useMemo(() => {
    const today = new Date();
    const thisWeekStart = subDays(today, 6);
    const prevWeekEnd = subDays(thisWeekStart, 1);
    const prevWeekStart = subDays(prevWeekEnd, 6);

    const current = buildWindowStats(workouts, thisWeekStart, today);
    const previous = buildWindowStats(workouts, prevWeekStart, prevWeekEnd);

    const volumeDelta = current.volume - previous.volume;
    const dayDelta = current.workoutDays - previous.workoutDays;
    const workoutDelta = current.workouts - previous.workouts;
    const baseVolume = Math.max(previous.volume, 1);
    const volumeDeltaPct = Math.round((volumeDelta / baseVolume) * 100);

    return {
      current,
      previous,
      volumeDelta,
      dayDelta,
      workoutDelta,
      volumeDeltaPct,
    };
  }, [workouts]);

  useEffect(() => {
    let cancelled = false;

    const loadNutritionConsistency = async () => {
      try {
        const rawNutrition = await AsyncStorage.getItem('gaintrack_nutrition');
        const parsed = rawNutrition ? JSON.parse(rawNutrition) : [];
        if (!Array.isArray(parsed)) {
          if (!cancelled) setNutritionTrackedDays(0);
          return;
        }

        const days = Array.from({ length: 7 }, (_, i) => format(subDays(new Date(), i), 'yyyy-MM-dd'));
        const tracked = parsed.filter((entry: any) => {
          const day = typeof entry?.date === 'string' ? entry.date : '';
          if (!days.includes(day)) return false;
          return Number(entry?.total_calories ?? 0) > 0;
        });

        const uniqueDays = new Set(tracked.map((entry: any) => entry.date));
        if (!cancelled) setNutritionTrackedDays(uniqueDays.size);
      } catch {
        if (!cancelled) setNutritionTrackedDays(0);
      }
    };

    loadNutritionConsistency();
    return () => {
      cancelled = true;
    };
  }, [workouts]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleNewWorkout = async () => {
    if (hasActiveWorkout) {
      await Haptics.selectionAsync();
      sendEngagementTelemetry({
        feature: 'home',
        action: 'start_workout_blocked_active_session',
        context: 'cta',
      });
      return;
    }
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    sendEngagementTelemetry({
      feature: 'home',
      action: 'start_workout_tapped',
      context: 'cta',
    });
    router.push('/(tabs)/exercises');
  };

  const handleQuickLog = async () => {
    if (hasActiveWorkout) {
      await Haptics.selectionAsync();
      sendEngagementTelemetry({
        feature: 'home',
        action: 'quick_log_blocked_active_session',
        context: 'fab',
      });
      return;
    }
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    sendEngagementTelemetry({
      feature: 'home',
      action: 'quick_log_tapped',
      context: 'fab',
    });
    router.push('/(tabs)/exercises');
  };

  const handleResumeWorkout = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    sendEngagementTelemetry({
      feature: 'home',
      action: 'resume_workout_tapped',
      context: resumeWorkoutName ?? 'in_progress',
    });
    router.push({ pathname: '/workout/active', params: { name: resumeWorkoutName ?? '' } });
  };

  const handleDismissResume = async () => {
    await Haptics.selectionAsync();
    sendEngagementTelemetry({
      feature: 'home',
      action: 'resume_workout_dismissed',
      context: resumeWorkoutName ?? 'in_progress',
    });
    // Clear both AsyncStorage and Zustand so no ghost workout remains
    await clearInProgress();
    setResumeWorkoutName(null);
  };

  const handleDeleteWorkout = async (workout: Workout) => {
    if (!uid) return;
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      await deleteWorkout(uid, workout.workout_id);
    } catch (err) {
      console.error('[HomeScreen] delete error:', err);
    }
  };

  const handleWorkoutPress = async (workout: Workout) => {
    await Haptics.selectionAsync();
    sendEngagementTelemetry({
      feature: 'home',
      action: 'recent_workout_opened',
      context: workout.workout_id,
    });
    router.push(`/workout/${workout.workout_id}`);
  };

  const handleBodyGoalPress = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/body-composition-goal' as any);
  };

  const handleWeeklyRecapPress = async () => {
    await Haptics.selectionAsync();
    sendEngagementTelemetry({
      feature: 'home',
      action: 'weekly_recap_opened',
      context: 'home_card',
    });
    const deltaPayload =
      `Volume vs last week: ${weeklyDeltaRecap.volumeDelta >= 0 ? '+' : ''}${formatVolume(Math.abs(weeklyDeltaRecap.volumeDelta))} (${weeklyDeltaRecap.volumeDeltaPct >= 0 ? '+' : ''}${weeklyDeltaRecap.volumeDeltaPct}%)\n` +
      `Workout days delta: ${weeklyDeltaRecap.dayDelta >= 0 ? '+' : ''}${weeklyDeltaRecap.dayDelta}\n` +
      `Sessions delta: ${weeklyDeltaRecap.workoutDelta >= 0 ? '+' : ''}${weeklyDeltaRecap.workoutDelta}`;

    Alert.alert(
      'Weekly Recap',
      `Workout days: ${workoutDaysThisWeek}/7\nNutrition days: ${nutritionTrackedDays}/7\nTotal volume: ${formatVolume(totalVolumeThisWeek)}\nCurrent streak: ${streak} day${streak === 1 ? '' : 's'}\n\nProgress delta payload:\n${deltaPayload}`,
      [
        { text: 'Close', style: 'cancel' },
        {
          text: 'Open Full Progress',
          onPress: () => router.push({
            pathname: '/(tabs)/progress',
            params: {
              source: 'weekly_recap',
              volumeDelta: String(weeklyDeltaRecap.volumeDelta),
              volumeDeltaPct: String(weeklyDeltaRecap.volumeDeltaPct),
              dayDelta: String(weeklyDeltaRecap.dayDelta),
              workoutDelta: String(weeklyDeltaRecap.workoutDelta),
            },
          } as any),
        },
      ],
    );
  };

  // ── Greeting ──────────────────────────────────────────────────────────────
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = user?.name?.split(' ')[0] ?? 'Athlete';

  // ── Sub-components ────────────────────────────────────────────────────────
  // Wrapped in useCallback so FlatList receives a stable reference and does
  // not unmount/remount the header (including the BarChart) on every render.

  const ListHeader = useCallback(() => (
    <View>
      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.greeting}>{greeting},</Text>
          <View style={styles.nameRow}>
            <Text style={styles.headerTitle}>{firstName}</Text>
            {streak > 0 && (
              <Badge
                label={`🔥 ${streak}d streak`}
                variant="pr"
                style={styles.streakBadge}
              />
            )}
          </View>
        </View>
        <TouchableOpacity
          style={styles.programsBtn}
          onPress={() => {
            sendEngagementTelemetry({
              feature: 'home',
              action: 'calendar_opened',
              context: 'header_icon',
            });
            router.push('/(tabs)/calendar');
          }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="calendar-outline" size={22} color={theme.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* ── Resume Workout banner ── */}
      {resumeWorkoutName && (
        <TouchableOpacity
          style={styles.resumeBanner}
          onPress={handleResumeWorkout}
          activeOpacity={0.85}
        >
          <View style={styles.resumeLeft}>
            <Ionicons name="play-circle" size={22} color={theme.primary} />
            <View>
              <Text style={styles.resumeLabel}>Workout in progress</Text>
              <Text style={styles.resumeName} numberOfLines={1}>{resumeWorkoutName}</Text>
            </View>
          </View>
          <View style={styles.resumeRight}>
            <Text style={styles.resumeCta}>Resume</Text>
            <TouchableOpacity
              onPress={handleDismissResume}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={18} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      )}

      {/* ── Start Workout CTA ── */}
      <TouchableOpacity
        style={[styles.ctaButton, hasActiveWorkout && styles.ctaButtonDisabled]}
        onPress={handleNewWorkout}
        disabled={hasActiveWorkout}
        activeOpacity={0.82}
      >
        <View style={styles.ctaInner}>
          <Ionicons name="barbell-outline" size={24} color={theme.textPrimary} />
          <Text style={styles.ctaText}>Start Workout</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.6)" />
      </TouchableOpacity>
      {hasActiveWorkout && (
        <Text style={styles.ctaDisabledNote}>
          Not possible while another workout session is in progress.
        </Text>
      )}

      <TouchableOpacity
        style={styles.bodyGoalCard}
        onPress={handleBodyGoalPress}
        activeOpacity={0.82}
      >
        <View style={styles.bodyGoalLeft}>
          <Ionicons name="body-outline" size={18} color={theme.primary} />
          <View>
            <Text style={styles.bodyGoalTitle}>Body Composition Goal</Text>
            <Text style={styles.bodyGoalSubtitle}>Set targets and projected timeline</Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
      </TouchableOpacity>

      <Card style={styles.engagementCard}>
        <View style={styles.engagementHeader}>
          <Text style={styles.sectionTitle}>This Week Momentum</Text>
          <Badge
            label={`${weeklyConsistencyScore}/14 consistency`}
            variant="neutral"
          />
        </View>

        <View style={styles.momentumStatsRow}>
          <View style={styles.momentumStatChip}>
            <Text style={styles.momentumStatValue}>{workoutDaysThisWeek}</Text>
            <Text style={styles.momentumStatLabel}>Workout days</Text>
          </View>
          <View style={styles.momentumStatChip}>
            <Text style={styles.momentumStatValue}>{nutritionTrackedDays}</Text>
            <Text style={styles.momentumStatLabel}>Nutrition days</Text>
          </View>
          <View style={styles.momentumStatChip}>
            <Text style={styles.momentumStatValue}>{streak}</Text>
            <Text style={styles.momentumStatLabel}>Current streak</Text>
          </View>
        </View>

        <View style={styles.milestoneRow}>
          <View>
            <Text style={styles.milestoneLabel}>Next milestone badge</Text>
            <Text style={styles.milestoneTitle}>🏅 {milestone.next} workouts</Text>
          </View>
          <Text style={styles.milestoneMeta}>{completedWorkoutsCount}/{milestone.next}</Text>
        </View>
        <View style={styles.milestoneTrack}>
          <View style={[styles.milestoneFill, { width: `${Math.max(8, milestone.progress * 100)}%` }]} />
        </View>

        {streakAtRisk ? (
          <TouchableOpacity
            style={styles.streakWarningCard}
            onPress={handleNewWorkout}
            activeOpacity={0.88}
          >
            <Ionicons name="flame" size={16} color={theme.warning} />
            <View style={styles.streakWarningContent}>
              <Text style={styles.streakWarningTitle}>Streak at risk today</Text>
              <Text style={styles.streakWarningSubtitle}>Log even one set to keep your streak alive.</Text>
            </View>
            <Text style={styles.streakWarningAction}>Protect</Text>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          style={styles.weeklyRecapButton}
          onPress={handleWeeklyRecapPress}
          activeOpacity={0.85}
        >
          <Text style={styles.weeklyRecapText}>Open Weekly Recap</Text>
          <Ionicons name="chevron-forward" size={16} color={theme.primary} />
        </TouchableOpacity>
      </Card>

      {/* ── Weekly volume chart ── */}
      <Card style={styles.chartCard} noPadding>
        <View style={styles.chartHeader}>
          <View>
            <Text style={styles.sectionTitle}>Weekly Volume</Text>
            <Text style={styles.chartSubtitle}>
              {formatVolume(totalVolumeThisWeek)} kg this week
            </Text>
          </View>
          <Badge
            label={`${workouts.length} total`}
            variant="neutral"
          />
        </View>
        {chartMax > 0 ? (
          <BarChart
            data={{
              labels: chartLabels,
              datasets: [{ data: chartData }],
            }}
            width={SCREEN_WIDTH - 32 - 2} // card margins + border
            height={180}
            yAxisLabel=""
            yAxisSuffix=""
            withInnerLines={false}
            showValuesOnTopOfBars={false}
            fromZero
            chartConfig={{
              backgroundGradientFrom: theme.surface,
              backgroundGradientTo: theme.surface,
              backgroundGradientFromOpacity: 0,
              backgroundGradientToOpacity: 0,
              color: (opacity = 1) => `rgba(255, 98, 0, ${opacity})`,
              labelColor: () => theme.textSecondary,
              barRadius: 4,
              decimalPlaces: 0,
              propsForBackgroundLines: { stroke: 'transparent' },
              propsForLabels: { fontSize: 12, fontWeight: '600' },
            }}
            style={styles.chart}
          />
        ) : (
          <View style={styles.chartEmpty}>
            <Text style={styles.chartEmptyText}>Log workouts to see volume</Text>
          </View>
        )}
      </Card>

      {/* ── Recent workouts label ── */}
      {recentWorkouts.length > 0 && (
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Recent Workouts</Text>
          <TouchableOpacity onPress={() => {
            sendEngagementTelemetry({
              feature: 'home',
              action: 'workout_history_opened',
              context: 'see_all_recent',
            });
            router.push('/workout-history' as any);
          }}>
            <Text style={styles.seeAll}>See all</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  ), [
    greeting,
    firstName,
    streak,
    resumeWorkoutName,
    hasActiveWorkout,
    chartLabels,
    chartData,
    chartMax,
    totalVolumeThisWeek,
    handleNewWorkout,
    handleResumeWorkout,
    handleDismissResume,
    workoutDaysThisWeek,
    nutritionTrackedDays,
    weeklyConsistencyScore,
    weeklyDeltaRecap,
    milestone.next,
    milestone.progress,
    completedWorkoutsCount,
    streakAtRisk,
    handleWeeklyRecapPress,
    router,
  ]);

  const EmptyWorkouts = useCallback(() => (
    <View style={styles.emptyState}>
      <Ionicons name="barbell-outline" size={56} color={theme.charcoal} />
      <Text style={styles.emptyTitle}>No workouts yet</Text>
      <Text style={styles.emptySubtitle}>Hit the button above to start your first session!</Text>
    </View>
  ), []);

  // ── Render ────────────────────────────────────────────────────────────────
  if (isLoading && workouts.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <FlatList
        data={recentWorkouts}
        keyExtractor={(item) => item.workout_id}
        renderItem={({ item }) => (
          <WorkoutCard
            workout={item}
            onPress={() => handleWorkoutPress(item)}
            onDelete={() => handleDeleteWorkout(item)}
          />
        )}
        ListHeaderComponent={<ListHeader />}
        ListEmptyComponent={<EmptyWorkouts />}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.primary}
          />
        }
      />

      {/* ── Build banner (debug) — hidden, keep for future debugging ── */}
      <View style={[styles.buildBanner, { display: 'none' }]}>
        <Text style={styles.buildBannerText}>BUILD: {BUILD_LABEL}</Text>
      </View>

      {/* ── Quick Log FAB ── */}
      <TouchableOpacity
        style={[styles.fab, hasActiveWorkout && styles.fabDisabled]}
        onPress={handleQuickLog}
        disabled={hasActiveWorkout}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={30} color={theme.textPrimary} />
      </TouchableOpacity>

    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },

  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 100, // clear FAB
  },

  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── Header ──
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingTop: 12,
    paddingBottom: 20,
  },
  greeting: {
    fontSize: 14,
    color: theme.textSecondary,
    fontWeight: '500',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 2,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: theme.textPrimary,
    letterSpacing: -0.5,
  },
  streakBadge: {
    marginBottom: 2,
  },
  programsBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: theme.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.border,
    marginTop: 14,
  },

  // ── Start Workout CTA ──
  ctaButton: {
    backgroundColor: theme.primary,
    borderRadius: 14,
    paddingVertical: 18,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    ...Platform.select({
      ios: {
        shadowColor: theme.primary,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.45,
        shadowRadius: 12,
      },
      android: { elevation: 8 },
    }),
  },
  ctaButtonDisabled: {
    opacity: 0.45,
  },
  ctaDisabledNote: {
    color: theme.textSecondary,
    fontSize: 12,
    marginTop: -6,
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  bodyGoalCard: {
    backgroundColor: theme.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  bodyGoalLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  bodyGoalTitle: {
    color: theme.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  bodyGoalSubtitle: {
    color: theme.textSecondary,
    fontSize: 12,
    marginTop: 1,
  },
  engagementCard: {
    marginBottom: 16,
    gap: 12,
  },
  engagementHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  momentumStatsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  momentumStatChip: {
    flex: 1,
    backgroundColor: theme.charcoal,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  momentumStatValue: {
    color: theme.textPrimary,
    fontSize: 18,
    fontWeight: '800',
  },
  momentumStatLabel: {
    color: theme.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  milestoneRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  milestoneLabel: {
    color: theme.textSecondary,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  milestoneTitle: {
    color: theme.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    marginTop: 2,
  },
  milestoneMeta: {
    color: theme.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  milestoneTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: theme.charcoal,
    overflow: 'hidden',
  },
  milestoneFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: theme.primary,
  },
  weeklyRecapButton: {
    marginTop: 4,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 2,
  },
  weeklyRecapText: {
    color: theme.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  streakWarningCard: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 186, 92, 0.35)',
    backgroundColor: 'rgba(255, 186, 92, 0.08)',
  },
  streakWarningContent: {
    flex: 1,
  },
  streakWarningTitle: {
    color: theme.warning,
    fontSize: 12,
    fontWeight: '700',
  },
  streakWarningSubtitle: {
    color: theme.textSecondary,
    fontSize: 11,
    marginTop: 1,
  },
  streakWarningAction: {
    color: theme.warning,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  ctaInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  ctaText: {
    color: theme.textPrimary,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.2,
  },

  // ── Chart ──
  chartCard: {
    marginBottom: 24,
    overflow: 'hidden',
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 16,
    paddingBottom: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.textPrimary,
    letterSpacing: 0.1,
  },
  chartSubtitle: {
    fontSize: 12,
    color: theme.textSecondary,
    marginTop: 2,
  },
  chart: {
    paddingRight: 0,
    paddingBottom: 8,
    marginHorizontal: -4,
  },
  chartEmpty: {
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 16,
  },
  chartEmptyText: {
    color: theme.textSecondary,
    fontSize: 13,
  },

  // ── Recent workouts ──
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  seeAll: {
    fontSize: 13,
    color: theme.primary,
    fontWeight: '600',
  },

  // ── Empty state ──
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 48,
    gap: 10,
  },
  emptyTitle: {
    color: theme.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  emptySubtitle: {
    color: theme.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 32,
  },

  // ── Resume banner ──
  resumeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.charcoal,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.primary,
    gap: 12,
  },
  resumeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  resumeLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  resumeName: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.textPrimary,
    marginTop: 1,
  },
  resumeRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  resumeCta: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.primary,
  },

  // ── Build banner ──
  buildBanner: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#b91c1c',
    paddingVertical: 10,
    marginTop: 16,
    alignItems: 'center',
  },
  buildBannerText: {
    textAlign: 'center',
    fontWeight: 'bold',
    fontSize: 14,
    color: '#ffffff',
  },

  // ── FAB ──
  fab: {
    position: 'absolute',
    bottom: 28,
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: theme.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: theme.primary,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.5,
        shadowRadius: 14,
      },
      android: { elevation: 10 },
    }),
  },
  fabDisabled: {
    opacity: 0.45,
  },
});
