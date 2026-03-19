// app/programs/[id].tsx
// GainTrack — Program detail: day-by-day breakdown + "Start Session" button
// Pre-loads active.tsx with auto-progressed weights via workoutStore

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { format } from 'date-fns';
import { usePrograms } from '../../src/hooks/usePrograms';
import { useAutoProgress } from '../../src/hooks/useAutoProgress';
import { usePro } from '../../src/hooks/usePro';
import { ProgressionBadge } from '../../src/components/programs/ProgressionBadge';
import { useWorkoutStore } from '../../src/store/workoutStore';
import { WorkoutProgram, ProgramDay, ProgramExercise, WorkoutExercise, WorkoutSet } from '../../src/types';
import { EXERCISES } from '../../src/constants/exercises';
import { colors, typography, radii, spacing, shadows } from '../../src/constants/theme';
import { getPrograms } from '../../src/services/storage';
import { useLanguage } from '../../src/context/LanguageContext';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

/** Convert a ProgramExercise to a WorkoutExercise with pre-filled sets. */
const toWorkoutExercise = (ex: ProgramExercise): WorkoutExercise => {
  const found = EXERCISES.find(
    (e) => e.name.toLowerCase() === ex.exerciseName.toLowerCase(),
  );
  const rawSets = ex.setDetails && ex.setDetails.length > 0
    ? ex.setDetails
    : Array.from({ length: ex.sets }, () => ({ reps: ex.reps, weight: ex.weight }));
  const sets: WorkoutSet[] = rawSets.map((s, i) => ({
    set_id: `${makeId()}_${i}`,
    set_number: i + 1,
    reps: s.reps,
    weight: s.weight,
    completed: false,
    is_warmup: false,
  }));
  return {
    exercise_id: found?.id ?? makeId(),
    exercise_name: ex.exerciseName,
    exercise: found ?? {
      id: makeId(),
      exercise_id: makeId(),
      name: ex.exerciseName,
      muscleGroup: 'Other',
      muscle_groups: ['Other'],
      category: 'Strength',
      equipment_required: [],
      is_compound: false,
      videoUrl: '',
    },
    sets,
  };
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function ProgramDetailScreen() {
  const router = useRouter();
  const { t } = useLanguage();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { programs, removeOne } = usePrograms();
  const { calculateNextSession } = useAutoProgress();
  const { isPro } = usePro();
  const { startWorkout, addExerciseToWorkout } = useWorkoutStore();

  const [program, setProgram] = useState<WorkoutProgram | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // prefer live programs from hook, fallback to storage
    const found = programs.find((p) => p.id === id);
    if (found) {
      setProgram(found);
      setLoading(false);
      return;
    }
    if (id) {
      getPrograms().then((all) => {
        setProgram(all.find((p) => p.id === id) ?? null);
        setLoading(false);
      });
    }
  }, [id, programs]);

  const handleStartSession = useCallback(() => {
    if (!program) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const nextDay = calculateNextSession(program, program.currentDayIndex);
    const workoutName = `${program.name} — ${nextDay.label} (Cycle ${program.currentCycle})`;

    // Pre-populate current workout in store
    startWorkout(workoutName);
    nextDay.exercises.forEach((ex) => {
      addExerciseToWorkout(toWorkoutExercise(ex));
    });

    // Navigate to active screen, pass programId + dayIndex so it can advance on finish
    router.push(
      `/workout/active?name=${encodeURIComponent(workoutName)}&programId=${program.id}&dayIndex=${program.currentDayIndex}` as any,
    );
  }, [program, calculateNextSession, startWorkout, addExerciseToWorkout, router]);

  const handleDelete = useCallback(() => {
    if (!program) return;
    Alert.alert(t('programDetail.deleteTitle'), t('programDetail.deleteMessage', { name: program.name }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('programDetail.deleteAction'),
        style: 'destructive',
        onPress: async () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          await removeOne(program.id);
          router.replace('/(tabs)/programs' as any);
        },
      },
    ]);
  }, [program, removeOne, router, t]);

  if (loading) {
    return (
      <SafeAreaView style={styles.screen}>
        <ActivityIndicator style={{ flex: 1 }} color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (!program) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.textDisabled} />
          <Text style={styles.errorText}>{t('programDetail.notFound')}</Text>
          <TouchableOpacity style={styles.backLink} onPress={() => router.back()}>
            <Text style={styles.backLinkText}>{t('programDetail.goBack')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const nextDay = calculateNextSession(program, program.currentDayIndex);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{program.name}</Text>
        <TouchableOpacity
          onPress={() => router.push(`/programs/builder?id=${program.id}` as any)}
          hitSlop={8}
        >
          <Ionicons name="create-outline" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={handleDelete} hitSlop={8}>
          <Ionicons name="trash-outline" size={20} color={colors.error} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Program meta */}
        <Animated.View entering={FadeInDown.springify()} style={styles.metaCard}>
          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Text style={styles.metaValue}>{program.daysPerWeek}×</Text>
              <Text style={styles.metaLabel}>{t('programDetail.perWeek')}</Text>
            </View>
            <View style={styles.metaDivider} />
            <View style={styles.metaItem}>
              <Text style={styles.metaValue}>Cycle {program.currentCycle}</Text>
              <Text style={styles.metaLabel}>{t('programDetail.current')}</Text>
            </View>
            <View style={styles.metaDivider} />
            <View style={styles.metaItem}>
              <Text style={styles.metaValue}>
                {program.currentDayIndex + 1}/{program.daysPerWeek}
              </Text>
              <Text style={styles.metaLabel}>{t('programDetail.daysDone')}</Text>
            </View>
          </View>

          {/* Progress bar */}
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${(program.currentDayIndex / program.daysPerWeek) * 100}%`,
                },
              ]}
            />
          </View>
        </Animated.View>

        {/* Next session preview */}
        <Animated.View entering={FadeInDown.delay(60).springify()} style={styles.nextSessionCard}>
          <View style={styles.nextSessionHeader}>
            <View style={styles.nextSessionBadge}>
              <Text style={styles.nextSessionBadgeText}>{t('programDetail.nextSession')}</Text>
            </View>
            <Text style={styles.nextSessionDate}>
              {program.lastSessionDate
                ? t('programDetail.lastSession', { date: program.lastSessionDate })
                : t('programDetail.created', { date: format(new Date(program.createdAt), 'MMM d') })}
            </Text>
          </View>
          <Text style={styles.nextSessionLabel}>{nextDay.label}</Text>
          <Text style={styles.nextSessionExCount}>
            {t('programDetail.exerciseCount', { count: nextDay.exercises.length })}
            {program.currentCycle > 1 && ` · ${t('programDetail.autoProgressed')}`}
          </Text>
        </Animated.View>

        {/* Day-by-day breakdown */}
        {program.days.map((day, i) => {
          const isNext = i === program.currentDayIndex;
          const isDone = i < program.currentDayIndex;
          const progressedDay = isNext
            ? calculateNextSession(program, i)
            : day;

          return (
            <Animated.View
              key={day.id}
              entering={FadeInDown.delay(80 + i * 50).springify()}
              style={[styles.dayCard, isNext && styles.dayCardNext]}
            >
              <View style={styles.dayHeader}>
                <View style={styles.dayIndexBadge}>
                  {isDone ? (
                    <Ionicons name="checkmark" size={14} color={colors.success} />
                  ) : (
                    <Text style={styles.dayIndexText}>{i + 1}</Text>
                  )}
                </View>
                <Text style={[styles.dayLabel, isNext && styles.dayLabelNext]}>
                  {day.label}
                </Text>
                {isNext && (
                  <View style={styles.nextBadge}>
                    <Text style={styles.nextBadgeText}>{t('programDetail.next')}</Text>
                  </View>
                )}
              </View>

              {progressedDay.exercises.length === 0 ? (
                <Text style={styles.noExText}>{t('programDetail.noExercises')}</Text>
              ) : (
                progressedDay.exercises.map((ex) => {
                  const meta = ex.setDetails && ex.setDetails.length > 0
                    ? ex.setDetails.map((s) => `${s.weight}kg×${s.reps}`).join(' / ')
                    : `${ex.sets}×${ex.reps} @ ${ex.weight} kg`;
                  return (
                    <View key={ex.exerciseName} style={styles.exRow}>
                      <View style={styles.exInfo}>
                        <Text style={styles.exName}>{ex.exerciseName}</Text>
                        <Text style={styles.exMeta} numberOfLines={2}>{meta}</Text>
                      </View>
                      <ProgressionBadge rule={ex.progression} cycle={program.currentCycle} compact />
                    </View>
                  );
                })
              )}

              {/* Completed session history */}
              {(day.completedSessions?.length ?? 0) > 0 && (
                <View style={styles.historySection}>
                  <Text style={styles.historyTitle}>{t('programDetail.sessionHistory')}</Text>
                  {[...(day.completedSessions ?? [])].reverse().slice(0, 3).map((session, si) => (
                    <View key={si} style={styles.historyRow}>
                      <Text style={styles.historyDate}>{session.date}</Text>
                      {session.exercises.map((hEx) => (
                        <Text key={hEx.exerciseName} style={styles.historyExLine} numberOfLines={1}>
                          {hEx.exerciseName}: {hEx.sets.map(s => `${s.weight}kg×${s.reps}`).join(' / ')}
                        </Text>
                      ))}
                    </View>
                  ))}
                </View>
              )}
            </Animated.View>
          );
        })}

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Start Session CTA */}
      <View style={styles.startSessionWrap}>
        <TouchableOpacity style={styles.startSessionBtn} onPress={handleStartSession}>
          <Ionicons name="play" size={20} color={colors.textPrimary} />
          <Text style={styles.startSessionText}>{t('programDetail.startSession', { label: nextDay.label })}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  headerTitle: {
    flex: 1,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
  },
  scrollContent: { paddingHorizontal: spacing[4], gap: spacing[3] },
  metaCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing[4],
    ...shadows.sm,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing[3],
  },
  metaItem: { flex: 1, alignItems: 'center' },
  metaValue: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
  },
  metaLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  metaDivider: {
    width: 1,
    height: 36,
    backgroundColor: colors.border,
  },
  progressTrack: {
    height: 6,
    backgroundColor: colors.charcoal,
    borderRadius: radii.full,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: radii.full,
  },
  nextSessionCard: {
    backgroundColor: colors.primaryMuted,
    borderRadius: radii.xl,
    padding: spacing[4],
    borderWidth: 1,
    borderColor: `${colors.primary}40`,
  },
  nextSessionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing[1],
  },
  nextSessionBadge: {
    backgroundColor: colors.primary,
    borderRadius: radii.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  nextSessionBadgeText: {
    fontSize: typography.fontSize.xs,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0.5,
  },
  nextSessionDate: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
  },
  nextSessionLabel: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
    marginTop: spacing[1],
  },
  nextSessionExCount: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    marginTop: 4,
  },
  dayCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing[3],
    ...shadows.sm,
  },
  dayCardNext: {
    borderWidth: 1,
    borderColor: colors.primary,
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    marginBottom: spacing[2],
  },
  dayIndexBadge: {
    width: 24,
    height: 24,
    borderRadius: radii.full,
    backgroundColor: colors.charcoal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayIndexText: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
    fontWeight: typography.fontWeight.bold,
  },
  dayLabel: {
    flex: 1,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textPrimary,
  },
  dayLabelNext: { color: colors.primary },
  nextBadge: {
    backgroundColor: colors.primaryMuted,
    borderRadius: radii.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  nextBadgeText: {
    fontSize: typography.fontSize.xs,
    color: colors.primary,
    fontWeight: typography.fontWeight.bold,
  },
  noExText: {
    fontSize: typography.fontSize.sm,
    color: colors.textDisabled,
    fontStyle: 'italic',
  },
  exRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  exInfo: { flex: 1 },
  exName: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.textPrimary,
  },
  exMeta: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
    marginTop: 1,
  },
  historySection: {
    marginTop: spacing[2],
    paddingTop: spacing[2],
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  historyTitle: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginBottom: 6,
  },
  historyRow: {
    marginBottom: spacing[2],
    padding: spacing[2],
    backgroundColor: colors.background,
    borderRadius: radii.md,
  },
  historyDate: {
    fontSize: typography.fontSize.xs,
    color: colors.primary,
    fontWeight: typography.fontWeight.semibold,
    marginBottom: 2,
  },
  historyExLine: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
  },
  startSessionWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing[4],
    backgroundColor: `${colors.background}F0`,
  },
  startSessionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    backgroundColor: colors.primary,
    borderRadius: radii.xl,
    paddingVertical: spacing[4],
    ...shadows.md,
  },
  startSessionText: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[3],
  },
  errorText: {
    fontSize: typography.fontSize.lg,
    color: colors.textSecondary,
  },
  backLink: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
  },
  backLinkText: {
    fontSize: typography.fontSize.base,
    color: colors.primary,
    fontWeight: typography.fontWeight.semibold,
  },
});
