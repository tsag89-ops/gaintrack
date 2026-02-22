import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { workoutApi } from '../../src/services/api';
import { Workout, WorkoutExercise, WorkoutSet } from '../../src/types';
import { formatDate, calculateWorkoutVolume, formatVolume, getCategoryColor } from '../../src/utils/helpers';
import { SetLoggerSheet } from '../../src/components/SetLoggerSheet';

export default function WorkoutDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedExercise, setSelectedExercise] = useState<WorkoutExercise | null>(null);
  const [showSetLogger, setShowSetLogger] = useState(false);

  const fetchWorkout = useCallback(async () => {
    if (!id) return;
    try {
      setIsLoading(true);
      const data = await workoutApi.get(id);
      setWorkout(data);
    } catch (error) {
      console.error('Error fetching workout:', error);
      Alert.alert('Error', 'Failed to load workout');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchWorkout();
  }, [fetchWorkout]);

  const handleDeleteWorkout = () => {
    Alert.alert('Delete Workout', 'Are you sure you want to delete this workout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await workoutApi.delete(id!);
            router.back();
          } catch (error) {
            console.error('Error deleting workout:', error);
            Alert.alert('Error', 'Failed to delete workout');
          }
        },
      },
    ]);
  };

  const handleExercisePress = (exercise: WorkoutExercise) => {
    setSelectedExercise(exercise);
    setShowSetLogger(true);
  };

  const handleSaveSets = async (sets: WorkoutSet[]) => {
    if (!workout || !selectedExercise) return;

    const updatedExercises = workout.exercises.map((ex) =>
      ex.exercise_id === selectedExercise.exercise_id ? { ...ex, sets } : ex
    );

    try {
      const updatedWorkout = await workoutApi.update(workout.workout_id, {
        ...workout,
        exercises: updatedExercises,
      });
      setWorkout(updatedWorkout);
    } catch (error) {
      console.error('Error saving sets:', error);
      Alert.alert('Error', 'Failed to save sets');
    }
  };

  const handleRequestWarmup = async (workingWeight: number) => {
    if (!selectedExercise) return;
    try {
      const result = await workoutApi.getWarmupSets(workingWeight, selectedExercise.exercise_name);
      const warmupSets: WorkoutSet[] = result.warmup_sets.map((s: any) => ({
        set_number: s.set_number,
        weight: s.weight,
        reps: s.reps,
        is_warmup: true,
        rpe: undefined,
      }));

      // Add warmup sets to the beginning
      const existingSets = selectedExercise.sets.filter(s => !s.is_warmup);
      const allSets = [...warmupSets, ...existingSets].map((s, idx) => ({
        ...s,
        set_number: idx + 1,
      }));

      handleSaveSets(allSets);
      setSelectedExercise({ ...selectedExercise, sets: allSets });
    } catch (error) {
      console.error('Error getting warmup sets:', error);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#10B981" />
        </View>
      </SafeAreaView>
    );
  }

  if (!workout) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Workout not found</Text>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backLink}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const volume = calculateWorkoutVolume(workout.exercises);
  const totalSets = workout.exercises.reduce(
    (acc, ex) => acc + ex.sets.filter(s => !s.is_warmup).length,
    0
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.headerTitle}>
          <Text style={styles.workoutName}>{workout.name}</Text>
          <Text style={styles.workoutDate}>{formatDate(workout.date)}</Text>
        </View>
        <TouchableOpacity onPress={handleDeleteWorkout} style={styles.deleteButton}>
          <Ionicons name="trash-outline" size={24} color="#EF4444" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
        {/* Stats Card */}
        <View style={styles.statsCard}>
          <View style={styles.statItem}>
            <Ionicons name="barbell-outline" size={22} color="#10B981" />
            <Text style={styles.statValue}>{workout.exercises.length}</Text>
            <Text style={styles.statLabel}>Exercises</Text>
          </View>
          <View style={styles.statItem}>
            <Ionicons name="layers-outline" size={22} color="#3B82F6" />
            <Text style={styles.statValue}>{totalSets}</Text>
            <Text style={styles.statLabel}>Sets</Text>
          </View>
          <View style={styles.statItem}>
            <Ionicons name="trending-up-outline" size={22} color="#F59E0B" />
            <Text style={styles.statValue}>{formatVolume(volume)}</Text>
            <Text style={styles.statLabel}>Volume</Text>
          </View>
          {workout.duration_minutes && (
            <View style={styles.statItem}>
              <Ionicons name="time-outline" size={22} color="#8B5CF6" />
              <Text style={styles.statValue}>{workout.duration_minutes}</Text>
              <Text style={styles.statLabel}>Minutes</Text>
            </View>
          )}
        </View>

        {/* Exercises */}
        <Text style={styles.sectionTitle}>Exercises</Text>
        {workout.exercises.map((exercise, index) => (
          <TouchableOpacity
            key={index}
            style={styles.exerciseCard}
            onPress={() => handleExercisePress(exercise)}
          >
            <View style={styles.exerciseHeader}>
              <Text style={styles.exerciseName}>{exercise.exercise_name}</Text>
              <Ionicons name="create-outline" size={20} color="#6B7280" />
            </View>

            {exercise.sets.length > 0 ? (
              <View style={styles.setsTable}>
                <View style={styles.setsHeaderRow}>
                  <Text style={[styles.setHeaderCell, { flex: 0.5 }]}>Set</Text>
                  <Text style={[styles.setHeaderCell, { flex: 1 }]}>Weight</Text>
                  <Text style={[styles.setHeaderCell, { flex: 1 }]}>Reps</Text>
                  <Text style={[styles.setHeaderCell, { flex: 0.5 }]}>RPE</Text>
                </View>
                {exercise.sets.map((set, setIdx) => (
                  <View
                    key={setIdx}
                    style={[styles.setRow, set.is_warmup && styles.warmupSetRow]}
                  >
                    <Text style={[styles.setCell, { flex: 0.5 }]}>
                      {set.is_warmup ? 'W' : set.set_number}
                    </Text>
                    <Text style={[styles.setCell, { flex: 1 }]}>{set.weight} lbs</Text>
                    <Text style={[styles.setCell, { flex: 1 }]}>{set.reps}</Text>
                    <Text style={[styles.setCell, { flex: 0.5 }]}>{set.rpe || '-'}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.noSetsText}>No sets logged - tap to add</Text>
            )}
          </TouchableOpacity>
        ))}

        {workout.notes && (
          <View style={styles.notesCard}>
            <Text style={styles.notesTitle}>Notes</Text>
            <Text style={styles.notesText}>{workout.notes}</Text>
          </View>
        )}
      </ScrollView>

      <SetLoggerSheet
        visible={showSetLogger}
        exerciseName={selectedExercise?.exercise_name || ''}
        sets={selectedExercise?.sets || []}
        onClose={() => setShowSetLogger(false)}
        onSave={handleSaveSets}
        onRequestWarmup={handleRequestWarmup}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: '#FFFFFF',
    fontSize: 18,
    marginBottom: 16,
  },
  backLink: {
    color: '#10B981',
    fontSize: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    flex: 1,
    marginLeft: 8,
  },
  workoutName: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  workoutDate: {
    color: '#10B981',
    fontSize: 12,
    marginTop: 2,
  },
  deleteButton: {
    padding: 8,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  statsCard: {
    flexDirection: 'row',
    backgroundColor: '#1F2937',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    marginTop: 6,
  },
  statLabel: {
    color: '#6B7280',
    fontSize: 11,
    marginTop: 2,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  exerciseCard: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  exerciseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  exerciseName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  setsTable: {
    backgroundColor: '#111827',
    borderRadius: 8,
    overflow: 'hidden',
  },
  setsHeaderRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  setHeaderCell: {
    color: '#6B7280',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  setRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1F2937',
  },
  warmupSetRow: {
    backgroundColor: '#F59E0B10',
  },
  setCell: {
    color: '#FFFFFF',
    fontSize: 14,
  },
  noSetsText: {
    color: '#6B7280',
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 12,
  },
  notesCard: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
  },
  notesTitle: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  notesText: {
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 20,
  },
});
