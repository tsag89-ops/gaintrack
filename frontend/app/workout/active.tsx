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
import { useNativeAuthState } from '../../src/hooks/useAuth';
import { seedExercises } from '../../src/data/seedData';

const REST_SECONDS = 90;

const ActiveWorkoutScreen: React.FC = () => {
  const router = useRouter();
  const { name: nameParam } = useLocalSearchParams<{ name: string }>();
  const workoutTitle = nameParam || 'New Workout';
  const { currentWorkout, updateExerciseInWorkout, setCurrentWorkout, createWorkout, startWorkout } = useWorkoutStore();
  const { uid } = useNativeAuthState();
  const [exerciseList, setExerciseList] = useState(currentWorkout?.exercises || []);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [search, setSearch] = useState('');
    // Filter exercises not already in workout
    const availableExercises = seedExercises.filter(
      (ex) => !exerciseList.some((w) => w.exercise_id === ex.id) &&
        (ex.name.toLowerCase().includes(search.toLowerCase()) || ex.muscleGroup?.toLowerCase().includes(search.toLowerCase()))
    );

    // Add exercise to workout
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
      setSearch('');
    };
  const [restTime, setRestTime] = useState(0);
  const [activeRest, setActiveRest] = useState(false);
  const [saving, setSaving] = useState(false);

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

  // Start rest timer
  const startRest = () => {
    setRestTime(REST_SECONDS);
    setActiveRest(true);
  };

  // Auto-init if navigated directly from new.tsx with a name param
  useEffect(() => {
    if (!currentWorkout) {
      startWorkout(workoutTitle);
    }
  }, []);

  // Countdown logic
  useEffect(() => {
    if (activeRest && restTime > 0) {
      const interval = setInterval(() => {
        setRestTime((t) => t - 1);
      }, 1000);
      return () => clearInterval(interval);
    } else if (restTime === 0) {
      setActiveRest(false);
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

  // Finish workout: save to Firestore [PRO]
  const finishWorkout = async () => {
    if (!currentWorkout) return;
    if (!uid) {
      Alert.alert('Not signed in', 'Please log in to save workouts.');
      return;
    }
    const validExercises = exerciseList.filter((ex) => ex.sets.length > 0);
    if (validExercises.length === 0) {
      Alert.alert('Nothing to save', 'Add at least one exercise with a set before finishing.');
      return;
    }
    setSaving(true);
    try {
      const updatedWorkout = { ...currentWorkout, exercises: validExercises };
      await createWorkout(uid, updatedWorkout);
      Alert.alert('Workout saved!');
      setCurrentWorkout(null);
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
      <Text style={styles.title}>{currentWorkout.name || workoutTitle}</Text>
      <TouchableOpacity style={styles.addExerciseBtn} onPress={() => setAddModalVisible(true)}>
        <Text style={styles.addExerciseText}>+ Add Exercise</Text>
      </TouchableOpacity>
            {/* Add Exercise Modal */}
            <Modal
              visible={addModalVisible}
              animationType="slide"
              transparent
              onRequestClose={() => setAddModalVisible(false)}
            >
              <View style={styles.modalOverlay}>
                <View style={[styles.modalContent, { maxHeight: '80%' }]}> 
                  <Text style={styles.modalTitle}>Add Exercise</Text>
                  <TextInput value={search} onChangeText={setSearch} placeholder="Search exercises..." placeholderTextColor="#B0B0B0" style={{ backgroundColor: "#252525", color: "#fff", borderRadius: 8, padding: 10, marginBottom: 10 }} />
                  <ScrollView>
                    {availableExercises.length === 0 ? (
                      <Text style={{ color: '#fff', textAlign: 'center', marginTop: 20 }}>No exercises found.</Text>
                    ) : (
                      availableExercises.map((ex) => (
                        <TouchableOpacity
                          key={ex.id || ex.exercise_id}
                          style={styles.addExerciseRow}
                          onPress={() => handleAddExercise(ex)}
                        >
                          <Text style={styles.addExerciseName}>{ex.name}</Text>
                          <Text style={styles.addExerciseGroup}>{ex.muscleGroup || ex.muscle_groups?.[0]}</Text>
                
                        </TouchableOpacity>
                      ))
                    )}
                  </ScrollView>
                  <TouchableOpacity style={styles.closeModalBtn} onPress={() => setAddModalVisible(false)}>
                    <Text style={styles.closeModalText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
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
          <View style={[styles.exerciseCard, isActive && { opacity: 0.8 }]}> 
            <TouchableOpacity onLongPress={drag} onPress={() => { setModalExercise(item); setModalVisible(true); }}>
              <Text style={styles.exerciseName}>{item.exercise_name}</Text>
            </TouchableOpacity>
            <FlatList
              data={item.sets}
              keyExtractor={(_, idx) => idx.toString()}
              renderItem={({ item: set, index }) => (
                <View style={styles.setRow}>
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
            <TouchableOpacity style={styles.restBtn} onPress={startRest}>
              <Text style={styles.restBtnText}>Start Rest Timer</Text>
            </TouchableOpacity>
            {activeRest && (
              <Text style={styles.restTimer}>Rest: {restTime}s</Text>
            )}
          </View>
          </Swipeable>
        )}
        ListEmptyComponent={<Text style={styles.emptyText}>No exercises added.</Text>}
      />
      <TouchableOpacity style={styles.finishBtn} onPress={finishWorkout} disabled={saving}>
        <Text style={styles.finishBtnText}>{saving ? 'Saving...' : 'Finish Workout'}</Text>
      </TouchableOpacity>

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
  addExerciseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderRadius: 6,
    padding: 12,
    marginBottom: 8,
  },
  addExerciseName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  addExerciseGroup: {
    color: '#FFC107',
    fontSize: 14,
    marginLeft: 12,
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
});
