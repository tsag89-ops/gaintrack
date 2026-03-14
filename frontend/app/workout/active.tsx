import React, { useState, useEffect, useRef, useCallback } from 'react';
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
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { WorkoutExercise, WorkoutSet } from '../../src/types';
import { ExerciseVideo } from '../../src/components/ExerciseVideo';
import { takePendingExercise } from '../../src/utils/exerciseMailbox';
import { useNativeAuthState } from '../../src/hooks/useAuth';
import { usePro } from '../../src/hooks/usePro';
import { useWeightUnit } from '../../src/hooks/useWeightUnit';
import { seedExercises } from '../../src/data/seedData';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';

const DEFAULT_REST_SECONDS = 90;
const REST_DURATION_KEY = 'gaintrack_rest_duration';
const SUPERSET_COLORS = ['#FF6200', '#4CAF50', '#29B6F6', '#FFB300', '#EF5350', '#AB47BC'];
// Per-exercise last-session cache — written on every finish, read before scanning workout history
const EXERCISE_HISTORY_KEY = 'gaintrack_exercise_history';

const ActiveWorkoutScreen: React.FC = () => {
  const router = useRouter();
  const { name: nameParam, programId, templateId, dayIndex } = useLocalSearchParams<{ name: string; programId?: string; templateId?: string; dayIndex?: string }>();
  const workoutTitle = nameParam || 'New Workout';
  const { currentWorkout, updateExerciseInWorkout, setCurrentWorkout, createWorkout, startWorkout,
    persistInProgress, restoreInProgress, clearInProgress } = useWorkoutStore();
  const { uid } = useNativeAuthState();
  const { isPro } = usePro();
  const weightUnit = useWeightUnit();
  const [exerciseList, setExerciseList] = useState(currentWorkout?.exercises || []);
  const [prefilledFromLastSession, setPrefilledFromLastSession] = useState<Set<string>>(new Set());

  // Fetch sets from the most recent workout containing this exercise, used for prefill.
  const loadLastSessionSets = async (ex: any): Promise<WorkoutSet[]> => {
    try {
      const idA: string = ex?.exercise_id || '';
      const idB: string = ex?.id || '';
    // Accept both Exercise (has .name) and WorkoutExercise (has .exercise_name)
    const exName: string = (ex?.name ?? ex?.exercise_name ?? '').toLowerCase();
      try {
        const cacheRaw = await AsyncStorage.getItem(EXERCISE_HISTORY_KEY);
        if (cacheRaw) {
          const cache: Record<string, WorkoutSet[]> = JSON.parse(cacheRaw);
          const cached = cache[idA] ?? cache[idB] ?? cache[exName];
          if (cached && cached.length > 0) {
            return cached.map((set: WorkoutSet, idx: number) => ({
              ...set,
              set_id: `prefill-${idA || idB}-${Date.now()}-${idx}`,
              set_number: idx + 1,
              completed: false,
            }));
          }
        }
      } catch {}

      // 2. Fallback: scan full workout history (handles pre-cache data)
      const storeWorkouts: any[] = useWorkoutStore.getState().workouts ?? [];
      let persisted: any[] = [];
      try {
        const raw = await AsyncStorage.getItem('gaintrack_workouts');
        if (raw) persisted = JSON.parse(raw);
      } catch {}

      const seen = new Set<string>();
      const all: any[] = [];
      for (const w of [...storeWorkouts, ...persisted]) {
        const wid: string = w?.workout_id ?? '';
        if (!seen.has(wid)) {
          if (wid) seen.add(wid);
          all.push(w);
        }
      }

      all.sort((a, b) => {
        const ad = new Date(a?.date ?? a?.created_at ?? 0).getTime();
        const bd = new Date(b?.date ?? b?.created_at ?? 0).getTime();
        return bd - ad;
      });

      for (const workout of all) {
        const previousExercise = (workout?.exercises ?? []).find((item: any) => {
          const storedId: string = item?.exercise_id ?? item?.id ?? '';
          if (idA && storedId === idA) return true;
          if (idB && storedId === idB) return true;
          if (exName && (item?.exercise_name ?? item?.name ?? '').toLowerCase() === exName) return true;
          return false;
        });
        const previousSets = previousExercise?.sets ?? [];
        if (previousSets.length > 0) {
          const lookupKey = idA || idB;
          return previousSets.map((set: WorkoutSet, idx: number) => ({
            ...set,
            set_id: `prefill-${lookupKey}-${Date.now()}-${idx}`,
            set_number: idx + 1,
            completed: false,
          }));
        }
      }
      return [];
    } catch (err) {
      console.warn('[active] loadLastSessionSets failed:', err);
      return [];
    }
  };

  const handleAddExercise = useCallback(async (ex: any) => {
    // Use exercise_id as the canonical ID (consistent with addExerciseToWorkout in exercises tab)
    const exerciseId = ex.exercise_id || ex.id;
    const previousSets = await loadLastSessionSets(ex);
    setExerciseList((prev) => [
      ...prev,
      {
        exercise_id: exerciseId,
        exercise_name: ex.name,
        exercise: ex,
        sets: previousSets,
      },
    ]);
    if (previousSets.length > 0) {
      setPrefilledFromLastSession((prev) => new Set(prev).add(exerciseId));
    }
  }, []);
  const [restTime, setRestTime] = useState(0);
  const [activeRest, setActiveRest] = useState(false);
  const [autoStartRestTimer, setAutoStartRestTimer] = useState(true);
  const [restSeconds, setRestSeconds] = useState(DEFAULT_REST_SECONDS);
  const [saving, setSaving] = useState(false);
  // Per-exercise rest override modal
  const [restOverrideModal, setRestOverrideModal] = useState<{ exerciseId: string; exerciseName: string } | null>(null);
  const [restOverrideInput, setRestOverrideInput] = useState('');
  const [elapsedSecs, setElapsedSecs] = useState(0);
  const [timerPaused, setTimerPaused] = useState(false);
  const startedAtRef = useRef<number>(Date.now());
  const pausedTimeRef = useRef<number>(0); // Accumulated paused time in ms
  const pauseStartRef = useRef<number>(0); // When current pause started
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
  const [showRpeInfo, setShowRpeInfo] = useState(false);

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

  const getSupersetGroupIds = () => (
    Array.from(new Set(exerciseList.filter((ex) => ex.superset_group).map((ex) => ex.superset_group as string)))
  );

  const getSupersetGroupMeta = (groupId: string) => {
    const groupIds = getSupersetGroupIds();
    const idx = Math.max(0, groupIds.indexOf(groupId));
    return {
      label: `Group ${idx + 1}`,
      color: SUPERSET_COLORS[idx % SUPERSET_COLORS.length],
    };
  };

  const assignExerciseToSupersetGroup = (exerciseId: string, groupId: string) => {
    setExerciseList((prev) =>
      prev.map((ex) =>
        ex.exercise_id === exerciseId ? { ...ex, superset_group: groupId } : ex
      )
    );
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const removeExerciseFromSupersetGroup = (exerciseId: string) => {
    setExerciseList((prev) =>
      prev.map((ex) =>
        ex.exercise_id === exerciseId ? { ...ex, superset_group: undefined } : ex
      )
    );
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // [PRO] Prompt user to choose which superset group this exercise belongs to.
  const toggleSuperset = (exerciseId: string) => {
    if (!isPro) {
      Alert.alert('Pro Feature', 'Supersets are available with GainTrack Pro ($4.99/yr).');
      return;
    }
    const exercise = exerciseList.find((ex) => ex.exercise_id === exerciseId);
    if (!exercise) return;

    if (exerciseList.length < 2) {
      Alert.alert('Add another exercise', 'Add at least one more exercise before creating a superset group.');
      return;
    }

    const existingGroups = getSupersetGroupIds().filter((g) => g !== exercise.superset_group);
    const createGroupId = `ss_${Date.now()}`;
    const buttons: Array<{ text: string; style?: 'default' | 'cancel' | 'destructive'; onPress?: () => void }> = [
      {
        text: 'Create New Group',
        onPress: () => assignExerciseToSupersetGroup(exerciseId, createGroupId),
      },
      ...existingGroups.map((groupId) => ({
        text: `Add to ${getSupersetGroupMeta(groupId).label}`,
        onPress: () => assignExerciseToSupersetGroup(exerciseId, groupId),
      })),
    ];

    if (exercise.superset_group) {
      buttons.push({
        text: `Remove from ${getSupersetGroupMeta(exercise.superset_group).label}`,
        style: 'destructive',
        onPress: () => removeExerciseFromSupersetGroup(exerciseId),
      });
    }

    buttons.push({ text: 'Cancel', style: 'cancel' });

    Alert.alert(
      'Superset Group',
      'Choose which superset group this exercise should be added to.',
      buttons
    );
  };

  // When the screen regains focus (e.g. returning from Exercises tab), check mailbox.
  useFocusEffect(
    useCallback(() => {
      const pending = takePendingExercise();
      if (pending) handleAddExercise(pending);
    }, [handleAddExercise]),
  );

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
      let listToUse: WorkoutExercise[];

      if (restored !== null) {
        listToUse = restored.exerciseList;
        startedAtRef.current = restored.startedAt;
        setElapsedSecs(Math.floor((Date.now() - restored.startedAt) / 1000));
      } else if (!currentWorkout) {
        startWorkout(workoutTitle);
        return; // No exercises yet — nothing to prefill
      } else {
        listToUse = currentWorkout.exercises; // e.g. Quick Workout with sets: []
      }

      // Prefill any exercises that were added with empty sets from last session cache
      const prefilledIds: string[] = [];
      const result = await Promise.all(
        listToUse.map(async (ex) => {
          if (ex.sets.length > 0) return ex; // Template / restored sets — keep as-is
          // Build a search object that loadLastSessionSets can use
          const searchEx = ex.exercise
            || { exercise_id: ex.exercise_id, id: ex.exercise_id, name: ex.exercise_name };
          const lastSets = await loadLastSessionSets(searchEx);
          if (lastSets.length > 0) {
            prefilledIds.push(ex.exercise_id);
            return { ...ex, sets: lastSets };
          }
          return ex;
        })
      );
      setExerciseList(result);
      if (prefilledIds.length > 0) {
        setPrefilledFromLastSession(new Set(prefilledIds));
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

  // Cleanup undo timers on unmount to prevent setState on unmounted component.
  useEffect(() => {
    return () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      if (undoIntervalRef.current) clearInterval(undoIntervalRef.current);
    };
  }, []);

  // Duration ticker — updates once per second [Feature 1]
  useEffect(() => {
    const interval = setInterval(() => {
      if (!timerPaused) {
        setElapsedSecs(Math.floor((Date.now() - startedAtRef.current - pausedTimeRef.current) / 1000));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [timerPaused]);

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
    const lastSet = exercise.sets[exercise.sets.length - 1];
    const newSet: WorkoutSet = {
      set_id: "set_" + Date.now(),
      set_number: exercise.sets.length + 1,
      completed: false,
      weight: lastSet?.weight ?? 0,
      reps: lastSet?.reps ?? 0,
      rpe: lastSet?.rpe,
      is_warmup: false,
    };
    const updated = exerciseList.map((ex) =>
      ex.exercise_id === exerciseId ? { ...ex, sets: [...ex.sets, newSet] } : ex
    );
    setExerciseList(updated);
  };

  // Add a warm-up set to an exercise
  const addWarmupSet = (exerciseId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const exercise = exerciseList.find((ex) => ex.exercise_id === exerciseId);
    if (!exercise) return;
    const newSet: WorkoutSet = {
      set_id: 'warmup_' + Date.now(),
      set_number: exercise.sets.length + 1,
      completed: false,
      weight: 0,
      reps: 0,
      rpe: undefined,
      is_warmup: true,
    };
    const updated = exerciseList.map((ex) =>
      ex.exercise_id === exerciseId ? { ...ex, sets: [...ex.sets, newSet] } : ex
    );
    setExerciseList(updated);
  };

  const skipRestTimer = async () => {
    cancelRestNotif();
    setActiveRest(false);
    setRestTime(0);
    await Haptics.selectionAsync();
  };

  // Toggle timer pause/play
  const toggleTimer = () => {
    if (timerPaused) {
      // Resuming: add the time paused to accumulated paused time
      pausedTimeRef.current += Date.now() - pauseStartRef.current;
      setTimerPaused(false);
    } else {
      // Pausing: record when we paused
      pauseStartRef.current = Date.now();
      setTimerPaused(true);
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // Tap checkmark to complete a set; auto-start rest on first completion [Feature 3]
  const toggleSetComplete = (exerciseId: string, setIdx: number) => {
    const exercise = exerciseList.find((ex) => ex.exercise_id === exerciseId);
    if (!exercise) return;
    const set = exercise.sets[setIdx];
    const wasComplete = set?.completed ?? false;
    // Block completing a set that has no weight or reps filled in
    if (!wasComplete) {
      const w = Number(set?.weight ?? 0);
      const r = Number(set?.reps ?? 0);
      if (r <= 0 || w < 0) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert(
          'Missing values',
          'Weight and reps must be filled in before marking a set as completed.',
        );
        return;
      }
    }
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

  // Remove a single set from an exercise
  const removeSet = (exerciseId: string, setIdx: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExerciseList((prev) =>
      prev.map((ex) =>
        ex.exercise_id === exerciseId
          ? {
              ...ex,
              sets: ex.sets
                .filter((_, i) => i !== setIdx)
                .map((s, i) => ({ ...s, set_number: i + 1 })),
            }
          : ex
      )
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
  const finishWorkout = async (skipIncompleteCheck = false) => {
    if (!currentWorkout) return;
    if (!uid) {
      Alert.alert('Not signed in', 'Please log in to save workouts.');
      return;
    }

    // Check for incomplete sets (have reps/weight filled but not marked complete)
    if (!skipIncompleteCheck) {
      const incompleteSets = exerciseList.reduce((count, ex) => {
        return count + ex.sets.filter((s) => !s.completed && (Number(s.reps) > 0 || Number(s.weight) > 0)).length;
      }, 0);
      if (incompleteSets > 0) {
        Alert.alert(
          'Incomplete sets',
          `You have ${incompleteSets} set${incompleteSets > 1 ? 's' : ''} that ${incompleteSets > 1 ? 'are' : 'is'} not marked as completed. What would you like to do?`,
          [
            { text: 'Keep editing', style: 'cancel' },
            {
              text: 'Discard incomplete & finish',
              style: 'destructive',
              onPress: () => {
                // Remove sets that aren't marked complete and have data, then finish
                setExerciseList((prev) =>
                  prev.map((ex) => ({
                    ...ex,
                    sets: ex.sets.filter((s) => s.completed || (Number(s.reps) === 0 && Number(s.weight) === 0)),
                  }))
                );
                // Use setTimeout so state update flushes before saving
                setTimeout(() => finishWorkout(true), 50);
              },
            },
          ],
        );
        return;
      }
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
      // Calculate duration excluding paused time
      const totalPausedTime = timerPaused ? pausedTimeRef.current + (Date.now() - pauseStartRef.current) : pausedTimeRef.current;
      const durationSeconds = Math.floor((Date.now() - startedAtRef.current - totalPausedTime) / 1000);
      const updatedWorkout = { ...currentWorkout, exercises: validExercises, duration: durationSeconds };
      const savedWorkout = await createWorkout(uid, updatedWorkout);
      const isOffline = savedWorkout.workout_id.startsWith('offline_');
      const newPRs = await detectAndSavePRs(validExercises);
      await clearInProgress();

      // Write per-exercise last-sets cache so next session prefill always works
      try {
        const cacheRaw = await AsyncStorage.getItem(EXERCISE_HISTORY_KEY);
        const cache: Record<string, WorkoutSet[]> = cacheRaw ? JSON.parse(cacheRaw) : {};
        for (const ex of validExercises) {
          const workingSets = ex.sets.filter((s) => !s.is_warmup && ((s.reps ?? 0) > 0 || (s.weight ?? 0) > 0));
          if (workingSets.length === 0) continue;
          const cleanSets: WorkoutSet[] = workingSets.map((s) => ({
            set_id: s.set_id,
            set_number: s.set_number,
            reps: s.reps ?? 0,
            weight: s.weight ?? 0,
            rpe: s.rpe ?? undefined,
            completed: false,
            is_warmup: false,
          }));
          // Index by exercise_id, numeric id (from exercise.id), and lowercased name
          if (ex.exercise_id) cache[ex.exercise_id] = cleanSets;
          const numericId: string = ex.exercise?.id ?? '';
          if (numericId) cache[numericId] = cleanSets;
          const nameKey = (ex.exercise_name ?? '').toLowerCase();
          if (nameKey) cache[nameKey] = cleanSets;
        }
        await AsyncStorage.setItem(EXERCISE_HISTORY_KEY, JSON.stringify(cache));
      } catch {}

      // Helper: build a serialisable snapshot of the current exercises for template storage
      const buildTemplateExercises = () =>
        validExercises.map((ex) => ({
          exercise_id: ex.exercise_id,
          exercise_name: ex.exercise_name,
          exercise: ex.exercise,
          sets: ex.sets.map((s) => ({
            set_id: s.set_id,
            set_number: s.set_number,
            reps: s.reps ?? 0,
            weight: s.weight ?? 0,
            rpe: s.rpe ?? null,
            completed: false,
            is_warmup: s.is_warmup ?? false,
          })),
        }));

      // Helper: persist updated template exercises back to AsyncStorage
      const saveTemplateExercises = async (tmplId: string, newExercises: any[]) => {
        const tmplRaw = await AsyncStorage.getItem('gaintrack_templates');
        const allTemplates: any[] = tmplRaw ? JSON.parse(tmplRaw) : [];
        const idx = allTemplates.findIndex((t: any) => t.id === tmplId);
        if (idx !== -1) {
          allTemplates[idx] = { ...allTemplates[idx], exercises: newExercises, updatedAt: new Date().toISOString() };
          await AsyncStorage.setItem('gaintrack_templates', JSON.stringify(allTemplates));
        }
      };

      // Helper: compute a human-readable diff between original template and current workout
      const buildTemplateDiff = (origExercises: any[], currentExercises: any[]): string => {
        const lines: string[] = [];
        const origMap = new Map(origExercises.map((e: any) => [e.exercise_id, e]));
        const currMap = new Map(currentExercises.map((e: any) => [e.exercise_id, e]));

        for (const [id, orig] of origMap) {
          if (!currMap.has(id)) lines.push(`• Removed: ${orig.exercise_name}`);
        }
        for (const [id, curr] of currMap) {
          if (!origMap.has(id)) {
            lines.push(`• Added: ${curr.exercise_name}`);
          } else {
            const orig = origMap.get(id)!;
            const origSets: any[] = orig.sets ?? [];
            const currSets: any[] = curr.sets ?? [];
            if (origSets.length !== currSets.length) {
              lines.push(`• ${curr.exercise_name}: ${origSets.length} → ${currSets.length} sets`);
            } else {
              const setChanges: string[] = [];
              currSets.forEach((cs, i) => {
                const os = origSets[i];
                if (!os) return;
                const parts: string[] = [];
                if (Number(cs.reps) !== Number(os.reps)) parts.push(`reps ${os.reps}→${cs.reps}`);
                if (Number(cs.weight) !== Number(os.weight)) parts.push(`${os.weight}→${cs.weight}${weightUnit}`);
                if ((cs.rpe ?? '') !== (os.rpe ?? '')) parts.push(`RPE ${os.rpe ?? '-'}→${cs.rpe ?? '-'}`);
                if (parts.length) setChanges.push(`set ${i + 1}: ${parts.join(', ')}`);
              });
              if (setChanges.length) lines.push(`• ${curr.exercise_name}: ${setChanges.join('; ')}`);
            }
          }
        }
        return lines.length ? lines.join('\n') : 'No changes detected.';
      };

      if (isOffline) {
        Alert.alert('📥 Saved offline', "No connection — your workout is stored locally and will sync when you're back online.", [{ text: 'OK', style: 'cancel' }]);
      } else if (templateId) {
        // Workout was loaded from a template — ask to update it instead of saving a new one
        const tmplRaw = await AsyncStorage.getItem('gaintrack_templates');
        const allTemplates: any[] = tmplRaw ? JSON.parse(tmplRaw) : [];
        const sourceTemplate = allTemplates.find((t: any) => t.id === templateId);
        const prLine = newPRs.length > 0 ? `🏆 ${newPRs.join(', ')}\n\n` : '';
        if (sourceTemplate) {
          const diff = buildTemplateDiff(sourceTemplate.exercises ?? [], buildTemplateExercises());
          Alert.alert(
            newPRs.length > 0 ? `🏆 ${newPRs.length} new PR${newPRs.length > 1 ? 's' : ''}!` : 'Workout saved!',
            `${prLine}Update template "${sourceTemplate.name}"?\n\n${diff}`,
            [
              {
                text: 'Update Template',
                onPress: () => saveTemplateExercises(templateId, buildTemplateExercises()),
              },
              { text: 'Keep Original', style: 'cancel' },
            ],
          );
        } else {
          // Template no longer exists — just show PR info if any
          if (newPRs.length > 0) Alert.alert(`🏆 ${newPRs.length} new PR${newPRs.length > 1 ? 's' : ''}!`, `Records broken: ${newPRs.join(', ')}`, [{ text: 'OK' }]);
        }
      } else {
        // Regular workout — offer to save as a new template
        const title = newPRs.length > 0 ? `🏆 ${newPRs.length} new PR${newPRs.length > 1 ? 's' : ''}!` : 'Workout saved!';
        const body = newPRs.length > 0 ? `Records broken: ${newPRs.join(', ')}\n\nSave as template?` : 'Save as a template for next time?';
        Alert.alert(title, body, [
          {
            text: 'Save Template',
            onPress: async () => {
              const tmplRaw = await AsyncStorage.getItem('gaintrack_templates');
              const templates = tmplRaw ? JSON.parse(tmplRaw) : [];
              templates.unshift({
                id: Date.now().toString(),
                name: currentWorkout.name,
                exercises: buildTemplateExercises(),
                createdAt: new Date().toISOString(),
              });
              // [PRO] unlimited templates; free tier capped at 3
              await AsyncStorage.setItem('gaintrack_templates', JSON.stringify(templates.slice(0, 10)));
            },
          },
          { text: 'Skip', style: 'cancel' },
        ]);
      }
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

            // Save completed session data into the program day for reference
            const completedExerciseData = exerciseList.map((ex: any) => ({
              exerciseName: ex.exercise_name,
              sets: ex.sets.map((s: any) => ({ weight: s.weight, reps: s.reps, completed: s.completed })),
            }));
            const dayIdx = parseInt(dayIndex || String(prog.currentDayIndex));
            const updatedDays = prog.days.map((d: any, i: number) => {
              if (i !== dayIdx) return d;
              const session = {
                date: format(new Date(), 'yyyy-MM-dd'),
                exercises: completedExerciseData,
              };
              return { ...d, completedSessions: [...(d.completedSessions || []), session] };
            });

            await saveProgram({
              ...prog,
              days: updatedDays,
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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={styles.durationText}>{formatDuration(elapsedSecs)}</Text>
          <TouchableOpacity onPress={toggleTimer} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name={timerPaused ? 'play-circle' : 'pause-circle'} size={28} color="#FF6200" />
          </TouchableOpacity>
        </View>
      </View>
      <TouchableOpacity style={styles.addExerciseBtn} onPress={() => router.push('/(tabs)/exercises')}>
        <Text style={styles.addExerciseText}>+ Add Exercise</Text>
      </TouchableOpacity>
      <DraggableFlatList
        data={exerciseList}
        onDragEnd={({ data }) => setExerciseList(data)}
        keyExtractor={(item) => item.exercise_id}
        renderItem={({ item, drag, isActive }: RenderItemParams<any>) => {
          const groupMeta = item.superset_group ? getSupersetGroupMeta(item.superset_group) : null;
          return (
          <Swipeable
            ref={(ref) => { swipeableRefs.current.set(item.exercise_id, ref); }}
            renderRightActions={(_, dragX) => renderDeleteAction(item.exercise_id, dragX)}
            rightThreshold={40}
            overshootRight={false}
          >
          <View
            style={[
              styles.exerciseCard,
              isActive && { opacity: 0.8 },
              groupMeta && { borderLeftWidth: 3, borderLeftColor: groupMeta.color },
            ]}
          >
            {/* Superset badge — shown when this exercise is part of a group */}
            {groupMeta && (
              <View style={[styles.supersetBadge, { backgroundColor: groupMeta.color }]}>
                <Ionicons name="flash" size={11} color="#1A1A1A" />
                <Text style={styles.supersetBadgeText}>{groupMeta.label}</Text>
              </View>
            )}
            <View style={styles.exerciseHeaderRow}>
              <TouchableOpacity style={{ flex: 1 }} onLongPress={drag} onPress={() => { setModalExercise(item); setModalVisible(true); }}>
                <Text style={styles.exerciseName}>{item.exercise_name}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setShowRpeInfo(true); Haptics.selectionAsync(); }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="help-circle-outline" size={20} color="#FF6200" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={item.sets}
              keyExtractor={(_, idx) => idx.toString()}
              ListHeaderComponent={
                <View>
                  {prefilledFromLastSession.has(item.exercise_id) && (
                    <Text style={styles.lastSessionHeader}>Last session</Text>
                  )}
                  <View style={styles.setColumnsHeaderRow}>
                    <View style={styles.setColumnsCheckSpacer} />
                    <Text style={styles.setColumnsSet}>Set</Text>
                    <Text style={styles.setColumnsLabel}>Weight ({weightUnit})</Text>
                    <Text style={styles.setColumnsLabel}>Reps</Text>
                    <Text style={styles.setColumnsLabel}>RPE</Text>
                    <View style={{ width: 28 }} />
                  </View>
                </View>
              }
              renderItem={({ item: set, index }) => (
                <View style={[styles.setRow, set.completed && styles.setRowComplete, set.is_warmup && styles.setRowWarmup]}>
                  {/* Tap-to-complete checkmark [Feature 3] */}
                  <TouchableOpacity
                    style={styles.setCompleteBtn}
                    onPress={() => toggleSetComplete(item.exercise_id, index)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons
                      name={set.completed ? 'checkmark-circle' : 'ellipse-outline'}
                      size={22}
                      color={set.completed ? '#4CAF50' : (set.is_warmup ? '#FF9800' : '#555')}
                    />
                  </TouchableOpacity>
                  {set.is_warmup ? (
                    <View style={styles.warmupNumBadge}>
                      <Text style={styles.warmupNumText}>🔥</Text>
                    </View>
                  ) : (
                    <Text style={styles.setNum}>Set {item.sets.filter((s: WorkoutSet) => !s.is_warmup).indexOf(set) + 1}</Text>
                  )}
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    value={set.weight.toString()}
                    onChangeText={(v) => updateSet(item.exercise_id, index, 'weight', Number(v))}
                    placeholder={weightUnit}
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
                  <TouchableOpacity
                    style={styles.setDeleteBtn}
                    onPress={() => removeSet(item.exercise_id, index)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="trash-outline" size={16} color="#666" />
                  </TouchableOpacity>
                </View>
              )}
              ListFooterComponent={
                <View style={styles.setFooterRow}>
                  <TouchableOpacity style={styles.warmupSetBtn} onPress={() => addWarmupSet(item.exercise_id)}>
                    <Text style={styles.warmupSetBtnText}>🔥 Warm Up</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.addSetBtn} onPress={() => addSet(item.exercise_id)}>
                    <Text style={styles.addSetText}>+ Add Set</Text>
                  </TouchableOpacity>
                </View>
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
              <View style={styles.restTimerRow}>
                <Text style={[styles.restTimer, restTime <= 5 && { color: '#F44336' }]}>
                  {restTime <= 5 ? '⚠️' : '⏱'} {restTime}s {restTime <= 5 ? '— go!' : 'rest…'}
                </Text>
                <TouchableOpacity style={styles.skipRestBtn} onPress={skipRestTimer}>
                  <Text style={styles.skipRestText}>Skip</Text>
                </TouchableOpacity>
              </View>
            )}
            {/* [PRO] Superset toggle button */}
            <TouchableOpacity
              style={[styles.supersetBtn, groupMeta && { backgroundColor: groupMeta.color, borderColor: groupMeta.color }]}
              onPress={() => toggleSuperset(item.exercise_id)}
              activeOpacity={0.75}
            >
              <Ionicons
                name={isPro ? 'flash' : 'lock-closed'}
                size={13}
                color={groupMeta ? '#1A1A1A' : '#B0B0B0'}
              />
              <Text style={[styles.supersetBtnText, groupMeta && styles.supersetBtnTextActive]}>
                {groupMeta ? groupMeta.label : 'Superset Group'}
              </Text>
            </TouchableOpacity>
          </View>
          </Swipeable>
        );
      }}
        ListEmptyComponent={<Text style={styles.emptyText}>No exercises added.</Text>}
        ListFooterComponent={
          <View style={styles.finishBtnFooter}>
            <TouchableOpacity style={styles.finishBtn} onPress={() => { void finishWorkout(); }} disabled={saving}>
              <Text style={styles.finishBtnText}>{saving ? 'Saving...' : 'Finish Workout'}</Text>
            </TouchableOpacity>
          </View>
        }
        contentContainerStyle={{ paddingBottom: 120 }}
      />

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

      {/* RPE Info Modal */}
      <Modal visible={showRpeInfo} transparent animationType="fade" onRequestClose={() => setShowRpeInfo(false)}>
        <TouchableOpacity style={styles.rpeInfoOverlay} activeOpacity={1} onPress={() => setShowRpeInfo(false)}>
          <View style={styles.rpeInfoContent}>
            <View style={styles.rpeInfoHeader}>
              <Text style={styles.rpeInfoTitle}>RPE Scale</Text>
              <Text style={styles.rpeInfoSubtitle}>Rate of Perceived Exertion</Text>
            </View>
            <ScrollView style={styles.rpeTableScroll}>
              <View style={styles.rpeTable}>
                <View style={[styles.rpeTableRow, styles.rpeTableHeader]}>
                  <Text style={[styles.rpeTableHeaderText, { width: 50 }]}>RPE</Text>
                  <Text style={[styles.rpeTableHeaderText, { flex: 1 }]}>Description</Text>
                  <Text style={[styles.rpeTableHeaderText, { width: 80 }]}>RIR Guide</Text>
                </View>
                {[
                  { rpe: 5, desc: 'Easy, sustainable', rir: '5+ reps left' },
                  { rpe: 6, desc: 'Moderate, controlled', rir: '4 reps left' },
                  { rpe: 7, desc: 'Challenging', rir: '3 reps left' },
                  { rpe: 8, desc: 'Hard, 2–3 more reps', rir: '2 reps left' },
                  { rpe: 9, desc: 'Very hard, 1 more rep', rir: '1 rep left' },
                  { rpe: 10, desc: 'Maximal, failure', rir: '0 reps left' },
                ].map((row) => (
                  <View key={row.rpe} style={styles.rpeTableRow}>
                    <Text style={[styles.rpeTableCell, { width: 50, fontWeight: '600' }]}>{row.rpe}</Text>
                    <Text style={[styles.rpeTableCell, { flex: 1 }]}>{row.desc}</Text>
                    <Text style={[styles.rpeTableCell, { width: 80, fontSize: 11 }]}>{row.rir}</Text>
                  </View>
                ))}
              </View>
            </ScrollView>
            <TouchableOpacity style={styles.rpeInfoCloseBtn} onPress={() => setShowRpeInfo(false)}>
              <Text style={styles.rpeInfoCloseBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
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
  exerciseHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
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
  lastSessionHeader: {
    color: '#FFD4B3',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
  },
  setColumnsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    opacity: 0.9,
  },
  setColumnsCheckSpacer: {
    width: 28,
    marginRight: 6,
  },
  setDeleteBtn: {
    marginLeft: 4,
    padding: 4,
  },
  setColumnsSet: {
    color: '#B0B0B0',
    width: 50,
    fontSize: 12,
    fontWeight: '700',
  },
  setColumnsLabel: {
    color: '#B0B0B0',
    width: 60,
    marginHorizontal: 4,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
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
  setFooterRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  addSetBtn: {
    flex: 1,
    backgroundColor: '#4CAF50',
    borderRadius: 6,
    alignItems: 'center',
    padding: 8,
  },
  addSetText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  warmupSetBtn: {
    flex: 1,
    backgroundColor: 'rgba(255,152,0,0.15)',
    borderRadius: 6,
    alignItems: 'center',
    padding: 8,
    borderWidth: 1,
    borderColor: '#FF9800',
  },
  warmupSetBtnText: {
    color: '#FF9800',
    fontWeight: 'bold',
  },
  setRowWarmup: {
    backgroundColor: 'rgba(255,152,0,0.08)',
    borderRadius: 6,
    borderLeftWidth: 2,
    borderLeftColor: '#FF9800',
  },
  warmupNumBadge: {
    width: 50,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  warmupNumText: {
    fontSize: 18,
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
  restTimerRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  skipRestBtn: {
    backgroundColor: '#2D2D2D',
    borderWidth: 1,
    borderColor: '#555',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  skipRestText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
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
  finishBtnFooter: {
    marginBottom: 16,
  },
  // ── RPE Info Modal ─────────────────────────────────────────────────────────
  rpeInfoOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  rpeInfoContent: {
    backgroundColor: '#252525',
    borderRadius: 12,
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
  },
  rpeInfoHeader: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#3A3A3A',
  },
  rpeInfoTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  rpeInfoSubtitle: {
    fontSize: 13,
    color: '#B0B0B0',
  },
  rpeTableScroll: {
    maxHeight: 300,
  },
  rpeTable: {
    padding: 16,
  },
  rpeTableRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#3A3A3A',
  },
  rpeTableHeader: {
    borderBottomWidth: 2,
    borderBottomColor: '#FF6200',
  },
  rpeTableHeaderText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FF6200',
  },
  rpeTableCell: {
    fontSize: 13,
    color: '#FFFFFF',
  },
  rpeInfoCloseBtn: {
    margin: 16,
    backgroundColor: '#FF6200',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  rpeInfoCloseBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
});
