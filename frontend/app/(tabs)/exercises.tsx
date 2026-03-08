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
import { useWorkoutStore } from '../../src/store/workoutStore';
import { setPendingExercise } from '../../src/utils/exerciseMailbox';

// Exercise library tab — tapping + on an exercise either adds to an active workout
// or starts a brand-new Quick Workout.

export default function ExercisesScreen() {
  const router = useRouter();
  const { isPro } = usePro();
  const { currentWorkout, startWorkout, addExerciseToWorkout } = useWorkoutStore();

  const handleAdd = async (exercise: Exercise, _superset?: boolean) => {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    if (currentWorkout) {
      // Active workout in progress — pass exercise back via mailbox and return
      setPendingExercise(exercise);
      router.back();
      return;
    }

    // No active workout — start a new Quick Workout
    const workoutName = 'Quick Workout';
    startWorkout(workoutName);
    addExerciseToWorkout({
      exercise_id: exercise.exercise_id || exercise.id,
      exercise_name: exercise.name,
      exercise: exercise,
      sets: [],
      notes: undefined,
    });
    router.push({
      pathname: '/workout/active',
      params: { name: workoutName },
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
});
