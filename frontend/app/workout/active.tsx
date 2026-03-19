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
import { useTimerAlerts } from '../../src/hooks/useTimerAlerts';
import { seedExercises } from '../../src/data/seedData';
import { useLanguage } from '../../src/context/LanguageContext';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { sendEngagementTelemetry, sendFirstWorkoutCompletedTelemetry, sendSupersetTelemetry } from '../../src/services/notifications';

// MUST be set at module level — without this, expo-notifications silently drops all
// notifications when the app is in the foreground (always the case during an active workout).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const DEFAULT_REST_SECONDS = 90;
const REST_TIMER_CHANNEL_ID = 'rest-timer-alerts';
const REST_DURATION_KEY = 'gaintrack_rest_duration';
const REST_TIMER_SOUND = 'rest-bell.wav';
const SUPERSET_COLORS = ['#FF6200', '#4CAF50', '#29B6F6', '#FFB300', '#EF5350', '#AB47BC'];
const WORKOUT_MILESTONES = [1, 5, 10, 25, 50, 100, 200];
const SUPERSET_FIRST_COMPLETION_PROMPT_KEY = 'gaintrack_superset_first_completion_prompted';
// Per-exercise last-session cache — written on every finish, read before scanning workout history
const EXERCISE_HISTORY_KEY = 'gaintrack_exercise_history';

const ActiveWorkoutScreen: React.FC = () => {
  const router = useRouter();
  const { t } = useLanguage();
  const { name: nameParam, programId, templateId, dayIndex } = useLocalSearchParams<{ name: string; programId?: string; templateId?: string; dayIndex?: string }>();
  const workoutTitle = nameParam || t('workoutActive.newWorkoutTitle');
  const quickWorkoutName = t('exercisesTab.quickWorkoutName');
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
    sendEngagementTelemetry({
      feature: 'workout_active',
      action: 'exercise_added',
      context: exerciseId,
    });
    if (previousSets.length > 0) {
      setPrefilledFromLastSession((prev) => new Set(prev).add(exerciseId));
    }
  }, []);
  const [restTime, setRestTime] = useState(0);
  const [activeRest, setActiveRest] = useState(false);
  // Wire haptic + bell alerts into the rest countdown.
  useTimerAlerts(restTime, activeRest);
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
  const restNotifIdsRef = useRef<string[]>([]);

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
    const ids = [...restNotifIdsRef.current];
    restNotifIdsRef.current = [];
    ids.forEach((id) => {
      Notifications.cancelScheduledNotificationAsync(id).catch(() => null);
    });
  };

  // Start rest timer and schedule a single completion bell.
  const startRestForExercise = async (exerciseId: string) => {
    const ex = exerciseList.find((e) => e.exercise_id === exerciseId);
    const secs = ex?.restSeconds ?? restSeconds;
    cancelRestNotif();
    setRestTime(secs);
    setActiveRest(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
            title: t('workoutActive.restOverTitle'),
            body: t('workoutActive.restOverMessage'),
          sound: REST_TIMER_SOUND,
          ...(Platform.OS === 'android' ? { android: { channelId: REST_TIMER_CHANNEL_ID } } : {}),
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: secs,
        },
      });
      restNotifIdsRef.current.push(id);
    } catch {}
  };

  // Back-compat wrapper used by auto-start (no exercise context needed at that callsite)
  const startRest = () => startRestForExercise('');

  // Save per-exercise rest override
  const saveRestOverride = () => {
    if (!restOverrideModal) return;
    const parsed = parseInt(restOverrideInput, 10);
    if (!parsed || parsed < 5 || parsed > 3600) {
      Alert.alert(t('workoutActive.invalidDurationTitle'), t('workoutActive.invalidDurationMessage'));
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
        label: t('workoutActive.groupLabel', { count: idx + 1 }),
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
      void sendSupersetTelemetry({
        eventType: 'superset_attempt_blocked',
        success: false,
        isPro: false,
        context: 'active_workout_toggle',
      });
        Alert.alert(t('workoutActive.proFeatureTitle'), t('workoutActive.proFeatureSupersetMessage'), [
          { text: t('workoutActive.notNowButton'), style: 'cancel' },
        {
            text: t('workoutActive.upgradeButton'),
          onPress: () => {
            void sendSupersetTelemetry({
              eventType: 'superset_paywall_view',
              success: true,
              isPro: false,
              context: 'active_workout_toggle',
            });
            router.push('/pro-paywall' as any);
          },
        },
      ]);
      return;
    }

    void sendSupersetTelemetry({
      eventType: 'superset_attempt',
      success: true,
      isPro: true,
      context: 'active_workout_toggle',
    });
    const exercise = exerciseList.find((ex) => ex.exercise_id === exerciseId);
    if (!exercise) return;

    if (exerciseList.length < 2) {
      Alert.alert(t('workoutActive.addAnotherExerciseTitle'), t('workoutActive.addAnotherExerciseMessage'));
      return;
    }

    const existingGroups = getSupersetGroupIds().filter((g) => g !== exercise.superset_group);
    const createGroupId = `ss_${Date.now()}`;
    const buttons: Array<{ text: string; style?: 'default' | 'cancel' | 'destructive'; onPress?: () => void }> = [
      {
          text: t('workoutActive.createNewGroupButton'),
        onPress: () => assignExerciseToSupersetGroup(exerciseId, createGroupId),
      },
      ...existingGroups.map((groupId) => ({
          text: t('workoutActive.addToGroupButton', { group: getSupersetGroupMeta(groupId).label }),
        onPress: () => assignExerciseToSupersetGroup(exerciseId, groupId),
      })),
    ];

    if (exercise.superset_group) {
      buttons.push({
          text: t('workoutActive.removeFromGroupButton', { group: getSupersetGroupMeta(exercise.superset_group).label }),
        style: 'destructive',
        onPress: () => removeExerciseFromSupersetGroup(exerciseId),
      });
    }

      buttons.push({ text: t('common.cancel'), style: 'cancel' });

    Alert.alert(
        t('workoutActive.supersetGroupTitle'),
        t('workoutActive.supersetGroupMessage'),
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
    sendEngagementTelemetry({
      feature: 'workout_active',
      action: 'screen_view',
      context: 'active_workout',
    });

    Notifications.requestPermissionsAsync().catch(() => null);

    // Create a dedicated high-importance notification channel for rest timer bells (Android 8+).
    // Without an explicit channel, Android may suppress sound entirely.
    if (Platform.OS === 'android') {
      Notifications.setNotificationChannelAsync(REST_TIMER_CHANNEL_ID, {
        name: t('workoutActive.restTimerChannelName'),
        importance: Notifications.AndroidImportance.HIGH,
        sound: REST_TIMER_SOUND,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF6200',
      }).catch(() => null);
    }

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

  // Countdown — tick down every second; useTimerAlerts handles haptics and bell at 3-2-1 / 0.
  useEffect(() => {
    if (activeRest && restTime > 0) {
      const interval = setInterval(() => {
        setRestTime((prev) => prev - 1);
      }, 1000);
      return () => clearInterval(interval);
    } else if (activeRest && restTime === 0) {
      setActiveRest(false);
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
          t('workoutActive.missingValuesTitle'),
          t('workoutActive.missingValuesMessage'),
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
          {t('workoutActive.deleteExerciseAction')}
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

  const summarizeCompletedSupersets = (exercises: WorkoutExercise[]): { groupsCount: number; exercisesCount: number } => {
    const grouped = new Map<string, WorkoutExercise[]>();
    for (const ex of exercises) {
      if (!ex.superset_group) continue;
      const list = grouped.get(ex.superset_group) ?? [];
      list.push(ex);
      grouped.set(ex.superset_group, list);
    }

    let groupsCount = 0;
    let exercisesCount = 0;
    grouped.forEach((groupExercises) => {
      if (groupExercises.length < 2) return;
      const exercisesWithCompletedSet = groupExercises.filter((ex) =>
        ex.sets.some((set) => set.completed),
      );
      if (exercisesWithCompletedSet.length < 2) return;
      groupsCount += 1;
      exercisesCount += exercisesWithCompletedSet.length;
    });

    return { groupsCount, exercisesCount };
  };

  // Finish workout: save to Firestore, detect PRs, stamp duration, prompt template [PRO]
  const finishWorkout = async (skipIncompleteCheck = false, overrideExerciseList?: WorkoutExercise[]) => {
    if (!currentWorkout) return;
    if (!uid) {
      Alert.alert(t('workoutActive.notSignedInTitle'), t('workoutActive.notSignedInMessage'));
      return;
    }

    // Check for incomplete sets (have reps/weight filled but not marked complete)
    if (!skipIncompleteCheck) {
      const incompleteSets = exerciseList.reduce((count, ex) => {
        return count + ex.sets.filter((s) => !s.completed && (Number(s.reps) > 0 || Number(s.weight) > 0)).length;
      }, 0);
      if (incompleteSets > 0) {
        const suffix = incompleteSets > 1 ? t('workoutActive.pluralSuffix') : '';
        const message = incompleteSets > 1 ? t('workoutActive.areVerb') : t('workoutActive.isVerb');
        Alert.alert(
          t('workoutActive.incompleteSetsTitle'),
          t('workoutActive.incompleteSetsMessage', { count: incompleteSets, suffix, message }),
          [
            { text: t('workoutActive.keepEditingButton'), style: 'cancel' },
            {
              text: t('workoutActive.discardIncompleteAndFinishButton'),
              style: 'destructive',
              onPress: () => {
                // Build filtered list synchronously — avoids stale closure / setTimeout race
                const filteredList = exerciseList.map((ex) => ({
                  ...ex,
                  sets: ex.sets.filter((s) => s.completed),
                }));
                setExerciseList(filteredList); // keep UI in sync
                finishWorkout(true, filteredList);
              },
            },
          ],
        );
        return;
      }
    }

    const validExercises = (overrideExerciseList ?? exerciseList).filter((ex) => ex.sets.length > 0);
    const hasValidSets = validExercises.some((exercise) =>
      exercise.sets.some(
        (set) => (Number(set.reps) || 0) > 0 && (Number(set.weight) || 0) >= 0,
      ),
    );

    // Incomplete sessions should not trigger template save/update prompts.
    const hasIncompleteExercise = validExercises.some((exercise) => {
      const meaningfulSets = exercise.sets.filter(
        (set) => !set.is_warmup && ((Number(set.reps) || 0) > 0 || (Number(set.weight) || 0) > 0),
      );
      if (meaningfulSets.length === 0) return false;
      return meaningfulSets.some((set) => !set.completed);
    });

    if (!hasValidSets || validExercises.length === 0) {
      Alert.alert(
        t('workoutActive.emptyWorkoutTitle'),
        t('workoutActive.emptyWorkoutMessage'),
        [
          { text: t('workoutActive.keepEditingButton'), style: 'cancel' },
          {
            text: t('workoutActive.discardWorkoutButton'),
            style: 'destructive',
            onPress: async () => {
              sendEngagementTelemetry({
                feature: 'workout_active',
                action: 'empty_workout_discarded',
                context: currentWorkout?.name || workoutTitle || quickWorkoutName,
              });
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
    sendEngagementTelemetry({
      feature: 'workout_active',
      action: 'finish_attempted',
      context: skipIncompleteCheck ? 'skip_incomplete_true' : 'skip_incomplete_false',
    });
    cancelRestNotif();
    try {
      let priorWorkoutCount = 0;
      try {
        const rawWorkouts = await AsyncStorage.getItem('gaintrack_workouts');
        const parsed = rawWorkouts ? JSON.parse(rawWorkouts) : [];
        if (Array.isArray(parsed)) {
          priorWorkoutCount = parsed.filter((w: any) => typeof w?.workout_id === 'string').length;
        }
      } catch {
        priorWorkoutCount = 0;
      }

      // Calculate duration excluding paused time
      const totalPausedTime = timerPaused ? pausedTimeRef.current + (Date.now() - pauseStartRef.current) : pausedTimeRef.current;
      const durationSeconds = Math.floor((Date.now() - startedAtRef.current - totalPausedTime) / 1000);
      const updatedWorkout = { ...currentWorkout, exercises: validExercises, duration: durationSeconds };
      const savedWorkout = await createWorkout(uid, updatedWorkout);
      const isOffline = savedWorkout.workout_id.startsWith('offline_');

      sendEngagementTelemetry({
        feature: 'workout_active',
        action: isOffline ? 'workout_saved_offline' : 'workout_saved',
        context: savedWorkout.workout_id,
      });

      const supersetSummary = summarizeCompletedSupersets(validExercises);
      const hasCompletedSuperset = supersetSummary.groupsCount > 0;

      if (hasCompletedSuperset) {
        void sendSupersetTelemetry({
          eventType: 'superset_completed_workout',
          success: true,
          isPro,
          workoutId: savedWorkout.workout_id,
          groupsCount: supersetSummary.groupsCount,
          exercisesCount: supersetSummary.exercisesCount,
          context: 'active_workout_finish',
        });
      }

      if (!isOffline && priorWorkoutCount === 0) {
        await sendFirstWorkoutCompletedTelemetry({
          workoutId: savedWorkout.workout_id,
          completedAt: new Date().toISOString(),
        });
      }

      if (!isOffline) {
        const completedCount = priorWorkoutCount + 1;
        if (WORKOUT_MILESTONES.includes(completedCount)) {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          Alert.alert(
            t('workoutActive.milestoneUnlockedTitle'),
            t('workoutActive.milestoneUnlockedMessage', {
              count: completedCount,
              suffix: completedCount > 1 ? t('workoutActive.pluralSuffix') : '',
            }),
          );
        }
      }

      if (hasCompletedSuperset) {
        const hasSeenFirstSupersetPrompt = await AsyncStorage.getItem(SUPERSET_FIRST_COMPLETION_PROMPT_KEY);
        if (!hasSeenFirstSupersetPrompt) {
          await AsyncStorage.setItem(SUPERSET_FIRST_COMPLETION_PROMPT_KEY, '1');
          void sendSupersetTelemetry({
            eventType: 'superset_first_completion_prompt_shown',
            success: true,
            isPro,
            workoutId: savedWorkout.workout_id,
            groupsCount: supersetSummary.groupsCount,
            exercisesCount: supersetSummary.exercisesCount,
            context: 'active_workout_finish',
          });
          Alert.alert(
            t('workoutActive.supersetMilestoneTitle'),
            t('workoutActive.supersetMilestoneMessage'),
            [
              {
                text: t('workoutActive.viewProgressButton'),
                onPress: () => router.push('/(tabs)/progress' as any),
              },
              { text: t('workoutActive.laterButton'), style: 'cancel' },
            ],
          );
        }
      }

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
          if (!currMap.has(id)) lines.push(t('workoutActive.templateDiffRemoved', { name: orig.exercise_name }));
        }
        for (const [id, curr] of currMap) {
          if (!origMap.has(id)) {
            lines.push(t('workoutActive.templateDiffAdded', { name: curr.exercise_name }));
          } else {
            const orig = origMap.get(id)!;
            const origSets: any[] = orig.sets ?? [];
            const currSets: any[] = curr.sets ?? [];
            if (origSets.length !== currSets.length) {
              lines.push(t('workoutActive.templateDiffSetCount', {
                name: curr.exercise_name,
                from: origSets.length,
                to: currSets.length,
              }));
            } else {
              const setChanges: string[] = [];
              currSets.forEach((cs, i) => {
                const os = origSets[i];
                if (!os) return;
                const parts: string[] = [];
                if (Number(cs.reps) !== Number(os.reps)) {
                  parts.push(t('workoutActive.templateDiffRepsChange', { from: os.reps, to: cs.reps }));
                }
                if (Number(cs.weight) !== Number(os.weight)) parts.push(`${os.weight}→${cs.weight}${weightUnit}`);
                if ((cs.rpe ?? '') !== (os.rpe ?? '')) {
                  parts.push(t('workoutActive.templateDiffRpeChange', { from: os.rpe ?? '-', to: cs.rpe ?? '-' }));
                }
                if (parts.length) {
                  setChanges.push(t('workoutActive.templateDiffSetChanges', { count: i + 1, changes: parts.join(', ') }));
                }
              });
              if (setChanges.length) {
                lines.push(t('workoutActive.templateDiffExerciseChanges', {
                  name: curr.exercise_name,
                  changes: setChanges.join('; '),
                }));
              }
            }
          }
        }
        return lines.length ? lines.join('\n') : t('workoutActive.templateDiffNoChanges');
      };

      if (isOffline) {
        Alert.alert(
          t('workoutActive.savedOfflineTitle'),
          t('workoutActive.savedOfflineMessage'),
          [{ text: t('workoutActive.okButton'), style: 'cancel' }],
        );
      } else if (hasIncompleteExercise) {
        if (newPRs.length > 0) {
          const suffix = newPRs.length > 1 ? t('workoutActive.pluralSuffix') : '';
          Alert.alert(
            t('workoutActive.prTitle', { count: newPRs.length, suffix }),
            t('workoutActive.prMessage', { list: newPRs.join(', ') }),
            [{ text: t('workoutActive.okButton') }],
          );
        }
      } else if (templateId) {
        // Workout was loaded from a template — ask to update it instead of saving a new one
        const tmplRaw = await AsyncStorage.getItem('gaintrack_templates');
        const allTemplates: any[] = tmplRaw ? JSON.parse(tmplRaw) : [];
        const sourceTemplate = allTemplates.find((t: any) => t.id === templateId);
        const prLine = newPRs.length > 0 ? `${t('workoutActive.prMedalLine', { list: newPRs.join(', ') })}\n\n` : '';
        if (sourceTemplate) {
          const diff = buildTemplateDiff(sourceTemplate.exercises ?? [], buildTemplateExercises());
          const suffix = newPRs.length > 1 ? t('workoutActive.pluralSuffix') : '';
          Alert.alert(
            newPRs.length > 0 ? t('workoutActive.prTitle', { count: newPRs.length, suffix }) : t('workoutActive.workoutSavedTitle'),
            t('workoutActive.updateTemplateMessage', {
              message: prLine,
              name: sourceTemplate.name,
              diff,
            }),
            [
              {
                text: t('workoutActive.updateTemplateButton'),
                onPress: () => saveTemplateExercises(templateId, buildTemplateExercises()),
              },
              { text: t('workoutActive.keepOriginalButton'), style: 'cancel' },
            ],
          );
        } else {
          // Template no longer exists — just show PR info if any
          if (newPRs.length > 0) {
            const suffix = newPRs.length > 1 ? t('workoutActive.pluralSuffix') : '';
            Alert.alert(
              t('workoutActive.prTitle', { count: newPRs.length, suffix }),
              t('workoutActive.prMessage', { list: newPRs.join(', ') }),
              [{ text: t('workoutActive.okButton') }],
            );
          }
        }
      } else {
        // Regular workout — offer to save as a new template
        const suffix = newPRs.length > 1 ? t('workoutActive.pluralSuffix') : '';
        const title = newPRs.length > 0
          ? t('workoutActive.prTitle', { count: newPRs.length, suffix })
          : t('workoutActive.workoutSavedTitle');
        const body = newPRs.length > 0
          ? t('workoutActive.saveAsTemplateWithPrMessage', { message: t('workoutActive.prMessage', { list: newPRs.join(', ') }) })
          : t('workoutActive.saveAsTemplateMessage');
        Alert.alert(title, body, [
          {
            text: t('workoutActive.saveTemplateButton'),
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
              sendEngagementTelemetry({
                feature: 'workout_active',
                action: 'template_saved',
                context: currentWorkout.name,
              });
            },
          },
          { text: t('workoutActive.skipButton'), style: 'cancel' },
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
      sendEngagementTelemetry({
        feature: 'workout_active',
        action: 'workout_save_failed',
        context: String(e),
      });
      console.error('Save workout error:', e);
      Alert.alert(t('workoutActive.errorSavingWorkoutTitle'), t('workoutActive.errorSavingWorkoutMessage', { message: String(e) }));
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
      <TouchableOpacity
        style={styles.addExerciseBtn}
        onPress={() => {
          sendEngagementTelemetry({
            feature: 'workout_active',
            action: 'add_exercise_opened',
            context: currentWorkout?.name || workoutTitle || quickWorkoutName,
          });
          router.push({
            pathname: '/(tabs)/exercises',
            params: {
              fromWorkout: '1',
              workoutName: currentWorkout?.name || workoutTitle || quickWorkoutName,
            },
          });
        }}
      >
        <Text style={styles.addExerciseText}>{t('workoutActive.addExerciseButton')}</Text>
      </TouchableOpacity>
      <DraggableFlatList
        data={exerciseList}
        onDragEnd={({ data }) => setExerciseList(data)}
        keyExtractor={(item) => item.exercise_id}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
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
              scrollEnabled={false}
              nestedScrollEnabled={false}
              ListHeaderComponent={
                <View>
                  {prefilledFromLastSession.has(item.exercise_id) && (
                    <Text style={styles.lastSessionHeader}>{t('workoutActive.lastSessionLabel')}</Text>
                  )}
                  <View style={styles.setColumnsHeaderRow}>
                    <View style={styles.setColumnsCheckSpacer} />
                    <Text style={styles.setColumnsSet}>{t('workoutActive.setHeader')}</Text>
                    <Text style={styles.setColumnsLabel}>{t('workoutActive.weightHeader', { unit: weightUnit })}</Text>
                    <Text style={styles.setColumnsLabel}>{t('workoutActive.repsHeader')}</Text>
                    <Text style={styles.setColumnsLabel}>{t('workoutActive.rpeHeader')}</Text>
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
                    <Text style={styles.setNum}>
                      {t('workoutActive.setNumberLabel', { count: item.sets.filter((s: WorkoutSet) => !s.is_warmup).indexOf(set) + 1 })}
                    </Text>
                  )}
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    rejectResponderTermination={false}
                    value={set.weight.toString()}
                    onChangeText={(v) => updateSet(item.exercise_id, index, 'weight', Number(v))}
                    placeholder={weightUnit}
                    placeholderTextColor="#B0B0B0"
                  />
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    rejectResponderTermination={false}
                    value={set.reps.toString()}
                    onChangeText={(v) => updateSet(item.exercise_id, index, 'reps', Number(v))}
                    placeholder={t('workoutActive.repsPlaceholder')}
                    placeholderTextColor="#B0B0B0"
                  />
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    rejectResponderTermination={false}
                    value={set.rpe?.toString() || ''}
                    onChangeText={(v) => updateSet(item.exercise_id, index, 'rpe', Number(v))}
                    placeholder={t('workoutActive.rpePlaceholder')}
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
                    <Text style={styles.warmupSetBtnText}>{t('workoutActive.warmupButton')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.addSetBtn} onPress={() => addSet(item.exercise_id)}>
                    <Text style={styles.addSetText}>{t('workoutActive.addSetButton')}</Text>
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
                <Text style={styles.restBtnText}>{t('workoutActive.restButton')}</Text>
                {item.restSeconds != null && (
                  <View style={styles.restOverrideBadge}>
                    <Text style={styles.restOverrideBadgeText}>
                      {item.restSeconds >= 60 ? `${item.restSeconds / 60}m` : `${item.restSeconds}s`}
                    </Text>
                  </View>
                )}
                {item.restSeconds == null && (
                  <Text style={styles.restBtnSubtext}>{t('workoutActive.secondsShort', { count: restSeconds })}</Text>
                )}
              </View>
            </TouchableOpacity>
            {activeRest && (
              <View style={styles.restTimerRow}>
                <Text style={[styles.restTimer, restTime <= 5 && { color: '#F44336' }]}>
                  {restTime <= 5
                    ? t('workoutActive.restCountdownCritical', { count: restTime, message: t('workoutActive.goMessage') })
                    : t('workoutActive.restCountdownNormal', { count: restTime, message: t('workoutActive.restMessage') })}
                </Text>
                <TouchableOpacity style={styles.skipRestBtn} onPress={skipRestTimer}>
                  <Text style={styles.skipRestText}>{t('workoutActive.skipButton')}</Text>
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
                {groupMeta ? groupMeta.label : t('workoutActive.supersetGroupButton')}
              </Text>
            </TouchableOpacity>
          </View>
          </Swipeable>
        );
      }}
        ListEmptyComponent={<Text style={styles.emptyText}>{t('workoutActive.noExercisesAdded')}</Text>}
        ListFooterComponent={
          <View style={styles.finishBtnFooter}>
            <TouchableOpacity style={styles.finishBtn} onPress={() => {
              sendEngagementTelemetry({
                feature: 'workout_active',
                action: 'finish_cta_tapped',
                context: currentWorkout?.name || workoutTitle || quickWorkoutName,
              });
              void finishWorkout();
            }} disabled={saving}>
              <Text style={styles.finishBtnText}>{saving ? t('common.saving') : t('workoutActive.finishWorkoutButton')}</Text>
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
            <Text style={styles.modalTitle}>{t('workoutActive.restDurationTitle')}</Text>
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
              placeholder={t('workoutActive.secondsPlaceholder')}
              placeholderTextColor="#B0B0B0"
            />
            <TouchableOpacity style={styles.restSaveBtn} onPress={saveRestOverride}>
              <Text style={styles.restSaveBtnText}>{t('workoutActive.setOverrideButton')}</Text>
            </TouchableOpacity>
            {restOverrideModal && exerciseList.find((e) => e.exercise_id === restOverrideModal.exerciseId)?.restSeconds != null && (
              <TouchableOpacity
                style={styles.restClearBtn}
                onPress={() => clearRestOverride(restOverrideModal.exerciseId)}
              >
                <Text style={styles.restClearBtnText}>{t('workoutActive.clearOverrideButton', { count: restSeconds })}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.closeModalBtn} onPress={() => setRestOverrideModal(null)}>
              <Text style={styles.closeModalText}>{t('common.cancel')}</Text>
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
                <Text style={styles.closeModalText}>{t('common.close')}</Text>
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
              <Text style={styles.rpeInfoTitle}>{t('workoutActive.rpeScaleTitle')}</Text>
              <Text style={styles.rpeInfoSubtitle}>{t('workoutActive.rpeScaleSubtitle')}</Text>
            </View>
            <ScrollView style={styles.rpeTableScroll}>
              <View style={styles.rpeTable}>
                <View style={[styles.rpeTableRow, styles.rpeTableHeader]}>
                  <Text style={[styles.rpeTableHeaderText, { width: 50 }]}>{t('workoutActive.rpeHeader')}</Text>
                  <Text style={[styles.rpeTableHeaderText, { flex: 1 }]}>{t('workoutActive.descriptionHeader')}</Text>
                  <Text style={[styles.rpeTableHeaderText, { width: 80 }]}>{t('workoutActive.rirGuideHeader')}</Text>
                </View>
                {[
                  { rpe: 5, desc: t('workoutActive.rpeDesc5'), rir: t('workoutActive.rpeRir5') },
                  { rpe: 6, desc: t('workoutActive.rpeDesc6'), rir: t('workoutActive.rpeRir6') },
                  { rpe: 7, desc: t('workoutActive.rpeDesc7'), rir: t('workoutActive.rpeRir7') },
                  { rpe: 8, desc: t('workoutActive.rpeDesc8'), rir: t('workoutActive.rpeRir8') },
                  { rpe: 9, desc: t('workoutActive.rpeDesc9'), rir: t('workoutActive.rpeRir9') },
                  { rpe: 10, desc: t('workoutActive.rpeDesc10'), rir: t('workoutActive.rpeRir10') },
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
              <Text style={styles.rpeInfoCloseBtnText}>{t('common.close')}</Text>
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
            {t('workoutActive.exerciseRemovedToast', { name: pendingDelete.exercise.exercise_name })}
          </Text>
          <View style={styles.undoCountdownBadge}>
            <Text style={styles.undoCountdownText}>{undoCountdown}</Text>
          </View>
          <TouchableOpacity style={styles.undoBtn} onPress={handleUndo} activeOpacity={0.8}>
            <Text style={styles.undoBtnText}>{t('workoutActive.undoButton')}</Text>
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
