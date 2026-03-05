import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { exerciseApiExtended as exerciseApi } from '../../src/services/api';
import { useWorkoutStore } from '../../src/store/workoutStore';
import { Exercise, WorkoutExercise, WorkoutSet } from '../../src/types';
import { getCategoryColor } from '../../src/utils/helpers';
import { SetLoggerSheet } from '../../src/components/SetLoggerSheet';
import { seedExercises as localSeedExercises } from '../../src/data/seedData';


const CATEGORIES = ['all', 'chest', 'back', 'shoulders', 'legs', 'arms', 'core'];

export default function NewWorkoutScreen() {
  const router = useRouter();
  const { preloadExercise } = useLocalSearchParams<{ preloadExercise?: string }>();
  const { startWorkout } = useWorkoutStore();
  const [workoutName, setWorkoutName] = useState('Workout');

  // Pre-populate exercise from browse mode if provided
  const preloaded = React.useMemo<WorkoutExercise | null>(() => {
    if (!preloadExercise) return null;
    try {
      const ex: Exercise = JSON.parse(preloadExercise);
      return {
        exercise_id: ex.exercise_id || ex.id,
        exercise_name: ex.name,
        exercise: ex,
        sets: [],
        notes: undefined,
      };
    } catch {
      return null;
    }
  }, [preloadExercise]);

  const [exercises, setExercises] = useState<WorkoutExercise[]>(() =>
    preloaded ? [preloaded] : []
  );
  const [availableExercises, setAvailableExercises] = useState<Exercise[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [showExercisePicker, setShowExercisePicker] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedExercise, setSelectedExercise] = useState<WorkoutExercise | null>(
    preloaded ?? null
  );
  const [showSetLogger, setShowSetLogger] = useState(preloaded !== null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);

  useEffect(() => {
    fetchExercises();
  }, []);

  const fetchExercises = async () => {
  try {
    setIsLoading(true);
    const data = await exerciseApi.getForUser();
    setAvailableExercises(data);
  } catch (error) {
    console.error('Error fetching exercises:', error);
    try {
      const allExercises = await exerciseApi.getAll();
      setAvailableExercises(allExercises);
    } catch (e) {
      console.error('Error fetching all exercises:', e);

      // Fallback: use local seeded exercises from app/data/seedData
      const mapped = (localSeedExercises as any[]).map((ex: any, index: number) => ({
        exercise_id: ex.id ?? String(index + 1),
        name: ex.name,
        category: (ex.muscleGroup || 'other').toLowerCase(),
        is_compound: ['chest', 'back', 'legs', 'shoulders'].includes(
          (ex.muscleGroup || '').toLowerCase()
        ),
      }));

      setAvailableExercises(mapped as any);
    }
  } finally {
    setIsLoading(false);
  }
};


  const filteredExercises = availableExercises.filter((ex) => {
    const matchesCategory = selectedCategory === 'all' || ex.category === selectedCategory;
    const matchesSearch = !searchQuery || ex.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const addExercise = (exercise: Exercise) => {
    const newExercise: WorkoutExercise = {
      exercise_id: exercise.exercise_id,
      exercise_name: exercise.name,
      exercise: exercise,
      sets: [],
      notes: undefined,
    };
    setExercises([...exercises, newExercise]);
    setShowExercisePicker(false);
    setSearchQuery('');
  };

  const removeExercise = (exerciseId: string) => {
    setExercises(exercises.filter((ex) => ex.exercise_id !== exerciseId));
  };

  const handleExercisePress = (exercise: WorkoutExercise) => {
    setSelectedExercise(exercise);
    setShowSetLogger(true);
  };

  const handleSaveSets = (sets: WorkoutSet[]) => {
    if (!selectedExercise) return;
    setExercises(
      exercises.map((ex) =>
        ex.exercise_id === selectedExercise.exercise_id ? { ...ex, sets } : ex
      )
    );
    setSelectedExercise({ ...selectedExercise, sets });
  };

  const handleRequestWarmup = async (workingWeight: number) => {
    if (!selectedExercise) return;
    try {
      const result: any[] = [];
      const warmupSets: WorkoutSet[] = result.map((s: any) => ({
        set_id: s.set_id ?? `warmup-${s.set_number}-${Date.now()}`,
        set_number: s.set_number,
        weight: s.weight,
        reps: s.reps,
        completed: false,
        is_warmup: true,
        rpe: undefined,
      }));

      const existingSets = selectedExercise.sets.filter((s) => !s.is_warmup);
      const allSets = [...warmupSets, ...existingSets].map((s, idx) => ({
        ...s,
        set_number: idx + 1,
      }));

      handleSaveSets(allSets);
    } catch (error) {
      console.error('Error getting warmup sets:', error);
    }
  };

  const handleStartWorkout = () => {
    startWorkout(workoutName);
    router.push({ pathname: '/workout/active', params: { name: workoutName } });
  };

  // ── Templates [Feature 4] ───────────────────────────────────────────────
  const handleOpenTemplates = async () => {
    const raw = await AsyncStorage.getItem('gaintrack_templates');
    setTemplates(raw ? JSON.parse(raw) : []);
    setShowTemplatePicker(true);
  };

  const applyTemplate = (template: any) => {
    setExercises(
      template.exercises.map((ex: any) => ({
        exercise_id: ex.exercise_id,
        exercise_name: ex.exercise_name,
        exercise: ex.exercise,
        sets: [],
        notes: undefined,
      }))
    );
    setWorkoutName(template.name);
    setShowTemplatePicker(false);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeButton}>
          <Ionicons name="close" size={28} color="#FFFFFF" />
        </TouchableOpacity>
        <TextInput
          style={styles.workoutNameInput}
          value={workoutName}
          onChangeText={setWorkoutName}
          placeholder="Workout Name"
          placeholderTextColor="#B0B0B0"
        />
        <TouchableOpacity
          style={styles.saveButton}
          onPress={handleStartWorkout}
        >
          <Text style={styles.saveButtonText}>Start</Text>
        </TouchableOpacity>
      </View>

      {/* From Template row [Feature 4] */}
      <TouchableOpacity style={styles.fromTemplateBtn} onPress={handleOpenTemplates}>
        <Ionicons name="copy-outline" size={16} color="#B0B0B0" />
        <Text style={styles.fromTemplateBtnText}>From Template</Text>
      </TouchableOpacity>

      <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
        {/* Exercise List */}
        {exercises.map((exercise, index) => (
          <View key={index} style={styles.exerciseCard}>
            <View style={styles.exerciseHeader}>
              <Text style={styles.exerciseName}>{exercise.exercise_name}</Text>
              <View style={styles.exerciseActions}>
                <TouchableOpacity onPress={() => handleExercisePress(exercise)}>
                  <Ionicons name="create-outline" size={20} color="#4CAF50" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => removeExercise(exercise.exercise_id)}>
                  <Ionicons name="trash-outline" size={20} color="#F44336" />
                </TouchableOpacity>
              </View>
            </View>

            {exercise.sets.length > 0 ? (
              <View style={styles.setsSummary}>
                <Text style={styles.setsSummaryText}>
                  {exercise.sets.filter((s) => !s.is_warmup).length} sets logged
                </Text>
                {exercise.sets.filter((s) => !s.is_warmup).length > 0 && (
                  <Text style={styles.setsDetail}>
                    Best: {Math.max(...exercise.sets.filter((s) => !s.is_warmup).map((s) => s.weight))} lbs
                  </Text>
                )}
              </View>
            ) : (
              <TouchableOpacity
                style={styles.addSetsButton}
                onPress={() => handleExercisePress(exercise)}
              >
                <Ionicons name="add" size={18} color="#4CAF50" />
                <Text style={styles.addSetsText}>Add Sets</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}

        {/* Add Exercise Button */}
        <TouchableOpacity
          style={styles.addExerciseButton}
          onPress={() => setShowExercisePicker(true)}
        >
          <Ionicons name="add-circle" size={24} color="#4CAF50" />
          <Text style={styles.addExerciseText}>Add Exercise</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Exercise Picker Modal */}
      {showExercisePicker && (
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerContent}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>Add Exercise</Text>
              <TouchableOpacity onPress={() => setShowExercisePicker(false)}>
                <Ionicons name="close" size={24} color="#B0B0B0" />
              </TouchableOpacity>
            </View>

            <View style={styles.searchContainer}>
              <Ionicons name="search" size={20} color="#B0B0B0" />
              <TextInput
                style={styles.searchInput}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search exercises..."
                placeholderTextColor="#B0B0B0"
              />
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.categoryScroll}
              contentContainerStyle={styles.categoryScrollContent}
            >
              {CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[
                    styles.categoryChip,
                    selectedCategory === cat && styles.categoryChipActive,
                  ]}
                  onPress={() => setSelectedCategory(cat)}
                >
                  <Text
                    style={[
                      styles.categoryChipText,
                      selectedCategory === cat && styles.categoryChipTextActive,
                    ]}
                  >
                    {cat.charAt(0).toUpperCase() + cat.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {isLoading ? (
              <ActivityIndicator size="large" color="#4CAF50" style={{ marginTop: 40 }} />
            ) : (
              <ScrollView style={styles.exerciseList}>
                {filteredExercises.map((ex) => (
                  <TouchableOpacity
                    key={ex.exercise_id}
                    style={styles.exerciseListItem}
                    onPress={() => addExercise(ex)}
                  >
                    <View>
                      <Text style={styles.exerciseListName}>{ex.name}</Text>
                      <View style={styles.exerciseMeta}>
                        <View
                          style={[
                            styles.categoryBadge,
                            { backgroundColor: getCategoryColor(ex.category) + '30' },
                          ]}
                        >
                          <Text
                            style={[
                              styles.categoryBadgeText,
                              { color: getCategoryColor(ex.category) },
                            ]}
                          >
                            {ex.category}
                          </Text>
                        </View>
                        {ex.is_compound && (
                          <View style={styles.compoundBadge}>
                            <Text style={styles.compoundBadgeText}>Compound</Text>
                          </View>
                        )}
                      </View>
                    </View>
                    <Ionicons name="add-circle" size={24} color="#4CAF50" />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      )}

      {/* Template Picker [Feature 4] */}
      {showTemplatePicker && (
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerContent}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>Templates</Text>
              <TouchableOpacity onPress={() => setShowTemplatePicker(false)}>
                <Ionicons name="close" size={24} color="#B0B0B0" />
              </TouchableOpacity>
            </View>
            {templates.length === 0 ? (
              <Text style={{ color: '#B0B0B0', padding: 20, textAlign: 'center' }}>
                No templates yet. Finish a workout and choose “Save Template”.
              </Text>
            ) : (
              <ScrollView style={{ paddingHorizontal: 20, paddingBottom: 40 }}>
                {templates.map((tmpl: any) => (
                  <TouchableOpacity
                    key={tmpl.id}
                    style={styles.exerciseListItem}
                    onPress={() => applyTemplate(tmpl)}
                  >
                    <View>
                      <Text style={styles.exerciseListName}>{tmpl.name}</Text>
                      <Text style={{ color: '#B0B0B0', fontSize: 13, marginTop: 4 }}>
                        {tmpl.exercises.length} exercise{tmpl.exercises.length !== 1 ? 's' : ''}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#B0B0B0" />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      )}

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
    backgroundColor: '#1A1A1A',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  closeButton: {
    padding: 4,
  },
  workoutNameInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    backgroundColor: '#252525',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  saveButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  exerciseCard: {
    backgroundColor: '#252525',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  exerciseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  exerciseName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  exerciseActions: {
    flexDirection: 'row',
    gap: 16,
  },
  setsSummary: {
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  setsSummaryText: {
    color: '#4CAF50',
    fontSize: 14,
  },
  setsDetail: {
    color: '#B0B0B0',
    fontSize: 14,
  },
  addSetsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    paddingVertical: 10,
    backgroundColor: '#4CAF5015',
    borderRadius: 8,
    gap: 6,
  },
  addSetsText: {
    color: '#4CAF50',
    fontSize: 14,
    fontWeight: '500',
  },
  addExerciseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderWidth: 2,
    borderColor: '#4CAF50',
    borderStyle: 'dashed',
    borderRadius: 12,
    gap: 8,
    marginTop: 8,
  },
  addExerciseText: {
    color: '#4CAF50',
    fontSize: 16,
    fontWeight: '600',
  },
  pickerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'flex-end',
  },
  pickerContent: {
    backgroundColor: '#252525',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
    maxHeight: '80%',
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  pickerTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    marginHorizontal: 20,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 16,
    paddingVertical: 12,
    marginLeft: 8,
  },
  categoryScroll: {
    maxHeight: 44,
  },
  categoryScrollContent: {
    paddingHorizontal: 20,
    gap: 8,
  },
  categoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#303030',
    borderRadius: 20,
  },
  categoryChipActive: {
    backgroundColor: '#4CAF50',
  },
  categoryChipText: {
    color: '#B0B0B0',
    fontSize: 14,
    fontWeight: '500',
  },
  categoryChipTextActive: {
    color: '#FFFFFF',
  },
  exerciseList: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },
  exerciseListItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#303030',
  },
  exerciseListName: {
    color: '#FFFFFF',
    fontSize: 16,
    marginBottom: 4,
  },
  exerciseMeta: {
    flexDirection: 'row',
    gap: 8,
  },
  categoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  categoryBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  compoundBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: '#2196F320',
    borderRadius: 4,
  },
  compoundBadgeText: {
    color: '#2196F3',
    fontSize: 11,
    fontWeight: '600',
  },
  // ── Feature 4: Template button ──
  fromTemplateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#252525',
  },
  fromTemplateBtnText: {
    color: '#B0B0B0',
    fontSize: 14,
  },
});
