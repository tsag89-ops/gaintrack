// app/(tabs)/exercises.tsx
// GainTrack — Exercise Library tab + start-workout entry point

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';

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
  const { currentWorkout, startWorkout, addExerciseToWorkout, addMultipleExercisesToWorkout, clearInProgress } = useWorkoutStore();

  // ── Template picker state ──────────────────────────────────────────────────
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);

  const handleOpenTemplates = async () => {
    const raw = await AsyncStorage.getItem('gaintrack_templates');
    setTemplates(raw ? JSON.parse(raw) : []);
    setShowTemplatePicker(true);
  };

  const applyTemplate = async (template: any) => {
    setShowTemplatePicker(false);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await clearInProgress();
    startWorkout(template.name);
    const exercises = (template.exercises ?? []).map((ex: any) => ({
      exercise_id: ex.exercise_id,
      exercise_name: ex.exercise_name,
      exercise: ex.exercise,
      sets: (ex.sets ?? []).map((s: any, idx: number) => ({
        ...s,
        set_id: `tmpl-${ex.exercise_id}-${Date.now()}-${idx}`,
        set_number: idx + 1,
        completed: false,
      })),
      notes: undefined,
    }));
    addMultipleExercisesToWorkout(exercises);
    router.push({
      pathname: '/workout/active',
      params: { name: template.name, templateId: template.id },
    });
  };

  // ── Exercise selection ─────────────────────────────────────────────────────
  const handleAdd = async (exercise: Exercise, _superset?: boolean) => {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    if (currentWorkout) {
      // Active workout in progress — pass exercise back via mailbox and return
      setPendingExercise(exercise);
      router.back();
      return;
    }

    // No active workout — start a new Quick Workout with this exercise
    const workoutName = 'Quick Workout';
    await clearInProgress();
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
    router.back();
  };

  return (
    <View style={styles.container}>
      <ExercisePicker
        onAdd={handleAdd}
        onClose={handleClose}
        isPro={isPro}
        addedExerciseIds={[]}
        standalone
        onTemplatePress={handleOpenTemplates}
      />

      {/* ── Template Picker Modal ──────────────────────────────────────── */}
      <Modal
        visible={showTemplatePicker}
        animationType="slide"
        transparent
        onRequestClose={() => setShowTemplatePicker(false)}
      >
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Templates</Text>
              <TouchableOpacity onPress={() => setShowTemplatePicker(false)}>
                <Ionicons name="close" size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>
            {templates.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="copy-outline" size={40} color={theme.charcoal} />
                <Text style={styles.emptyText}>No templates yet</Text>
                <Text style={styles.emptySubtext}>
                  Finish a workout and save it as a template to reuse it here.
                </Text>
              </View>
            ) : (
              <ScrollView contentContainerStyle={styles.templateList}>
                {templates.map((t) => (
                  <TouchableOpacity
                    key={t.id}
                    style={styles.templateCard}
                    onPress={() => applyTemplate(t)}
                    activeOpacity={0.8}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.templateName}>{t.name}</Text>
                      <Text style={styles.templateMeta}>
                        {(t.exercises ?? []).length} exercise{(t.exercises ?? []).length !== 1 ? 's' : ''}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  // Modal overlay
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: theme.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 32,
    maxHeight: '75%',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.charcoal,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.textPrimary,
  },
  templateList: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 10,
  },
  templateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.charcoal,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  templateName: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.textPrimary,
    marginBottom: 2,
  },
  templateMeta: {
    fontSize: 12,
    color: theme.textSecondary,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 32,
    gap: 10,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.textSecondary,
  },
  emptySubtext: {
    fontSize: 13,
    color: theme.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
});

