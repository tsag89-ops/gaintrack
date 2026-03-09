// app/(tabs)/plates.tsx
// Plate Calculator tab — full-featured barbell plate calculator with:
//   • Visual bar representation (PlateBarVisual)
//   • Configurable plate counts per denomination
//   • Bar-weight selector
//   • AsyncStorage-backed persistence (via usePlateCalculator hook)
//   • "Use in Active Workout" integration

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { usePlateCalculator, BAR_OPTIONS, DEFAULT_PLATES } from '../../src/hooks/usePlateCalculator';
import PlateBarVisual from '../../src/components/PlateBarVisual';
import { colors, typography, spacing, radii, shadows } from '../../src/constants/theme';
import { Unit } from '../../src/types/plates';

export default function PlatesScreen() {
  const {
    unit,
    barWeight,
    targetWeight,
    plates,
    result,
    loading,
    setUnit,
    setBarWeight,
    setTargetWeight,
    setPlateCount,
    resetToDefaults,
    useInActiveWorkout,
  } = usePlateCalculator();

  const [inputFocused, setInputFocused] = useState(false);

  // ── Derived display values ─────────────────────────────────────────────────
  const hasResult   = result !== null;
  const hasTarget   = targetWeight.length > 0;
  const canUseInWorkout = hasResult && (result?.platesPerSide.length ?? 0) > 0;

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleUnitToggle(u: Unit) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setUnit(u);
  }

  function handleBarSelect(w: number) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setBarWeight(w);
  }

  function handlePlateCountChange(plateWeight: number, delta: number) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const current = plates.find((p) => p.weight === plateWeight)?.count ?? 0;
    const next = Math.max(0, current + delta);
    setPlateCount(plateWeight, next);
  }

  function handleReset() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    resetToDefaults();
  }

  function handleUseInWorkout() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    useInActiveWorkout();
  }

  // ── Build the result summary string ───────────────────────────────────────
  function buildSummary(): string {
    if (!result || result.platesPerSide.length === 0) return '';
    const perSide = result.platesPerSide
      .map((p) => `${p.weight}${unit} × ${p.countPerSide}`)
      .join(', ');
    return `Per side: ${perSide}`;
  }

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <Text style={styles.title}>Plate Calculator</Text>
        <Text style={styles.subtitle}>
          Figure out which plates to load for any target weight
        </Text>

        {/* ── Unit toggle: KG / LB ─────────────────────────────────────── */}
        <View style={styles.toggleRow}>
          {(['kg', 'lb'] as Unit[]).map((u) => (
            <TouchableOpacity
              key={u}
              style={[styles.toggleBtn, unit === u && styles.toggleBtnActive]}
              onPress={() => handleUnitToggle(u)}
              activeOpacity={0.75}
            >
              <Text
                style={[
                  styles.toggleText,
                  unit === u && styles.toggleTextActive,
                ]}
              >
                {u.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Target weight input ───────────────────────────────────────── */}
        <View
          style={[styles.inputWrap, inputFocused && styles.inputWrapFocused]}
        >
          <TextInput
            style={styles.input}
            value={targetWeight}
            onChangeText={setTargetWeight}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            placeholder={`Target weight (${unit})`}
            placeholderTextColor={colors.textDisabled}
            keyboardType="decimal-pad"
            returnKeyType="done"
          />
          <Text style={styles.inputSuffix}>{unit}</Text>
        </View>

        {/* ── Bar weight selector ───────────────────────────────────────── */}
        <Text style={styles.sectionTitle}>Bar Weight</Text>
        <View style={styles.chipRow}>
          {BAR_OPTIONS[unit].map((w) => (
            <TouchableOpacity
              key={w}
              style={[styles.chip, barWeight === w && styles.chipActive]}
              onPress={() => handleBarSelect(w)}
              activeOpacity={0.75}
            >
              <Text
                style={[
                  styles.chipText,
                  barWeight === w && styles.chipTextActive,
                ]}
              >
                {w} {unit}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Visual bar (shown when there's a result with plates) ──────── */}
        {hasResult && result!.platesPerSide.length > 0 && (
          <PlateBarVisual
            platesPerSide={result!.platesPerSide}
            unit={unit}
            barWeight={barWeight}
          />
        )}

        {/* ── Result card ───────────────────────────────────────────────── */}
        {hasTarget && (
          <View
            style={[
              styles.resultCard,
              result?.success ? styles.resultCardSuccess : styles.resultCardWarn,
            ]}
          >
            {!result || result.platesPerSide.length === 0 ? (
              /* Target is at or below bar weight */
              <Text style={styles.resultNote}>
                {`Target must be greater than bar weight (${barWeight} ${unit})`}
              </Text>
            ) : result.success ? (
              /* Exact match */
              <>
                <View style={styles.resultHeader}>
                  <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                  <Text style={styles.resultTitle}>
                    Exact — {result.achievedTotal} {unit}
                  </Text>
                </View>
                <Text style={styles.resultDetail}>{buildSummary()}</Text>
              </>
            ) : (
              /* Closest achievable */
              <>
                <View style={styles.resultHeader}>
                  <Ionicons name="alert-circle" size={20} color={colors.warning} />
                  <Text style={styles.resultTitle}>
                    Closest: {result.achievedTotal} {unit}
                    {'  '}
                    <Text style={styles.resultMissing}>
                      (asked {parseFloat(targetWeight)} {unit})
                    </Text>
                  </Text>
                </View>
                <Text style={styles.resultDetail}>{buildSummary()}</Text>
                {result.missing !== undefined && Math.abs(result.missing) > 0 && (
                  <Text style={styles.resultMissingNote}>
                    Off by {Math.abs(result.missing).toFixed(2)} {unit} — no matching plates for the
                    remainder
                  </Text>
                )}
              </>
            )}
          </View>
        )}

        {/* ── Info chips ────────────────────────────────────────────────── */}
        {hasResult && result!.platesPerSide.length > 0 && (
          <View style={styles.infoRow}>
            <View style={styles.infoChip}>
              <Text style={styles.infoChipLabel}>Bar</Text>
              <Text style={styles.infoChipValue}>
                {barWeight} {unit}
              </Text>
            </View>
            <View style={styles.infoChip}>
              <Text style={styles.infoChipLabel}>Plates</Text>
              <Text style={styles.infoChipValue}>
                {(result!.achievedTotal - barWeight).toFixed(2).replace(/\.?0+$/, '')} {unit}
              </Text>
            </View>
            <View style={styles.infoChip}>
              <Text style={styles.infoChipLabel}>Per side</Text>
              <Text style={styles.infoChipValue}>
                {((result!.achievedTotal - barWeight) / 2)
                  .toFixed(2)
                  .replace(/\.?0+$/, '')}{' '}
                {unit}
              </Text>
            </View>
          </View>
        )}

        {/* ── Plate bank config ─────────────────────────────────────────── */}
        <Text style={styles.sectionTitle}>Plates Available</Text>
        <Text style={styles.sectionSubtitle}>
          Total single plates you own (need 2 for a pair)
        </Text>
        <View style={styles.plateListCard}>
          {plates.map((plate, idx) => {
            const isLast = idx === plates.length - 1;
            return (
              <View
                key={plate.weight}
                style={[styles.plateRow, !isLast && styles.plateRowBorder]}
              >
                <Text style={styles.plateWeightLabel}>
                  {plate.weight} {unit}
                </Text>
                <View style={styles.plateCountControls}>
                  <TouchableOpacity
                    style={[
                      styles.countBtn,
                      plate.count === 0 && styles.countBtnDisabled,
                    ]}
                    onPress={() => handlePlateCountChange(plate.weight, -2)}
                    disabled={plate.count === 0}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name="remove"
                      size={16}
                      color={plate.count === 0 ? colors.textDisabled : colors.textPrimary}
                    />
                  </TouchableOpacity>
                  <Text style={styles.plateCountText}>{plate.count}</Text>
                  <TouchableOpacity
                    style={styles.countBtn}
                    onPress={() => handlePlateCountChange(plate.weight, 2)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="add" size={16} color={colors.textPrimary} />
                  </TouchableOpacity>
                </View>
                {/* Visual pair indicator */}
                <Text style={styles.pairLabel}>
                  {Math.floor(plate.count / 2)} pair{Math.floor(plate.count / 2) !== 1 ? 's' : ''}
                </Text>
              </View>
            );
          })}
        </View>

        {/* ── Actions ───────────────────────────────────────────────────── */}

        {/* "Use in Active Workout" button — only enabled when we have plates */}
        {/* Navigates to the Active Workout screen with the achieved total.   */}
        {/* See usePlateCalculator.ts → useInActiveWorkout() for the stub.   */}
        <TouchableOpacity
          style={[
            styles.primaryBtn,
            !canUseInWorkout && styles.primaryBtnDisabled,
          ]}
          onPress={handleUseInWorkout}
          disabled={!canUseInWorkout}
          activeOpacity={0.82}
        >
          <Ionicons
            name="barbell-outline"
            size={18}
            color={!canUseInWorkout ? colors.textDisabled : '#FFFFFF'}
            style={{ marginRight: spacing[2] }}
          />
          <Text
            style={[
              styles.primaryBtnText,
              !canUseInWorkout && styles.primaryBtnTextDisabled,
            ]}
          >
            Use in Active Workout
          </Text>
        </TouchableOpacity>

        {/* Reset button */}
        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={handleReset}
          activeOpacity={0.75}
        >
          <Ionicons
            name="refresh-outline"
            size={16}
            color={colors.textSecondary}
            style={{ marginRight: spacing[2] }}
          />
          <Text style={styles.secondaryBtnText}>Reset to Defaults</Text>
        </TouchableOpacity>

        <View style={styles.bottomPad} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: spacing[4],
    paddingBottom: spacing[10],
  },

  // Header
  title: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
    marginBottom: spacing[1],
  },
  subtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing[5],
  },

  // Unit toggle
  toggleRow: {
    flexDirection: 'row',
    backgroundColor: colors.charcoal,
    borderRadius: radii.full,
    padding: 3,
    alignSelf: 'flex-start',
    marginBottom: spacing[4],
  },
  toggleBtn: {
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[2],
    borderRadius: radii.full,
  },
  toggleBtnActive: {
    backgroundColor: colors.primary,
    ...shadows.sm,
  },
  toggleText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textSecondary,
    letterSpacing: 0.8,
  },
  toggleTextActive: {
    color: colors.textPrimary,
  },

  // Target input
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: spacing[4],
    marginBottom: spacing[5],
    height: 56,
  },
  inputWrapFocused: {
    borderColor: colors.borderFocus,
  },
  input: {
    flex: 1,
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textPrimary,
    paddingVertical: 0,
  },
  inputSuffix: {
    fontSize: typography.fontSize.base,
    color: colors.textSecondary,
    fontWeight: typography.fontWeight.medium,
  },

  // Section labels
  sectionTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing[2],
  },
  sectionSubtitle: {
    fontSize: typography.fontSize.xs,
    color: colors.textDisabled,
    marginBottom: spacing[3],
    marginTop: -spacing[1],
  },

  // Bar weight chips
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
    marginBottom: spacing[5],
  },
  chip: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    backgroundColor: colors.surface,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.primaryMuted,
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.textSecondary,
  },
  chipTextActive: {
    color: colors.primary,
    fontWeight: typography.fontWeight.semibold,
  },

  // Result card
  resultCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: spacing[4],
    marginBottom: spacing[4],
  },
  resultCardSuccess: {
    backgroundColor: colors.successMuted,
    borderColor: colors.success,
  },
  resultCardWarn: {
    backgroundColor: colors.warningMuted,
    borderColor: colors.warning,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    marginBottom: spacing[2],
  },
  resultTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  resultDetail: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  resultNote: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
  },
  resultMissing: {
    color: colors.textSecondary,
    fontWeight: typography.fontWeight.regular,
  },
  resultMissingNote: {
    fontSize: typography.fontSize.xs,
    color: colors.warning,
    marginTop: spacing[1],
  },

  // Info chips row (bar / plates / per-side)
  infoRow: {
    flexDirection: 'row',
    gap: spacing[2],
    marginBottom: spacing[5],
  },
  infoChip: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing[3],
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoChipLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  infoChipValue: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    color: colors.primary,
  },

  // Plate bank list
  plateListCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing[5],
    overflow: 'hidden',
  },
  plateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  plateRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  plateWeightLabel: {
    flex: 1,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.medium,
    color: colors.textPrimary,
  },
  plateCountControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  countBtn: {
    width: 32,
    height: 32,
    borderRadius: radii.md,
    backgroundColor: colors.charcoal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBtnDisabled: {
    opacity: 0.38,
  },
  plateCountText: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textPrimary,
    minWidth: 28,
    textAlign: 'center',
  },
  pairLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
    width: 52,
    textAlign: 'right',
  },

  // Buttons
  primaryBtn: {
    flexDirection: 'row',
    backgroundColor: colors.primary,
    borderRadius: radii.lg,
    paddingVertical: spacing[4],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[3],
    ...shadows.md,
  },
  primaryBtnDisabled: {
    backgroundColor: colors.charcoal,
    ...shadows.sm,
  },
  primaryBtnText: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  primaryBtnTextDisabled: {
    color: colors.textDisabled,
  },
  secondaryBtn: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    paddingVertical: spacing[3],
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryBtnText: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.medium,
    color: colors.textSecondary,
  },

  bottomPad: {
    height: spacing[8],
  },
});
