// app/(tabs)/progress.tsx
// Hevy-style analytics — 1RM trend, weekly volume, PRs, bodyweight tracker
// [PRO] Entire screen is Pro-gated

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  Modal,
  FlatList,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LineChart, BarChart } from 'react-native-chart-kit';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useRouter } from 'expo-router';
import { format, addWeeks } from 'date-fns';
import * as Haptics from 'expo-haptics';
import { colors, typography, spacing, radii } from '../../src/constants/theme';
import { usePro } from '../../src/hooks/usePro';
import { calc1RM } from '../../src/utils/fitness';
import { GOAL_KEY, type BodyCompositionGoal } from '../body-composition-goal';

// ── Constants ─────────────────────────────────────────────────────────────────

const SCREEN_W = Dimensions.get('window').width;
const WORKOUTS_KEY = 'gaintrack_workouts';
const MEASUREMENTS_KEY = 'gaintrack_measurements';
const NUTRITION_KEY = 'gaintrack_nutrition';
const KCAL_PER_KG = 7700;

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = '1rm' | 'volume' | 'prs' | 'bodyweight' | 'nutrition';

interface StoredSet {
  reps: number;
  weight: number;
  set_number?: number;
  completed?: boolean;
}

interface StoredExercise {
  exercise_id?: string;
  exercise_name?: string;
  name?: string;
  sets: StoredSet[];
}

interface StoredWorkout {
  workout_id: string;
  name?: string;
  date: string;
  exercises?: StoredExercise[];
}

interface StoredMeasurement {
  date: string;
  weight?: number;
  bodyweight?: number;
  body_weight?: number;
  bodyWeight?: number;
}

interface PREntry {
  exerciseName: string;
  oneRM: number;
  date: string;
  reps: number;
  weight: number;
}

interface ChartDataSet {
  labels: string[];
  data: number[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** ISO week label e.g. "2025-W04" */
const isoWeekLabel = (dateStr: string): string => {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 'bad';
  const day = d.getDay() || 7;
  d.setDate(d.getDate() + 4 - day);
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return d.getFullYear() + '-W' + String(week).padStart(2, '0');
};

const shortDate = (dateStr: string): string => {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '?';
  return (d.getMonth() + 1) + '/' + d.getDate();
};

const getExName = (ex: StoredExercise): string =>
  (ex.exercise_name ?? ex.name ?? '').trim();

const getBW = (m: StoredMeasurement): number =>
  m.weight ?? m.bodyweight ?? (m as any).body_weight ?? (m as any).bodyWeight ?? 0;

// ── Chart config ──────────────────────────────────────────────────────────────

const CHART_CFG = {
  backgroundColor: colors.surface,
  backgroundGradientFrom: colors.surface,
  backgroundGradientTo: colors.surface,
  decimalPlaces: 0,
  color: (opacity = 1) => `rgba(255, 98, 0, ${opacity})`,
  labelColor: (opacity = 1) => `rgba(176, 176, 176, ${opacity})`,
  propsForDots: { r: '4', strokeWidth: '2', stroke: colors.primary },
  propsForBackgroundLines: { stroke: colors.border, strokeDasharray: '' },
};

// ── Extracted sub-components (defined outside ProgressScreen to keep stable
//     React element identity — prevents unmount/remount on every tab render) ──

const ExerciseSelector = React.memo(function ExerciseSelector({
  selectedExercise,
  onPress,
}: {
  selectedExercise: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.exerciseSelector} onPress={onPress} activeOpacity={0.75}>
      <Text style={styles.exerciseSelectorText} numberOfLines={1}>
        {selectedExercise || 'Select Exercise'}
      </Text>
      <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
    </TouchableOpacity>
  );
});

const EmptyState = React.memo(function EmptyState({
  icon,
  title,
  subtitle,
}: {
  icon: string;
  title: string;
  subtitle: string;
}) {
  return (
    <View style={styles.emptyCard}>
      <Ionicons name={icon as any} size={40} color={colors.textDisabled} />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptySubtitle}>{subtitle}</Text>
    </View>
  );
});

const StatBox = React.memo(function StatBox({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <View style={styles.statBox}>
      <Text style={[styles.statBoxValue, valueColor ? { color: valueColor } : undefined]}>{value}</Text>
      <Text style={styles.statBoxLabel}>{label}</Text>
    </View>
  );
});

// ── Screen ────────────────────────────────────────────────────────────────────

export default function ProgressScreen() {
  const { isPro } = usePro();
  const router = useRouter();

  const [workouts, setWorkouts] = useState<StoredWorkout[]>([]);
  const [measurements, setMeasurements] = useState<StoredMeasurement[]>([]);
  const [nutritionDays, setNutritionDays] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('1rm');
  const [selectedExercise, setSelectedExercise] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [goal, setGoal] = useState<BodyCompositionGoal | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [wRaw, mRaw, nRaw, gRaw] = await Promise.all([
        AsyncStorage.getItem(WORKOUTS_KEY),
        AsyncStorage.getItem(MEASUREMENTS_KEY),
        AsyncStorage.getItem(NUTRITION_KEY),
        AsyncStorage.getItem(GOAL_KEY),
      ]);
      const wArr: StoredWorkout[] = wRaw ? JSON.parse(wRaw) : [];
      const mArr: StoredMeasurement[] = mRaw ? JSON.parse(mRaw) : [];
      const nArr: any[] = nRaw ? JSON.parse(nRaw) : [];
      setNutritionDays(nArr);
      setGoal(gRaw ? (JSON.parse(gRaw) as BodyCompositionGoal) : null);
      const sortedW = [...wArr].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      );
      const sortedM = [...mArr].sort((a, b) => a.date.localeCompare(b.date));
      // Filter out workouts with no exercises and zero volume
      const filteredW = sortedW.filter((w) => {
        const exercises = w.exercises ?? [];
        return !(exercises.length === 0 &&
          exercises.reduce(
            (v, ex) =>
              v + (ex.sets ?? []).reduce(
                (sv, s) => sv + (s.weight ?? 0) * (s.reps ?? 0),
                0,
              ),
            0,
          ) === 0);
      });
      setWorkouts(filteredW);
      setMeasurements(sortedM);
      if (sortedW.length > 0) {
        const first = sortedW
          .flatMap((w) => (w.exercises ?? []).map(getExName))
          .find(Boolean);
        if (first) setSelectedExercise((prev) => prev || first);
      }
    } catch (e) {
      console.error('[ProgressScreen] load error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const allExerciseNames = useMemo(() => {
    const s = new Set<string>();
    workouts.forEach((w) =>
      (w.exercises ?? []).forEach((ex) => {
        const n = getExName(ex);
        if (n) s.add(n);
      }),
    );
    return Array.from(s).sort();
  }, [workouts]);

  const oneRMChart = useMemo((): ChartDataSet => {
    const pts: { date: string; val: number }[] = [];
    workouts.forEach((w) => {
      const ex = (w.exercises ?? []).find((e) => getExName(e) === selectedExercise);
      if (!ex) return;
      const best = Math.max(
        0,
        ...(ex.sets ?? [])
          .filter((s) => s.reps > 0 && s.weight > 0)
          .map((s) => calc1RM(s.weight, s.reps)),
      );
      if (best > 0) pts.push({ date: w.date, val: best });
    });
    const last = pts.slice(-10);
    return { labels: last.map((p) => shortDate(p.date)), data: last.map((p) => p.val) };
  }, [workouts, selectedExercise]);

  const volumeChart = useMemo((): ChartDataSet => {
    const map = new Map<string, number>();
    workouts.forEach((w) => {
      const wk = isoWeekLabel(w.date);
      let vol = 0;
      (w.exercises ?? []).forEach((ex) => {
        if (selectedExercise && getExName(ex) !== selectedExercise) return;
        (ex.sets ?? [])
          .filter((s) => s.reps > 0 && s.weight > 0)
          .forEach((s) => { vol += s.weight * s.reps; });
      });
      // Skip workouts with zero volume so they don't create empty week entries
      if (vol > 0) map.set(wk, (map.get(wk) ?? 0) + vol);
    });
    const sorted = Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-8);
    return {
      labels: sorted.map(([wk]) => 'W' + (wk.split('-W')[1] ?? wk)),
      data: sorted.map(([, v]) => Math.round(v)),
    };
  }, [workouts, selectedExercise]);

  const prList = useMemo((): PREntry[] => {
    const map = new Map<string, PREntry>();
    workouts.forEach((w) => {
      (w.exercises ?? []).forEach((ex) => {
        const n = getExName(ex);
        if (!n) return;
        (ex.sets ?? [])
          .filter((s) => s.reps > 0 && s.weight > 0)
          .forEach((s) => {
            const rm = calc1RM(s.weight, s.reps);
            const cur = map.get(n);
            if (!cur || rm > cur.oneRM) {
              map.set(n, { exerciseName: n, oneRM: rm, date: w.date, reps: s.reps, weight: s.weight });
            }
          });
      });
    });
    return Array.from(map.values()).sort((a, b) => b.oneRM - a.oneRM);
  }, [workouts]);

  const bwChart = useMemo((): ChartDataSet => {
    const pts = measurements
      .map((m) => ({ date: m.date, val: getBW(m) }))
      .filter((p) => p.val > 0)
      .slice(-12);
    return { labels: pts.map((p) => shortDate(p.date)), data: pts.map((p) => p.val) };
  }, [measurements]);

  // ── Goal Projection chart data (bodyweight tab) ─────────────────────────
  interface ProjectionChartData {
    labels: string[];
    dataset1: number[]; // actual history + flat extension at current weight
    dataset2: number[]; // flat at current weight for history + projected values
    currentWeight: number;
    weeksToGoal: number;
    projectedDate: Date;
    dailyKcal: number;
  }

  const projectionChart = useMemo((): ProjectionChartData | null => {
    if (!goal || goal.weeklyRate === 0) return null;

    // Last 4 actual measurement data points
    const actualPts = measurements
      .map((m) => ({ date: m.date, val: getBW(m) }))
      .filter((p) => p.val > 0)
      .slice(-4);

    if (actualPts.length === 0) return null;

    const currentWeight = actualPts[actualPts.length - 1].val;
    const weightDelta = goal.targetWeight - currentWeight;

    // Make sure the goal direction is still valid vs current weight
    if ((goal.weeklyRate < 0 && weightDelta >= 0) || (goal.weeklyRate > 0 && weightDelta <= 0)) {
      return null;
    }

    const weeksToGoal = Math.abs(weightDelta / goal.weeklyRate);
    const futurePtCount = Math.min(8, Math.ceil(weeksToGoal) || 1);
    const today = new Date();

    const futurePts = Array.from({ length: futurePtCount }, (_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() + (i + 1) * 7);
      const projected = currentWeight + goal.weeklyRate * (i + 1);
      const val = goal.weeklyRate < 0
        ? Math.max(goal.targetWeight, parseFloat(projected.toFixed(1)))
        : Math.min(goal.targetWeight, parseFloat(projected.toFixed(1)));
      return { date: format(d, 'yyyy-MM-dd'), val };
    });

    const labels = [
      ...actualPts.map((p) => shortDate(p.date)),
      ...futurePts.map((p) => shortDate(p.date)),
    ];

    // Dataset 1 (solid orange): actual history, then flat at current weight
    const dataset1 = [
      ...actualPts.map((p) => p.val),
      ...futurePts.map(() => currentWeight),
    ];

    // Dataset 2 (light orange): flat at current weight for history, then projected slope
    const dataset2 = [
      ...actualPts.map(() => currentWeight),
      ...futurePts.map((p) => p.val),
    ];

    return {
      labels,
      dataset1,
      dataset2,
      currentWeight,
      weeksToGoal: Math.round(weeksToGoal * 10) / 10,
      projectedDate: addWeeks(today, weeksToGoal),
      dailyKcal: Math.round((goal.weeklyRate * KCAL_PER_KG) / 7),
    };
  }, [goal, measurements]);

  const nutritionChart = useMemo(() => {
    const now = new Date();
    const days: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      days.push(format(d, 'yyyy-MM-dd'));
    }
    const map: Record<string, any> = Object.fromEntries(
      nutritionDays.map((n: any) => [n.date, n])
    );
    const calories = days.map(d => map[d]?.total_calories ?? 0);
    return {
      labels: days.map(d => (d.slice(5, 7) + '/' + d.slice(8, 10))),
      calories,
      avgCalories: Math.round(calories.reduce((s, v) => s + v, 0) / 7),
      avgProtein:  Math.round(days.reduce((s, d) => s + (map[d]?.total_protein ?? 0), 0) / 7),
      avgCarbs:    Math.round(days.reduce((s, d) => s + (map[d]?.total_carbs   ?? 0), 0) / 7),
      avgFat:      Math.round(days.reduce((s, d) => s + (map[d]?.total_fat     ?? 0), 0) / 7),
      daysLogged:  calories.filter(v => v > 0).length,
    };
  }, [nutritionDays]);

  const handleExport = async () => {
    if (!isPro) { // [PRO]
      Alert.alert('Pro Feature', 'Upgrade to Pro to export your workout data as CSV.');
      return;
    }
    if (exporting) return;
    setExporting(true);
    try {
      const rows = ['Date,Workout,Exercise,Set,Reps,Weight_kg,1RM_kg'];
      workouts.forEach((w) => {
        const wDate = format(new Date(w.date), 'yyyy-MM-dd');
        const wName = (w.name ?? 'Workout').replace(/,/g, ' ');
        (w.exercises ?? []).forEach((ex) => {
          const eName = getExName(ex).replace(/,/g, ' ');
          (ex.sets ?? []).forEach((s, i) => {
            rows.push([wDate, wName, eName, i + 1, s.reps, s.weight, calc1RM(s.weight, s.reps)].join(','));
          });
        });
      });
      const csv = rows.join('\n');

      // Web: use browser Blob download
      if (Platform.OS === 'web') {
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'gaintrack_workouts.csv';
        a.click();
        URL.revokeObjectURL(url);
        return;
      }

      // Native: write to file system and share
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const FS = FileSystem as any;
      const path: string = (FS.documentDirectory ?? '') + 'gaintrack_workouts.csv';
      await FS.writeAsStringAsync(path, csv, { encoding: 'utf8' });
      await Sharing.shareAsync(path, { mimeType: 'text/csv', dialogTitle: 'Export GainTrack Data' });
    } catch (e) {
      Alert.alert('Export failed', String(e));
    } finally {
      setExporting(false);
    }
  };

  const hasData = (cd: ChartDataSet) =>
    cd.labels.length > 0 && cd.data.length > 0 && cd.data.some((v) => v > 0);

  // ExerciseSelector, EmptyState and StatBox are module-level React.memo components.
  // Stable callback for the ExerciseSelector onPress:
  const openExercisePicker = useCallback(() => setShowPicker(true), []);

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading analytics...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Progress</Text>
        <TouchableOpacity
          style={[styles.exportBtn, !isPro && styles.exportBtnDim]}
          onPress={handleExport}
          disabled={exporting}
          activeOpacity={0.75}
        >
          {exporting ? (
            <ActivityIndicator size="small" color={colors.textPrimary} />
          ) : (
            <>
              <Ionicons name="download-outline" size={15} color={isPro ? colors.textPrimary : colors.textSecondary} />
              <Text style={[styles.exportBtnText, !isPro && { color: colors.textSecondary }]}>CSV</Text>
              {!isPro && (
                <View style={styles.miniProBadge}>
                  <Text style={styles.miniProBadgeText}>PRO</Text>
                </View>
              )}
            </>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.tabBar}>
        {(['1rm', 'volume', 'prs', 'bodyweight', 'nutrition'] as Tab[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tabItem, activeTab === tab && styles.tabItemActive]}
            onPress={() => setActiveTab(tab)}
            activeOpacity={0.75}
          >
            <Text style={[styles.tabLabel, activeTab === tab && styles.tabLabelActive]}>
              {tab === '1rm' ? '1RM' : tab === 'prs' ? 'PRs' : tab === 'volume' ? 'Volume' : tab === 'bodyweight' ? 'Weight' : 'Nutrition'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {!isPro ? (
        <View style={styles.proGate}>
          <View style={styles.proGateIconWrap}>
            <Ionicons name="analytics" size={36} color={colors.primary} />
          </View>
          <Text style={styles.proGateTitle}>Analytics - Pro Feature</Text>
          <Text style={styles.proGateBody}>
            Unlock 1RM tracking, weekly volume charts, personal records, bodyweight trends, and CSV export with GainTrack Pro.
          </Text>
          <TouchableOpacity
            style={styles.proGateBtn}
            activeOpacity={0.85}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              router.push('/pro-paywall' as any);
            }}
          >
            <Ionicons name="flash" size={16} color={colors.background} />
            <Text style={styles.proGateBtnText}>Upgrade to Pro - $4.99 / yr</Text>
          </TouchableOpacity>
          <Text style={styles.proGateNote}>Cancel anytime - All future features included</Text>
        </View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {activeTab === '1rm' && (
            <View>
              <ExerciseSelector selectedExercise={selectedExercise} onPress={openExercisePicker} />
              {hasData(oneRMChart) ? (
                <View style={styles.chartCard}>
                  <Text style={styles.cardTitle}>Estimated 1RM</Text>
                  <Text style={styles.cardSubtitle}>Brzycki formula - last 10 sessions</Text>
                  <LineChart
                    data={{ labels: oneRMChart.labels, datasets: [{ data: oneRMChart.data, strokeWidth: 2 }] }}
                    width={SCREEN_W - 48}
                    height={200}
                    chartConfig={CHART_CFG}
                    bezier
                    withShadow={false}
                    style={styles.chart}
                    yAxisSuffix=" kg"
                    formatYLabel={(y) => String(Math.round(Number(y)))}
                  />
                  <View style={styles.statRow}>
                    <StatBox label="Best 1RM" value={Math.max(...oneRMChart.data) + ' kg'} />
                    <StatBox label="Latest" value={oneRMChart.data[oneRMChart.data.length - 1] + ' kg'} />
                    <StatBox
                      label="Change"
                      value={(oneRMChart.data[oneRMChart.data.length - 1] >= oneRMChart.data[0] ? '+' : '') + (oneRMChart.data[oneRMChart.data.length - 1] - oneRMChart.data[0]) + ' kg'}
                      valueColor={oneRMChart.data[oneRMChart.data.length - 1] >= oneRMChart.data[0] ? colors.success : colors.error}
                    />
                  </View>
                </View>
              ) : (
                <EmptyState icon="bar-chart-outline" title={'No data for ' + (selectedExercise || 'this exercise')} subtitle="Log workouts with this exercise to see your 1RM trend" />
              )}
            </View>
          )}

          {activeTab === 'volume' && (
            <View>
              <ExerciseSelector selectedExercise={selectedExercise} onPress={openExercisePicker} />
              {hasData(volumeChart) ? (
                <View style={styles.chartCard}>
                  <Text style={styles.cardTitle}>Weekly Volume Load</Text>
                  <Text style={styles.cardSubtitle}>{selectedExercise || 'All exercises'} - sets x reps x weight</Text>
                  <BarChart
                    data={{ labels: volumeChart.labels, datasets: [{ data: volumeChart.data }] }}
                    width={SCREEN_W - 48}
                    height={200}
                    chartConfig={CHART_CFG}
                    style={styles.chart}
                    yAxisLabel=""
                    yAxisSuffix=" kg"
                    fromZero
                    showValuesOnTopOfBars={false}
                    withInnerLines
                  />
                  <View style={styles.statRow}>
                    <StatBox label="Avg / week" value={Math.round(volumeChart.data.reduce((a, b) => a + b, 0) / volumeChart.data.length) + ' kg'} />
                    <StatBox label="Peak week" value={Math.max(...volumeChart.data) + ' kg'} />
                    <StatBox label="Total" value={volumeChart.data.reduce((a, b) => a + b, 0) + ' kg'} />
                  </View>
                </View>
              ) : (
                <EmptyState icon="bar-chart-outline" title="No volume data yet" subtitle="Complete workouts to track your weekly training volume" />
              )}
            </View>
          )}

          {activeTab === 'prs' && (
            <View>
              <Text style={styles.sectionTitle}>Personal Records</Text>
              <Text style={styles.sectionSubtitle}>Best estimated 1RM per exercise, all time</Text>
              {prList.length === 0 ? (
                <EmptyState icon="trophy-outline" title="No PRs recorded yet" subtitle="Complete your first workout to set personal records" />
              ) : (
                prList.map((pr, idx) => (
                  <View key={pr.exerciseName} style={styles.prRow}>
                    <View style={styles.prRankBadge}>
                      <Text style={styles.prRankText}>{'#' + (idx + 1)}</Text>
                    </View>
                    <View style={styles.prInfo}>
                      <Text style={styles.prName}>{pr.exerciseName}</Text>
                      <Text style={styles.prDetail}>{pr.weight + ' kg x ' + pr.reps + ' rep' + (pr.reps !== 1 ? 's' : '') + ' - ' + shortDate(pr.date)}</Text>
                    </View>
                    <View style={styles.prBadge}>
                      <Text style={styles.prBadgeValue}>{pr.oneRM}</Text>
                      <Text style={styles.prBadgeUnit}>kg</Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          )}

          {activeTab === 'bodyweight' && (
            <View>
              {/* Title row with Set Goal button */}
              <View style={styles.bwHeaderRow}>
                <View>
                  <Text style={styles.sectionTitle}>Bodyweight</Text>
                  <Text style={styles.sectionSubtitle}>Track your weight over time</Text>
                </View>
                <TouchableOpacity
                  style={styles.setGoalBtn}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push('/body-composition-goal' as any);
                  }}
                  activeOpacity={0.75}
                >
                  <Ionicons name="flag-outline" size={13} color={colors.primary} />
                  <Text style={styles.setGoalBtnText}>{goal ? 'Edit Goal' : 'Set Goal'}</Text>
                </TouchableOpacity>
              </View>

              {hasData(bwChart) ? (
                <View style={styles.chartCard}>
                  <Text style={styles.cardTitle}>Weight Trend</Text>
                  <Text style={styles.cardSubtitle}>Last 12 entries</Text>
                  <LineChart
                    data={{ labels: bwChart.labels, datasets: [{ data: bwChart.data, strokeWidth: 2 }] }}
                    width={SCREEN_W - 48}
                    height={200}
                    chartConfig={CHART_CFG}
                    bezier
                    withShadow={false}
                    style={styles.chart}
                    yAxisSuffix=" kg"
                    formatYLabel={(y) => String(Math.round(Number(y)))}
                  />
                  <View style={styles.statRow}>
                    <StatBox label="Current" value={bwChart.data[bwChart.data.length - 1] + ' kg'} />
                    <StatBox label="Lowest" value={Math.min(...bwChart.data) + ' kg'} />
                    <StatBox
                      label="Change"
                      value={(bwChart.data[bwChart.data.length - 1] >= bwChart.data[0] ? '+' : '') + Math.round((bwChart.data[bwChart.data.length - 1] - bwChart.data[0]) * 10) / 10 + ' kg'}
                      valueColor={bwChart.data[bwChart.data.length - 1] <= bwChart.data[0] ? colors.success : colors.error}
                    />
                  </View>
                </View>
              ) : (
                <EmptyState icon="scale-outline" title="No bodyweight data" subtitle="Log measurements to track your weight over time" />
              )}

              {/* ── Goal Summary Card ── */}
              {goal && (
                <TouchableOpacity
                  style={styles.goalCard}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push('/body-composition-goal' as any);
                  }}
                  activeOpacity={0.85}
                >
                  <View style={styles.goalCardHeader}>
                    <View style={styles.goalIconWrap}>
                      <Ionicons name="flag" size={16} color={colors.primary} />
                    </View>
                    <Text style={styles.goalCardTitle}>
                      {goal.weeklyRate < 0 ? 'Cut Goal' : goal.weeklyRate > 0 ? 'Bulk Goal' : 'Maintain Goal'}
                    </Text>
                    <View style={styles.goalEditChip}>
                      <Text style={styles.goalEditChipText}>Edit</Text>
                    </View>
                  </View>
                  <View style={styles.goalStatRow}>
                    <View style={styles.goalStat}>
                      <Text style={styles.goalStatValue}>{goal.targetWeight} kg</Text>
                      <Text style={styles.goalStatLabel}>Target</Text>
                    </View>
                    <Ionicons name="arrow-forward-outline" size={14} color={colors.textDisabled} />
                    <View style={styles.goalStat}>
                      <Text style={[
                        styles.goalStatValue,
                        { color: goal.weeklyRate < 0 ? colors.info : goal.weeklyRate > 0 ? colors.success : colors.textSecondary },
                      ]}>
                        {goal.weeklyRate > 0 ? '+' : ''}{goal.weeklyRate} kg/wk
                      </Text>
                      <Text style={styles.goalStatLabel}>Rate</Text>
                    </View>
                    {projectionChart && (
                      <>
                        <Ionicons name="arrow-forward-outline" size={14} color={colors.textDisabled} />
                        <View style={styles.goalStat}>
                          <Text style={[styles.goalStatValue, { color: colors.primary, fontSize: typography.fontSize.sm }]}>
                            {format(projectionChart.projectedDate, 'MMM d')}
                          </Text>
                          <Text style={styles.goalStatLabel}>Projected</Text>
                        </View>
                      </>
                    )}
                    {goal.targetBodyFat && (
                      <>
                        <Ionicons name="arrow-forward-outline" size={14} color={colors.textDisabled} />
                        <View style={styles.goalStat}>
                          <Text style={styles.goalStatValue}>{goal.targetBodyFat}%</Text>
                          <Text style={styles.goalStatLabel}>Body Fat</Text>
                        </View>
                      </>
                    )}
                  </View>
                  {projectionChart && (
                    <Text style={styles.goalKcalNote}>
                      {projectionChart.dailyKcal < 0 ? '−' : '+'}{Math.abs(projectionChart.dailyKcal)} kcal/day · {projectionChart.weeksToGoal} weeks to goal
                    </Text>
                  )}
                </TouchableOpacity>
              )}

              {/* ── Goal Projection Chart ── */}
              {projectionChart && (
                <View style={styles.chartCard}>
                  <Text style={styles.cardTitle}>Goal Projection</Text>
                  <Text style={styles.cardSubtitle}>
                    Actual weight → projected path at {goal?.weeklyRate} kg/wk
                  </Text>
                  <LineChart
                    data={{
                      labels: projectionChart.labels,
                      datasets: [
                        {
                          data: projectionChart.dataset1,
                          strokeWidth: 2.5,
                          color: (opacity = 1) => `rgba(255, 98, 0, ${opacity})`,
                        },
                        {
                          data: projectionChart.dataset2,
                          strokeWidth: 2,
                          color: (opacity = 1) => `rgba(255, 152, 0, ${opacity * 0.55})`,
                        },
                      ],
                    }}
                    width={SCREEN_W - 48}
                    height={200}
                    chartConfig={CHART_CFG}
                    bezier
                    withShadow={false}
                    style={styles.chart}
                    yAxisSuffix=" kg"
                    formatYLabel={(y) => String(Math.round(Number(y)))}
                  />
                  <View style={styles.projLegendRow}>
                    <View style={styles.projLegendItem}>
                      <View style={[styles.projLegendDot, { backgroundColor: colors.primary }]} />
                      <Text style={styles.projLegendText}>Logged</Text>
                    </View>
                    <View style={styles.projLegendItem}>
                      <View style={[styles.projLegendDot, { backgroundColor: colors.warning, opacity: 0.7 }]} />
                      <Text style={styles.projLegendText}>Projected</Text>
                    </View>
                    <Text style={styles.projLegendGoal}>
                      Goal: {goal?.targetWeight} kg
                    </Text>
                  </View>
                </View>
              )}
              {measurements.length > 0 && (
                <View style={styles.bwListCard}>
                  <Text style={styles.cardTitle}>Recent Entries</Text>
                  {[...measurements].reverse().slice(0, 10).map((m, i) => {
                    const bw = getBW(m);
                    if (!bw) return null;
                    return (
                      <View key={i} style={[styles.bwRow, i === 0 ? { marginTop: 8 } : undefined]}>
                        <Text style={styles.bwDate}>{new Date(m.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</Text>
                        <Text style={styles.bwWeight}>{bw} kg</Text>
                      </View>
                    );
                  })}
                </View>
              )}
              {/* Calorie Intake alongside weight — correlation view */}
              {nutritionChart.daysLogged > 0 && (
                <View style={styles.chartCard}>
                  <Text style={styles.cardTitle}>Calorie Intake</Text>
                  <Text style={styles.cardSubtitle}>Alongside your weight trend — last 7 days</Text>
                  <BarChart
                    data={{ labels: nutritionChart.labels, datasets: [{ data: nutritionChart.calories }] }}
                    width={SCREEN_W - 48}
                    height={160}
                    chartConfig={{ ...CHART_CFG, color: (o = 1) => `rgba(59,130,246,${o})` }}
                    style={styles.chart}
                    yAxisLabel=""
                    yAxisSuffix=""
                    fromZero
                    showValuesOnTopOfBars={false}
                    withInnerLines
                  />
                  <View style={styles.statRow}>
                    <StatBox label="Avg / day" value={nutritionChart.avgCalories + ' kcal'} />
                    <StatBox label="Avg protein" value={nutritionChart.avgProtein + 'g'} />
                    <StatBox label="Days logged" value={nutritionChart.daysLogged + ' / 7'} />
                  </View>
                </View>
              )}
            </View>
          )}
        </ScrollView>
      )}

      <Modal visible={showPicker} animationType="slide" transparent onRequestClose={() => setShowPicker(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowPicker(false)}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Select Exercise</Text>
            {allExerciseNames.length === 0 ? (
              <Text style={styles.emptyTitle}>No exercises in workout history yet</Text>
            ) : (
              <FlatList
                data={allExerciseNames}
                keyExtractor={(item) => item}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.pickerRow, item === selectedExercise && styles.pickerRowActive]}
                    onPress={() => { setSelectedExercise(item); setShowPicker(false); }}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.pickerRowText, item === selectedExercise && styles.pickerRowTextActive]}>{item}</Text>
                    {item === selectedExercise && <Ionicons name="checkmark" size={18} color={colors.primary} />}
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { color: colors.textSecondary, fontSize: typography.fontSize.base },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing[4], paddingVertical: spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  headerTitle: { fontSize: typography.fontSize['2xl'], fontWeight: typography.fontWeight.bold, color: colors.textPrimary },
  exportBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing[1],
    backgroundColor: colors.charcoal, paddingHorizontal: spacing[3], paddingVertical: spacing[2],
    borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
  },
  exportBtnDim: { opacity: 0.8 },
  exportBtnText: { fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.semibold, color: colors.textPrimary },
  miniProBadge: { backgroundColor: colors.primary, paddingHorizontal: 4, paddingVertical: 2, borderRadius: radii.sm },
  miniProBadgeText: { fontSize: 9, fontWeight: typography.fontWeight.extrabold, color: colors.background, letterSpacing: 0.4 },
  tabBar: {
    flexDirection: 'row', backgroundColor: colors.charcoal,
    marginHorizontal: spacing[4], marginTop: spacing[3], marginBottom: spacing[3],
    borderRadius: radii.md, padding: 3,
  },
  tabItem: { flex: 1, paddingVertical: spacing[2], borderRadius: radii.sm, alignItems: 'center' },
  tabItemActive: { backgroundColor: colors.surface },
  tabLabel: { fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.medium, color: colors.textSecondary },
  tabLabelActive: { color: colors.primary, fontWeight: typography.fontWeight.semibold },
  proGate: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing[8], gap: spacing[4] },
  proGateIconWrap: { width: 72, height: 72, borderRadius: radii.full, backgroundColor: colors.primaryMuted, justifyContent: 'center', alignItems: 'center' },
  proGateTitle: { fontSize: typography.fontSize.xl, fontWeight: typography.fontWeight.bold, color: colors.textPrimary, textAlign: 'center' },
  proGateBody: { fontSize: typography.fontSize.base, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  proGateBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], backgroundColor: colors.primary, paddingHorizontal: spacing[8], paddingVertical: spacing[4], borderRadius: radii.full, marginTop: spacing[2] },
  proGateBtnText: { fontSize: typography.fontSize.base, fontWeight: typography.fontWeight.bold, color: colors.background },
  proGateNote: { fontSize: typography.fontSize.xs, color: colors.textDisabled, textAlign: 'center' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: spacing[4], paddingBottom: spacing[10] },
  exerciseSelector: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.surface, borderRadius: radii.md,
    paddingHorizontal: spacing[4], paddingVertical: spacing[3],
    marginBottom: spacing[4], borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
  },
  exerciseSelectorText: { flex: 1, color: colors.textPrimary, fontSize: typography.fontSize.base, fontWeight: typography.fontWeight.medium },
  chartCard: { backgroundColor: colors.surface, borderRadius: radii.lg, padding: spacing[4], marginBottom: spacing[4] },
  cardTitle: { fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.semibold, color: colors.textPrimary, marginBottom: 2 },
  cardSubtitle: { fontSize: typography.fontSize.xs, color: colors.textSecondary, marginBottom: spacing[4] },
  chart: { borderRadius: radii.md, marginLeft: -spacing[3] },
  statRow: { flexDirection: 'row', marginTop: spacing[4], gap: spacing[2] },
  statBox: { flex: 1, backgroundColor: colors.charcoal, borderRadius: radii.md, padding: spacing[3], alignItems: 'center' },
  statBoxValue: { fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.bold, color: colors.textPrimary },
  statBoxLabel: { fontSize: typography.fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  sectionTitle: { fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.semibold, color: colors.textPrimary, marginBottom: 2 },
  sectionSubtitle: { fontSize: typography.fontSize.xs, color: colors.textSecondary, marginBottom: spacing[4] },
  prRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], backgroundColor: colors.surface, borderRadius: radii.lg, paddingHorizontal: spacing[4], paddingVertical: spacing[3], marginBottom: spacing[2] },
  prRankBadge: { width: 34, height: 34, borderRadius: radii.full, backgroundColor: colors.primaryMuted, alignItems: 'center', justifyContent: 'center' },
  prRankText: { fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.bold, color: colors.primary },
  prInfo: { flex: 1, minWidth: 0 },
  prName: { fontSize: typography.fontSize.base, fontWeight: typography.fontWeight.semibold, color: colors.textPrimary },
  prDetail: { fontSize: typography.fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  prBadge: { backgroundColor: colors.primary, borderRadius: radii.full, paddingHorizontal: spacing[3], paddingVertical: spacing[1], alignItems: 'center', minWidth: 60 },
  prBadgeValue: { fontSize: typography.fontSize.base, fontWeight: typography.fontWeight.extrabold, color: colors.background, lineHeight: 20 },
  prBadgeUnit: { fontSize: 9, fontWeight: typography.fontWeight.medium, color: colors.background },
  bwListCard: { backgroundColor: colors.surface, borderRadius: radii.lg, padding: spacing[4], marginTop: spacing[2] },
  bwRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing[3], borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  bwDate: { fontSize: typography.fontSize.base, color: colors.textSecondary },
  bwWeight: { fontSize: typography.fontSize.base, fontWeight: typography.fontWeight.semibold, color: colors.textPrimary },
  // Bodyweight header row
  bwHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing[4] },
  setGoalBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing[1],
    backgroundColor: colors.primaryMuted, paddingHorizontal: spacing[3], paddingVertical: spacing[2],
    borderRadius: radii.full, borderWidth: 1, borderColor: colors.primary,
  },
  setGoalBtnText: { fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.semibold, color: colors.primary },
  // Goal summary card
  goalCard: {
    backgroundColor: colors.surface, borderRadius: radii.lg, padding: spacing[4],
    marginBottom: spacing[4], borderWidth: 1, borderColor: colors.primaryMuted,
  },
  goalCardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], marginBottom: spacing[3] },
  goalIconWrap: {
    width: 28, height: 28, borderRadius: radii.full,
    backgroundColor: colors.primaryMuted, alignItems: 'center', justifyContent: 'center',
  },
  goalCardTitle: { flex: 1, fontSize: typography.fontSize.base, fontWeight: typography.fontWeight.semibold, color: colors.textPrimary },
  goalEditChip: {
    backgroundColor: colors.charcoal, paddingHorizontal: spacing[3], paddingVertical: 3,
    borderRadius: radii.full, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
  },
  goalEditChipText: { fontSize: typography.fontSize.xs, color: colors.textSecondary, fontWeight: typography.fontWeight.medium },
  goalStatRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], flexWrap: 'wrap' },
  goalStat: { alignItems: 'center', minWidth: 56 },
  goalStatValue: { fontSize: typography.fontSize.base, fontWeight: typography.fontWeight.bold, color: colors.textPrimary },
  goalStatLabel: { fontSize: typography.fontSize.xs, color: colors.textSecondary, marginTop: 1 },
  goalKcalNote: { fontSize: typography.fontSize.xs, color: colors.textDisabled, marginTop: spacing[3], fontStyle: 'italic' },
  // Projection chart legend
  projLegendRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[4], marginTop: spacing[3] },
  projLegendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing[1] },
  projLegendDot: { width: 8, height: 8, borderRadius: 4 },
  projLegendText: { fontSize: typography.fontSize.xs, color: colors.textSecondary },
  projLegendGoal: { fontSize: typography.fontSize.xs, color: colors.primary, fontWeight: typography.fontWeight.semibold, marginLeft: 'auto' as any },
  emptyCard: { backgroundColor: colors.surface, borderRadius: radii.lg, padding: spacing[10], alignItems: 'center', gap: spacing[2], marginBottom: spacing[4] },
  emptyTitle: { fontSize: typography.fontSize.base, fontWeight: typography.fontWeight.medium, color: colors.textSecondary, textAlign: 'center' },
  emptySubtitle: { fontSize: typography.fontSize.sm, color: colors.textDisabled, textAlign: 'center', lineHeight: 20 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay },
  modalSheet: { backgroundColor: colors.surface, borderTopLeftRadius: radii['2xl'], borderTopRightRadius: radii['2xl'], padding: spacing[4], maxHeight: '72%' },
  modalHandle: { width: 36, height: 4, backgroundColor: colors.border, borderRadius: radii.full, alignSelf: 'center', marginBottom: spacing[4] },
  modalTitle: { fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.semibold, color: colors.textPrimary, marginBottom: spacing[3] },
  pickerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing[3], paddingHorizontal: spacing[2], borderRadius: radii.md },
  pickerRowActive: { backgroundColor: colors.primaryMuted },
  pickerRowText: { fontSize: typography.fontSize.base, color: colors.textPrimary },
  pickerRowTextActive: { color: colors.primary, fontWeight: typography.fontWeight.semibold },
});
