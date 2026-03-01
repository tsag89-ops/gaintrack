// File: src/components/ui/SkeletonLoader.tsx
// GainTrack — Animated shimmer placeholder for loading states (react-native-reanimated)

import React, { useEffect } from 'react';
import { View, StyleSheet, ViewStyle, StyleProp, DimensionValue } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  interpolate,
} from 'react-native-reanimated';
import { theme } from '../../constants/theme';

// ─── Single skeleton line/block ──────────────────────────────────────────────

interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  width = '100%',
  height = 16,
  borderRadius = 8,
  style,
}) => {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      -1,   // infinite
      true, // reverse (ping-pong)
    );
    return () => {
      progress.value = 0;
    };
  }, [progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0.35, 0.75]),
  }));

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: '#3A3A3A',
        },
        animatedStyle,
        style,
      ]}
    />
  );
};

// ─── Preset layouts ──────────────────────────────────────────────────────────

/** Row of avatar circle + two text lines — matches WorkoutCard shape */
export const SkeletonWorkoutCard: React.FC = () => (
  <View style={skStyles.card}>
    <View style={skStyles.row}>
      <Skeleton width={44} height={44} borderRadius={22} />
      <View style={skStyles.textBlock}>
        <Skeleton width="60%" height={14} borderRadius={7} />
        <View style={{ height: 6 }} />
        <Skeleton width="40%" height={11} borderRadius={6} />
      </View>
    </View>
    <View style={{ height: 12 }} />
    <Skeleton width="100%" height={10} borderRadius={5} />
    <View style={{ height: 6 }} />
    <Skeleton width="80%" height={10} borderRadius={5} />
    <View style={{ height: 6 }} />
    <Skeleton width="55%" height={10} borderRadius={5} />
  </View>
);

/** Single exercise row skeleton */
export const SkeletonExerciseRow: React.FC = () => (
  <View style={skStyles.exerciseRow}>
    <Skeleton width={40} height={40} borderRadius={8} />
    <View style={skStyles.exerciseText}>
      <Skeleton width="55%" height={13} borderRadius={6} />
      <View style={{ height: 5 }} />
      <Skeleton width="35%" height={10} borderRadius={5} />
    </View>
  </View>
);

/** Full-screen loading list (5 workout cards) */
interface SkeletonListProps {
  count?: number;
  variant?: 'workout' | 'exercise';
  style?: StyleProp<ViewStyle>;
}

export const SkeletonList: React.FC<SkeletonListProps> = ({
  count = 5,
  variant = 'workout',
  style,
}) => (
  <View style={[skStyles.list, style]}>
    {Array.from({ length: count }).map((_, i) =>
      variant === 'workout' ? (
        <SkeletonWorkoutCard key={i} />
      ) : (
        <SkeletonExerciseRow key={i} />
      ),
    )}
  </View>
);

const skStyles = StyleSheet.create({
  list: {
    gap: 12,
    paddingHorizontal: 16,
  },

  card: {
    backgroundColor: theme.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#303030',
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  textBlock: {
    flex: 1,
    justifyContent: 'center',
  },

  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: theme.surface,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#303030',
  },

  exerciseText: {
    flex: 1,
  },
});

export default SkeletonList;
