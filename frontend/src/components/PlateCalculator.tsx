// components/PlateCalculator.tsx
// Hevy-style barbell plate calculator with visual preview

import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Clipboard,
  Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  useAnimatedStyle,
  withSpring,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { colors, typography, spacing, radii, shadows } from '../constants/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

type Unit = 'kg' | 'lbs';

interface PlateConfig {
  weight: number;
  color: string;
  borderColor: string;
  label: string;
  heightPx: number;
  widthPx: number;
}

// ─── Plate definitions ────────────────────────────────────────────────────────

const KG_PLATES: PlateConfig[] = [
  { weight: 20,   color: '#1565C0', borderColor: '#0D47A1', label: '20',   heightPx: 80, widthPx: 18 },
  { weight: 15,   color: '#F9A825', borderColor: '#F57F17', label: '15',   heightPx: 70, widthPx: 16 },
  { weight: 10,   color: '#2E7D32', borderColor: '#1B5E20', label: '10',   heightPx: 60, widthPx: 14 },
  { weight: 5,    color: '#424242', borderColor: '#212121', label: '5',    heightPx: 48, widthPx: 12 },
  { weight: 2.5,  color: '#C62828', borderColor: '#B71C1C', label: '2.5',  heightPx: 38, widthPx: 10 },
  { weight: 1.25, color: '#6A1B9A', borderColor: '#4A148C', label: '1.25', heightPx: 30, widthPx: 8  },
];

const LBS_PLATES: PlateConfig[] = [
  { weight: 45,  color: '#1565C0', borderColor: '#0D47A1', label: '45',  heightPx: 80, widthPx: 18 },
  { weight: 35,  color: '#F9A825', borderColor: '#F57F17', label: '35',  heightPx: 70, widthPx: 16 },
  { weight: 25,  color: '#2E7D32', borderColor: '#1B5E20', label: '25',  heightPx: 60, widthPx: 14 },
  { weight: 10,  color: '#424242', borderColor: '#212121', label: '10',  heightPx: 48, widthPx: 12 },
  { weight: 5,   color: '#C62828', borderColor: '#B71C1C', label: '5',   heightPx: 38, widthPx: 10 },
  { weight: 2.5, color: '#6A1B9A', borderColor: '#4A148C', label: '2.5', heightPx: 30, widthPx: 8  },
];

const BAR_WEIGHT: Record<Unit, number> = { kg: 20, lbs: 45 };

// ─── Algorithm ────────────────────────────────────────────────────────────────

function calculatePlates(
  targetWeight: number,
  unit: Unit
): { plates: PlateConfig[]; perSide: { plate: PlateConfig; count: number }[]; valid: boolean; remainder: number } {
  const barWeight = BAR_WEIGHT[unit];
  const allPlates = unit === 'kg' ? KG_PLATES : LBS_PLATES;

  if (targetWeight <= barWeight) {
    return { plates: [], perSide: [], valid: targetWeight === barWeight, remainder: 0 };
  }

  const totalPlateWeight = targetWeight - barWeight;
  const perSideWeight = totalPlateWeight / 2;

  let remaining = perSideWeight;
  const result: { plate: PlateConfig; count: number }[] = [];
  const platesFlat: PlateConfig[] = [];

  for (const plate of allPlates) {
    if (remaining <= 0) break;
    const count = Math.floor(remaining / plate.weight);
    if (count > 0) {
      result.push({ plate, count });
      for (let i = 0; i < count; i++) platesFlat.push(plate);
      remaining = parseFloat((remaining - count * plate.weight).toFixed(4));
    }
  }

  return {
    plates: platesFlat,
    perSide: result,
    valid: remaining < 0.01,
    remainder: remaining,
  };
}

// ─── Plate visual ─────────────────────────────────────────────────────────────

const PlateRect: React.FC<{ plate: PlateConfig; index: number }> = ({ plate, index }) => {
  const scale = useSharedValue(0);

  React.useEffect(() => {
    scale.value = withSpring(1, { damping: 12, stiffness: 180, delay: index * 40 } as any);
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scaleY: scale.value }],
  }));

  return (
    <Animated.View
      style={[
        animStyle,
        {
          width: plate.widthPx,
          height: plate.heightPx,
          backgroundColor: plate.color,
          borderRadius: 4,
          borderWidth: 2,
          borderColor: plate.borderColor,
          alignItems: 'center',
          justifyContent: 'center',
          marginHorizontal: 1,
        },
      ]}
    >
      <Text
        style={{
          color: '#fff',
          fontSize: 7,
          fontWeight: '700',
          transform: [{ rotate: '-90deg' }],
          width: plate.heightPx,
          textAlign: 'center',
        }}
        numberOfLines={1}
      >
        {plate.label}
      </Text>
    </Animated.View>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  initialWeight?: number;
}

const PlateCalculator: React.FC<Props> = ({ initialWeight }) => {
  const [unit, setUnit] = useState<Unit>('kg');
  const [inputValue, setInputValue] = useState(
    initialWeight ? String(initialWeight) : ''
  );
  const [focused, setFocused] = useState(false);
  const copyScale = useSharedValue(1);

  const targetWeight = useMemo(() => {
    const parsed = parseFloat(inputValue);
    return isNaN(parsed) ? 0 : parsed;
  }, [inputValue]);

  const { plates, perSide, valid, remainder } = useMemo(
    () => calculatePlates(targetWeight, unit),
    [targetWeight, unit]
  );

  const handleUnitToggle = useCallback((selected: Unit) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setUnit(selected);
    setInputValue('');
  }, []);

  const handleCopy = useCallback(async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    copyScale.value = withSequence(
      withTiming(0.88, { duration: 80 }),
      withSpring(1, { damping: 10 })
    );

    if (!valid || perSide.length === 0) return;
    const barLabel = `${BAR_WEIGHT[unit]}${unit} bar`;
    const lines = perSide.map((p) => `${p.count}x ${p.plate.label}${unit}`);
    const text = `GainTrack Plate Calculator\n${barLabel} + ${lines.join(', ')} per side\nTotal: ${targetWeight}${unit}`;
    Clipboard.setString(text);
  }, [valid, perSide, unit, targetWeight, copyScale]);

  const copyAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: copyScale.value }],
  }));

  const barWeight = BAR_WEIGHT[unit];
  const showBar = targetWeight >= barWeight && inputValue.length > 0;
  const maxBarPlates = 8; // display cap for visual

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <Text style={styles.title}>Plate Calculator</Text>
      <Text style={styles.subtitle}>
        {barWeight}{unit} bar · Plates per side
      </Text>

      {/* Unit toggle */}
      <View style={styles.toggleRow}>
        {(['kg', 'lbs'] as Unit[]).map((u) => (
          <TouchableOpacity
            key={u}
            style={[styles.toggleBtn, unit === u && styles.toggleBtnActive]}
            onPress={() => handleUnitToggle(u)}
            activeOpacity={0.75}
          >
            <Text style={[styles.toggleText, unit === u && styles.toggleTextActive]}>
              {u.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Weight input */}
      <View style={[styles.inputWrap, focused && styles.inputWrapFocused]}>
        <TextInput
          style={styles.input}
          value={inputValue}
          onChangeText={setInputValue}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={`Target weight (${unit})`}
          placeholderTextColor={colors.textDisabled}
          keyboardType="decimal-pad"
          returnKeyType="done"
        />
        <Text style={styles.inputUnit}>{unit}</Text>
      </View>

      {/* Bar info chips */}
      {showBar && (
        <View style={styles.chipRow}>
          <View style={styles.chip}>
            <Text style={styles.chipLabel}>Bar</Text>
            <Text style={styles.chipValue}>{barWeight}{unit}</Text>
          </View>
          <View style={styles.chip}>
            <Text style={styles.chipLabel}>Plates</Text>
            <Text style={styles.chipValue}>
              {valid ? `${(targetWeight - barWeight).toFixed(2).replace(/\.?0+$/, '')}${unit}` : '—'}
            </Text>
          </View>
          <View style={styles.chip}>
            <Text style={styles.chipLabel}>Per side</Text>
            <Text style={styles.chipValue}>
              {valid ? `${((targetWeight - barWeight) / 2).toFixed(2).replace(/\.?0+$/, '')}${unit}` : '—'}
            </Text>
          </View>
        </View>
      )}

      {/* Visual barbell */}
      {showBar && (
        <View style={styles.barbellCard}>
          <Text style={styles.barbellLabel}>Visual Preview</Text>
          <View style={styles.barbellRow}>
            {/* Left collar */}
            <View style={styles.collar} />

            {/* Plates (left side — mirrored) */}
            <View style={styles.platesLeft}>
              {plates.slice(0, maxBarPlates).reverse().map((plate, i) => (
                <PlateRect key={`l-${i}`} plate={plate} index={i} />
              ))}
            </View>

            {/* Bar sleeve */}
            <View style={styles.barSleeve} />

            {/* Center knurl */}
            <View style={styles.barCenter}>
              {Array.from({ length: 6 }).map((_, i) => (
                <View key={i} style={styles.knurl} />
              ))}
            </View>

            {/* Bar sleeve right */}
            <View style={styles.barSleeve} />

            {/* Plates (right side) */}
            <View style={styles.platesRight}>
              {plates.slice(0, maxBarPlates).map((plate, i) => (
                <PlateRect key={`r-${i}`} plate={plate} index={i} />
              ))}
            </View>

            {/* Right collar */}
            <View style={styles.collar} />
          </View>

          {plates.length > maxBarPlates && (
            <Text style={styles.overflowNote}>
              +{plates.length - maxBarPlates} more plate{plates.length - maxBarPlates > 1 ? 's' : ''} per side
            </Text>
          )}
        </View>
      )}

      {/* Plate list */}
      {showBar && perSide.length > 0 && (
        <View style={styles.plateListCard}>
          <Text style={styles.sectionTitle}>Plates per side</Text>
          {valid ? (
            perSide.map(({ plate, count }, i) => (
              <View key={i} style={styles.plateRow}>
                <View style={[styles.plateDot, { backgroundColor: plate.color, borderColor: plate.borderColor }]} />
                <Text style={styles.plateRowLabel}>{plate.label} {unit}</Text>
                <View style={styles.plateBubbles}>
                  {Array.from({ length: count }).map((_, j) => (
                    <View key={j} style={[styles.plateBubble, { backgroundColor: plate.color }]}>
                      <Text style={styles.plateBubbleText}>{plate.label}</Text>
                    </View>
                  ))}
                </View>
                <Text style={styles.plateRowCount}>×{count}</Text>
              </View>
            ))
          ) : (
            <View style={styles.errorRow}>
              <Text style={styles.errorText}>
                ⚠ {targetWeight}{unit} can't be loaded exactly — off by {remainder.toFixed(2)}{unit} per side.
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Empty / below bar weight state */}
      {inputValue.length > 0 && !showBar && (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>
            Minimum weight is {barWeight}{unit} (bar only)
          </Text>
        </View>
      )}

      {/* Copy button */}
      {showBar && valid && perSide.length > 0 && (
        <Animated.View style={copyAnimStyle}>
          <TouchableOpacity style={styles.copyBtn} onPress={handleCopy} activeOpacity={0.82}>
            <Text style={styles.copyBtnText}>Copy Plates</Text>
          </TouchableOpacity>
        </Animated.View>
      )}
    </ScrollView>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing[4],
    paddingBottom: spacing[10],
  },
  title: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
    marginBottom: spacing[1],
  },
  subtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing[4],
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
  // Input
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: spacing[4],
    marginBottom: spacing[4],
    height: 52,
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
  inputUnit: {
    fontSize: typography.fontSize.base,
    color: colors.textSecondary,
    fontWeight: typography.fontWeight.medium,
    marginLeft: spacing[2],
  },
  // Chips
  chipRow: {
    flexDirection: 'row',
    gap: spacing[2],
    marginBottom: spacing[4],
  },
  chip: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing[3],
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  chipValue: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.bold,
    color: colors.primary,
  },
  // Barbell visual
  barbellCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing[4],
    marginBottom: spacing[4],
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.md,
  },
  barbellLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
    marginBottom: spacing[3],
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  barbellRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 90,
  },
  collar: {
    width: 8,
    height: 28,
    backgroundColor: '#888',
    borderRadius: 3,
    zIndex: 2,
  },
  platesLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
  },
  platesRight: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
  },
  barSleeve: {
    width: 24,
    height: 10,
    backgroundColor: '#9E9E9E',
    borderRadius: 2,
  },
  barCenter: {
    flex: 1,
    maxWidth: 100,
    height: 14,
    backgroundColor: '#757575',
    borderRadius: 3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingHorizontal: 4,
  },
  knurl: {
    width: 2,
    height: 10,
    backgroundColor: '#555',
    borderRadius: 1,
  },
  overflowNote: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing[2],
  },
  // Plate list
  plateListCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing[4],
    marginBottom: spacing[4],
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing[3],
  },
  plateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  plateDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    marginRight: spacing[3],
  },
  plateRowLabel: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.medium,
    color: colors.textPrimary,
    width: 56,
  },
  plateBubbles: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  plateBubble: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.full,
    minWidth: 28,
    alignItems: 'center',
  },
  plateBubbleText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  plateRowCount: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.bold,
    color: colors.primary,
    minWidth: 28,
    textAlign: 'right',
  },
  // Error
  errorRow: {
    paddingVertical: spacing[3],
  },
  errorText: {
    fontSize: typography.fontSize.sm,
    color: colors.warning,
    lineHeight: 20,
  },
  // Empty
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing[4],
    alignItems: 'center',
    marginBottom: spacing[4],
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyText: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
  },
  // Copy button
  copyBtn: {
    backgroundColor: colors.primary,
    borderRadius: radii.lg,
    paddingVertical: spacing[4],
    alignItems: 'center',
    ...shadows.md,
  },
  copyBtnText: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    color: '#fff',
    letterSpacing: 0.4,
  },
});

export default PlateCalculator;
