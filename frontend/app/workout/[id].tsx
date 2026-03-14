
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
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useWorkoutStore } from '../../src/store/workoutStore';
import { useWeightUnit } from '../../src/hooks/useWeightUnit';
import { Workout } from '../../src/types';
import { calculateTotalSets, calculateWorkoutVolume, formatDate, formatVolume } from '../../src/utils/helpers';

const NOTES_PREFIX = 'workout_notes_';

export default function WorkoutDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { workouts } = useWorkoutStore();
  const weightUnit = useWeightUnit();

  const [localWorkout, setLocalWorkout] = useState<Workout | null>(null);
  const [notes, setNotes] = useState('');
  const [showNotesEditor, setShowNotesEditor] = useState(false);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [loading, setLoading] = useState(false);

  const workout = useMemo(() => {
    if (!id) return null;
    return workouts.find((w) => w.workout_id === id) ?? localWorkout;
  }, [id, workouts, localWorkout]);

  const exercises = workout?.exercises ?? [];
  const totalSets = calculateTotalSets(exercises);
  const totalVolume = calculateWorkoutVolume(exercises);

  // Load workout + notes for this specific workout on mount.
  React.useEffect(() => {
    if (!id) return;

    const bootstrap = async () => {
      try {
        // Notes are stored independently so they remain editable post-sync.
        const saved = await AsyncStorage.getItem(NOTES_PREFIX + id);
        if (saved) setNotes(saved);

        // If the store is empty (cold start), load workout history from cache.
        if (!workouts.some((w) => w.workout_id === id)) {
          const rawWorkouts = await AsyncStorage.getItem('gaintrack_workouts');
          if (rawWorkouts) {
            const parsed = JSON.parse(rawWorkouts);
            if (Array.isArray(parsed)) {
              const found = parsed.find((w: Workout) => w.workout_id === id);
              if (found) setLocalWorkout(found);
            }
          }
        }
      } catch (e) {
        // ignore
      } finally {
        setIsBootstrapping(false);
      }
    };

    bootstrap();
  }, [id, workouts]);

  const saveNotes = async () => {
    if (!id) return;
    setLoading(true);
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await AsyncStorage.setItem(NOTES_PREFIX + id, notes);
      Alert.alert('Saved', 'Workout notes updated.');
      setShowNotesEditor(false);
    } catch (e) {
      Alert.alert('Error saving notes');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleNotes = async () => {
    await Haptics.selectionAsync();
    setShowNotesEditor((prev) => !prev);
  };

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
          <Text style={styles.headerTitle}>Workout Summary</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.emptyContainer}>
          <Ionicons name="barbell-outline" size={52} color="#2D2D2D" />
          <Text style={styles.emptyTitle}>Workout not found</Text>
          <Text style={styles.emptySubtitle}>This workout may have been deleted.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={26} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Workout Summary</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.metaCard}>
            <Text style={styles.workoutDate}>{formatDate(workout.date)}</Text>
            <Text style={styles.workoutName}>{workout.name || 'Untitled Workout'}</Text>

            <View style={styles.statsRow}>
              <View style={styles.statChip}>
                <Ionicons name="barbell-outline" size={15} color="#4CAF50" />
                <Text style={styles.statText}>{exercises.length} exercises</Text>
              </View>
              <View style={styles.statChip}>
                <Ionicons name="layers-outline" size={15} color="#2196F3" />
                <Text style={styles.statText}>{totalSets} sets</Text>
              </View>
              <View style={styles.statChip}>
                <Ionicons name="trending-up-outline" size={15} color="#FFC107" />
                <Text style={styles.statText}>{formatVolume(totalVolume)} {weightUnit}</Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.notesToggleButton}
              onPress={handleToggleNotes}
              activeOpacity={0.82}
            >
              <View style={styles.notesToggleLeft}>
                <Ionicons name="document-text-outline" size={18} color="#FF6200" />
                <Text style={styles.notesToggleText}>Workout Notes</Text>
              </View>
              <Ionicons
                name={showNotesEditor ? 'chevron-up' : 'chevron-down'}
                size={18}
                color="#B0B0B0"
              />
            </TouchableOpacity>

            {showNotesEditor && (
              <View style={styles.notesCard}>
                <TextInput
                  style={styles.notesInput}
                  placeholder="Add your notes here..."
                  placeholderTextColor="#B0B0B0"
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                />
                <TouchableOpacity
                  style={styles.saveButton}
                  onPress={saveNotes}
                  disabled={loading}
                >
                  <Text style={styles.saveButtonText}>{loading ? 'Saving...' : 'Save Notes'}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Exercises</Text>
          </View>

          {exercises.map((exercise, exerciseIndex) => {
            const sets = exercise.sets ?? [];
            return (
              <View key={`${exercise.exercise_id}_${exerciseIndex}`} style={styles.exerciseCard}>
                <Text style={styles.exerciseName}>{exercise.exercise_name}</Text>

                {exercise.notes ? (
                  <Text style={styles.exerciseNotes}>{exercise.notes}</Text>
                ) : null}

                {sets.map((set, setIndex) => (
                  <View key={`${set.set_id ?? setIndex}`} style={styles.setRow}>
                    <View style={styles.setLeft}>
                      <Text style={styles.setNumber}>Set {set.set_number || setIndex + 1}</Text>
                      {set.is_warmup ? <Text style={styles.warmupTag}>Warm-up</Text> : null}
                    </View>
                    <Text style={styles.setValue}>
                      {set.reps} reps x {set.weight} {weightUnit}
                    </Text>
                  </View>
                ))}
              </View>
            );
          })}

          {exercises.length === 0 && (
            <View style={styles.emptyExercisesCard}>
              <Text style={styles.emptyExercisesText}>No exercises recorded for this workout.</Text>
            </View>
          )}
        </ScrollView>
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
  metaCard: {
    backgroundColor: '#252525',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#303030',
    padding: 14,
    gap: 12,
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
    marginTop: -6,
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
  notesCard: {
    marginTop: -4,
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
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
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
  exerciseName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  exerciseNotes: {
    color: '#B0B0B0',
    fontSize: 13,
    marginTop: -2,
    marginBottom: 2,
  },
  setRow: {
    backgroundColor: '#1A1A1A',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#303030',
    paddingHorizontal: 10,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  setLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  setNumber: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  warmupTag: {
    color: '#FFB37A',
    fontSize: 11,
    fontWeight: '700',
    backgroundColor: 'rgba(255, 98, 0, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: 'hidden',
  },
  setValue: {
    color: '#B0B0B0',
    fontSize: 13,
    fontWeight: '600',
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
  },
  emptyExercisesText: {
    color: '#B0B0B0',
    fontSize: 13,
  },
});