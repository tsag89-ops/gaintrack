// frontend/src/components/charts/OneRMChart.tsx
// Reusable 1RM progress line chart using Brzycki formula.
// [PRO] — renders ProGate for free users.

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TouchableOpacity } from 'react-native';
import { colors, typography, spacing, radii } from '../../constants/theme';
import { usePro } from '../../hooks/usePro';
import { calc1RM } from '../../utils/fitness';
import type { Workout, WorkoutExercise } from '../../types';

interface Props {
  exerciseName: string;
  workouts: Workout[];
}

const SCREEN_W = Dimensions.get('window').width;

const shortDate = (dateStr: string): string => {
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? '?' : (d.getMonth() + 1) + '/' + d.getDate();
};

export function OneRMChart({ exerciseName, workouts }: Props) {
  const { isPro } = usePro();
  const router = useRouter();

  // [PRO] — block non-Pro users
  if (!isPro) {
    return (
      <View style={styles.proGate}>
        <View style={styles.proGateIconWrap}>
          <Ionicons name="lock-closed" size={24} color={colors.primary} />
        </View>
        <Text style={styles.proGateTitle}>1RM Progress Chart</Text>
        <Text style={styles.proGateBody}>Unlock strength trending with GainTrack Pro</Text>
        <TouchableOpacity
          style={styles.proGateBtn}
          activeOpacity={0.85}
          onPress={() => router.push('/pro-paywall' as any)}
        >
          <Ionicons name="flash" size={14} color={colors.background} />
          <Text style={styles.proGateBtnText}>Upgrade — $4.99/yr</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const chartData = useMemo(() => {
    const pts: { date: string; val: number }[] = [];
    workouts.forEach((w) => {
      const ex: WorkoutExercise | undefined = w.exercises.find(
        (e) => (e.exercise_name ?? '').toLowerCase() === exerciseName.toLowerCase()
      );
      if (!ex) return;
      const best = Math.max(
        0,
        ...ex.sets
          .filter((s) => s.reps > 0 && s.weight > 0)
          .map((s) => calc1RM(s.weight, s.reps))
      );
      if (best > 0) pts.push({ date: w.date, val: best });
    });
    const last = pts
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-10);
    return {
      labels: last.map((p) => shortDate(p.date)),
      data:   last.map((p) => p.val),
    };
  }, [workouts, exerciseName]);

  if (chartData.labels.length < 2) {
    return (
      <View style={styles.emptyCard}>
        <Ionicons name="bar-chart-outline" size={36} color={colors.textDisabled} />
        <Text style={styles.emptyTitle}>Not enough data</Text>
        <Text style={styles.emptySubtitle}>Log at least 2 sessions with {exerciseName} to see a trend</Text>
      </View>
    );
  }

  const best   = Math.max(...chartData.data);
  const latest = chartData.data[chartData.data.length - 1];
  const first  = chartData.data[0];
  const delta  = Math.round((latest - first) * 10) / 10;

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Estimated 1RM — {exerciseName}</Text>
      <Text style={styles.cardSubtitle}>Brzycki formula · last {chartData.labels.length} sessions</Text>

      <LineChart
        data={{
          labels:   chartData.labels,
          datasets: [{ data: chartData.data, strokeWidth: 2 }],
        }}
        width={SCREEN_W - 48}
        height={200}
        yAxisSuffix=" kg"
        chartConfig={{
          backgroundColor:         colors.surface,
          backgroundGradientFrom:  colors.surface,
          backgroundGradientTo:    colors.surface,
          decimalPlaces:           0,
          color:                   (opacity = 1) => `rgba(255, 98, 0, ${opacity})`,
          labelColor:              (opacity = 1) => `rgba(176, 176, 176, ${opacity})`,
          propsForDots:            { r: '4', strokeWidth: '2', stroke: colors.primary },
          propsForBackgroundLines: { stroke: colors.border, strokeDasharray: '' },
        }}
        bezier
        withShadow={false}
        formatYLabel={(y) => String(Math.round(Number(y)))}
        style={styles.chart}
      />

      <View style={styles.statRow}>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{best} kg</Text>
          <Text style={styles.statLabel}>Best 1RM</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{latest} kg</Text>
          <Text style={styles.statLabel}>Latest</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={[styles.statValue, { color: delta >= 0 ? colors.success : colors.error }]}>
            {delta >= 0 ? '+' : ''}{delta} kg
          </Text>
          <Text style={styles.statLabel}>Change</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // ── ProGate ────────────────────────────────────────────────────────────────
  proGate: {
    backgroundColor: colors.surface,
    borderRadius:    radii.lg,
    padding:         spacing[6],
    alignItems:      'center',
    marginBottom:    spacing[4],
  },
  proGateIconWrap: {
    backgroundColor: colors.charcoal,
    borderRadius:    radii.full,
    padding:         spacing[3],
    marginBottom:    spacing[3],
  },
  proGateTitle: {
    color:        colors.textPrimary,
    fontSize:     typography.fontSize.lg,
    fontWeight:   typography.fontWeight.bold,
    marginBottom: spacing[1],
  },
  proGateBody: {
    color:        colors.textSecondary,
    fontSize:     typography.fontSize.sm,
    marginBottom: spacing[4],
    textAlign:    'center',
  },
  proGateBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               spacing[1],
    backgroundColor:   colors.primary,
    paddingHorizontal: spacing[6],
    paddingVertical:   spacing[3],
    borderRadius:      radii.full,
  },
  proGateBtnText: {
    color:      colors.background,
    fontWeight: typography.fontWeight.bold,
    fontSize:   typography.fontSize.sm,
  },

  // ── Chart card ─────────────────────────────────────────────────────────────
  card: {
    backgroundColor: colors.surface,
    borderRadius:    radii.lg,
    padding:         spacing[4],
    marginBottom:    spacing[4],
  },
  cardTitle: {
    color:        colors.textPrimary,
    fontSize:     typography.fontSize.md,
    fontWeight:   typography.fontWeight.bold,
    marginBottom: spacing[1],
  },
  cardSubtitle: {
    color:        colors.textSecondary,
    fontSize:     typography.fontSize.xs,
    marginBottom: spacing[3],
  },
  chart: {
    borderRadius: radii.md,
  },

  // ── Stats row ──────────────────────────────────────────────────────────────
  statRow: {
    flexDirection:  'row',
    marginTop:      spacing[3],
  },
  statBox: {
    flex:       1,
    alignItems: 'center',
  },
  statValue: {
    color:      colors.textPrimary,
    fontSize:   typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
  },
  statLabel: {
    color:    colors.textSecondary,
    fontSize: typography.fontSize.xs,
    marginTop: 2,
  },

  // ── Empty state ────────────────────────────────────────────────────────────
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius:    radii.lg,
    padding:         spacing[6],
    alignItems:      'center',
    marginBottom:    spacing[4],
  },
  emptyTitle: {
    color:        colors.textPrimary,
    fontSize:     typography.fontSize.base,
    fontWeight:   typography.fontWeight.semibold,
    marginTop:    spacing[2],
    marginBottom: spacing[1],
  },
  emptySubtitle: {
    color:     colors.textSecondary,
    fontSize:  typography.fontSize.sm,
    textAlign: 'center',
  },
});
