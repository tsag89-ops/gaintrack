// app/(tabs)/exercises.tsx
// GainTrack — Exercise Library tab (wraps ExercisePicker in standalone browse mode)

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { Exercise } from '../../src/types';
import { theme } from '../../src/constants/theme';
import { ExercisePicker } from '../../src/components/ExercisePicker';
import { usePro } from '../../src/hooks/usePro';

// Exercise library tab — tapping + on an exercise starts a new workout with it pre-loaded

export default function ExercisesScreen() {
  const router = useRouter();
  const { isPro } = usePro();

  const handleAdd = async (exercise: Exercise, _superset?: boolean) => {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // Start a new workout with this exercise pre-loaded
    router.push({
      pathname: '/workout/new',
      params: { preloadExercise: JSON.stringify(exercise) },
    });
  };

  const handleClose = () => {
    // No-op: in tab mode, "close" navigates back (nothing to close)
    router.back();
  };

  return (
    <View style={styles.container}>
      {/* The ExercisePicker fills the whole tab */}
      <ExercisePicker
        onAdd={handleAdd}
        onClose={handleClose}
        isPro={isPro}
        addedExerciseIds={[]}
        standalone
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  toast: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.charcoal,
    borderRadius: 12,
