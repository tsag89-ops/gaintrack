import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { workoutApi } from '../../src/services/api';
import { useWorkoutStore } from '../../src/store/workoutStore';
import { WorkoutCard } from '../../src/components/WorkoutCard';
import { Workout } from '../../src/types';

export default function WorkoutsScreen() {
  const router = useRouter();
  const { workouts, setWorkouts, isLoading, setLoading } = useWorkoutStore();
  const [refreshing, setRefreshing] = useState(false);

  const fetchWorkouts = useCallback(async () => {
    try {
      setLoading(true);
      const data = await workoutApi.getAll();
      setWorkouts(data);
    } catch (error) {
      console.error('Error fetching workouts:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWorkouts();
  }, [fetchWorkouts]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchWorkouts();
    setRefreshing(false);
  };

  const handleWorkoutPress = (workout: Workout) => {
    router.push(`/workout/${workout.workout_id}`);
  };

  const handleNewWorkout = () => {
    router.push('/workout/new');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Workouts</Text>
          <Text style={styles.headerSubtitle}>Track your gains</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.programsButton} onPress={() => router.push('/programs')}>
            <Ionicons name="list-outline" size={22} color="#10B981" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.addButton} onPress={handleNewWorkout}>
            <Ionicons name="add" size={28} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

      {isLoading && workouts.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#10B981" />
        </View>
      ) : (
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#10B981"
            />
          }
        >
          {workouts.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="barbell-outline" size={64} color="#374151" />
              <Text style={styles.emptyTitle}>No workouts yet</Text>
              <Text style={styles.emptySubtitle}>
                Start tracking your first workout!
              </Text>
              <TouchableOpacity
                style={styles.emptyButton}
                onPress={handleNewWorkout}
              >
                <Text style={styles.emptyButtonText}>Start Workout</Text>
              </TouchableOpacity>
            </View>
          ) : (
            workouts.map((workout) => (
              <WorkoutCard
                key={workout.workout_id}
                workout={workout}
                onPress={() => handleWorkoutPress(workout)}
              />
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
  },
  addButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    marginTop: 16,
  },
  emptySubtitle: {
    color: '#6B7280',
    fontSize: 14,
    marginTop: 8,
  },
  emptyButton: {
    backgroundColor: '#10B981',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 24,
  },
  emptyButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
