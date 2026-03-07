// src/components/programs/ProgressionBadge.tsx
// GainTrack — Shows the progression delta for the current cycle (e.g. +2.5 kg this cycle)

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ProgressionRule } from '../../types';
import { colors, typography, radii } from '../../constants/theme';

interface ProgressionBadgeProps {
  rule: ProgressionRule;
  cycle: number;       // currentCycle (1-indexed)
  compact?: boolean;
}

const ruleLabel = (rule: ProgressionRule): string => {
  if (rule.type === 'weight') return `+${rule.increment} kg`;
  if (rule.type === 'reps') return `+${rule.increment} rep`;
  return `+${rule.increment} (custom)`;
};

const periodLabel = (rule: ProgressionRule): string => {
  switch (rule.every) {
    case 'session': return '/session';
    case 'week': return '/week';
    case 'cycle': return '/cycle';
    default: return '';
  }
};

export const ProgressionBadge: React.FC<ProgressionBadgeProps> = ({
  rule,
  cycle,
  compact = false,
}) => {
  const gainsSoFar = rule.increment * (cycle - 1);
  const hasGains = gainsSoFar > 0;

  return (
    <View style={[styles.container, compact && styles.compact]}>
      <Ionicons name="trending-up" size={compact ? 10 : 12} color={colors.success} />
      <Text style={[styles.label, compact && styles.labelCompact]}>
        {ruleLabel(rule)}
        <Text style={styles.period}>{periodLabel(rule)}</Text>
      </Text>
      {hasGains && !compact && (
        <View style={styles.gainsPill}>
          <Text style={styles.gainsText}>
            +{gainsSoFar}{rule.type === 'weight' ? ' kg' : ' rep'} this prog
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'wrap',
  },
  compact: {
    gap: 2,
  },
  label: {
    fontSize: typography.fontSize.sm,
    color: colors.success,
    fontWeight: typography.fontWeight.semibold,
  },
  labelCompact: {
    fontSize: typography.fontSize.xs,
  },
  period: {
    fontWeight: typography.fontWeight.regular,
    color: colors.textSecondary,
  },
  gainsPill: {
    backgroundColor: 'rgba(76,175,80,0.15)',
    borderRadius: radii.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  gainsText: {
    fontSize: typography.fontSize.xs,
    color: colors.success,
    fontWeight: typography.fontWeight.semibold,
  },
});
