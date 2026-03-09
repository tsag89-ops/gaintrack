import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { useWorkoutStore } from '../src/store/workoutStore';
import { useNativeAuthState } from '../src/hooks/useAuth';
import { WorkoutCard } from '../src/components/WorkoutCard';
import { Workout } from '../src/types';
import { theme } from '../src/constants/theme';
import { calculateWorkoutVolume } from '../src/utils/helpers';

export default function WorkoutHistoryScreen() {
  const router = useRouter();
  const { uid } = useNativeAuthState();
  const { workouts, loadUserWorkouts, deleteWorkout } = useWorkoutStore();
  const [refreshing, setRefreshing] = React.useState(false);

  const allWorkouts = useMemo(
    () =>
      [...workouts]
        .filter((w) => {
          const exercises = w.exercises ?? [];
          return !(exercises.length === 0 && calculateWorkoutVolume(exercises) === 0);
        })
        .sort((a, b) => b.date.localeCompare(a.date)),
    [workouts],
  );

  const onRefresh = async () => {
    if (!uid) return;
    setRefreshing(true);
    await loadUserWorkouts(uid);
    setRefreshing(false);
  };

  const handleWorkoutPress = async (workout: Workout) => {
    await Haptics.selectionAsync();
    router.push(`/workout/${workout.workout_id}`);
  };

  const handleDeleteWorkout = async (workout: Workout) => {
    if (!uid) return;
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    await deleteWorkout(uid, workout.workout_id);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>All Workouts</Text>
        <Text style={styles.headerCount}>{allWorkouts.length}</Text>
      </View>

      <FlatList
        data={allWorkouts}
        keyExtractor={(item) => item.workout_id}
        renderItem={({ item }) => (
          <WorkoutCard
            workout={item}
            onPress={() => handleWorkoutPress(item)}
            onDelete={() => handleDeleteWorkout(item)}
          />
        )}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="barbell-outline" size={56} color={theme.charcoal} />
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
            tintColor={theme.primary}
          />
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
    flex: 1,
  },
  headerCount: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.primary,
    backgroundColor: theme.primary + '20',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    overflow: 'hidden',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
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
