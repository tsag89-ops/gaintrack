// File: src/components/ui/Badge.tsx
// GainTrack — Orange for PRs, grey for free-tier labels, accent for highlights

import React from 'react';
import { View, Text, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { theme } from '../../constants/theme';

export type BadgeVariant = 'pr' | 'free' | 'pro' | 'success' | 'error' | 'neutral';

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  /** Render as a dot indicator without text */
  dot?: boolean;
  style?: StyleProp<ViewStyle>;
}

const VARIANT_COLORS: Record<BadgeVariant, { bg: string; text: string; border: string }> = {
  pr: {
    bg: 'rgba(255, 98, 0, 0.18)',
    text: theme.primary,
    border: 'rgba(255, 98, 0, 0.45)',
  },
  pro: {
    bg: 'rgba(255, 212, 179, 0.15)',
    text: theme.accent,
    border: 'rgba(255, 212, 179, 0.35)',
  },
  free: {
    bg: 'rgba(176, 176, 176, 0.12)',
    text: theme.textSecondary,
    border: 'rgba(176, 176, 176, 0.25)',
  },
  success: {
    bg: 'rgba(76, 175, 80, 0.15)',
    text: theme.success,
    border: 'rgba(76, 175, 80, 0.35)',
  },
  error: {
    bg: 'rgba(244, 67, 54, 0.15)',
    text: theme.error,
    border: 'rgba(244, 67, 54, 0.35)',
  },
  neutral: {
    bg: theme.charcoal,
    text: theme.textSecondary,
    border: '#3D3D3D',
  },
};

export const Badge: React.FC<BadgeProps> = ({
  label,
  variant = 'neutral',
  dot = false,
  style,
}) => {
  const colors = VARIANT_COLORS[variant];

  if (dot) {
    return (
      <View
        style={[
          styles.dot,
          { backgroundColor: colors.text },
          style,
        ]}
      />
    );
  }

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: colors.bg,
          borderColor: colors.border,
        },
        style,
      ]}
    >
      <Text style={[styles.label, { color: colors.text }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 20,
    borderWidth: 1,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
  },

  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});

export default Badge;
