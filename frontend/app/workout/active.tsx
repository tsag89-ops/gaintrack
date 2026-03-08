import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Modal,
  ScrollView,
  FlatList,
  Animated,
  ActivityIndicator,
} from 'react-native';
import DraggableFlatList, { RenderItemParams } from 'react-native-draggable-flatlist';
import { Swipeable } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { useWorkoutStore } from '../../src/store/workoutStore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { WorkoutExercise, WorkoutSet } from '../../src/types';
import { ExerciseVideo } from '../../src/components/ExerciseVideo';
import { ExercisePicker } from '../../src/components/ExercisePicker';
import { useNativeAuthState } from '../../src/hooks/useAuth';
import { usePro } from '../../src/hooks/usePro';
import { seedExercises } from '../../src/data/seedData';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';

const DEFAULT_REST_SECONDS = 90;
const REST_DURATION_KEY = 'gaintrack_rest_duration';

const ActiveWorkoutScreen: React.FC = () => {
  const router = useRouter();
  const { name: nameParam, programId } = useLocalSearchParams<{ name: string; programId?: string }>();
  const workoutTitle = nameParam || 'New Workout';
  const { currentWorkout, updateExerciseInWorkout, setCurrentWorkout, createWorkout, startWorkout,
    persistInProgress, restoreInProgress, clearInProgress } = useWorkoutStore();
  const { uid } = useNativeAuthState();
  const { isPro } = usePro();
  const [exerciseList, setExerciseList] = useState(currentWorkout?.exercises || []);
  const [addModalVisible, setAddModalVisible] = useState(false);

  // Add exercise to workout from ExercisePicker
  const handleAddExercise = (ex: any) => {
    setExerciseList([
      ...exerciseList,
       {
        exercise_id: ex.id || ex.exercise_id,
        exercise_name: ex.name,
        exercise: ex,
        sets: [],
      },
    ]);
    setAddModalVisible(false);
  };
  const [restTime, setRestTime] = useState(0);
  const [activeRest, setActiveRest] = useState(false);
  const [autoStartRestTimer, setAutoStartRestTimer] = useState(true);
  const [restSeconds, setRestSeconds] = useState(DEFAULT_REST_SECONDS);
  const [saving, setSaving] = useState(false);
  // Per-exercise rest override modal
  const [restOverrideModal, setRestOverrideModal] = useState<{ exerciseId: string; exerciseName: string } | null>(null);
  const [restOverrideInput, setRestOverrideInput] = useState('');
  const [elapsedSecs, setElapsedSecs] = useState(0);
  const startedAtRef = useRef<number>(Date.now());
  const notifIdRef = useRef<string | null>(null);

  // Undo-delete state
  type DeletedItem = { exercise: any; index: number };
  const [pendingDelete, setPendingDelete] = useState<DeletedItem | null>(null);
  const [undoCountdown, setUndoCountdown] = useState(0);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const toastAnim = useRef(new Animated.Value(0)).current;


  // Modal state for exercise video/instructions
  const [modalVisible, setModalVisible] = useState(false);
  const [modalExercise, setModalExercise] = useState<WorkoutExercise | null>(null);

  // Format elapsed seconds as MM:SS or H:MM:SS
  const formatDuration = (secs: number): string => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // Cancel any pending rest-over notification
  const cancelRestNotif = () => {
    if (notifIdRef.current) {
      Notifications.cancelScheduledNotificationAsync(notifIdRef.current).catch(() => null);
      notifIdRef.current = null;
    }
  };

  // Start rest timer + schedule bell notification [Feature 5]
  const startRestForExercise = async (exerciseId: string) => {
    const ex = exerciseList.find((e) => e.exercise_id === exerciseId);
    const secs = ex?.restSeconds ?? restSeconds;
    setRestTime(secs);
    setActiveRest(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: '\uD83D\uDD14 Rest over!',
          body: 'Time for your next set \uD83D\uDCAA',
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: secs,
        },
      });
      notifIdRef.current = id;
    } catch {}
  };

  // Back-compat wrapper used by auto-start (no exercise context needed at that callsite)
  const startRest = () => startRestForExercise('');

  // Save per-exercise rest override
  const saveRestOverride = () => {
    if (!restOverrideModal) return;
    const parsed = parseInt(restOverrideInput, 10);
    if (!parsed || parsed < 5 || parsed > 3600) {
      Alert.alert('Invalid duration', 'Enter a value between 5 and 3600 seconds.');
      return;
    }
    setExerciseList((prev) =>
      prev.map((ex) =>
        ex.exercise_id === restOverrideModal.exerciseId
          ? { ...ex, restSeconds: parsed }
          : ex
      )
    );
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setRestOverrideModal(null);
    setRestOverrideInput('');
  };

  const clearRestOverride = (exerciseId: string) => {
    setExerciseList((prev) =>
      prev.map((ex) =>
        ex.exercise_id === exerciseId ? { ...ex, restSeconds: undefined } : ex
      )
    );
    Haptics.selectionAsync();
    setRestOverrideModal(null);
    setRestOverrideInput('');
  };

  // [PRO] Toggle superset grouping between this exercise and the one below it.
  // Exercises sharing the same superset_group UUID are rendered as visually grouped.
  const toggleSuperset = (exerciseId: string) => {
    if (!isPro) {
      Alert.alert('Pro Feature', 'Supersets are available with GainTrack Pro ($4.99/yr).');
      return;
    }
    const idx = exerciseList.findIndex((ex) => ex.exercise_id === exerciseId);
    if (idx === -1 || idx === exerciseList.length - 1) {
      Alert.alert('Add another exercise', 'Add a second exercise below this one to create a superset.');
      return;
    }
    const current = exerciseList[idx];
    const next    = exerciseList[idx + 1];
    // Both already share the same group → unlink
    if (current.superset_group && current.superset_group === next.superset_group) {
      setExerciseList((prev) =>
        prev.map((ex) =>
          ex.exercise_id === current.exercise_id || ex.exercise_id === next.exercise_id
            ? { ...ex, superset_group: undefined }
            : ex
        )
      );
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      return;
    }
    // Link them with a shared group ID
    const groupId = 'ss_' + Date.now();
    setExerciseList((prev) =>
      prev.map((ex, i) =>
        i === idx || i === idx + 1
          ? { ...ex, superset_group: groupId }
          : ex
      )
    );
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  // Auto-init; restore in-progress or start fresh; request notification permissions [Feature 1]
  useEffect(() => {
    Notifications.requestPermissionsAsync().catch(() => null);
    AsyncStorage.getItem('gaintrack_auto_rest_timer').then((v) => {
      if (v !== null) setAutoStartRestTimer(JSON.parse(v));
    }).catch(() => null);
    AsyncStorage.getItem(REST_DURATION_KEY).then((v) => {
      if (v !== null) setRestSeconds(Number(v));
    }).catch(() => null);
    const init = async () => {
      const restored = await restoreInProgress();
      if (restored !== null) {
        setExerciseList(restored.exerciseList);
        startedAtRef.current = restored.startedAt;
        setElapsedSecs(Math.floor((Date.now() - restored.startedAt) / 1000));
      } else if (!currentWorkout) {
        startWorkout(workoutTitle);
      }
    };
    init();
  }, []);

  // Persist exerciseList (and currentWorkout metadata) on every mutation.
  useEffect(() => {
    if (currentWorkout) {
      persistInProgress(currentWorkout, exerciseList, startedAtRef.current);
    }
  }, [exerciseList, currentWorkout]);

  // Duration ticker — updates once per second [Feature 1]
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedSecs(Math.floor((Date.now() - startedAtRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Countdown — vibrate each tick in last 5 s; cancel notif when done in-app [Feature 5]
  useEffect(() => {
    if (activeRest && restTime > 0) {
      const interval = setInterval(() => {
        setRestTime((t) => {
          const next = t - 1;
          if (next > 0 && next <= 5) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => null);
          }
          return next;
        });
      }, 1000);
      return () => clearInterval(interval);
    } else if (activeRest && restTime === 0) {
      setActiveRest(false);
      cancelRestNotif();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => null);
    }
  }, [activeRest, restTime]);

  // Add a new set to an exercise
  const addSet = (exerciseId: string) => {
    const exercise = exerciseList.find((ex) => ex.exercise_id === exerciseId);
    if (!exercise) return;
    const newSet: WorkoutSet = {
      set_id: "set_" + Date.now(),
      set_number: exercise.sets.length + 1,
      completed: false,
      weight: 0,
      reps: 0,
      rpe: undefined,
      is_warmup: false,
    };
    const updated = exerciseList.map((ex) =>
      ex.exercise_id === exerciseId ? { ...ex, sets: [...ex.sets, newSet] } : ex
    );
    setExerciseList(updated);
  };

  // Tap checkmark to complete a set; auto-start rest on first completion [Feature 3]
  const toggleSetComplete = (exerciseId: string, setIdx: number) => {
    const exercise = exerciseList.find((ex) => ex.exercise_id === exerciseId);
    if (!exercise) return;
    const wasComplete = exercise.sets[setIdx]?.completed ?? false;
    const sets = exercise.sets.map((s, idx) =>
      idx === setIdx ? { ...s, completed: !s.completed } : s
    );
    const updated = exerciseList.map((ex) =>
      ex.exercise_id === exerciseId ? { ...ex, sets } : ex
    );
    setExerciseList(updated);
    if (!wasComplete) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (!activeRest && autoStartRestTimer) startRestForExercise(exerciseId);
    } else {
      Haptics.selectionAsync();
    }
  };

  // Swipeable refs — keyed by exercise_id
  const swipeableRefs = useRef<Map<string, Swipeable | null>>(new Map());

  // Show undo toast animation
  const showToast = () => {
    Animated.spring(toastAnim, { toValue: 1, useNativeDriver: true, speed: 20 }).start();
  };
  const hideToast = () => {
    Animated.timing(toastAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() =>
      setPendingDelete(null)
    );
  };

  // Clear any pending undo timers
  const clearUndoTimers = () => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    if (undoIntervalRef.current) clearInterval(undoIntervalRef.current);
  };

  // Stage a delete — actual removal committed after 5 s
  const removeExercise = (exerciseId: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    swipeableRefs.current.get(exerciseId)?.close();

    const index = exerciseList.findIndex((ex) => ex.exercise_id === exerciseId);
    const exercise = exerciseList[index];
    if (!exercise) return;

    // Visually remove immediately
    setExerciseList((prev) => prev.filter((ex) => ex.exercise_id !== exerciseId));

    // Cancel any previous pending delete
    clearUndoTimers();
    hideToast();

    // Stage new pending delete
    setPendingDelete({ exercise, index });
    setUndoCountdown(5);
    showToast();

    undoIntervalRef.current = setInterval(() => {
      setUndoCountdown((c) => c - 1);
    }, 1000);

    undoTimerRef.current = setTimeout(() => {
      clearUndoTimers();
      swipeableRefs.current.delete(exerciseId);
      hideToast();
    }, 5000);
  };

  // Restore the staged exercise
  const handleUndo = () => {
    if (!pendingDelete) return;
    clearUndoTimers();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setExerciseList((prev) => {
      const next = [...prev];
      next.splice(pendingDelete.index, 0, pendingDelete.exercise);
      return next;
    });
    hideToast();
  };

  const renderDeleteAction = (exerciseId: string, dragX: Animated.AnimatedInterpolation<number>) => {
    const scale = dragX.interpolate({
      inputRange: [-80, 0],
      outputRange: [1, 0.5],
      extrapolate: 'clamp',
    });
    return (
      <TouchableOpacity
        style={styles.swipeDeleteAction}
        onPress={() => removeExercise(exerciseId)}
        activeOpacity={0.8}
      >
        <Animated.Text style={[styles.swipeDeleteText, { transform: [{ scale }] }]}>
          🗑 Delete
        </Animated.Text>
      </TouchableOpacity>
    );
  };

  // Update a set's values
  const updateSet = (exerciseId: string, setIdx: number, field: keyof WorkoutSet, value: number) => {
    const exercise = exerciseList.find((ex) => ex.exercise_id === exerciseId);
    if (!exercise) return;
    const sets = exercise.sets.map((set, idx) =>
      idx === setIdx ? { ...set, [field]: value } : set
    );
    const updated = exerciseList.map((ex) =>
      ex.exercise_id === exerciseId ? { ...ex, sets } : ex
    );
    setExerciseList(updated);
  };

  // Detect per-exercise PRs using Brzycki 1RM formula; persist & return names [Feature 2]
  const detectAndSavePRs = async (exercises: WorkoutExercise[]): Promise<string[]> => {
    const PR_KEY = 'gaintrack_prs';
    const raw = await AsyncStorage.getItem(PR_KEY);
    const prs: Record<string, number> = raw ? JSON.parse(raw) : {};
    const newPRs: string[] = [];
    for (const ex of exercises) {
      const best = Math.max(
        0,
        ...ex.sets
          .filter((s) => !s.is_warmup && s.reps > 0 && s.weight > 0 && s.reps < 37)
          .map((s) => s.weight * (36 / (37 - s.reps))),
      );
      if (best > 0 && best > (prs[ex.exercise_id] ?? 0)) {
        prs[ex.exercise_id] = best;
        newPRs.push(ex.exercise_name);
      }
    }
    await AsyncStorage.setItem(PR_KEY, JSON.stringify(prs));
    return newPRs;
  };

  // Finish workout: save to Firestore, detect PRs, stamp duration, prompt template [PRO]
  const finishWorkout = async () => {
    if (!currentWorkout) return;
    if (!uid) {
      Alert.alert('Not signed in', 'Please log in to save workouts.');
      return;
    }
    const validExercises = exerciseList.filter((ex) => ex.sets.length > 0);
    const hasValidSets = validExercises.some((exercise) =>
      exercise.sets.some(
        (set) => (Number(set.reps) || 0) > 0 && (Number(set.weight) || 0) >= 0,
      ),
    );

    if (!hasValidSets || validExercises.length === 0) {
      Alert.alert(
        'Empty Workout',
        'No sets were logged. Add at least one set with reps to save this workout.',
        [
          { text: 'Keep Editing', style: 'cancel' },
          {
            text: 'Discard Workout',
            style: 'destructive',
            onPress: async () => {
              await clearInProgress();
              setCurrentWorkout(null);
              router.replace('/');
            },
          },
        ],
      );
      return;
    }
    setSaving(true);
    cancelRestNotif();
    try {
      const durationSeconds = Math.floor((Date.now() - startedAtRef.current) / 1000);
      const updatedWorkout = { ...currentWorkout, exercises: validExercises, duration: durationSeconds };
      const savedWorkout = await createWorkout(uid, updatedWorkout);
      const isOffline = savedWorkout.workout_id.startsWith('offline_');
      const newPRs = isOffline ? [] : await detectAndSavePRs(validExercises);
      await clearInProgress();
      const title = isOffline
        ? '📥 Saved offline'
        : newPRs.length > 0
          ? `🏆 ${newPRs.length} new PR${newPRs.length > 1 ? 's' : ''}!`
          : 'Workout saved!';
      const body = isOffline
        ? "No connection — your workout is stored locally and will sync to the cloud automatically when you're back online."
        : newPRs.length > 0
          ? `Records broken: ${newPRs.join(', ')}\n\nSave as template?`
          : 'Save as a template for next time?';
      Alert.alert(title, body, isOffline
        ? [{ text: 'OK', style: 'cancel' }]
        : [
            {
              text: 'Save Template',
              onPress: async () => {
                const tmplRaw = await AsyncStorage.getItem('gaintrack_templates');
                const templates = tmplRaw ? JSON.parse(tmplRaw) : [];
                templates.unshift({
                  id: Date.now().toString(),
                  name: currentWorkout.name,
                  exercises: validExercises.map((ex) => ({
                    exercise_id: ex.exercise_id,
                    exercise_name: ex.exercise_name,
                    exercise: ex.exercise,
                  })),
                  createdAt: new Date().toISOString(),
                });
                // [PRO] unlimited templates; free tier capped at 3
                await AsyncStorage.setItem('gaintrack_templates', JSON.stringify(templates.slice(0, 10)));
              },
            },
            { text: 'Skip', style: 'cancel' },
          ],
      );
      setCurrentWorkout(null);
      // Advance program day if this session was started from a program
      if (programId) {
        try {
          const { getPrograms, saveProgram } = await import('../../src/services/storage');
          const { format } = await import('date-fns');
          const all = await getPrograms();
          const prog = all.find((p: any) => p.id === programId);
          if (prog) {
            const nextDayIndex = prog.currentDayIndex + 1;
            const cycleComplete = nextDayIndex >= prog.daysPerWeek;
            await saveProgram({
              ...prog,
              currentDayIndex: cycleComplete ? 0 : nextDayIndex,
              currentCycle: cycleComplete ? prog.currentCycle + 1 : prog.currentCycle,
              lastSessionDate: format(new Date(), 'yyyy-MM-dd'),
            });
          }
        } catch (advErr) {
          console.warn('[active] advanceProgramDay failed:', advErr);
        }
      }
      router.replace('/');
    } catch (e) {
      console.error('Save workout error:', e);
      Alert.alert('Error saving workout', String(e));
    } finally {
      setSaving(false);
    }
  };

  if (!currentWorkout) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#FF6200" style={{ marginTop: 40 }} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Duration timer header [Feature 1] */}
      <View style={styles.headerRow}>
        <Text style={styles.title}>{currentWorkout.name || workoutTitle}</Text>
        <Text style={styles.durationText}>{formatDuration(elapsedSecs)}</Text>
      </View>
      <TouchableOpacity style={styles.addExerciseBtn} onPress={() => setAddModalVisible(true)}>
        <Text style={styles.addExerciseText}>+ Add Exercise</Text>
      </TouchableOpacity>
            {/* Add Exercise Modal */}
            <Modal
              visible={addModalVisible}
              animationType="slide"
              presentationStyle="pageSheet"
              onRequestClose={() => setAddModalVisible(false)}
            >
              <ExercisePicker
                onAdd={handleAddExercise}
                onClose={() => setAddModalVisible(false)}
                isPro={isPro}
                addedExerciseIds={exerciseList.map(e => e.exercise_id)}
              />
            </Modal>
      <DraggableFlatList
        data={exerciseList}
        onDragEnd={({ data }) => setExerciseList(data)}
        keyExtractor={(item) => item.exercise_id}
        renderItem={({ item, drag, isActive }: RenderItemParams<any>) => (
          <Swipeable
            ref={(ref) => { swipeableRefs.current.set(item.exercise_id, ref); }}
            renderRightActions={(_, dragX) => renderDeleteAction(item.exercise_id, dragX)}
            rightThreshold={40}
            overshootRight={false}
          >
          <View style={[styles.exerciseCard, isActive && { opacity: 0.8 }, item.superset_group && styles.exerciseCardSuperset]}> 
            {/* Superset badge — shown when this exercise is part of a group */}
            {item.superset_group && (
              <View style={styles.supersetBadge}>
                <Ionicons name="flash" size={11} color="#1A1A1A" />
                <Text style={styles.supersetBadgeText}>SUPERSET</Text>
              </View>
            )}
            <TouchableOpacity onLongPress={drag} onPress={() => { setModalExercise(item); setModalVisible(true); }}>
              <Text style={styles.exerciseName}>{item.exercise_name}</Text>
            </TouchableOpacity>
            <FlatList
              data={item.sets}
              keyExtractor={(_, idx) => idx.toString()}
              renderItem={({ item: set, index }) => (
                <View style={[styles.setRow, set.completed && styles.setRowComplete]}>
                  {/* Tap-to-complete checkmark [Feature 3] */}
                  <TouchableOpacity
                    style={styles.setCompleteBtn}
                    onPress={() => toggleSetComplete(item.exercise_id, index)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons
                      name={set.completed ? 'checkmark-circle' : 'ellipse-outline'}
                      size={22}
                      color={set.completed ? '#4CAF50' : '#555'}
                    />
                  </TouchableOpacity>
                  <Text style={styles.setNum}>Set {set.set_number}</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    value={set.weight.toString()}
                    onChangeText={(v) => updateSet(item.exercise_id, index, 'weight', Number(v))}
                    placeholder="kg"
                    placeholderTextColor="#B0B0B0"
                  />
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    value={set.reps.toString()}
                    onChangeText={(v) => updateSet(item.exercise_id, index, 'reps', Number(v))}
                    placeholder="reps"
                    placeholderTextColor="#B0B0B0"
                  />
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    value={set.rpe?.toString() || ''}
                    onChangeText={(v) => updateSet(item.exercise_id, index, 'rpe', Number(v))}
                    placeholder="RPE"
                    placeholderTextColor="#B0B0B0"
                  />
                </View>
              )}
              ListFooterComponent={
                <TouchableOpacity style={styles.addSetBtn} onPress={() => addSet(item.exercise_id)}>
                  <Text style={styles.addSetText}>+ Add Set</Text>
                </TouchableOpacity>
              }
            />
            <TouchableOpacity
              style={styles.restBtn}
              onPress={() => startRestForExercise(item.exercise_id)}
              onLongPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setRestOverrideInput(String(item.restSeconds ?? restSeconds));
                setRestOverrideModal({ exerciseId: item.exercise_id, exerciseName: item.exercise_name });
              }}
              delayLongPress={400}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.restBtnText}>⏱ Rest</Text>
                {item.restSeconds != null && (
                  <View style={styles.restOverrideBadge}>
                    <Text style={styles.restOverrideBadgeText}>
                      {item.restSeconds >= 60 ? `${item.restSeconds / 60}m` : `${item.restSeconds}s`}
                    </Text>
                  </View>
                )}
                {item.restSeconds == null && (
                  <Text style={styles.restBtnSubtext}>{restSeconds}s</Text>
                )}
              </View>
            </TouchableOpacity>
            {activeRest && (
              <Text style={[styles.restTimer, restTime <= 5 && { color: '#F44336' }]}>
                {restTime <= 5 ? '⚠️' : '⏱'} {restTime}s {restTime <= 5 ? '— go!' : 'rest…'}
              </Text>
            )}
            {/* [PRO] Superset toggle button */}
            <TouchableOpacity
              style={[styles.supersetBtn, item.superset_group && styles.supersetBtnActive]}
              onPress={() => toggleSuperset(item.exercise_id)}
              activeOpacity={0.75}
            >
              <Ionicons
                name={isPro ? 'flash' : 'lock-closed'}
                size={13}
                color={item.superset_group ? '#1A1A1A' : '#B0B0B0'}
              />
              <Text style={[styles.supersetBtnText, item.superset_group && styles.supersetBtnTextActive]}>
                {item.superset_group ? 'Superset ✓' : 'Superset'}
              </Text>
            </TouchableOpacity>
          </View>
          </Swipeable>
        )}
        ListEmptyComponent={<Text style={styles.emptyText}>No exercises added.</Text>}
      />
      <TouchableOpacity style={styles.finishBtn} onPress={finishWorkout} disabled={saving}>
        <Text style={styles.finishBtnText}>{saving ? 'Saving...' : 'Finish Workout'}</Text>
      </TouchableOpacity>

      {/* Per-exercise rest duration override modal */}
      <Modal
        visible={restOverrideModal !== null}
        animationType="fade"
        transparent
        onRequestClose={() => setRestOverrideModal(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { padding: 20 }]}>
            <Text style={styles.modalTitle}>Rest Duration</Text>
            <Text style={{ color: '#B0B0B0', textAlign: 'center', marginBottom: 16, fontSize: 13 }}>
              {restOverrideModal?.exerciseName}
            </Text>
            <View style={styles.restPresetRow}>
              {[30, 60, 90, 120, 180, 300].map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[
                    styles.restPresetPill,
                    parseInt(restOverrideInput, 10) === s && styles.restPresetPillActive,
                  ]}
                  onPress={() => { Haptics.selectionAsync(); setRestOverrideInput(String(s)); }}
                >
                  <Text style={[
                    styles.restPresetPillText,
                    parseInt(restOverrideInput, 10) === s && styles.restPresetPillTextActive,
                  ]}>
                    {s >= 60 ? `${s / 60}m` : `${s}s`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={[styles.input, { width: '100%', marginHorizontal: 0, marginBottom: 16, fontSize: 18, textAlign: 'center' }]}
              keyboardType="numeric"
              value={restOverrideInput}
              onChangeText={setRestOverrideInput}
              placeholder="seconds"
              placeholderTextColor="#B0B0B0"
            />
            <TouchableOpacity style={styles.restSaveBtn} onPress={saveRestOverride}>
              <Text style={styles.restSaveBtnText}>Set Override</Text>
            </TouchableOpacity>
            {restOverrideModal && exerciseList.find((e) => e.exercise_id === restOverrideModal.exerciseId)?.restSeconds != null && (
              <TouchableOpacity
                style={styles.restClearBtn}
                onPress={() => clearRestOverride(restOverrideModal.exerciseId)}
              >
                <Text style={styles.restClearBtnText}>Clear Override (use global {restSeconds}s)</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.closeModalBtn} onPress={() => setRestOverrideModal(null)}>
              <Text style={styles.closeModalText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Exercise Video/Instructions Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ScrollView contentContainerStyle={{ padding: 16 }}>
              <Text style={styles.modalTitle}>{modalExercise?.exercise_name}</Text>
              {/* You may want to fetch videoUrl/instructions from your exercise data source */}
              {modalExercise && (
                <ExerciseVideo videoUrl={getExerciseVideoUrl(modalExercise.exercise_name)} />
              )}
              <Text style={styles.modalInstructions}>{getExerciseInstructions(modalExercise?.exercise_name)}</Text>
              <TouchableOpacity style={styles.closeModalBtn} onPress={() => setModalVisible(false)}>
                <Text style={styles.closeModalText}>Close</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Undo-delete toast */}
      {pendingDelete && (
        <Animated.View
          style={[
            styles.undoToast,
            {
              opacity: toastAnim,
              transform: [{
                translateY: toastAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [40, 0],
                }),
              }],
            },
          ]}
        >
          <Text style={styles.undoToastText} numberOfLines={1}>
            “{pendingDelete.exercise.exercise_name}” removed
          </Text>
          <View style={styles.undoCountdownBadge}>
            <Text style={styles.undoCountdownText}>{undoCountdown}</Text>
          </View>
          <TouchableOpacity style={styles.undoBtn} onPress={handleUndo} activeOpacity={0.8}>
            <Text style={styles.undoBtnText}>UNDO</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

    </KeyboardAvoidingView>
  );
};

export default ActiveWorkoutScreen;

// Helper functions to get videoUrl/instructions by exercise name
function getExerciseVideoUrl(name: string) {
  const ex = seedExercises.find(e => e.name === name);
  return ex?.videoUrl || 'https://www.youtube.com/embed/rT7DgCr-3pg';
}
function getExerciseInstructions(name?: string) {
  const ex = seedExercises.find(e => e.name === name);
  return ex?.instructions || '';
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1A1A1A',
    padding: 16,
    paddingTop: 40,
  },
  title: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  exerciseCard: {
    backgroundColor: '#252525',
    borderRadius: 10,
    padding: 16,
    marginBottom: 20,
  },
  exerciseName: {
    color: '#FFC107',
    fontWeight: 'bold',
    fontSize: 18,
    marginBottom: 8,
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  setNum: {
    color: '#fff',
    width: 50,
  },
  input: {
    backgroundColor: '#1A1A1A',
    color: '#fff',
    borderRadius: 6,
    padding: 6,
    marginHorizontal: 4,
    width: 60,
    borderWidth: 1,
    borderColor: '#303030',
    textAlign: 'center',
  },
  addSetBtn: {
    marginTop: 6,
    backgroundColor: '#4CAF50',
    borderRadius: 6,
    alignItems: 'center',
    padding: 8,
  },
  addSetText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  restBtn: {
    marginTop: 10,
    backgroundColor: '#2196F3',
    borderRadius: 6,
    alignItems: 'center',
    padding: 8,
  },
  restBtnText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  restTimer: {
    color: '#FFC107',
    fontWeight: 'bold',
    fontSize: 16,
    marginTop: 6,
    textAlign: 'center',
  },
  finishBtn: {
    backgroundColor: '#FF6200',
    borderRadius: 8,
    alignItems: 'center',
    padding: 16,
    marginTop: 16,
  },
  finishBtnText: {
    color: '#1A1A1A',
    fontWeight: 'bold',
    fontSize: 18,
  },
  emptyText: {
    color: '#B0B0B0',
    textAlign: 'center',
    marginTop: 40,
  },
  swipeDeleteAction: {
    backgroundColor: '#F44336',
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    borderRadius: 10,
    marginBottom: 20,
  },
  swipeDeleteText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 13,
    textAlign: 'center',
  },
  undoToast: {
    position: 'absolute',
    bottom: 90,
    left: 16,
    right: 16,
    backgroundColor: '#2D2D2D',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
    borderLeftWidth: 4,
    borderLeftColor: '#FF6200',
  },
  undoToastText: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  undoCountdownBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: '#FF6200',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  undoCountdownText: {
    color: '#FF6200',
    fontSize: 12,
    fontWeight: 'bold',
  },
  undoBtn: {
    backgroundColor: '#FF6200',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  undoBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 13,
    letterSpacing: 0.5,
  },
  addExerciseBtn: {
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    alignItems: 'center',
    padding: 12,
    marginBottom: 12,
  },
  addExerciseText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '90%',
    backgroundColor: '#252525',
    borderRadius: 12,
    padding: 0,
    overflow: 'hidden',
  },
  modalTitle: {
    color: '#FFC107',
    fontWeight: 'bold',
    fontSize: 20,
    marginBottom: 12,
    textAlign: 'center',
  },
  modalInstructions: {
    color: '#fff',
    fontSize: 16,
    marginTop: 12,
    marginBottom: 16,
    textAlign: 'center',
  },
  closeModalBtn: {
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    alignItems: 'center',
    padding: 12,
    marginTop: 8,
  },
  closeModalText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  // ── Feature 1: Duration header ──
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  durationText: {
    color: '#B0B0B0',
    fontSize: 15,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  // ── Feature 3: Set completion ──
  setCompleteBtn: {
    marginRight: 6,
  },
  setRowComplete: {
    backgroundColor: 'rgba(76,175,80,0.08)',
    borderRadius: 6,
  },
  // Per-exercise rest override
  restOverrideBadge: {
    backgroundColor: '#FF6200',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  restOverrideBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  restBtnSubtext: {
    color: '#AACFFF',
    fontSize: 12,
    fontWeight: '500',
  },
  restPresetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 14,
  },
  restPresetPill: {
    borderWidth: 1,
    borderColor: '#444',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  restPresetPillActive: {
    backgroundColor: '#FF6200',
    borderColor: '#FF6200',
  },
  restPresetPillText: {
    color: '#B0B0B0',
    fontWeight: '600',
    fontSize: 13,
  },
  restPresetPillTextActive: {
    color: '#fff',
  },
  restSaveBtn: {
    backgroundColor: '#FF6200',
    borderRadius: 8,
    alignItems: 'center',
    padding: 12,
    marginBottom: 8,
  },
  restSaveBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 15,
  },
  restClearBtn: {
    alignItems: 'center',
    padding: 10,
    marginBottom: 4,
  },
  restClearBtnText: {
    color: '#B0B0B0',
    fontSize: 13,
    textDecorationLine: 'underline',
  },
  // ── Superset styles [PRO] ─────────────────────────────────────────────────
  exerciseCardSuperset: {
    borderLeftWidth:  3,
    borderLeftColor:  '#FF6200',
  },
  supersetBadge: {
    flexDirection:     'row',
    alignItems:        'center',
    alignSelf:         'flex-start',
    backgroundColor:   '#FF6200',
    borderRadius:      20,
    paddingHorizontal: 8,
    paddingVertical:   3,
    marginBottom:      6,
    gap:               3,
  },
  supersetBadgeText: {
    color:      '#1A1A1A',
    fontSize:   10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  supersetBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    alignSelf:         'flex-start',
    marginTop:         8,
    borderWidth:       1,
    borderColor:       '#444',
    borderRadius:      20,
    paddingHorizontal: 12,
    paddingVertical:   5,
    gap:               4,
  },
  supersetBtnActive: {
    backgroundColor: '#FF6200',
    borderColor:     '#FF6200',
  },
  supersetBtnText: {
    color:      '#B0B0B0',
    fontSize:   12,
    fontWeight: '600',
  },
  supersetBtnTextActive: {
    color: '#1A1A1A',
  },
});
