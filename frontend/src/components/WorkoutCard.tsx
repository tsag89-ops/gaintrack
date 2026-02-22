import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Workout } from '../types';
import { formatDate, calculateWorkoutVolume, calculateTotalSets, formatVolume } from '../utils/helpers';

interface WorkoutCardProps {
  workout: Workout;
  onPress: () => void;
}

export const WorkoutCard: React.FC<WorkoutCardProps> = ({ workout, onPress }) => {
  const volume = calculateWorkoutVolume(workout.exercises);
  const totalSets = calculateTotalSets(workout.exercises);

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.header}>
        <View style={styles.dateContainer}>
          <Text style={styles.date}>{formatDate(workout.date)}</Text>
          <Text style={styles.name}>{workout.name}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color="#6B7280" />
      </View>

      <View style={styles.stats}>
        <View style={styles.statItem}>
          <Ionicons name="barbell-outline" size={18} color="#10B981" />
          <Text style={styles.statValue}>{workout.exercises.length}</Text>
          <Text style={styles.statLabel}>Exercises</Text>
        </View>
        <View style={styles.statItem}>
          <Ionicons name="layers-outline" size={18} color="#3B82F6" />
          <Text style={styles.statValue}>{totalSets}</Text>
          <Text style={styles.statLabel}>Sets</Text>
        </View>
        <View style={styles.statItem}>
          <Ionicons name="trending-up-outline" size={18} color="#F59E0B" />
          <Text style={styles.statValue}>{formatVolume(volume)}</Text>
          <Text style={styles.statLabel}>Volume</Text>
        </View>
      </View>

      {workout.exercises.length > 0 && (
        <View style={styles.exerciseList}>
          {workout.exercises.slice(0, 3).map((ex, idx) => (
            <Text key={idx} style={styles.exerciseName} numberOfLines={1}>
              {ex.exercise_name}
            </Text>
          ))}
          {workout.exercises.length > 3 && (
            <Text style={styles.moreExercises}>
              +{workout.exercises.length - 3} more
            </Text>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1F2937',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  dateContainer: {
    flex: 1,
  },
  date: {
    color: '#10B981',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  name: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 2,
  },
  stats: {
    flexDirection: 'row',
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 4,
  },
  statLabel: {
    color: '#6B7280',
    fontSize: 11,
    marginTop: 2,
  },
  exerciseList: {
    borderTopWidth: 1,
    borderTopColor: '#374151',
    paddingTop: 12,
  },
  exerciseName: {
    color: '#9CA3AF',
    fontSize: 14,
    marginBottom: 4,
  },
  moreExercises: {
    color: '#6B7280',
    fontSize: 12,
    fontStyle: 'italic',
  },
});
