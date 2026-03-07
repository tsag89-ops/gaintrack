// src/components/programs/ProgramCard.tsx
// GainTrack — Program summary card: name, schedule, cycle, next session, progress bar

import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { format, addDays, parseISO } from 'date-fns';
import { WorkoutProgram } from '../../types';
import { colors, typography, radii, shadows, spacing } from '../../constants/theme';

interface ProgramCardProps {
  program: WorkoutProgram;
  onPress: (program: WorkoutProgram) => void;
  onLongPress?: (program: WorkoutProgram) => void;
}

/** Returns the estimated next session date from lastSessionDate or today. */
const nextSessionDate = (program: WorkoutProgram): string => {
  const base = program.lastSessionDate
    ? parseISO(program.lastSessionDate)
    : new Date();
  // Rough heuristic: 7 / daysPerWeek = rest days between sessions
  const daysGap = Math.round(7 / program.daysPerWeek);
  const next = addDays(base, daysGap);
  return format(next, 'MMM d');
};

/** How many days in this cycle have been completed (0 → daysPerWeek-1). */
const weekCompletion = (program: WorkoutProgram): number => {
  return program.currentDayIndex / program.daysPerWeek;
};

export const ProgramCard: React.FC<ProgramCardProps> = ({
  program,
  onPress,
  onLongPress,
}) => {
  const handlePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress(program);
  }, [program, onPress]);

  const handleLongPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onLongPress?.(program);
  }, [program, onLongPress]);

  const completion = weekCompletion(program);
  const progressPercent = Math.max(0, Math.min(1, completion)) * 100;
  const nextDay = program.days[program.currentDayIndex];

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={handlePress}
      onLongPress={handleLongPress}
      activeOpacity={0.8}
    >
      {/* Header row */}
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={styles.iconWrap}>
            <Ionicons name="barbell" size={18} color={colors.primary} />
          </View>
          <View style={styles.titleBlock}>
            <Text style={styles.name} numberOfLines={1}>{program.name}</Text>
            <Text style={styles.schedule}>
              {program.daysPerWeek}×/week · Cycle {program.currentCycle}
            </Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
      </View>

      {/* Progress bar */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
      </View>
      <View style={styles.progressLabels}>
        <Text style={styles.progressText}>
          Day {program.currentDayIndex + 1} of {program.daysPerWeek} this cycle
        </Text>
        <Text style={styles.progressText}>{Math.round(progressPercent)}%</Text>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <View style={styles.footerItem}>
          <Ionicons name="calendar-outline" size={13} color={colors.textSecondary} />
          <Text style={styles.footerText}>Next: {nextSessionDate(program)}</Text>
        </View>
        {nextDay && (
          <View style={styles.footerItem}>
            <Ionicons name="today-outline" size={13} color={colors.textSecondary} />
            <Text style={styles.footerText} numberOfLines={1}>{nextDay.label}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing[4],
    marginBottom: spacing[3],
    ...shadows.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing[3],
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    flex: 1,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleBlock: {
    flex: 1,
  },
  name: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
  },
  schedule: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  progressTrack: {
    height: 6,
    backgroundColor: colors.charcoal,
    borderRadius: radii.full,
    overflow: 'hidden',
    marginBottom: 4,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: radii.full,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing[3],
  },
  progressText: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing[4],
  },
  footerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  footerText: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
  },
});
