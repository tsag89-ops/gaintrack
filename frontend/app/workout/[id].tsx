import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ScrollView,
  ActivityIndicator,
  Modal,
  Clipboard,
  Share,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useWorkoutStore } from '../../src/store/workoutStore';
import { useNativeAuthState } from '../../src/hooks/useAuth';
import { useWeightUnit } from '../../src/hooks/useWeightUnit';
import { Workout, WorkoutSet } from '../../src/types';
import {
  calculateTotalSets,
  calculateWorkoutVolume,
  formatDate,
  formatVolume,
} from '../../src/utils/helpers';
import { useLanguage } from '../../src/context/LanguageContext';

const NOTES_PREFIX = 'workout_notes_';
const ACTIVE_WORKOUT_KEY = 'gaintrack_active_workout';

type InProgressDecision = 'replace' | 'resume' | 'cancel';

type SetIssue = {
  key: string;
  message: string;
  level: 'invalid' | 'suspicious';
};

export default function WorkoutDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const router = useRouter();
  const { workouts, setWorkouts, setCurrentWorkout, persistInProgress, clearInProgress, updateWorkout } = useWorkoutStore();
  const { uid } = useNativeAuthState();
  const { t } = useLanguage();
  const weightUnit = useWeightUnit();
  const workoutId = Array.isArray(id) ? id[0] : id;

  const [localWorkout, setLocalWorkout] = useState<Workout | null>(null);
  const [notes, setNotes] = useState('');
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [hasAutoPromptedNotes, setHasAutoPromptedNotes] = useState(false);
  const [loading, setLoading] = useState(false);
  const [collapsedExerciseKeys, setCollapsedExerciseKeys] = useState<Set<string>>(new Set());
  const [showExerciseEditorModal, setShowExerciseEditorModal] = useState(false);
  const [editingExerciseIndex, setEditingExerciseIndex] = useState<number | null>(null);
  const [editingExerciseNotes, setEditingExerciseNotes] = useState('');
  const [savingExerciseEdit, setSavingExerciseEdit] = useState(false);
  const [editingSets, setEditingSets] = useState<
    Array<{
      set_id: string;
      set_number: number;
      reps: string;
      weight: string;
      rpe: string;
      is_warmup: boolean;
    }>
  >([]);

  const workout = useMemo(() => {
    if (!workoutId) return null;
    return workouts.find((w) => w.workout_id === workoutId) ?? localWorkout;
  }, [workoutId, workouts, localWorkout]);

  const exercises = workout?.exercises ?? [];
  const totalSets = calculateTotalSets(exercises);
  const totalVolume = calculateWorkoutVolume(exercises);

  const summaryText = useMemo(() => {
    if (!workout) return '';
    const lines: string[] = [];
    lines.push(`${workout.name || t('workoutDetail.defaultWorkoutName')} - ${formatDate(workout.date)}`);
    lines.push(
      t('workoutDetail.summaryStats', {
        exercises: exercises.length,
        sets: totalSets,
        volume: formatVolume(totalVolume),
        unit: weightUnit,
      }),
    );
    lines.push('');

    exercises.forEach((exercise, exerciseIndex) => {
      lines.push(`${exerciseIndex + 1}. ${exercise.exercise_name}`);
      (exercise.sets ?? []).filter(s => s.completed).forEach((set, setIndex) => {
        const rpePart = typeof set.rpe === 'number' ? `, RPE ${set.rpe}` : '';
        const warmupPart = set.is_warmup ? ` ${t('workoutDetail.warmupInline')}` : '';
        lines.push(
          t('workoutDetail.setSummaryLine', {
            setNumber: set.set_number || setIndex + 1,
            reps: set.reps,
            weight: set.weight,
            unit: weightUnit,
            rpePart,
            warmupPart,
          }),
        );
      });
      if (exercise.notes?.trim()) lines.push(`${t('workoutDetail.notesPrefix')} ${exercise.notes.trim()}`);
      lines.push('');
    });

    if (notes.trim()) {
      lines.push(t('workoutDetail.workoutNotes'));
      lines.push(notes.trim());
      lines.push('');
    }

    return lines.join('\n');
  }, [workout, exercises, totalSets, totalVolume, weightUnit, notes, t]);

  const setIssues = useMemo(() => {
    const issues: SetIssue[] = [];
    const suspiciousWeightLimit = weightUnit === 'kg' ? 400 : 900;

    exercises.forEach((exercise, exerciseIndex) => {
      (exercise.sets ?? []).forEach((set, setIndex) => {
        const key = `${exercise.exercise_id}_${exerciseIndex}_${set.set_id || setIndex}`;
        const reps = Number(set.reps);
        const weight = Number(set.weight);
        const rpe = set.rpe === undefined || set.rpe === null ? null : Number(set.rpe);

        if (!Number.isFinite(reps) || !Number.isFinite(weight) || reps < 0 || weight < 0) {
          issues.push({
            key,
            message: t('workoutDetail.invalidValuesMessage'),
            level: 'invalid',
          });
          return;
        }

        if (rpe !== null && (!Number.isFinite(rpe) || rpe < 0 || rpe > 10)) {
          issues.push({
            key,
            message: t('workoutDetail.invalidRpeMessage'),
            level: 'invalid',
          });
          return;
        }

        if (reps > 50 || weight > suspiciousWeightLimit) {
          issues.push({
            key,
            message: t('workoutDetail.suspiciousEntryMessage'),
            level: 'suspicious',
          });
        }
      });
    });

    return issues;
  }, [exercises, weightUnit, t]);

  const invalidCount = setIssues.filter((issue) => issue.level === 'invalid').length;
  const suspiciousCount = setIssues.filter((issue) => issue.level === 'suspicious').length;

  const setIssueMap = useMemo(() => {
    const map = new Map<string, SetIssue>();
    setIssues.forEach((issue) => map.set(issue.key, issue));
    return map;
  }, [setIssues]);

  React.useEffect(() => {
    if (!workoutId) return;

    const bootstrap = async () => {
      try {
        const saved = await AsyncStorage.getItem(NOTES_PREFIX + workoutId);
        if (saved) setNotes(saved);

        if (!workouts.some((w) => w.workout_id === workoutId)) {
          const rawWorkouts = await AsyncStorage.getItem('gaintrack_workouts');
          if (rawWorkouts) {
            const parsed = JSON.parse(rawWorkouts);
            if (Array.isArray(parsed)) {
              const found = parsed.find((w: Workout) => w.workout_id === workoutId);
              if (found) setLocalWorkout(found);
            }
          }
        }
      } catch {
        // ignore bootstrap errors
      } finally {
        setIsBootstrapping(false);
      }
    };

    bootstrap();
  }, [workoutId, workouts]);

  const saveNotes = async () => {
    if (!workoutId) return;
    setLoading(true);
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await AsyncStorage.setItem(NOTES_PREFIX + workoutId, notes);
      Alert.alert(t('workoutDetail.savedTitle'), t('workoutDetail.notesUpdatedMessage'));
      setShowNotesModal(false);
    } catch {
      Alert.alert(t('workoutDetail.errorSavingNotesTitle'));
    } finally {
      setLoading(false);
    }
  };

  const handleOpenNotes = async () => {
    await Haptics.selectionAsync();
    setShowNotesModal(true);
  };

  const handleCloseNotes = async () => {
    await Haptics.selectionAsync();
    setShowNotesModal(false);
  };

  const askInProgressDecision = async (): Promise<InProgressDecision> => {
    try {
      const raw = await AsyncStorage.getItem(ACTIVE_WORKOUT_KEY);
      if (!raw) return 'replace';

      const parsed = JSON.parse(raw) as { workout?: { name?: string } };
      const draftName = parsed?.workout?.name?.trim() || t('workoutDetail.currentDraftFallback');

      return await new Promise<InProgressDecision>((resolve) => {
        Alert.alert(
          t('workoutDetail.replaceInProgressTitle'),
          t('workoutDetail.replaceInProgressMessage', { draftName }),
          [
            { text: t('common.cancel'), style: 'cancel', onPress: () => resolve('cancel') },
            {
              text: t('workoutDetail.resumeCurrent'),
              onPress: () => {
                router.push({ pathname: '/workout/active', params: { name: draftName } });
                resolve('resume');
              },
            },
            { text: t('workoutDetail.replaceAction'), style: 'destructive', onPress: () => resolve('replace') },
          ],
        );
      });
    } catch {
      return 'replace';
    }
  };

  const buildDraftWorkout = (source: Workout, nameOverride?: string): Workout => {
    const ts = Date.now();
    return {
      workout_id: `draft_${source.workout_id}_${ts}`,
      name: nameOverride || source.name || t('workoutDetail.defaultWorkoutName'),
      date: new Date().toISOString(),
      created_at: new Date().toISOString(),
      exercises: source.exercises.map((exercise, exerciseIndex) => ({
        ...exercise,
        sets: (exercise.sets ?? []).map((set, setIndex) => ({
          ...set,
          set_id: `draft_set_${exerciseIndex}_${setIndex}_${ts}`,
          set_number: set.set_number || setIndex + 1,
          completed: false,
        })),
      })),
    };
  };

  const startDraftWorkout = async (source: Workout, nameOverride?: string) => {
    const decision = await askInProgressDecision();
    if (decision !== 'replace') return;

    const draft = buildDraftWorkout(source, nameOverride);
    await clearInProgress();
    setCurrentWorkout(draft);
    await persistInProgress(draft, draft.exercises, Date.now());
    router.push({ pathname: '/workout/active', params: { name: draft.name } });
  };

  const handleEditWorkout = async () => {
    if (!workout) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await startDraftWorkout(workout);
  };

  const openExerciseEditor = async (exerciseIndex: number) => {
    const exercise = exercises[exerciseIndex];
    if (!exercise) return;
    await Haptics.selectionAsync();
    setEditingExerciseIndex(exerciseIndex);
    setEditingExerciseNotes(exercise.notes ?? '');
    setEditingSets(
      (exercise.sets ?? []).map((set, idx) => ({
        set_id: set.set_id || `set_${exerciseIndex}_${idx}_${Date.now()}`,
        set_number: set.set_number || idx + 1,
        reps: String(set.reps ?? 0),
        weight: String(set.weight ?? 0),
        rpe: set.rpe === undefined || set.rpe === null ? '' : String(set.rpe),
        is_warmup: Boolean(set.is_warmup),
      })),
    );
    setShowExerciseEditorModal(true);
  };

  const closeExerciseEditor = async () => {
    await Haptics.selectionAsync();
    setShowExerciseEditorModal(false);
    setEditingExerciseIndex(null);
    setEditingExerciseNotes('');
    setEditingSets([]);
  };

  const updateEditingSetField = (
    setIndex: number,
    field: 'reps' | 'weight' | 'rpe' | 'is_warmup',
    value: string | boolean,
  ) => {
    setEditingSets((prev) =>
      prev.map((set, idx) =>
        idx === setIndex
          ? {
              ...set,
              [field]: value,
            }
          : set,
      ),
    );
  };

  const addEditingSet = async () => {
    await Haptics.selectionAsync();
    setEditingSets((prev) => [
      ...prev,
      {
        set_id: `set_new_${Date.now()}_${prev.length}`,
        set_number: prev.length + 1,
        reps: '0',
        weight: '0',
        rpe: '',
        is_warmup: false,
      },
    ]);
  };

  const removeEditingSet = async (setIndex: number) => {
    await Haptics.selectionAsync();
    setEditingSets((prev) =>
      prev
        .filter((_, idx) => idx !== setIndex)
        .map((set, idx) => ({ ...set, set_number: idx + 1 })),
    );
  };

  const saveExerciseEdits = async () => {
    if (!workout || editingExerciseIndex === null) return;

    const parsedSets: WorkoutSet[] = [];
    for (let i = 0; i < editingSets.length; i++) {
      const row = editingSets[i];
      const reps = Number(row.reps);
      const weight = Number(row.weight);
      const rpe = row.rpe.trim() === '' ? undefined : Number(row.rpe);

      if (!Number.isFinite(reps) || reps < 0 || !Number.isFinite(weight) || weight < 0) {
        Alert.alert(
          t('workoutDetail.invalidSetValuesTitle'),
          t('workoutDetail.invalidSetValuesMessage', { setNumber: i + 1 }),
        );
        return;
      }
      if (rpe !== undefined && (!Number.isFinite(rpe) || rpe < 0 || rpe > 10)) {
        Alert.alert(
          t('workoutDetail.invalidRpeTitle'),
          t('workoutDetail.invalidRpeSetMessage', { setNumber: i + 1 }),
        );
        return;
      }

      parsedSets.push({
        set_id: row.set_id,
        set_number: i + 1,
        reps,
        weight,
        rpe,
        completed: reps > 0 || weight > 0,
        is_warmup: row.is_warmup,
      });
    }

    const updatedExercises = exercises.map((exercise, idx) =>
      idx === editingExerciseIndex
        ? {
            ...exercise,
            notes: editingExerciseNotes.trim() || undefined,
            sets: parsedSets,
          }
        : exercise,
    );

    setSavingExerciseEdit(true);
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      const updatedWorkout = { ...workout, exercises: updatedExercises };
      const updatedStoreWorkouts = workouts.map((w) =>
        w.workout_id === workout.workout_id ? updatedWorkout : w,
      );
      setWorkouts(updatedStoreWorkouts);
      setLocalWorkout((prev) =>
        prev && prev.workout_id === workout.workout_id
          ? { ...prev, exercises: updatedExercises }
          : prev,
      );

      const rawWorkouts = await AsyncStorage.getItem('gaintrack_workouts');
      if (rawWorkouts) {
        const parsed = JSON.parse(rawWorkouts);
        if (Array.isArray(parsed)) {
          const merged = parsed.map((w: Workout) =>
            w.workout_id === workout.workout_id ? { ...w, exercises: updatedExercises } : w,
          );
          await AsyncStorage.setItem('gaintrack_workouts', JSON.stringify(merged));
        }
      }

      if (uid && !workout.workout_id.startsWith('offline_')) {
        await updateWorkout(uid, workout.workout_id, { exercises: updatedExercises });
      }

      Alert.alert(t('workoutDetail.savedTitle'), t('workoutDetail.exerciseUpdatedMessage'));
      setShowExerciseEditorModal(false);
      setEditingExerciseIndex(null);
      setEditingExerciseNotes('');
      setEditingSets([]);
    } catch (error) {
      console.warn('[workout detail] saveExerciseEdits failed:', error);
      Alert.alert(t('workoutDetail.savedLocallyTitle'), t('workoutDetail.savedLocallyMessage'));
      setShowExerciseEditorModal(false);
      setEditingExerciseIndex(null);
      setEditingExerciseNotes('');
      setEditingSets([]);
    } finally {
      setSavingExerciseEdit(false);
    }
  };

  const handleDuplicateWorkout = async () => {
    if (!workout) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await startDraftWorkout(workout, `${workout.name || t('workoutDetail.defaultWorkoutName')} ${t('workoutDetail.copySuffix')}`);
  };

  const handleShareSummary = async () => {
    if (!summaryText) return;
    await Haptics.selectionAsync();
    try {
      await Share.share({ message: summaryText, title: `${workout?.name || t('workoutDetail.defaultWorkoutName')} ${t('workoutDetail.summaryTitle')}` });
    } catch {
      Alert.alert(t('workoutDetail.shareFailedTitle'), t('workoutDetail.shareFailedMessage'));
    }
  };

  const handleCopySummary = async () => {
    if (!summaryText) return;
    await Haptics.selectionAsync();
    Clipboard.setString(summaryText);
    Alert.alert(t('workoutDetail.copiedTitle'), t('workoutDetail.copiedMessage'));
  };

  const toggleExerciseCollapsed = async (exerciseKey: string) => {
    await Haptics.selectionAsync();
    setCollapsedExerciseKeys((prev) => {
      const next = new Set(prev);
      if (next.has(exerciseKey)) next.delete(exerciseKey);
      else next.add(exerciseKey);
      return next;
    });
  };

  React.useEffect(() => {
    if (!workout || isBootstrapping || hasAutoPromptedNotes) return;
    if (!notes.trim()) {
      setShowNotesModal(true);
      setHasAutoPromptedNotes(true);
    }
  }, [workout, notes, isBootstrapping, hasAutoPromptedNotes]);

  if (isBootstrapping) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF6200" />
        </View>
      </SafeAreaView>
    );
  }

  if (!workout) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={26} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('workoutDetail.summaryTitle')}</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.emptyContainer}>
          <Ionicons name="barbell-outline" size={52} color="#2D2D2D" />
          <Text style={styles.emptyTitle}>{t('workoutDetail.notFoundTitle')}</Text>
          <Text style={styles.emptySubtitle}>{t('workoutDetail.notFoundSubtitle')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={26} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('workoutDetail.summaryTitle')}</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          stickyHeaderIndices={[0]}
        >
          <View style={styles.stickyContainer}>
            <View style={styles.metaCard}>
              <Text style={styles.workoutDate}>{formatDate(workout.date)}</Text>
              <Text style={styles.workoutName}>{workout.name || t('workoutDetail.untitledWorkout')}</Text>

              <View style={styles.statsRow}>
                <View style={styles.statChip}>
                  <Ionicons name="barbell-outline" size={15} color="#4CAF50" />
                  <Text style={styles.statText}>{t('workoutDetail.exerciseCount', { count: exercises.length })}</Text>
                </View>
                <View style={styles.statChip}>
                  <Ionicons name="layers-outline" size={15} color="#2196F3" />
                  <Text style={styles.statText}>{t('workoutDetail.setCount', { count: totalSets })}</Text>
                </View>
                <View style={styles.statChip}>
                  <Ionicons name="trending-up-outline" size={15} color="#FFC107" />
                  <Text style={styles.statText}>{formatVolume(totalVolume)} {weightUnit}</Text>
                </View>
              </View>

              <View style={styles.actionRow}>
                <TouchableOpacity style={styles.primaryActionButton} onPress={handleEditWorkout} activeOpacity={0.82}>
                  <Ionicons name="refresh-outline" size={16} color="#FFFFFF" />
                  <Text style={styles.actionButtonText}>{t('workoutDetail.redoWorkout')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.secondaryActionButton} onPress={handleDuplicateWorkout} activeOpacity={0.82}>
                  <Ionicons name="copy-outline" size={16} color="#FFFFFF" />
                  <Text style={styles.actionButtonText}>{t('workoutDetail.duplicate')}</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.actionRow}>
                <TouchableOpacity style={styles.secondaryActionButton} onPress={handleShareSummary} activeOpacity={0.82}>
                  <Ionicons name="share-social-outline" size={16} color="#FFFFFF" />
                  <Text style={styles.actionButtonText}>{t('workoutDetail.share')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.secondaryActionButton} onPress={handleCopySummary} activeOpacity={0.82}>
                  <Ionicons name="clipboard-outline" size={16} color="#FFFFFF" />
                  <Text style={styles.actionButtonText}>{t('workoutDetail.copyText')}</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={styles.notesToggleButton} onPress={handleOpenNotes} activeOpacity={0.82}>
                <View style={styles.notesToggleLeft}>
                  <Ionicons name="document-text-outline" size={18} color="#FF6200" />
                  <Text style={styles.notesToggleText}>{t('workoutDetail.workoutNotes')}</Text>
                </View>
                <Text style={styles.notesButtonLabel}>{notes.trim() ? t('workoutDetail.editLabel') : t('workoutDetail.addLabel')}</Text>
              </TouchableOpacity>
              <Text style={styles.notesPreview}>
                {notes.trim() || t('workoutDetail.noNotesYet')}
              </Text>
            </View>
          </View>

          {(invalidCount > 0 || suspiciousCount > 0) && (
            <View style={styles.guardrailsCard}>
              <Text style={styles.guardrailsTitle}>{t('workoutDetail.validationChecks')}</Text>
              {invalidCount > 0 && (
                <Text style={styles.guardrailsErrorText}>
                  {t('workoutDetail.invalidSetCount', { count: invalidCount })}
                </Text>
              )}
              {suspiciousCount > 0 && (
                <Text style={styles.guardrailsWarningText}>
                  {t('workoutDetail.suspiciousSetCount', { count: suspiciousCount })}
                </Text>
              )}
            </View>
          )}

          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>{t('workoutDetail.exercisesTitle')}</Text>
          </View>

          {exercises.map((exercise, exerciseIndex) => {
            const sets = (exercise.sets ?? []).filter(s => s.completed);
            const exerciseKey = `${exercise.exercise_id}_${exerciseIndex}`;
            const isCollapsed = collapsedExerciseKeys.has(exerciseKey);

            return (
              <View key={exerciseKey} style={styles.exerciseCard}>
                <View style={styles.exerciseHeaderRow}>
                  <TouchableOpacity
                    style={styles.exerciseHeaderButton}
                    onPress={() => toggleExerciseCollapsed(exerciseKey)}
                    activeOpacity={0.82}
                  >
                    <Text style={styles.exerciseName}>{exercise.exercise_name}</Text>
                    <Ionicons name={isCollapsed ? 'chevron-down' : 'chevron-up'} size={18} color="#B0B0B0" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.exerciseEditButton}
                    onPress={() => openExerciseEditor(exerciseIndex)}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="create-outline" size={14} color="#FFFFFF" />
                    <Text style={styles.exerciseEditButtonText}>{t('workoutDetail.editLabel')}</Text>
                  </TouchableOpacity>
                </View>

                {exercise.notes ? <Text style={styles.exerciseNotes}>{exercise.notes}</Text> : null}

                {isCollapsed ? (
                  <Text style={styles.collapsedMeta}>{t('workoutDetail.hiddenSetsCount', { count: sets.length })}</Text>
                ) : (
                  <>
                    <View style={styles.tableHeader}>
                      <Text style={[styles.tableHeaderText, styles.colSet]}>{t('workoutDetail.setLabel')}</Text>
                      <Text style={[styles.tableHeaderText, styles.colReps]}>{t('workoutDetail.repsLabel')}</Text>
                      <Text style={[styles.tableHeaderText, styles.colWeight]}>{t('workoutDetail.weightLabel', { unit: weightUnit })}</Text>
                      <Text style={[styles.tableHeaderText, styles.colRpe]}>{t('workoutDetail.rpeLabel')}</Text>
                    </View>

                    {sets.map((set: WorkoutSet, setIndex: number) => {
                      const issueKey = `${exercise.exercise_id}_${exerciseIndex}_${set.set_id || setIndex}`;
                      const issue = setIssueMap.get(issueKey);

                      return (
                        <View key={`${set.set_id || setIndex}_row`}>
                          <View style={[styles.setRow, issue?.level === 'invalid' && styles.setRowInvalid, issue?.level === 'suspicious' && styles.setRowSuspicious]}>
                            <Text style={[styles.cellText, styles.colSet]}>
                              {set.set_number || setIndex + 1}
                              {set.is_warmup ? ' W' : ''}
                            </Text>
                            <Text style={[styles.cellText, styles.colReps]}>{set.reps}</Text>
                            <Text style={[styles.cellText, styles.colWeight]}>{set.weight}</Text>
                            <Text style={[styles.cellText, styles.colRpe]}>{typeof set.rpe === 'number' ? set.rpe : '-'}</Text>
                          </View>
                          {issue ? (
                            <Text style={[styles.issueText, issue.level === 'invalid' ? styles.issueTextInvalid : styles.issueTextSuspicious]}>
                              {issue.message}
                            </Text>
                          ) : null}
                        </View>
                      );
                    })}
                  </>
                )}
              </View>
            );
          })}

          {exercises.length === 0 && (
            <View style={styles.emptyExercisesCard}>
              <Text style={styles.emptyExercisesText}>{t('workoutDetail.noExercisesTitle')}</Text>
              <Text style={styles.emptyExercisesHint}>{t('workoutDetail.noExercisesHint')}</Text>
            </View>
          )}
        </ScrollView>

        <Modal visible={showNotesModal} animationType="slide" transparent onRequestClose={handleCloseNotes}>
          <View style={styles.modalBackdrop}>
            <KeyboardAvoidingView
              style={styles.modalKeyboardWrap}
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
              <View style={styles.modalCard}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>{t('workoutDetail.workoutNotes')}</Text>
                  <TouchableOpacity onPress={handleCloseNotes} style={styles.modalCloseButton}>
                    <Ionicons name="close" size={20} color="#B0B0B0" />
                  </TouchableOpacity>
                </View>

                <TextInput
                  style={styles.notesInput}
                  placeholder={t('workoutDetail.notesPlaceholder')}
                  placeholderTextColor="#B0B0B0"
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                />

                <View style={styles.modalActions}>
                  <TouchableOpacity style={styles.cancelButton} onPress={handleCloseNotes} disabled={loading}>
                    <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.saveButton} onPress={saveNotes} disabled={loading}>
                    <Text style={styles.saveButtonText}>{loading ? t('common.saving') : t('workoutDetail.saveNotes')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </KeyboardAvoidingView>
          </View>
        </Modal>

        <Modal
          visible={showExerciseEditorModal}
          animationType="slide"
          transparent
          onRequestClose={closeExerciseEditor}
        >
          <View style={styles.modalBackdrop}>
            <KeyboardAvoidingView
              style={styles.modalKeyboardWrap}
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
              <View style={styles.modalCardTall}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>
                    {t('workoutDetail.editExerciseTitle', {
                      name: editingExerciseIndex !== null
                        ? exercises[editingExerciseIndex]?.exercise_name || t('workoutDetail.exerciseFallbackName')
                        : t('workoutDetail.exerciseFallbackName'),
                    })}
                  </Text>
                  <TouchableOpacity onPress={closeExerciseEditor} style={styles.modalCloseButton}>
                    <Ionicons name="close" size={20} color="#B0B0B0" />
                  </TouchableOpacity>
                </View>

                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.exerciseEditContent}>
                  {editingSets.map((set, setIndex) => (
                    <View key={`${set.set_id}_${setIndex}`} style={styles.editSetCard}>
                      <View style={styles.editSetHeader}>
                        <Text style={styles.editSetTitle}>{t('workoutDetail.setTitle', { setNumber: setIndex + 1 })}</Text>
                        <TouchableOpacity
                          onPress={() => removeEditingSet(setIndex)}
                          style={styles.removeSetButton}
                          disabled={editingSets.length <= 1}
                        >
                          <Ionicons
                            name="trash-outline"
                            size={16}
                            color={editingSets.length <= 1 ? '#666' : '#F44336'}
                          />
                        </TouchableOpacity>
                      </View>

                      <View style={styles.editInputRow}>
                        <View style={styles.editInputGroup}>
                          <Text style={styles.editInputLabel}>{t('workoutDetail.repsLabel')}</Text>
                          <TextInput
                            style={styles.editInput}
                            value={set.reps}
                            onChangeText={(value) => updateEditingSetField(setIndex, 'reps', value)}
                            keyboardType="numeric"
                          />
                        </View>
                        <View style={styles.editInputGroup}>
                          <Text style={styles.editInputLabel}>{t('workoutDetail.weightLabel', { unit: weightUnit })}</Text>
                          <TextInput
                            style={styles.editInput}
                            value={set.weight}
                            onChangeText={(value) => updateEditingSetField(setIndex, 'weight', value)}
                            keyboardType="numeric"
                          />
                        </View>
                        <View style={styles.editInputGroup}>
                          <Text style={styles.editInputLabel}>{t('workoutDetail.rpeLabel')}</Text>
                          <TextInput
                            style={styles.editInput}
                            value={set.rpe}
                            onChangeText={(value) => updateEditingSetField(setIndex, 'rpe', value)}
                            keyboardType="numeric"
                          />
                        </View>
                      </View>

                      <TouchableOpacity
                        style={styles.warmupToggleButton}
                        onPress={() => updateEditingSetField(setIndex, 'is_warmup', !set.is_warmup)}
                      >
                        <Ionicons
                          name={set.is_warmup ? 'checkbox' : 'square-outline'}
                          size={18}
                          color={set.is_warmup ? '#FF6200' : '#B0B0B0'}
                        />
                        <Text style={styles.warmupToggleText}>{t('workoutDetail.warmupSet')}</Text>
                      </TouchableOpacity>
                    </View>
                  ))}

                  <TouchableOpacity style={styles.addSetButton} onPress={addEditingSet} activeOpacity={0.85}>
                    <Ionicons name="add" size={18} color="#FFFFFF" />
                    <Text style={styles.addSetButtonText}>{t('workoutDetail.addSet')}</Text>
                  </TouchableOpacity>

                  <Text style={styles.editInputLabel}>{t('workoutDetail.exerciseNotes')}</Text>
                  <TextInput
                    style={styles.notesInput}
                    placeholder={t('workoutDetail.exerciseNotesPlaceholder')}
                    placeholderTextColor="#B0B0B0"
                    value={editingExerciseNotes}
                    onChangeText={setEditingExerciseNotes}
                    multiline
                  />
                </ScrollView>

                <View style={styles.modalActions}>
                  <TouchableOpacity style={styles.cancelButton} onPress={closeExerciseEditor} disabled={savingExerciseEdit}>
                    <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.saveButton} onPress={saveExerciseEdits} disabled={savingExerciseEdit}>
                    <Text style={styles.saveButtonText}>{savingExerciseEdit ? t('common.saving') : t('workoutDetail.saveExercise')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </KeyboardAvoidingView>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1A1A1A',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#2D2D2D',
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  headerSpacer: {
    width: 36,
    height: 36,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 28,
    gap: 12,
  },
  stickyContainer: {
    backgroundColor: '#1A1A1A',
    paddingBottom: 8,
  },
  metaCard: {
    backgroundColor: '#252525',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#303030',
    padding: 14,
    gap: 10,
  },
  workoutDate: {
    color: '#FF6200',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  workoutName: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    marginTop: -4,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1A1A1A',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#303030',
  },
  statText: {
    color: '#B0B0B0',
    fontSize: 12,
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  primaryActionButton: {
    flex: 1,
    backgroundColor: '#FF6200',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  secondaryActionButton: {
    flex: 1,
    backgroundColor: '#2D2D2D',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#3A3A3A',
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    flexShrink: 1,
    textAlign: 'center',
  },
  notesToggleButton: {
    backgroundColor: '#1A1A1A',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#303030',
    paddingHorizontal: 12,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  notesToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  notesToggleText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  notesButtonLabel: {
    color: '#FF6200',
    fontSize: 13,
    fontWeight: '700',
  },
  notesPreview: {
    color: '#B0B0B0',
    fontSize: 13,
    marginTop: -4,
    flexShrink: 1,
  },
  guardrailsCard: {
    backgroundColor: '#252525',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#303030',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  guardrailsTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  guardrailsErrorText: {
    color: '#F44336',
    fontSize: 12,
    fontWeight: '600',
  },
  guardrailsWarningText: {
    color: '#FFB37A',
    fontSize: 12,
    fontWeight: '600',
  },
  sectionHeaderRow: {
    marginTop: 2,
    marginBottom: -2,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
  },
  exerciseCard: {
    backgroundColor: '#252525',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#303030',
    padding: 12,
    gap: 8,
  },
  exerciseHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  exerciseHeaderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    flex: 1,
  },
  exerciseEditButton: {
    backgroundColor: '#2D2D2D',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3A3A3A',
    paddingHorizontal: 8,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  exerciseEditButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  exerciseName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
  },
  exerciseNotes: {
    color: '#B0B0B0',
    fontSize: 13,
    marginTop: -2,
    marginBottom: 2,
  },
  collapsedMeta: {
    color: '#B0B0B0',
    fontSize: 12,
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#303030',
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  tableHeaderText: {
    color: '#B0B0B0',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#303030',
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginTop: 6,
  },
  setRowInvalid: {
    borderColor: '#F44336',
  },
  setRowSuspicious: {
    borderColor: '#FFB37A',
  },
  colSet: {
    flex: 1,
  },
  colReps: {
    flex: 1,
    textAlign: 'center',
  },
  colWeight: {
    flex: 2,
    textAlign: 'center',
  },
  colRpe: {
    flex: 1,
    textAlign: 'right',
  },
  cellText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  issueText: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
    marginLeft: 4,
  },
  issueTextInvalid: {
    color: '#F44336',
  },
  issueTextSuspicious: {
    color: '#FFB37A',
  },
  notesInput: {
    color: '#FFFFFF',
    backgroundColor: '#1A1A1A',
    borderRadius: 10,
    padding: 12,
    minHeight: 100,
    borderWidth: 1,
    borderColor: '#303030',
    marginBottom: 10,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  saveButton: {
    backgroundColor: '#FF6200',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    flex: 1,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
  },
  cancelButton: {
    backgroundColor: '#2D2D2D',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    flex: 1,
  },
  cancelButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 12,
  },
  emptySubtitle: {
    color: '#B0B0B0',
    fontSize: 13,
    marginTop: 6,
    textAlign: 'center',
  },
  emptyExercisesCard: {
    backgroundColor: '#252525',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#303030',
    padding: 14,
    gap: 6,
  },
  emptyExercisesText: {
    color: '#B0B0B0',
    fontSize: 13,
  },
  emptyExercisesHint: {
    color: '#FFB37A',
    fontSize: 12,
    fontWeight: '600',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'flex-end',
  },
  modalKeyboardWrap: {
    width: '100%',
  },
  modalCard: {
    backgroundColor: '#252525',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 20,
    borderTopWidth: 1,
    borderColor: '#303030',
  },
  modalCardTall: {
    backgroundColor: '#252525',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 20,
    borderTopWidth: 1,
    borderColor: '#303030',
    maxHeight: '88%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    flex: 1,
    paddingRight: 8,
  },
  modalCloseButton: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: '#1A1A1A',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  exerciseEditContent: {
    gap: 10,
    paddingBottom: 12,
  },
  editSetCard: {
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#303030',
    borderRadius: 10,
    padding: 10,
    gap: 8,
  },
  editSetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  editSetTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  removeSetButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#252525',
  },
  editInputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  editInputGroup: {
    flex: 1,
    gap: 4,
  },
  editInputLabel: {
    color: '#B0B0B0',
    fontSize: 12,
    fontWeight: '600',
  },
  editInput: {
    backgroundColor: '#252525',
    borderWidth: 1,
    borderColor: '#303030',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
    color: '#FFFFFF',
    fontSize: 14,
  },
  warmupToggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  warmupToggleText: {
    color: '#B0B0B0',
    fontSize: 12,
    fontWeight: '600',
  },
  addSetButton: {
    backgroundColor: '#2D2D2D',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#3A3A3A',
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  addSetButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
