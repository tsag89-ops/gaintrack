// app/body-composition-goal.tsx
// Body Composition Goal Setting Screen
// Set target weight, body fat %, and weekly rate — projected timeline shown on weight chart

import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { format, addWeeks } from 'date-fns';
import { colors, typography, spacing, radii } from '../src/constants/theme';
import { useLanguage } from '../src/context/LanguageContext';

// ── Constants ─────────────────────────────────────────────────────────────────

const MEASUREMENTS_KEY = 'gaintrack_measurements';
export const GOAL_KEY = 'gaintrack_body_goal';
const KCAL_PER_KG = 7700; // kcal per kg of body fat

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BodyCompositionGoal {
  targetWeight: number;     // kg
  targetBodyFat?: number;   // %
  weeklyRate: number;       // kg/week — negative = cut, 0 = maintain, positive = bulk
  startDate: string;        // 'yyyy-MM-dd'
  startWeight: number;      // kg at time of saving
}

// ── Rate presets ─────────────────────────────────────────────────────────────

type RateType = 'cut' | 'maintain' | 'bulk';

interface RatePreset {
  label: string;
  value: number;
  type: RateType;
}

const RATE_PRESETS: RatePreset[] = [
  { label: '-1.0', value: -1.0, type: 'cut' },
  { label: '-0.75', value: -0.75, type: 'cut' },
  { label: '-0.5', value: -0.5, type: 'cut' },
  { label: '-0.25', value: -0.25, type: 'cut' },
  { label: '0', value: 0, type: 'maintain' },
  { label: '+0.25', value: 0.25, type: 'bulk' },
  { label: '+0.5', value: 0.5, type: 'bulk' },
  { label: '+0.75', value: 0.75, type: 'bulk' },
];

const RATE_COLORS: Record<RateType, string> = {
  cut: colors.info,
  maintain: colors.textSecondary,
  bulk: colors.success,
};

// ── Screen ────────────────────────────────────────────────────────────────────

export default function BodyCompositionGoalScreen() {
  const router = useRouter();
  const { t } = useLanguage();
  const [currentWeight, setCurrentWeight] = useState('');
  const [targetWeight, setTargetWeight] = useState('');
  const [targetBodyFat, setTargetBodyFat] = useState('');
  const [currentBodyFat, setCurrentBodyFat] = useState('');
  const [weeklyRate, setWeeklyRate] = useState(-0.5);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hasExistingGoal, setHasExistingGoal] = useState(false);

  // Load most recent measurement and any existing goal on mount
  useEffect(() => {
    (async () => {
      try {
        const [mRaw, gRaw] = await Promise.all([
          AsyncStorage.getItem(MEASUREMENTS_KEY),
          AsyncStorage.getItem(GOAL_KEY),
        ]);

        // Pre-fill from latest measurement
        if (mRaw) {
          const measurements: any[] = JSON.parse(mRaw);
          if (measurements.length > 0) {
            const sorted = [...measurements].sort((a, b) => b.date.localeCompare(a.date));
            const latest = sorted[0];
            const bw = latest.weight ?? latest.bodyweight ?? latest.body_weight ?? latest.bodyWeight;
            if (bw && !gRaw) setCurrentWeight(String(bw));
            if (latest.body_fat && !gRaw) setCurrentBodyFat(String(latest.body_fat));
          }
        }

        // Load existing goal — override measurement pre-fill
        if (gRaw) {
          const goal: BodyCompositionGoal = JSON.parse(gRaw);
          setHasExistingGoal(true);
          if (goal.startWeight) setCurrentWeight(String(goal.startWeight));
          if (goal.targetWeight) setTargetWeight(String(goal.targetWeight));
          if (goal.targetBodyFat) setTargetBodyFat(String(goal.targetBodyFat));
          if (goal.weeklyRate !== undefined) setWeeklyRate(goal.weeklyRate);
        }
      } catch (e) {
        console.error('[GoalScreen] load error:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ── Projection calculations ──────────────────────────────────────────────

  const projection = useMemo(() => {
    const cw = parseFloat(currentWeight);
    const tw = parseFloat(targetWeight);
    if (!cw || !tw || isNaN(cw) || isNaN(tw) || cw === tw) return null;
    if (weeklyRate === 0) return null;

    const weightDelta = tw - cw; // negative = cut, positive = bulk
    // Guard: rate direction must match goal direction
    if ((weeklyRate > 0 && weightDelta < 0) || (weeklyRate < 0 && weightDelta > 0)) return null;

    const weeks = Math.abs(weightDelta / weeklyRate);
    const targetDate = addWeeks(new Date(), weeks);
    const dailyKcal = Math.round((weeklyRate * KCAL_PER_KG) / 7);
    const fatChange = Math.round(Math.abs(weightDelta) * 10) / 10;

    // LBM calculations (optional — only if body fat % provided)
    const cbf = parseFloat(currentBodyFat);
    const tbf = parseFloat(targetBodyFat);
    const lbm = !isNaN(cbf) && cbf > 0
      ? Math.round(cw * (1 - cbf / 100) * 10) / 10
      : null;
    const targetLbm = !isNaN(tbf) && tbf > 0
      ? Math.round(tw * (1 - tbf / 100) * 10) / 10
      : null;

    return {
      weeks: Math.round(weeks * 10) / 10,
      targetDate,
      dailyKcal,
      fatChange,
      lbm,
      targetLbm,
    };
  }, [currentWeight, targetWeight, currentBodyFat, targetBodyFat, weeklyRate]);

  // ── Save / Clear ─────────────────────────────────────────────────────────

  const handleSave = async () => {
    const cw = parseFloat(currentWeight);
    const tw = parseFloat(targetWeight);

    if (!cw || isNaN(cw)) {
      Alert.alert(t('bodyGoal.missingFieldTitle'), t('bodyGoal.missingCurrentWeightMessage'));
      return;
    }
    if (!tw || isNaN(tw)) {
      Alert.alert(t('bodyGoal.missingFieldTitle'), t('bodyGoal.missingTargetWeightMessage'));
      return;
    }
    if (weeklyRate !== 0) {
      const delta = tw - cw;
      const mismatch = (weeklyRate < 0 && delta > 0) || (weeklyRate > 0 && delta < 0);
      if (mismatch) {
        Alert.alert(
          t('bodyGoal.goalMismatchTitle'),
          weeklyRate < 0
            ? t('bodyGoal.goalMismatchCutMessage')
            : t('bodyGoal.goalMismatchBulkMessage'),
        );
        return;
      }
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSaving(true);
    try {
      const tbf = parseFloat(targetBodyFat);
      const goal: BodyCompositionGoal = {
        targetWeight: tw,
        ...((!isNaN(tbf) && tbf > 0) ? { targetBodyFat: tbf } : {}),
        weeklyRate,
        startDate: format(new Date(), 'yyyy-MM-dd'),
        startWeight: cw,
      };
      await AsyncStorage.setItem(GOAL_KEY, JSON.stringify(goal));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const projText = projection?.targetDate
        ? t('bodyGoal.projectedLine', { projection: format(projection.targetDate, 'MMM d, yyyy') })
        : '';
      Alert.alert(t('bodyGoal.goalSavedTitle'), t('bodyGoal.goalSavedMessage', { weight: tw, projection: projText }), [
        { text: t('bodyGoal.doneButton'), onPress: () => router.back() },
      ]);
    } catch {
      Alert.alert(t('bodyGoal.saveErrorTitle'), t('bodyGoal.saveErrorMessage'));
    } finally {
      setSaving(false);
    }
  };

  const handleClearGoal = () => {
    Alert.alert(t('bodyGoal.clearGoalTitle'), t('bodyGoal.clearGoalMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('bodyGoal.removeButton'),
        style: 'destructive',
        onPress: async () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          await AsyncStorage.removeItem(GOAL_KEY);
          setHasExistingGoal(false);
          router.back();
        },
      },
    ]);
  };

  // ── Safety note ───────────────────────────────────────────────────────────

  const safetyNote = useMemo(() => {
    if (weeklyRate === 0) return t('bodyGoal.safetyMaintain');
    const abs = Math.abs(weeklyRate);
    if (abs >= 1.0) return t('bodyGoal.safetyAggressive');
    if (abs <= 0.25) return t('bodyGoal.safetyConservative');
    return t('bodyGoal.safetyModerate');
  }, [weeklyRate, t]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerBackBtn}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={22} color={colors.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('bodyGoal.headerTitle')}</Text>
        <TouchableOpacity
          style={[styles.headerSaveBtn, saving && styles.headerSaveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.8}
        >
          {saving
            ? <ActivityIndicator size="small" color={colors.background} />
            : <Text style={styles.headerSaveBtnText}>{t('common.save')}</Text>}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Current Stats ── */}
          <Text style={styles.sectionLabel}>{t('bodyGoal.currentStatsSection')}</Text>
          <View style={styles.card}>
            <View style={styles.inputRow}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>{t('bodyGoal.currentWeightLabel')}</Text>
                <TextInput
                  style={styles.input}
                  value={currentWeight}
                  onChangeText={setCurrentWeight}
                  placeholder={t('bodyGoal.currentWeightPlaceholder')}
                  placeholderTextColor={colors.textDisabled}
                  keyboardType="decimal-pad"
                  returnKeyType="next"
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>{t('bodyGoal.currentBodyFatLabel')}</Text>
                <TextInput
                  style={styles.input}
                  value={currentBodyFat}
                  onChangeText={setCurrentBodyFat}
                  placeholder={t('bodyGoal.currentBodyFatPlaceholder')}
                  placeholderTextColor={colors.textDisabled}
                  keyboardType="decimal-pad"
                  returnKeyType="next"
                />
              </View>
            </View>
          </View>

          {/* ── Target ── */}
          <Text style={styles.sectionLabel}>{t('bodyGoal.targetSection')}</Text>
          <View style={styles.card}>
            <View style={styles.inputRow}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>{t('bodyGoal.targetWeightLabel')}</Text>
                <TextInput
                  style={styles.input}
                  value={targetWeight}
                  onChangeText={setTargetWeight}
                  placeholder={t('bodyGoal.targetWeightPlaceholder')}
                  placeholderTextColor={colors.textDisabled}
                  keyboardType="decimal-pad"
                  returnKeyType="next"
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>{t('bodyGoal.targetBodyFatLabel')}</Text>
                <TextInput
                  style={styles.input}
                  value={targetBodyFat}
                  onChangeText={setTargetBodyFat}
                  placeholder={t('bodyGoal.targetBodyFatPlaceholder')}
                  placeholderTextColor={colors.textDisabled}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                />
              </View>
            </View>
          </View>

          {/* ── Weekly Rate ── */}
          <Text style={styles.sectionLabel}>{t('bodyGoal.weeklyRateSection')}</Text>
          <View style={styles.card}>
            <Text style={styles.rateHint}>{t('bodyGoal.weeklyRateHint')}</Text>
            <View style={styles.rateGrid}>
              {RATE_PRESETS.map((preset) => {
                const active = weeklyRate === preset.value;
                const chipColor = RATE_COLORS[preset.type];
                return (
                  <TouchableOpacity
                    key={preset.value}
                    style={[
                      styles.rateChip,
                      { borderColor: active ? chipColor : colors.border },
                      active && { backgroundColor: chipColor },
                    ]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setWeeklyRate(preset.value);
                    }}
                    activeOpacity={0.75}
                  >
                    <Text
                      style={[
                        styles.rateChipText,
                        { color: active ? '#fff' : chipColor },
                      ]}
                    >
                      {preset.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={styles.rateNoteRow}>
              <Ionicons name="flame-outline" size={13} color={colors.textDisabled} />
              <Text style={styles.rateNoteText}>
                {weeklyRate === 0
                  ? t('bodyGoal.maintenanceNoAdjustment')
                  : weeklyRate < 0
                  ? t('bodyGoal.cutRateNote', {
                      rate: Math.abs(weeklyRate),
                      kcal: Math.abs(Math.round(weeklyRate * KCAL_PER_KG / 7)),
                    })
                  : t('bodyGoal.bulkRateNote', {
                      rate: weeklyRate,
                      kcal: Math.round(weeklyRate * KCAL_PER_KG / 7),
                    })}
              </Text>
            </View>
          </View>

          {/* ── Projection Summary ── */}
          {projection && (
            <>
              <Text style={styles.sectionLabel}>{t('bodyGoal.projectedTimelineSection')}</Text>
              <View style={[styles.card, styles.projectionCard]}>
                {/* Goal header */}
                <View style={styles.projectionHeader}>
                  <View style={styles.projectionIconWrap}>
                    <Ionicons name="flag" size={20} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.projectionTitle}>
                      {weeklyRate < 0
                        ? t('bodyGoal.cutToTitle', { weight: parseFloat(targetWeight).toFixed(1) })
                        : t('bodyGoal.bulkToTitle', { weight: parseFloat(targetWeight).toFixed(1) })}
                    </Text>
                    {projection.targetDate && (
                      <Text style={styles.projectionDate}>
                        {format(projection.targetDate, 'MMMM d, yyyy')}
                      </Text>
                    )}
                  </View>
                </View>

                {/* Stat row */}
                <View style={styles.projStatRow}>
                  <View style={styles.projStatItem}>
                    <Text style={styles.projStatValue}>{projection.weeks}w</Text>
                    <Text style={styles.projStatLabel}>{t('bodyGoal.durationLabel')}</Text>
                  </View>
                  <View style={styles.projStatDivider} />
                  <View style={styles.projStatItem}>
                    <Text style={[
                      styles.projStatValue,
                      { color: weeklyRate < 0 ? colors.info : colors.success },
                    ]}>
                      {weeklyRate < 0 ? '−' : '+'}{projection.fatChange} kg
                    </Text>
                    <Text style={styles.projStatLabel}>
                      {weeklyRate < 0 ? t('bodyGoal.fatToLoseLabel') : t('bodyGoal.massToGainLabel')}
                    </Text>
                  </View>
                  <View style={styles.projStatDivider} />
                  <View style={styles.projStatItem}>
                    <Text style={[
                      styles.projStatValue,
                      { color: weeklyRate < 0 ? colors.error : colors.success },
                    ]}>
                      {projection.dailyKcal > 0 ? '+' : ''}{projection.dailyKcal}
                    </Text>
                    <Text style={styles.projStatLabel}>{t('bodyGoal.kcalPerDayLabel')}</Text>
                  </View>
                </View>

                {/* LBM row — only when body fat % is provided */}
                {(projection.lbm !== null || projection.targetLbm !== null) && (
                  <View style={styles.lbmRow}>
                    {projection.lbm !== null && (
                      <View style={styles.lbmChip}>
                        <Text style={styles.lbmChipLabel}>{t('bodyGoal.currentLbmLabel')}</Text>
                        <Text style={styles.lbmChipValue}>{projection.lbm} kg</Text>
                      </View>
                    )}
                    {projection.targetLbm !== null && (
                      <View style={styles.lbmChip}>
                        <Text style={styles.lbmChipLabel}>{t('bodyGoal.targetLbmLabel')}</Text>
                        <Text style={styles.lbmChipValue}>{projection.targetLbm} kg</Text>
                      </View>
                    )}
                  </View>
                )}

                {/* Safety note */}
                <View style={styles.safetyNote}>
                  <Ionicons name="information-circle-outline" size={13} color={colors.textDisabled} />
                  <Text style={styles.safetyNoteText}>{safetyNote}</Text>
                </View>
              </View>
            </>
          )}

          {/* ── Clear Goal ── */}
          {hasExistingGoal && (
            <TouchableOpacity
              style={styles.clearBtn}
              onPress={handleClearGoal}
              activeOpacity={0.7}
            >
              <Ionicons name="trash-outline" size={16} color={colors.error} />
              <Text style={styles.clearBtnText}>{t('bodyGoal.removeGoalButton')}</Text>
            </TouchableOpacity>
          )}

          <View style={{ height: 48 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerBackBtn: {
    width: 36, height: 36,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    marginHorizontal: spacing[2],
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textPrimary,
  },
  headerSaveBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    borderRadius: radii.md,
    minWidth: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSaveBtnDisabled: { opacity: 0.6 },
  headerSaveBtnText: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.background,
  },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: spacing[4], paddingTop: spacing[4] },

  // Section label
  sectionLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textDisabled,
    letterSpacing: 0.8,
    marginBottom: spacing[2],
    marginTop: spacing[1],
  },

  // Card
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing[4],
    marginBottom: spacing[4],
  },

  // Inputs
  inputRow: { flexDirection: 'row', gap: spacing[3] },
  inputGroup: { flex: 1 },
  inputLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    color: colors.textSecondary,
    marginBottom: spacing[2],
  },
  input: {
    backgroundColor: colors.charcoal,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    fontSize: typography.fontSize.base,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.semibold,
  },

  // Rate selector
  rateHint: {
    fontSize: typography.fontSize.xs,
    color: colors.textDisabled,
    marginBottom: spacing[3],
  },
  rateGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
    marginBottom: spacing[3],
  },
  rateChip: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: radii.full,
    borderWidth: 1,
  },
  rateChipText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  rateNoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
  },
  rateNoteText: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
    fontStyle: 'italic',
    flex: 1,
  },

  // Projection card
  projectionCard: {
    borderWidth: 1,
    borderColor: colors.primaryMuted,
  },
  projectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    marginBottom: spacing[4],
  },
  projectionIconWrap: {
    width: 40, height: 40,
    borderRadius: radii.full,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  projectionTitle: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
  },
  projectionDate: {
    fontSize: typography.fontSize.sm,
    color: colors.primary,
    fontWeight: typography.fontWeight.semibold,
    marginTop: 2,
  },
  projStatRow: {
    flexDirection: 'row',
    backgroundColor: colors.charcoal,
    borderRadius: radii.md,
    paddingVertical: spacing[3],
    marginBottom: spacing[3],
  },
  projStatItem: { flex: 1, alignItems: 'center' },
  projStatValue: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
  },
  projStatLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  projStatDivider: {
    width: 1,
    backgroundColor: colors.border,
    marginVertical: 4,
  },

  // LBM row
  lbmRow: {
    flexDirection: 'row',
    gap: spacing[3],
    marginBottom: spacing[3],
  },
  lbmChip: {
    flex: 1,
    backgroundColor: colors.charcoal,
    borderRadius: radii.md,
    padding: spacing[3],
    alignItems: 'center',
  },
  lbmChipLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
  },
  lbmChipValue: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
    marginTop: 2,
  },

  // Safety note
  safetyNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[1],
  },
  safetyNoteText: {
    flex: 1,
    fontSize: typography.fontSize.xs,
    color: colors.textDisabled,
    lineHeight: 16,
  },

  // Clear button
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    paddingVertical: spacing[4],
  },
  clearBtnText: {
    fontSize: typography.fontSize.base,
    color: colors.error,
    fontWeight: typography.fontWeight.medium,
  },
});
