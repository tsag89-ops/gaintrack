import React, { useMemo, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useWorkoutStore } from '../src/store/workoutStore';
import { useNativeAuthState } from '../src/hooks/useAuth';
import { Workout } from '../src/types';
import { useWeightUnit } from '../src/hooks/useWeightUnit';
import { formatDate, calculateWorkoutVolume, calculateTotalSets, formatVolume } from '../src/utils/helpers';
import { shareWorkoutCard } from '../src/services/social';

export default function WorkoutHistoryScreen() {
  const router = useRouter();
  const { uid } = useNativeAuthState();
  const { workouts, loadUserWorkouts, deleteWorkout } = useWorkoutStore();
  const [refreshing, setRefreshing] = useState(false);
  const [localWorkouts, setLocalWorkouts] = useState<Workout[]>([]);
  const weightUnit = useWeightUnit();

  // Load from both store and AsyncStorage on mount
  useEffect(() => {
    const load = async () => {
      // If store has workouts, use them
      if (workouts.length > 0) {
        setLocalWorkouts(workouts);
        return;
      }
      // Fallback: read from AsyncStorage
      try {
        const raw = await AsyncStorage.getItem('gaintrack_workouts');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) setLocalWorkouts(parsed);
        }
      } catch {}
      // Also trigger store load
      if (uid) loadUserWorkouts(uid);
    };
    load();
  }, []);

  // Keep in sync with store
  useEffect(() => {
    if (workouts.length > 0) setLocalWorkouts(workouts);
  }, [workouts]);

  const allWorkouts = useMemo(
    () =>
      localWorkouts
        .filter((w) => {
          if (!w || !w.date) return false;
          const exercises = w.exercises ?? [];
          return exercises.length > 0;
        })
        .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')),
    [localWorkouts],
  );

  const onRefresh = async () => {
    if (!uid) return;
    setRefreshing(true);
    await loadUserWorkouts(uid);
    setRefreshing(false);
  };

  const handleWorkoutPress = async (workout: Workout) => {
    await Haptics.selectionAsync();
    router.push(`/workout/${workout.workout_id}` as any);
  };

  const handleDeleteWorkout = (workout: Workout) => {
    Alert.alert(
      'Delete Workout',
      `Delete "${workout.name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!uid) return;
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            await deleteWorkout(uid, workout.workout_id);
          },
        },
      ],
    );
  };

  const handleShareWorkout = async (workout: Workout) => {
    const exercises = workout.exercises ?? [];
    const volume = calculateWorkoutVolume(exercises);
    const totalSets = calculateTotalSets(exercises);

    const shared = await shareWorkoutCard({
      workoutName: workout.name || 'Workout',
      date: formatDate(workout.date),
      totalVolume: `${formatVolume(volume)} ${weightUnit}`,
      totalSets,
      exerciseCount: exercises.length,
    });

    if (shared) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      Alert.alert('Share unavailable', 'Could not share this workout card right now.');
    }
  };

  const renderWorkoutCard = ({ item }: { item: Workout }) => {
    const exercises = item.exercises ?? [];
    const volume = calculateWorkoutVolume(exercises);
    const totalSets = calculateTotalSets(exercises);

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => handleWorkoutPress(item)}
        onLongPress={() => handleDeleteWorkout(item)}
        activeOpacity={0.7}
      >
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardDate}>{formatDate(item.date)}</Text>
            <Text style={styles.cardName}>{item.name || 'Untitled Workout'}</Text>
          </View>
          <View style={styles.cardHeaderActions}>
            <TouchableOpacity
              style={styles.shareButton}
              onPress={() => handleShareWorkout(item)}
              hitSlop={{ top: 8, left: 8, right: 8, bottom: 8 }}
            >
              <Ionicons name="share-social-outline" size={18} color="#FF6200" />
            </TouchableOpacity>
            <Ionicons name="chevron-forward" size={20} color="#6B7280" />
          </View>
        </View>

        <View style={styles.cardStats}>
          <View style={styles.statPill}>
            <Ionicons name="barbell-outline" size={14} color="#4CAF50" />
            <Text style={styles.statPillText}>{exercises.length} exercises</Text>
          </View>
          <View style={styles.statPill}>
            <Ionicons name="layers-outline" size={14} color="#2196F3" />
            <Text style={styles.statPillText}>{totalSets} sets</Text>
          </View>
          <View style={styles.statPill}>
            <Ionicons name="trending-up-outline" size={14} color="#FFC107" />
            <Text style={styles.statPillText}>{formatVolume(volume)} {weightUnit}</Text>
          </View>
        </View>

        {exercises.length > 0 && (
          <View style={styles.exerciseList}>
            {exercises.slice(0, 4).map((ex, idx) => {
              const workingSets = (ex.sets ?? []).filter(s => !s.is_warmup);
              return (
                <View key={idx} style={styles.exerciseBlock}>
                  <View style={styles.exerciseRow}>
                    <View style={styles.exerciseDot} />
                    <Text style={styles.exerciseName} numberOfLines={1}>
                      {ex.exercise_name}
                    </Text>
                  </View>
                  {workingSets.length > 0 && (
                    <View style={styles.setDetails}>
                      {workingSets.map((s, si) => (
                        <Text key={si} style={styles.setDetailText}>
                          {s.reps}×{s.weight}{weightUnit}
                        </Text>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}
            {exercises.length > 4 && (
              <Text style={styles.moreExercises}>
                +{exercises.length - 4} more exercises
              </Text>
            )}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>All Workouts</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{allWorkouts.length}</Text>
        </View>
      </View>

      <FlatList
        data={allWorkouts}
        keyExtractor={(item) => item.workout_id}
        renderItem={renderWorkoutCard}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="barbell-outline" size={56} color="#2D2D2D" />
            <Text style={styles.emptyTitle}>No workouts yet</Text>
            <Text style={styles.emptySubtitle}>
              Complete a workout to see it here.
            </Text>
          </View>
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#FF6200"
          />
        }
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
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2D2D2D',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    flex: 1,
  },
  countBadge: {
    backgroundColor: 'rgba(255,98,0,0.15)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  countText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FF6200',
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: '#252525',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#303030',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  shareButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,98,0,0.14)',
  },
  cardDate: {
    fontSize: 12,
    color: '#FF6200',
    fontWeight: '600',
    marginBottom: 2,
  },
  cardName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  cardStats: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#1A1A1A',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statPillText: {
    fontSize: 12,
    color: '#B0B0B0',
    fontWeight: '600',
  },
  exerciseList: {
    borderTopWidth: 1,
    borderTopColor: '#303030',
    paddingTop: 10,
    gap: 8,
  },
  exerciseBlock: {
    gap: 3,
  },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  exerciseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FF6200',
  },
  exerciseName: {
    flex: 1,
    fontSize: 14,
    color: '#FFFFFF',
  },
  setDetails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginLeft: 14,
  },
  setDetailText: {
    fontSize: 12,
    color: '#B0B0B0',
    backgroundColor: '#1A1A1A',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  moreExercises: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
    marginLeft: 14,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 16,
  },
  emptySubtitle: {
    color: '#B0B0B0',
    fontSize: 14,
    marginTop: 8,
  },
});
