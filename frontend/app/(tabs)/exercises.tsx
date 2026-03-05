// app/(tabs)/exercises.tsx
// GainTrack — Exercise Library tab (wraps ExercisePicker in standalone browse mode)

import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { Exercise } from '../../src/types';
import { theme } from '../../src/constants/theme';
import { ExercisePicker } from '../../src/components/ExercisePicker';
import { usePro } from '../../src/hooks/usePro';

// In browse mode there is no active workout, so we show a small "added" toast
// and optionally push to /workout/new pre-populated (future enhancement).

export default function ExercisesScreen() {
  const router = useRouter();
  const [lastAdded, setLastAdded] = useState<Exercise | null>(null);

  const { isPro } = usePro();

  const handleAdd = async (exercise: Exercise, _superset?: boolean) => {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setLastAdded(exercise);
    // Dismiss the toast after 2 s
    setTimeout(() => setLastAdded(null), 2000);
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
      />

      {/* ── "Added" toast ─────────────────────────────────────────────── */}
      {lastAdded && (
        <View style={styles.toast} pointerEvents="none">
          <Ionicons name="checkmark-circle" size={18} color={theme.success} />
          <Text style={styles.toastText} numberOfLines={1}>
            {lastAdded.name} — start a workout to log sets
          </Text>
        </View>
      )}
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(76,175,80,0.3)',
  },
  toastText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: theme.textPrimary,
  },
});
