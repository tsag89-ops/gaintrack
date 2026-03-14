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
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { format, addWeeks } from 'date-fns';
import * as Haptics from 'expo-haptics';
import { colors, typography, spacing, radii } from '../../src/constants/theme';
import { usePro } from '../../src/hooks/usePro';
import { calc1RM } from '../../src/utils/fitness';
import { GOAL_KEY, type BodyCompositionGoal } from '../body-composition-goal';
import { useWorkoutVolume } from '../../src/hooks/useWorkoutVolume';

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
  rpe?: number;
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

interface PremiumInsightData {
  readinessScore: number;
  readinessDelta: number;
  deloadConfidence: number;
  strainBalance: number;
  hardSetRate: number;
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

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const getWorkoutDate = (workout: StoredWorkout): Date | null => {
  const d = new Date(workout.date);
  return isNaN(d.getTime()) ? null : d;
};

const getWindowWorkouts = (
  workouts: StoredWorkout[],
  startInclusive: Date,
  endInclusive: Date,
): StoredWorkout[] => {
  const start = startInclusive.getTime();
  const end = endInclusive.getTime();
  return workouts.filter((w) => {
    const d = getWorkoutDate(w);
    if (!d) return false;
    const t = d.getTime();
    return t >= start && t <= end;
  });
};

const summarizeWindow = (windowWorkouts: StoredWorkout[]) => {
  let totalVolume = 0;
  let totalSets = 0;
  let hardSets = 0;
  let rpeSetCount = 0;
  let rpeSum = 0;

  windowWorkouts.forEach((w) => {
    (w.exercises ?? []).forEach((ex) => {
      (ex.sets ?? []).forEach((set) => {
        if ((set.reps ?? 0) <= 0 || (set.weight ?? 0) < 0) return;
        totalSets += 1;
        totalVolume += (set.weight ?? 0) * (set.reps ?? 0);
        if ((set.rpe ?? 0) >= 8) {
          hardSets += 1;
        }
        if (typeof set.rpe === 'number' && set.rpe > 0) {
          rpeSetCount += 1;
          rpeSum += set.rpe;
        }
      });
    });
  });

  return {
    sessions: windowWorkouts.length,
    totalVolume,
    totalSets,
    hardSetRate: totalSets > 0 ? hardSets / totalSets : 0,
    avgRpe: rpeSetCount > 0 ? rpeSum / rpeSetCount : 6,
  };
};

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
  const recapParams = useLocalSearchParams<{
    source?: string;
    volumeDelta?: string;
    volumeDeltaPct?: string;
    dayDelta?: string;
    workoutDelta?: string;
  }>();

  const [workouts, setWorkouts] = useState<StoredWorkout[]>([]);
  const [measurements, setMeasurements] = useState<StoredMeasurement[]>([]);
  const [nutritionDays, setNutritionDays] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('1rm');
  const [selectedExercise, setSelectedExercise] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [goal, setGoal] = useState<BodyCompositionGoal | null>(null);
  // Volume Overview — loaded upfront so the volume tab renders inline charts without a separate screen
  const { volumeData: overviewVolumeData, loading: overviewLoading } = useWorkoutVolume(); // [PRO]

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

  const premiumInsights = useMemo((): PremiumInsightData => {
    const today = new Date();
    const thisWeekStart = new Date(today);
    thisWeekStart.setDate(today.getDate() - 6);

    const previousWeekEnd = new Date(thisWeekStart);
    previousWeekEnd.setDate(thisWeekStart.getDate() - 1);
    const previousWeekStart = new Date(previousWeekEnd);
    previousWeekStart.setDate(previousWeekEnd.getDate() - 6);

    const thisWeek = summarizeWindow(getWindowWorkouts(workouts, thisWeekStart, today));
    const previousWeek = summarizeWindow(getWindowWorkouts(workouts, previousWeekStart, previousWeekEnd));

    const volumeBase = Math.max(previousWeek.totalVolume, 1);
    const volumeSpike = thisWeek.totalVolume / volumeBase;
    const sessionDensity = thisWeek.sessions / 7;

    const readinessRaw =
      100
      - thisWeek.avgRpe * 5.5
      - thisWeek.hardSetRate * 26
      - Math.max(0, volumeSpike - 1) * 18
      - sessionDensity * 8;
    const readinessScore = Math.round(clamp(readinessRaw, 20, 98));

    const prevReadinessRaw =
      100
      - previousWeek.avgRpe * 5.5
      - previousWeek.hardSetRate * 26
      - Math.max(0, (previousWeek.totalVolume / Math.max(thisWeek.totalVolume, 1)) - 1) * 18
      - (previousWeek.sessions / 7) * 8;
    const previousReadiness = Math.round(clamp(prevReadinessRaw, 20, 98));
    const readinessDelta = readinessScore - previousReadiness;

    const deloadSignal =
      (thisWeek.avgRpe >= 8 ? 35 : thisWeek.avgRpe >= 7.5 ? 24 : 10)
      + (thisWeek.hardSetRate >= 0.55 ? 32 : thisWeek.hardSetRate >= 0.4 ? 22 : 10)
      + (volumeSpike >= 1.2 ? 24 : volumeSpike >= 1.05 ? 16 : 8)
      + (thisWeek.sessions >= 5 ? 14 : thisWeek.sessions >= 4 ? 9 : 4);
    const deloadConfidence = Math.round(clamp(deloadSignal, 8, 95));

    const strainBalance = Math.round(clamp(100 - Math.abs(thisWeek.hardSetRate - 0.5) * 180, 18, 98));

    return {
      readinessScore,
      readinessDelta,
      deloadConfidence,
      strainBalance,
      hardSetRate: thisWeek.hardSetRate,
    };
  }, [workouts]);

  const weeklyRecapDelta = useMemo(() => {
    if (recapParams.source !== 'weekly_recap') return null;

    const volumeDelta = Number(recapParams.volumeDelta ?? 0);
    const volumeDeltaPct = Number(recapParams.volumeDeltaPct ?? 0);
    const dayDelta = Number(recapParams.dayDelta ?? 0);
    const workoutDelta = Number(recapParams.workoutDelta ?? 0);

    return {
      volumeDelta,
      volumeDeltaPct,
      dayDelta,
      workoutDelta,
    };
  }, [recapParams.dayDelta, recapParams.source, recapParams.volumeDelta, recapParams.volumeDeltaPct, recapParams.workoutDelta]);

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
      const path: string = (FileSystem.documentDirectory ?? '') + 'gaintrack_workouts.csv';
      await FileSystem.writeAsStringAsync(path, csv, { encoding: 'utf8' });
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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity
            style={styles.exportBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/physique-progress' as any);
            }}
            activeOpacity={0.75}
          >
            <Ionicons name="camera-outline" size={15} color={colors.textPrimary} />
            <Text style={styles.exportBtnText}>Physique</Text>
          </TouchableOpacity>
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
          {weeklyRecapDelta && (
            <View style={styles.recapDeltaCard}>
              <View style={styles.recapDeltaHeader}>
                <Text style={styles.recapDeltaTitle}>Weekly Delta From Home Recap</Text>
                <Ionicons name="sparkles-outline" size={14} color={colors.primary} />
              </View>
              <Text style={styles.recapDeltaText}>
                Volume: {weeklyRecapDelta.volumeDelta >= 0 ? '+' : ''}{Math.round(weeklyRecapDelta.volumeDelta)} kg ({weeklyRecapDelta.volumeDeltaPct >= 0 ? '+' : ''}{weeklyRecapDelta.volumeDeltaPct}%)
              </Text>
              <Text style={styles.recapDeltaText}>
                Workout days: {weeklyRecapDelta.dayDelta >= 0 ? '+' : ''}{weeklyRecapDelta.dayDelta} • Sessions: {weeklyRecapDelta.workoutDelta >= 0 ? '+' : ''}{weeklyRecapDelta.workoutDelta}
              </Text>
            </View>
          )}

          <View style={styles.premiumInsightCard}>
            <View style={styles.premiumInsightHeader}>
              <Text style={styles.premiumInsightTitle}>Premium Performance Signals</Text>
              <View style={styles.premiumPill}>
                <Text style={styles.premiumPillText}>PRO</Text>
              </View>
            </View>
            <Text style={styles.premiumInsightSubtitle}>Weekly readiness, deload timing confidence, and strain balance.</Text>
            <View style={styles.premiumGrid}>
              <View style={styles.premiumMetricCard}>
                <Text style={styles.premiumMetricLabel}>Readiness Trend</Text>
                <Text style={styles.premiumMetricValue}>{premiumInsights.readinessScore}</Text>
                <Text style={[styles.premiumMetricMeta, { color: premiumInsights.readinessDelta >= 0 ? colors.success : colors.error }]}>
                  {premiumInsights.readinessDelta >= 0 ? '+' : ''}{premiumInsights.readinessDelta} vs last week
                </Text>
              </View>
              <View style={styles.premiumMetricCard}>
                <Text style={styles.premiumMetricLabel}>Deload Confidence</Text>
                <Text style={styles.premiumMetricValue}>{premiumInsights.deloadConfidence}%</Text>
                <Text style={styles.premiumMetricMeta}>
                  {premiumInsights.deloadConfidence >= 70 ? 'High strain detected' : premiumInsights.deloadConfidence >= 45 ? 'Watch recovery' : 'Normal load'}
                </Text>
              </View>
              <View style={styles.premiumMetricCardFull}>
                <Text style={styles.premiumMetricLabel}>Strain Balance</Text>
                <Text style={styles.premiumMetricValue}>{premiumInsights.strainBalance}/100</Text>
                <Text style={styles.premiumMetricMeta}>
                  Hard sets this week: {Math.round(premiumInsights.hardSetRate * 100)}% of total logged sets
                </Text>
              </View>
            </View>
          </View>

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

              {/* ── Volume Overview: Muscle-Group Breakdown ── */}
              {overviewLoading ? (
                <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 16 }} />
              ) : overviewVolumeData?.muscleGroup.data.length ? (
                <View style={styles.chartCard}>
                  <Text style={styles.cardTitle}>This Week — Volume by Muscle Group</Text>
                  <Text style={styles.cardSubtitle}>sets × reps × weight per muscle group</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <BarChart
                      data={{ labels: overviewVolumeData.muscleGroup.labels, datasets: [{ data: overviewVolumeData.muscleGroup.data }] }}
                      width={Math.max(SCREEN_W - 48, overviewVolumeData.muscleGroup.labels.length * 72)}
                      height={200}
                      chartConfig={{ ...CHART_CFG, propsForLabels: { fontSize: '11' } }}
                      style={styles.chart}
                      yAxisLabel=""
                      yAxisSuffix=" kg"
                      fromZero
                      showValuesOnTopOfBars
                      withInnerLines
                      verticalLabelRotation={0}
                    />
                  </ScrollView>
                </View>
              ) : null}
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
  premiumInsightCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing[4],
    marginBottom: spacing[4],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  premiumInsightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing[2],
  },
  premiumInsightTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
  },
  premiumPill: {
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    borderRadius: radii.full,
    backgroundColor: colors.primaryMuted,
  },
  premiumPillText: {
    color: colors.primary,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.extrabold,
    letterSpacing: 0.3,
  },
  premiumInsightSubtitle: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.xs,
    marginBottom: spacing[3],
  },
  premiumGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  premiumMetricCard: {
    flex: 1,
    minWidth: 130,
    backgroundColor: colors.charcoal,
    borderRadius: radii.md,
    padding: spacing[3],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  premiumMetricCardFull: {
    width: '100%',
    backgroundColor: colors.charcoal,
    borderRadius: radii.md,
    padding: spacing[3],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  premiumMetricLabel: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.xs,
    marginBottom: spacing[1],
  },
  premiumMetricValue: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.extrabold,
  },
  premiumMetricMeta: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.xs,
    marginTop: spacing[1],
  },
  recapDeltaCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing[4],
    marginBottom: spacing[4],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  recapDeltaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing[2],
  },
  recapDeltaTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
  },
  recapDeltaText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.xs,
    marginBottom: 2,
  },
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
