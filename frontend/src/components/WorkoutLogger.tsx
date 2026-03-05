// src/components/WorkoutLogger.tsx
// Hevy-style workout logging screen component
// Full copy-paste — no partial snippets

import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import {
  GestureHandlerRootView,
  Swipeable,
} from 'react-native-gesture-handler';
import { CountdownCircleTimer } from 'react-native-countdown-circle-timer';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '../config/firebase';
import { collection, doc, setDoc } from 'firebase/firestore';
import { colors, typography, spacing, radii, shadows } from '../constants/theme';
import { WorkoutExercise, WorkoutSet, Exercise } from '../types';

import { calc1RM } from '../utils/fitness';

// ─── Types ───────────────────────────────────────────────────────────────────

interface SetRow extends WorkoutSet {
  oneRM?: number;
}

interface ExerciseBlock {
  uid: string; // local unique id
  exercise: Exercise;
  sets: SetRow[];
  supersetGroup?: string; // [PRO] superset group label
  notes: string;
}

interface Props {
  workoutName?: string;
  userId?: string;
  isPro?: boolean; // [PRO] pass true to unlock supersets
  onFinish?: (workout: SavedWorkout) => void;
}

export interface SavedWorkout {
  workout_id: string;
  name: string;
  date: string;
  duration: number;
  exercises: ExerciseBlock[];
}

// ─── Constants ────────────────────────────────────────────────────────────────
const REST_DURATIONS = [30, 60, 90, 120, 180];
const WORKOUTS_KEY = '@gaintrack_workouts';

// ─── Sub-components ──────────────────────────────────────────────────────────

const RightDeleteAction = ({
  progress,
  dragX,
  onDelete,
}: {
  progress: any;
  dragX: any;
  onDelete: () => void;
}) => (
  <TouchableOpacity
    style={styles.deleteAction}
    onPress={() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      onDelete();
    }}
    activeOpacity={0.8}
  >
    <Text style={styles.deleteActionText}>Delete</Text>
  </TouchableOpacity>
);

// ─── Main Component ──────────────────────────────────────────────────────────

const WorkoutLogger: React.FC<Props> = ({
  workoutName = 'New Workout',
  userId,
  isPro = false,
  onFinish,
}) => {
  const [blocks, setBlocks] = useState<ExerciseBlock[]>([]);
  const [saving, setSaving] = useState(false);
  const [restActive, setRestActive] = useState(false);
  const [restDuration, setRestDuration] = useState(60);
  const [restKey, setRestKey] = useState(0); // reset timer
  const startTimeRef = useRef(Date.now());
  const swipeRefs = useRef<Record<string, Swipeable | null>>({});

  // ── Helpers ──────────────────────────────────────────────────────────────

  const makeSet = (setNumber: number): SetRow => ({
    set_id: `${Date.now()}_${Math.random()}`,
    set_number: setNumber,
    reps: 0,
    weight: 0,
    rpe: undefined,
    completed: false,
    is_warmup: false,
  });

  const addSet = useCallback((blockUid: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setBlocks((prev) =>
      prev.map((b) =>
        b.uid === blockUid
          ? { ...b, sets: [...b.sets, makeSet(b.sets.length + 1)] }
          : b,
      ),
    );
  }, []);

  const deleteSet = useCallback((blockUid: string, setId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setBlocks((prev) =>
      prev.map((b) =>
        b.uid === blockUid
          ? {
              ...b,
              sets: b.sets
                .filter((s) => s.set_id !== setId)
                .map((s, i) => ({ ...s, set_number: i + 1 })),
            }
          : b,
      ),
    );
  }, []);

  const updateSetField = useCallback(
    (
      blockUid: string,
      setId: string,
      field: 'reps' | 'weight' | 'rpe',
      raw: string,
    ) => {
      const val = parseFloat(raw) || 0;
      setBlocks((prev) =>
        prev.map((b) => {
          if (b.uid !== blockUid) return b;
          return {
            ...b,
            sets: b.sets.map((s) => {
              if (s.set_id !== setId) return s;
              const updated = { ...s, [field]: val };
              updated.oneRM = calc1RM(updated.weight, updated.reps);
              return updated;
            }),
          };
        }),
      );
    },
    [],
  );

  const toggleSetComplete = useCallback((blockUid: string, setId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setBlocks((prev) =>
      prev.map((b) => {
        if (b.uid !== blockUid) return b;
        return {
          ...b,
          sets: b.sets.map((s) =>
            s.set_id === setId ? { ...s, completed: !s.completed } : s,
          ),
        };
      }),
    );
    // Start rest timer on completion
    setRestKey((k) => k + 1);
    setRestActive(true);
  }, []);

  const updateNotes = useCallback((blockUid: string, text: string) => {
    setBlocks((prev) =>
      prev.map((b) => (b.uid === blockUid ? { ...b, notes: text } : b)),
    );
  }, []);

  const removeExercise = useCallback((blockUid: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setBlocks((prev) => prev.filter((b) => b.uid !== blockUid));
  }, []);

  // [PRO] Assign superset group
  const assignSuperset = useCallback(
    (blockUid: string, group: string) => {
      if (!isPro) {
        Alert.alert('Pro Feature', 'Upgrade to Pro to use supersets.');
        return;
      }
      setBlocks((prev) =>
        prev.map((b) =>
          b.uid === blockUid ? { ...b, supersetGroup: group } : b,
        ),
      );
    },
    [isPro],
  );

  // ── Save ─────────────────────────────────────────────────────────────────

  const finishWorkout = async () => {
    if (blocks.length === 0) {
      Alert.alert('No exercises', 'Add at least one exercise before finishing.');
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSaving(true);
    const workout: SavedWorkout = {
      workout_id: `wkt_${Date.now()}`,
      name: workoutName,
      date: new Date().toISOString(),
      duration: Math.round((Date.now() - startTimeRef.current) / 1000),
      exercises: blocks,
    };

    try {
      // AsyncStorage
      const raw = await AsyncStorage.getItem(WORKOUTS_KEY);
      const existing: SavedWorkout[] = raw ? JSON.parse(raw) : [];
      await AsyncStorage.setItem(
        WORKOUTS_KEY,
        JSON.stringify([workout, ...existing]),
      );

      // Firestore [PRO] sync when userId present
      if (userId && db) {
        await setDoc(
          doc(collection(db, 'Users', userId, 'workouts'), workout.workout_id),
          workout,
        );
      }

      onFinish?.(workout);
      Alert.alert('Workout saved!', `Duration: ${Math.round(workout.duration / 60)} min`);
    } catch (err) {
      console.error('[WorkoutLogger] save error:', err);
      Alert.alert('Save failed', 'Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  // ── Render helpers ───────────────────────────────────────────────────────

  const renderSetRow = (b: ExerciseBlock, s: SetRow) => {
    const swipeKey = `${b.uid}_${s.set_id}`;
    return (
      <Swipeable
        key={s.set_id}
        ref={(ref) => { swipeRefs.current[swipeKey] = ref; }}
        friction={2}
        rightThreshold={40}
        renderRightActions={(progress, dragX) => (
          <RightDeleteAction
            progress={progress}
            dragX={dragX}
            onDelete={() => deleteSet(b.uid, s.set_id)}
          />
        )}
      >
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => toggleSetComplete(b.uid, s.set_id)}
          style={[
            styles.setRow,
            s.completed && styles.setRowCompleted,
            s.is_warmup && styles.setRowWarmup,
          ]}
        >
          {/* Set number */}
          <View style={styles.setNumBadge}>
            <Text style={styles.setNumText}>
              {s.is_warmup ? 'W' : s.set_number}
            </Text>
          </View>

          {/* Weight input */}
          <View style={styles.setInputWrap}>
            <TextInput
              style={styles.setInput}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={colors.textDisabled}
              defaultValue={s.weight > 0 ? String(s.weight) : ''}
              onChangeText={(v) => updateSetField(b.uid, s.set_id, 'weight', v)}
            />
            <Text style={styles.setInputLabel}>kg</Text>
          </View>

          {/* Reps input */}
          <View style={styles.setInputWrap}>
            <TextInput
              style={styles.setInput}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor={colors.textDisabled}
              defaultValue={s.reps > 0 ? String(s.reps) : ''}
              onChangeText={(v) => updateSetField(b.uid, s.set_id, 'reps', v)}
            />
            <Text style={styles.setInputLabel}>reps</Text>
          </View>

          {/* RPE input */}
          <View style={styles.setInputWrap}>
            <TextInput
              style={[styles.setInput, styles.setInputRpe]}
              keyboardType="decimal-pad"
              placeholder="RPE"
              placeholderTextColor={colors.textDisabled}
              defaultValue={s.rpe !== undefined ? String(s.rpe) : ''}
              onChangeText={(v) => updateSetField(b.uid, s.set_id, 'rpe', v)}
            />
          </View>

          {/* 1RM badge */}
          {s.oneRM != null && s.oneRM > 0 && (
            <View style={styles.oneRMBadge}>
              <Text style={styles.oneRMText}>{s.oneRM}</Text>
              <Text style={styles.oneRMLabel}>1RM</Text>
            </View>
          )}

          {/* Checkmark */}
          <View style={[styles.checkCircle, s.completed && styles.checkCircleDone]}>
            <Text style={styles.checkIcon}>{s.completed ? '✓' : ''}</Text>
          </View>
        </TouchableOpacity>
      </Swipeable>
    );
  };

  const renderExerciseBlock = (b: ExerciseBlock) => (
    <View key={b.uid} style={styles.exerciseCard}>
      {/* [PRO] Superset group badge */}
      {isPro && b.supersetGroup && (
        <View style={styles.supersetBadge}>
          <Text style={styles.supersetText}>Superset {b.supersetGroup}</Text>
        </View>
      )}

      {/* Exercise header */}
      <View style={styles.exerciseHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.exerciseName}>{b.exercise.name}</Text>
          <Text style={styles.exerciseMuscle}>
            {b.exercise.muscleGroup || (b.exercise.muscle_groups ?? []).join(', ')}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => removeExercise(b.uid)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.removeBtn}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* Notes */}
      <TextInput
        style={styles.notesInput}
        placeholder="Add note…"
        placeholderTextColor={colors.textDisabled}
        value={b.notes}
        onChangeText={(t) => updateNotes(b.uid, t)}
      />

      {/* Column headers */}
      <View style={styles.setHeader}>
        <Text style={[styles.setHeaderText, { width: 32 }]}>SET</Text>
        <Text style={[styles.setHeaderText, { flex: 1 }]}>KG</Text>
        <Text style={[styles.setHeaderText, { flex: 1 }]}>REPS</Text>
        <Text style={[styles.setHeaderText, { width: 48 }]}>RPE</Text>
        <Text style={[styles.setHeaderText, { width: 52 }]}>1RM</Text>
        <View style={{ width: 28 }} />
      </View>

      {/* Set rows */}
      {b.sets.map((s) => renderSetRow(b, s))}

      {/* Add Set button */}
      <TouchableOpacity
        style={styles.addSetBtn}
        onPress={() => addSet(b.uid)}
        activeOpacity={0.8}
      >
        <Text style={styles.addSetBtnText}>+ Add Set</Text>
      </TouchableOpacity>

      {/* [PRO] Superset controls */}
      {isPro && (
        <View style={styles.supersetRow}>
          {['A', 'B', 'C'].map((g) => (
            <TouchableOpacity
              key={g}
              style={[
                styles.supersetGroupBtn,
                b.supersetGroup === g && styles.supersetGroupBtnActive,
              ]}
              onPress={() => assignSuperset(b.uid, g)}
            >
              <Text
                style={[
                  styles.supersetGroupText,
                  b.supersetGroup === g && styles.supersetGroupTextActive,
                ]}
              >
                Superset {g}
              </Text>
            </TouchableOpacity>
          ))}
          {b.supersetGroup && (
            <TouchableOpacity
              style={styles.supersetGroupBtn}
              onPress={() => assignSuperset(b.uid, '')}
            >
              <Text style={styles.supersetGroupText}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );

  // ── Main render ──────────────────────────────────────────────────────────
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={styles.root}>
        {/* Rest Timer */}
        {restActive && (
          <View style={styles.restTimerContainer}>
            <Text style={styles.restTimerLabel}>Rest</Text>
            <CountdownCircleTimer
              key={restKey}
              isPlaying
              duration={restDuration}
              colors={colors.primary as any}
              trailColor={colors.charcoal as any}
              size={90}
              strokeWidth={7}
              onComplete={() => {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                setRestActive(false);
                return { shouldRepeat: false };
              }}
            >
              {({ remainingTime }: { remainingTime: number }) => (
                <Text style={styles.restTimerCount}>{remainingTime}s</Text>
              )}
            </CountdownCircleTimer>
            <View style={styles.restDurationRow}>
              {REST_DURATIONS.map((d) => (
                <TouchableOpacity
                  key={d}
                  style={[
                    styles.restDurationBtn,
                    restDuration === d && styles.restDurationBtnActive,
                  ]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setRestDuration(d);
                    setRestKey((k) => k + 1);
                  }}
                >
                  <Text
                    style={[
                      styles.restDurationText,
                      restDuration === d && styles.restDurationTextActive,
                    ]}
                  >
                    {d}s
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={styles.restSkipBtn}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setRestActive(false);
              }}
            >
              <Text style={styles.restSkipText}>Skip</Text>
            </TouchableOpacity>
          </View>
        )}

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {blocks.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>🏋️</Text>
              <Text style={styles.emptyTitle}>No exercises yet</Text>
              <Text style={styles.emptySubtitle}>
                Tap "+ Add Exercise" below to get started
              </Text>
            </View>
          ) : (
            blocks.map(renderExerciseBlock)
          )}

          {/* Spacer for FAB */}
          <View style={{ height: 120 }} />
        </ScrollView>

        {/* Bottom actions */}
        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={styles.addExerciseBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              // Caller should mount ExercisePicker and pass selected exercise back
              // via the addExerciseBlock helper exposed below
              Alert.alert(
                'Add Exercise',
                'Integrate ExercisePicker and call addExerciseBlock(exercise)',
              );
            }}
            activeOpacity={0.85}
          >
            <Text style={styles.addExerciseBtnText}>+ Add Exercise</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.finishBtn, saving && styles.finishBtnDisabled]}
            onPress={finishWorkout}
            disabled={saving}
            activeOpacity={0.85}
          >
            <Text style={styles.finishBtnText}>
              {saving ? 'Saving…' : 'Finish Workout'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </GestureHandlerRootView>
  );
};

// ── Imperative API (attach via ref or call directly) ────────────────────────
export const addExerciseBlock = (
  exercise: Exercise,
  setBlocks: React.Dispatch<React.SetStateAction<ExerciseBlock[]>>,
) => {
  setBlocks((prev) => [
    ...prev,
    {
      uid: `${exercise.id}_${Date.now()}`,
      exercise,
      sets: [
        {
          set_id: `${Date.now()}_1`,
          set_number: 1,
          reps: 0,
          weight: 0,
          completed: false,
          is_warmup: false,
        },
      ],
      notes: '',
    },
  ]);
};

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing[4],
    gap: spacing[4],
  },

  // ── Empty state ────────────────────────────────────────────────────────
  emptyState: {
    alignItems: 'center',
    paddingTop: spacing[16],
    gap: spacing[2],
  },
  emptyIcon: {
    fontSize: 48,
  },
  emptyTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textPrimary,
  },
  emptySubtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
  },

  // ── Exercise card ──────────────────────────────────────────────────────
  exerciseCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing[4],
    ...shadows.sm,
  },
  exerciseHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing[2],
  },
  exerciseName: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
  },
  exerciseMuscle: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
    textTransform: 'capitalize',
  },
  removeBtn: {
    fontSize: 16,
    color: colors.textDisabled,
    paddingLeft: spacing[2],
  },
  notesInput: {
    backgroundColor: colors.charcoal,
    borderRadius: radii.sm,
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    marginBottom: spacing[3],
    borderWidth: 1,
    borderColor: colors.border,
  },

  // ── Set header ─────────────────────────────────────────────────────────
  setHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[1],
    marginBottom: spacing[1],
    gap: spacing[1],
  },
  setHeaderText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textDisabled,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },

  // ── Set row ────────────────────────────────────────────────────────────
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.charcoal,
    borderRadius: radii.md,
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[2],
    marginBottom: spacing[1],
    gap: spacing[1],
    borderWidth: 1,
    borderColor: colors.border,
  },
  setRowCompleted: {
    backgroundColor: colors.successMuted,
    borderColor: colors.success,
  },
  setRowWarmup: {
    borderColor: colors.warning,
  },
  setNumBadge: {
    width: 28,
    height: 28,
    borderRadius: radii.full,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  setNumText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    color: colors.primary,
  },
  setInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: radii.sm,
    paddingHorizontal: spacing[1],
    borderWidth: 1,
    borderColor: colors.border,
  },
  setInput: {
    flex: 1,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textPrimary,
    paddingVertical: Platform.OS === 'ios' ? spacing[2] : spacing[1],
    textAlign: 'center',
  },
  setInputRpe: {
    fontSize: typography.fontSize.sm,
  },
  setInputLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.textDisabled,
  },
  oneRMBadge: {
    width: 48,
    alignItems: 'center',
  },
  oneRMText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    color: colors.accent,
  },
  oneRMLabel: {
    fontSize: 9,
    color: colors.textDisabled,
    textTransform: 'uppercase',
  },
  checkCircle: {
    width: 26,
    height: 26,
    borderRadius: radii.full,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkCircleDone: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  checkIcon: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: typography.fontWeight.bold,
  },

  // ── Swipe delete ───────────────────────────────────────────────────────
  deleteAction: {
    backgroundColor: colors.error,
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    borderRadius: radii.md,
    marginBottom: spacing[1],
  },
  deleteActionText: {
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.bold,
    fontSize: typography.fontSize.sm,
  },

  // ── Add Set button ─────────────────────────────────────────────────────
  addSetBtn: {
    marginTop: spacing[2],
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: spacing[2],
    alignItems: 'center',
  },
  addSetBtnText: {
    color: colors.primary,
    fontWeight: typography.fontWeight.semibold,
    fontSize: typography.fontSize.sm,
  },

  // ── Superset [PRO] ─────────────────────────────────────────────────────
  supersetBadge: {
    backgroundColor: colors.primaryMuted,
    borderRadius: radii.sm,
    paddingHorizontal: spacing[2],
    paddingVertical: 3,
    alignSelf: 'flex-start',
    marginBottom: spacing[2],
  },
  supersetText: {
    fontSize: typography.fontSize.xs,
    color: colors.primary,
    fontWeight: typography.fontWeight.semibold,
  },
  supersetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[1],
    marginTop: spacing[2],
  },
  supersetGroupBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
  },
  supersetGroupBtnActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryMuted,
  },
  supersetGroupText: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
  },
  supersetGroupTextActive: {
    color: colors.primary,
    fontWeight: typography.fontWeight.semibold,
  },

  // ── Rest timer ─────────────────────────────────────────────────────────
  restTimerContainer: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: spacing[3],
    alignItems: 'center',
    gap: spacing[2],
  },
  restTimerLabel: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    fontWeight: typography.fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  restTimerCount: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.primary,
  },
  restDurationRow: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  restDurationBtn: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  restDurationBtnActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryMuted,
  },
  restDurationText: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
  },
  restDurationTextActive: {
    color: colors.primary,
    fontWeight: typography.fontWeight.semibold,
  },
  restSkipBtn: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[1],
  },
  restSkipText: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
  },

  // ── Bottom bar ─────────────────────────────────────────────────────────
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    paddingBottom: spacing[6],
    flexDirection: 'row',
    gap: spacing[3],
  },
  addExerciseBtn: {
    flex: 1,
    backgroundColor: colors.charcoal,
    borderRadius: radii.lg,
    paddingVertical: spacing[3],
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  addExerciseBtnText: {
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.semibold,
    fontSize: typography.fontSize.base,
  },
  finishBtn: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: radii.lg,
    paddingVertical: spacing[3],
    alignItems: 'center',
    ...shadows.md,
  },
  finishBtnDisabled: {
    opacity: 0.5,
  },
  finishBtnText: {
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.bold,
    fontSize: typography.fontSize.base,
  },
});

export default WorkoutLogger;
