// frontend/app/(tabs)/exercises.tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Exercise } from '../../src/types';
import { getExercises } from '../../src/services/storage';
import { SearchInput } from '../../src/components/SearchInput';
import { ExerciseVideo } from '../../src/components/ExerciseVideo';

interface ExerciseItemProps {
  exercise: Exercise;
  onPress: (exercise: Exercise) => void;
}

const ExerciseItem: React.FC<ExerciseItemProps> = ({ exercise, onPress }) => (
  <TouchableOpacity style={styles.item} onPress={() => onPress(exercise)}>
    <View style={styles.header}>
      <Text style={styles.name}>{exercise.name}</Text>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{exercise.muscleGroup}</Text>
      </View>
    </View>
    <Text style={styles.hint}>Tap to view video & instructions</Text>
  </TouchableOpacity>
);

interface ExerciseModalProps {
  exercise: Exercise | null;
  visible: boolean;
  onClose: () => void;
}

const ExerciseModal: React.FC<ExerciseModalProps> = ({ exercise, visible, onClose }) => {
  if (!exercise) return null;

  return (
    <Modal
      animationType="slide"
      transparent
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <ScrollView contentContainerStyle={styles.modalScrollContent}>
            <Text style={styles.modalTitle}>{exercise.name}</Text>
            <View style={styles.badgeLarge}>
              <Text style={styles.badgeTextLarge}>{exercise.muscleGroup}</Text>
            </View>

            <View style={styles.videoWrapper}>
              <ExerciseVideo videoUrl={exercise.videoUrl} />
            </View>

            <Text style={styles.instructionsTitle}>Instructions</Text>
            <Text style={styles.instructions}>{exercise.instructions}</Text>

            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

export default function ExercisesScreen() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [filteredExercises, setFilteredExercises] = useState<Exercise[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  const loadExercises = useCallback(async () => {
    const data = await getExercises();
    setExercises(data);
    setFilteredExercises(data);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadExercises();
    }, [loadExercises])
  );

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredExercises(exercises);
    } else {
      const q = searchQuery.toLowerCase();
      const filtered = exercises.filter(
        (exercise) =>
          exercise.name.toLowerCase().includes(q) ||
          exercise.muscleGroup.toLowerCase().includes(q)
      );
      setFilteredExercises(filtered);
    }
  }, [searchQuery, exercises]);

  const handleExercisePress = (exercise: Exercise) => {
    setSelectedExercise(exercise);
    setModalVisible(true);
  };

  const handleCloseModal = () => {
    setModalVisible(false);
    setSelectedExercise(null);
  };

  return (
    <View style={styles.container}>
      <SearchInput
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder="Search exercises..."
      />
      <FlatList
        data={filteredExercises}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ExerciseItem exercise={item} onPress={handleExercisePress} />
        )}
        contentContainerStyle={styles.list}
      />
      <ExerciseModal
        exercise={selectedExercise}
        visible={modalVisible}
        onClose={handleCloseModal}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827', // dark, same family as Nutrition
  },
  list: {
    paddingBottom: 20,
  },
  item: {
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 8,
    backgroundColor: '#1F2937',
    borderRadius: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  name: {
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
    color: '#F9FAFB',
  },
  badge: {
    backgroundColor: '#4ecdc4',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 16,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  hint: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 8,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxHeight: '85%',
    backgroundColor: '#111827',
    borderRadius: 16,
    overflow: 'hidden',
  },
  modalScrollContent: {
    padding: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
    color: '#F9FAFB',
  },
  badgeLarge: {
    alignSelf: 'flex-start',
    backgroundColor: '#4ecdc4',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 18,
    marginBottom: 16,
  },
  badgeTextLarge: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  videoWrapper: {
    marginBottom: 16,
    alignItems: 'center',
  },
  instructionsTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
    color: '#E5E7EB',
  },
  instructions: {
    fontSize: 14,
    color: '#D1D5DB',
    marginBottom: 16,
  },
  closeButton: {
    alignSelf: 'center',
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#1f2937',
    borderRadius: 20,
  },
  closeButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
});

