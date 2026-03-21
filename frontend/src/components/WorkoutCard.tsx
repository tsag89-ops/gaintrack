import React, { useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { Workout } from '../types';
import { formatDate, calculateWorkoutVolume, calculateTotalSets, formatVolume } from '../utils/helpers';
import { useWeightUnit } from '../hooks/useWeightUnit';
import { useLanguage } from '../context/LanguageContext';

interface WorkoutCardProps {
  workout: Workout;
  onPress: () => void;
  /** Optional — when provided, swipe-left reveals a delete action. */
  onDelete?: () => void;
}

export const WorkoutCard: React.FC<WorkoutCardProps> = ({ workout, onPress, onDelete }) => {
  const { t, locale } = useLanguage();
  const exercises = workout.exercises ?? [];
  const volume = calculateWorkoutVolume(exercises);
  const totalSets = calculateTotalSets(exercises);
  const weightUnit = useWeightUnit();
  const swipeRef = useRef<Swipeable>(null);

  const handleDeletePress = () => {
    swipeRef.current?.close();
    Alert.alert(
      t('workoutCard.deleteWorkoutTitle'),
      t('workoutCard.deleteWorkoutMessage', { name: workout.name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('workoutCard.deleteAction'),
          style: 'destructive',
          onPress: onDelete,
        },
      ],
    );
  };

  const renderRightActions = () => (
    <TouchableOpacity
      style={styles.deleteAction}
      onPress={handleDeletePress}
      activeOpacity={0.8}
    >
      <Ionicons name="trash-outline" size={24} color="#FFFFFF" />
      <Text style={styles.deleteActionText}>{t('workoutCard.deleteAction')}</Text>
    </TouchableOpacity>
  );

  const card = (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.header}>
        <View style={styles.dateContainer}>
          <Text style={styles.date}>{formatDate(workout.date, {
            locale,
            todayLabel: t('workoutCard.today'),
            yesterdayLabel: t('workoutCard.yesterday'),
          })}</Text>
          <Text style={styles.name}>{workout.name}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color="#B0B0B0" />
      </View>

      <View style={styles.stats}>
        <View style={styles.statItem}>
          <Ionicons name="barbell-outline" size={18} color="#4CAF50" />
          <Text style={styles.statValue}>{exercises.length}</Text>
          <Text style={styles.statLabel}>{t('workoutCard.exercisesLabel')}</Text>
        </View>
        <View style={styles.statItem}>
          <Ionicons name="layers-outline" size={18} color="#2196F3" />
          <Text style={styles.statValue}>{totalSets}</Text>
          <Text style={styles.statLabel}>{t('workoutCard.setsLabel')}</Text>
        </View>
        <View style={styles.statItem}>
          <Ionicons name="trending-up-outline" size={18} color="#FFC107" />
          <Text style={styles.statValue}>{formatVolume(volume)}</Text>
          <Text style={styles.statLabel}>{t('workoutCard.volumeLabel', { unit: weightUnit })}</Text>
        </View>
      </View>

      {exercises.length > 0 && (
        <View style={styles.exerciseList}>
          {exercises.slice(0, 3).map((ex, idx) => (
            <Text key={idx} style={styles.exerciseName} numberOfLines={1}>
              {ex.exercise_name}
            </Text>
          ))}
          {exercises.length > 3 && (
            <Text style={styles.moreExercises}>
              {t('workoutCard.moreExercises', { count: exercises.length - 3 })}
            </Text>
          )}
        </View>
      )}
    </TouchableOpacity>
  );

  if (!onDelete) return card;

  return (
    <Swipeable
      ref={swipeRef}
      renderRightActions={renderRightActions}
      rightThreshold={60}
      overshootRight={false}
      friction={2}
    >
      {card}
    </Swipeable>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#252525',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  deleteAction: {
    backgroundColor: '#F44336',
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    borderRadius: 16,
    marginBottom: 12,
    gap: 4,
  },
  deleteActionText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
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
    color: '#4CAF50',
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
    backgroundColor: '#1A1A1A',
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
    color: '#B0B0B0',
    fontSize: 11,
    marginTop: 2,
  },
  exerciseList: {
    borderTopWidth: 1,
    borderTopColor: '#303030',
    paddingTop: 12,
  },
  exerciseName: {
    color: '#B0B0B0',
    fontSize: 14,
    marginBottom: 4,
  },
  moreExercises: {
    color: '#B0B0B0',
    fontSize: 12,
    fontStyle: 'italic',
  },
});
