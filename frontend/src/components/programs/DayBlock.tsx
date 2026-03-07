// src/components/programs/DayBlock.tsx
// GainTrack — Draggable day row for the program builder.
// Shows day label, exercises count, and delete button.
// Pro gate: max 3 exercises/day for free users.

import React, { useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { ProgramDay } from '../../types';
import { colors, typography, radii, spacing } from '../../constants/theme';

interface DayBlockProps {
  day: ProgramDay;
  index: number;
  isPro: boolean;
  onAddExercise: (dayId: string) => void;
  onRemoveExercise: (dayId: string, exerciseName: string) => void;
  onDelete: (dayId: string) => void;
  /** Drag handle — pass through from DraggableFlatList renderItem */
  drag?: () => void;
  isActive?: boolean;
}

const FREE_EXERCISE_LIMIT = 3;

export const DayBlock: React.FC<DayBlockProps> = ({
  day,
  index,
  isPro,
  onAddExercise,
  onRemoveExercise,
  onDelete,
  drag,
  isActive = false,
}) => {
  const atLimit = !isPro && day.exercises.length >= FREE_EXERCISE_LIMIT;
  const canAdd = isPro || day.exercises.length < FREE_EXERCISE_LIMIT;

  const handleAddPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (canAdd) {
      onAddExercise(day.id);
    }
  }, [canAdd, day.id, onAddExercise]);

  const handleDelete = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onDelete(day.id);
  }, [day.id, onDelete]);

  return (
    <View style={[styles.container, isActive && styles.containerActive]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onLongPress={drag} style={styles.dragHandle} hitSlop={8}>
          <Ionicons name="reorder-three" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
        <View style={styles.labelWrap}>
          <Text style={styles.dayIndex}>Day {index + 1}</Text>
          <Text style={styles.dayLabel} numberOfLines={1}>{day.label}</Text>
        </View>
        <TouchableOpacity onPress={handleDelete} hitSlop={8}>
          <Ionicons name="trash-outline" size={18} color={colors.error} />
        </TouchableOpacity>
      </View>

      {/* Exercise list */}
      {day.exercises.map((ex) => (
        <View key={ex.exerciseName} style={styles.exerciseRow}>
          <View style={styles.exerciseInfo}>
            <Text style={styles.exerciseName} numberOfLines={1}>{ex.exerciseName}</Text>
            <Text style={styles.exerciseMeta}>
              {ex.sets}×{ex.reps} @ {ex.weight} kg
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onRemoveExercise(day.id, ex.exerciseName);
            }}
            hitSlop={8}
          >
            <Ionicons name="close-circle" size={18} color={colors.textDisabled} />
          </TouchableOpacity>
        </View>
      ))}

      {/* Add exercise button */}
      <TouchableOpacity
        style={[styles.addBtn, !canAdd && styles.addBtnDisabled]}
        onPress={handleAddPress}
        activeOpacity={0.7}
      >
        <Ionicons
          name={canAdd ? 'add-circle-outline' : 'lock-closed-outline'}
          size={16}
          color={canAdd ? colors.primary : colors.textDisabled}
        />
        <Text style={[styles.addBtnText, !canAdd && styles.addBtnTextDisabled]}>
          {canAdd ? 'Add Exercise' : `Pro — add more than ${FREE_EXERCISE_LIMIT}`}
        </Text>
      </TouchableOpacity>

      {/* Free tier upsell inline banner */}
      {atLimit && (
        <View style={styles.upsellBanner}>
          <Ionicons name="lock-closed" size={13} color={colors.accent} />
          <Text style={styles.upsellText}>
            Upgrade to Pro for unlimited exercises per day {/* [PRO] */}
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.charcoal,
    borderRadius: radii.lg,
    padding: spacing[3],
    marginBottom: spacing[2],
  },
  containerActive: {
    opacity: 0.85,
    transform: [{ scale: 1.02 }],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    marginBottom: spacing[2],
  },
  dragHandle: {
    padding: 4,
  },
  labelWrap: {
    flex: 1,
  },
  dayIndex: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  dayLabel: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textPrimary,
  },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  exerciseInfo: {
    flex: 1,
  },
  exerciseName: {
    fontSize: typography.fontSize.sm,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.medium,
  },
  exerciseMeta: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
    marginTop: 1,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing[2],
    padding: 6,
  },
  addBtnDisabled: {
    opacity: 0.5,
  },
  addBtnText: {
    fontSize: typography.fontSize.sm,
    color: colors.primary,
    fontWeight: typography.fontWeight.semibold,
  },
  addBtnTextDisabled: {
    color: colors.textDisabled,
  },
  upsellBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 212, 179, 0.1)',
    borderRadius: radii.md,
    padding: spacing[2],
    marginTop: spacing[1],
  },
  upsellText: {
    fontSize: typography.fontSize.xs,
    color: colors.accent,
    flex: 1,
  },
});
