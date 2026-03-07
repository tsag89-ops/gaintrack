// app/(tabs)/index.tsx
// GainTrack — Hevy-style Home Dashboard

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Dimensions,
  Platform,
  Modal,
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
import { ExercisePicker } from '../../src/components/ExercisePicker';
import { usePro } from '../../src/hooks/usePro';
import { Workout, Exercise } from '../../src/types';
import { theme } from '../../src/constants/theme';
import {
  calculateWorkoutVolume,
  formatVolume,
} from '../../src/utils/helpers';
import { format, subDays, parseISO, isSameDay } from 'date-fns';

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

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const router = useRouter();
  const { workouts, isLoading, loadUserWorkouts, deleteWorkout } = useWorkoutStore();
  const { user } = useAuthStore();
  const { uid } = useNativeAuthState();
  const { isPro } = usePro();
  const [refreshing, setRefreshing] = useState(false);
  const [exercisePickerVisible, setExercisePickerVisible] = useState(false);
  const [resumeWorkoutName, setResumeWorkoutName] = useState<string | null>(null);

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

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleNewWorkout = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push('/workout/new');
  };

  const handleQuickLog = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    router.push('/workout/new');
  };

  const handleResumeWorkout = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    router.push({ pathname: '/workout/active', params: { name: resumeWorkoutName ?? '' } });
  };

  const handleDismissResume = async () => {
    await Haptics.selectionAsync();
    await AsyncStorage.removeItem('gaintrack_active_workout');
    setResumeWorkoutName(null);
  };

  const handleBrowseExercises = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExercisePickerVisible(true);
  };

  const handleExercisePickerClose = () => {
    setExercisePickerVisible(false);
  };

  // In browse mode: close picker and start a new workout pre-populated with the exercise
  const handleExerciseAdd = async (exercise: Exercise) => {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setExercisePickerVisible(false);
    router.push({
      pathname: '/workout/new',
      params: { preloadExercise: JSON.stringify(exercise) },
    });
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
    router.push(`/workout/${workout.workout_id}`);
  };

  // ── Greeting ──────────────────────────────────────────────────────────────
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = user?.name?.split(' ')[0] ?? 'Athlete';

  // ── Sub-components ────────────────────────────────────────────────────────

  const ListHeader = () => (
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
          onPress={() => router.push('/programs')}
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
        style={styles.ctaButton}
        onPress={handleNewWorkout}
        activeOpacity={0.82}
      >
        <View style={styles.ctaInner}>
          <Ionicons name="barbell-outline" size={24} color={theme.textPrimary} />
          <Text style={styles.ctaText}>Start Workout</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.6)" />
      </TouchableOpacity>

      {/* ── Browse Exercises button ── */}
      <TouchableOpacity
        style={styles.browseBtn}
        onPress={handleBrowseExercises}
        activeOpacity={0.75}
      >
        <Ionicons name="search-outline" size={18} color={theme.primary} />
        <Text style={styles.browseBtnText}>Browse Exercises</Text>
        <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
      </TouchableOpacity>

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
            height={140}
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
          <TouchableOpacity onPress={() => router.push('/progress')}>
            <Text style={styles.seeAll}>See all</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  const EmptyWorkouts = () => (
    <View style={styles.emptyState}>
      <Ionicons name="barbell-outline" size={56} color={theme.charcoal} />
      <Text style={styles.emptyTitle}>No workouts yet</Text>
      <Text style={styles.emptySubtitle}>Hit the button above to start your first session!</Text>
    </View>
  );

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

      {/* ── Quick Log FAB ── */}
      <TouchableOpacity
        style={styles.fab}
        onPress={handleQuickLog}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={30} color={theme.textPrimary} />
      </TouchableOpacity>

      {/* ── Exercise Picker Modal ── */}
      <Modal
        visible={exercisePickerVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleExercisePickerClose}
      >
        <ExercisePicker
          onAdd={handleExerciseAdd}
          onClose={handleExercisePickerClose}
          isPro={isPro}
          addedExerciseIds={[]}
        />
      </Modal>
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

  // ── Browse Exercises button ──
  browseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: theme.surface,
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: theme.border,
  },
  browseBtnText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: theme.textPrimary,
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
});
