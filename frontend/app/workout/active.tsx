import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import DraggableFlatList, { RenderItemParams } from 'react-native-draggable-flatlist';
import { useWorkoutStore } from '../../src/store/workoutStore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { WorkoutExercise, WorkoutSet } from '../../src/types';
import { ExerciseVideo } from '../../src/components/ExerciseVideo';

const REST_SECONDS = 90;

const ActiveWorkoutScreen: React.FC = () => {
  const router = useRouter();
  const { currentWorkout, updateExerciseInWorkout, setCurrentWorkout } = useWorkoutStore();
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


  // Modal state for exercise video/instructions
  const [modalVisible, setModalVisible] = useState(false);
  const [modalExercise, setModalExercise] = useState<WorkoutExercise | null>(null);

  // Start rest timer
  const startRest = () => {
    setRestTime(REST_SECONDS);
    setActiveRest(true);
  };

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

  // Remove an exercise
  const removeExercise = (exerciseId: string) => {
    const updated = exerciseList.filter((ex) => ex.exercise_id !== exerciseId);
    setExerciseList(updated);
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

  // Finish workout: save to AsyncStorage and Firestore
  const finishWorkout = async () => {
    if (!currentWorkout) return;
    setSaving(true);
    try {
      // Save to AsyncStorage
      const prev = await AsyncStorage.getItem('gaintrack_workouts');
      const workouts = prev ? JSON.parse(prev) : [];
      const updatedWorkout = { ...currentWorkout, exercises: exerciseList };
      await AsyncStorage.setItem('gaintrack_workouts', JSON.stringify([...workouts, updatedWorkout]));
      // [PRO] Save to Firestore here
      // await saveWorkoutToFirestore(updatedWorkout);
      Alert.alert('Workout saved!');
      setCurrentWorkout(null);
      router.replace('/');
    } catch (e) {
      Alert.alert('Error saving workout');
    } finally {
      setSaving(false);
    }
  };

  if (!currentWorkout) {
    return (
      <View style={styles.container}>
        <Text style={styles.emptyText}>No active workout. Start a workout from the main screen.</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Text style={styles.title}>{currentWorkout.name || 'Active Workout'}</Text>
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
                  <TextInput value={search} onChangeText={setSearch} placeholder="Search exercises..." placeholderTextColor="#6B7280" style={{ backgroundColor: "#1F2937", color: "#fff", borderRadius: 8, padding: 10, marginBottom: 10 }} />
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
          <View style={[styles.exerciseCard, isActive && { opacity: 0.8 }]}> 
            <TouchableOpacity onLongPress={drag} onPress={() => { setModalExercise(item); setModalVisible(true); }}>
              <Text style={styles.exerciseName}>{item.exercise_name}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.removeBtn} onPress={() => removeExercise(item.exercise_id)}>
              <Text style={styles.removeBtnText}>Remove</Text>
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
                    placeholderTextColor="#888"
                  />
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    value={set.reps.toString()}
                    onChangeText={(v) => updateSet(item.exercise_id, index, 'reps', Number(v))}
                    placeholder="reps"
                    placeholderTextColor="#888"
                  />
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    value={set.rpe?.toString() || ''}
                    onChangeText={(v) => updateSet(item.exercise_id, index, 'rpe', Number(v))}
                    placeholder="RPE"
                    placeholderTextColor="#888"
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
    </KeyboardAvoidingView>
  );
};

export default ActiveWorkoutScreen;

// Helper functions to get videoUrl/instructions by exercise name
import { seedExercises } from '../../src/data/seedData';
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
    backgroundColor: '#121212',
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
    backgroundColor: '#1F2937',
    borderRadius: 10,
    padding: 16,
    marginBottom: 20,
  },
  exerciseName: {
    color: '#FBBF24',
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
    backgroundColor: '#111827',
    color: '#fff',
    borderRadius: 6,
    padding: 6,
    marginHorizontal: 4,
    width: 60,
    borderWidth: 1,
    borderColor: '#374151',
    textAlign: 'center',
  },
  addSetBtn: {
    marginTop: 6,
    backgroundColor: '#10B981',
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
    backgroundColor: '#3B82F6',
    borderRadius: 6,
    alignItems: 'center',
    padding: 8,
  },
  restBtnText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  restTimer: {
    color: '#FBBF24',
    fontWeight: 'bold',
    fontSize: 16,
    marginTop: 6,
    textAlign: 'center',
  },
  finishBtn: {
    backgroundColor: '#F59E42',
    borderRadius: 8,
    alignItems: 'center',
    padding: 16,
    marginTop: 16,
  },
  finishBtnText: {
    color: '#121212',
    fontWeight: 'bold',
    fontSize: 18,
  },
  emptyText: {
    color: '#888',
    textAlign: 'center',
    marginTop: 40,
  },
  removeBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: '#EF4444',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    zIndex: 2,
  },
  removeBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 13,
  },
  addExerciseBtn: {
    backgroundColor: '#10B981',
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
    backgroundColor: '#111827',
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
    color: '#FBBF24',
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
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 0,
    overflow: 'hidden',
  },
  modalTitle: {
    color: '#FBBF24',
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
    backgroundColor: '#10B981',
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
