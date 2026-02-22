import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { statsApi } from '../../src/services/api';
import { useAuthStore } from '../../src/store/authStore';

const screenWidth = Dimensions.get('window').width;

interface VolumeData {
  date: string;
  volume: number;
  workout_name: string;
}

interface NutritionData {
  date: string;
  calories: number;
  calories_goal: number;
  protein: number;
  protein_goal: number;
}

// Simple bar chart component
const SimpleBarChart = ({ data, color }: { data: VolumeData[]; color: string }) => {
  if (!data || data.length === 0) return null;
  const maxValue = Math.max(...data.map(d => d.volume), 1);

  return (
    <View style={simpleChartStyles.container}>
      {data.map((item, index) => {
        const height = (item.volume / maxValue) * 120;
        const date = new Date(item.date);
        return (
          <View key={index} style={simpleChartStyles.barContainer}>
            <View style={simpleChartStyles.barWrapper}>
              <View
                style={[
                  simpleChartStyles.bar,
                  { height: Math.max(height, 4), backgroundColor: color },
                ]}
              />
            </View>
            <Text style={simpleChartStyles.label}>{date.getDate()}</Text>
          </View>
        );
      })}
    </View>
  );
};

// Simple line indicator for nutrition
const NutritionProgressBars = ({ data }: { data: NutritionData[] }) => {
  if (!data || data.length === 0) return null;

  return (
    <View style={nutritionStyles.container}>
      {data.slice(-5).map((item, index) => {
        const date = new Date(item.date);
        const proteinPercent = Math.min((item.protein / item.protein_goal) * 100, 100);
        const caloriesPercent = Math.min((item.calories / item.calories_goal) * 100, 100);

        return (
          <View key={index} style={nutritionStyles.dayContainer}>
            <View style={nutritionStyles.barsWrapper}>
              <View style={nutritionStyles.barBackground}>
                <View
                  style={[
                    nutritionStyles.barFill,
                    { height: `${proteinPercent}%`, backgroundColor: '#EF4444' },
                  ]}
                />
              </View>
              <View style={nutritionStyles.barBackground}>
                <View
                  style={[
                    nutritionStyles.barFill,
                    { height: `${caloriesPercent}%`, backgroundColor: '#10B981' },
                  ]}
                />
              </View>
            </View>
            <Text style={nutritionStyles.label}>{date.getDate()}</Text>
          </View>
        );
      })}
    </View>
  );
};

export default function ProgressScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [volumeData, setVolumeData] = useState<VolumeData[]>([]);
  const [nutritionData, setNutritionData] = useState<NutritionData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'workouts' | 'nutrition'>('workouts');

  const fetchStats = useCallback(async () => {
    try {
      setIsLoading(true);
      const [volume, nutrition] = await Promise.all([
        statsApi.getWorkoutVolume(30),
        statsApi.getNutritionAdherence(7),
      ]);

      setVolumeData(volume.slice(-10));
      setNutritionData(nutrition);
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchStats();
    setRefreshing(false);
  };

  const goals = user?.goals || {
    daily_calories: 2000,
    protein_grams: 150,
    workouts_per_week: 4,
  };

  const totalVolume = volumeData.reduce((sum, d) => sum + d.volume, 0);
  const avgProtein = nutritionData.length > 0
    ? Math.round(nutritionData.reduce((sum, d) => sum + d.protein, 0) / nutritionData.length)
    : 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Progress</Text>
          <Text style={styles.headerSubtitle}>Track your gains over time</Text>
        </View>
        <TouchableOpacity style={styles.aiButton} onPress={() => router.push('/progression')}>
          <Ionicons name="sparkles" size={22} color="#10B981" />
        </TouchableOpacity>
      </View>

      {/* Tab Selector */}
      <View style={styles.tabSelector}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'workouts' && styles.activeTab]}
          onPress={() => setActiveTab('workouts')}
        >
          <Ionicons
            name="barbell-outline"
            size={18}
            color={activeTab === 'workouts' ? '#FFFFFF' : '#6B7280'}
          />
          <Text style={[styles.tabText, activeTab === 'workouts' && styles.activeTabText]}>
            Workouts
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'nutrition' && styles.activeTab]}
          onPress={() => setActiveTab('nutrition')}
        >
          <Ionicons
            name="restaurant-outline"
            size={18}
            color={activeTab === 'nutrition' ? '#FFFFFF' : '#6B7280'}
          />
          <Text style={[styles.tabText, activeTab === 'nutrition' && styles.activeTabText]}>
            Nutrition
          </Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#10B981" />
        </View>
      ) : (
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10B981" />
          }
        >
          {activeTab === 'workouts' ? (
            <>
              {/* Volume Chart */}
              <View style={styles.chartCard}>
                <Text style={styles.chartTitle}>Workout Volume (Last 10 Sessions)</Text>
                <Text style={styles.chartSubtitle}>Total weight lifted per session</Text>
                {volumeData.length > 0 ? (
                  <SimpleBarChart data={volumeData} color="#10B981" />
                ) : (
                  <View style={styles.emptyChart}>
                    <Ionicons name="bar-chart-outline" size={48} color="#374151" />
                    <Text style={styles.emptyChartText}>No workout data yet</Text>
                  </View>
                )}
              </View>

              {/* Workout Stats */}
              <View style={styles.statsRow}>
                <View style={styles.statCard}>
                  <Ionicons name="flame" size={24} color="#EF4444" />
                  <Text style={styles.statValue}>{volumeData.length}</Text>
                  <Text style={styles.statLabel}>Total Sessions</Text>
                </View>
                <View style={styles.statCard}>
                  <Ionicons name="trending-up" size={24} color="#10B981" />
                  <Text style={styles.statValue}>
                    {totalVolume >= 1000 ? `${Math.round(totalVolume / 1000)}k` : totalVolume}
                  </Text>
                  <Text style={styles.statLabel}>Total Volume</Text>
                </View>
              </View>
            </>
          ) : (
            <>
              {/* Nutrition Chart */}
              <View style={styles.chartCard}>
                <Text style={styles.chartTitle}>Nutrition Adherence (Last 5 Days)</Text>
                <Text style={styles.chartSubtitle}>Protein (red) vs Calories (green)</Text>
                {nutritionData.length > 0 ? (
                  <NutritionProgressBars data={nutritionData} />
                ) : (
                  <View style={styles.emptyChart}>
                    <Ionicons name="nutrition-outline" size={48} color="#374151" />
                    <Text style={styles.emptyChartText}>No nutrition data yet</Text>
                  </View>
                )}
              </View>

              {/* Goal Progress */}
              <View style={styles.goalCard}>
                <Text style={styles.goalTitle}>Daily Goals</Text>
                <View style={styles.goalRow}>
                  <View style={styles.goalItem}>
                    <View style={[styles.goalDot, { backgroundColor: '#10B981' }]} />
                    <Text style={styles.goalLabel}>Calories</Text>
                    <Text style={styles.goalValue}>{goals.daily_calories}</Text>
                  </View>
                  <View style={styles.goalItem}>
                    <View style={[styles.goalDot, { backgroundColor: '#EF4444' }]} />
                    <Text style={styles.goalLabel}>Protein</Text>
                    <Text style={styles.goalValue}>{goals.protein_grams}g</Text>
                  </View>
                </View>
              </View>

              {/* Weekly Stats */}
              <View style={styles.statsRow}>
                <View style={styles.statCard}>
                  <Ionicons name="nutrition" size={24} color="#EF4444" />
                  <Text style={styles.statValue}>{avgProtein}g</Text>
                  <Text style={styles.statLabel}>Avg Protein/Day</Text>
                </View>
                <View style={styles.statCard}>
                  <Ionicons name="checkmark-circle" size={24} color="#10B981" />
                  <Text style={styles.statValue}>{nutritionData.length}</Text>
                  <Text style={styles.statLabel}>Days Logged</Text>
                </View>
              </View>
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const simpleChartStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    height: 160,
    paddingTop: 20,
  },
  barContainer: {
    alignItems: 'center',
  },
  barWrapper: {
    height: 120,
    justifyContent: 'flex-end',
  },
  bar: {
    width: 20,
    borderRadius: 4,
    minHeight: 4,
  },
  label: {
    color: '#6B7280',
    fontSize: 10,
    marginTop: 4,
  },
});

const nutritionStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    height: 160,
    paddingTop: 20,
  },
  dayContainer: {
    alignItems: 'center',
  },
  barsWrapper: {
    flexDirection: 'row',
    height: 120,
    alignItems: 'flex-end',
    gap: 4,
  },
  barBackground: {
    width: 16,
    height: 120,
    backgroundColor: '#374151',
    borderRadius: 4,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  barFill: {
    width: '100%',
    borderRadius: 4,
  },
  label: {
    color: '#6B7280',
    fontSize: 10,
    marginTop: 4,
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
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
  tabSelector: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginVertical: 12,
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  activeTab: {
    backgroundColor: '#10B981',
  },
  tabText: {
    color: '#6B7280',
    fontSize: 14,
    fontWeight: '600',
  },
  activeTabText: {
    color: '#FFFFFF',
  },
  loadingContainer: {
    flex: 1,
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
  chartCard: {
    backgroundColor: '#1F2937',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  chartTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  chartSubtitle: {
    color: '#6B7280',
    fontSize: 12,
    marginBottom: 8,
  },
  emptyChart: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyChartText: {
    color: '#6B7280',
    fontSize: 14,
    marginTop: 12,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#1F2937',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
  },
  statValue: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
    marginTop: 8,
  },
  statLabel: {
    color: '#6B7280',
    fontSize: 12,
    marginTop: 4,
  },
  goalCard: {
    backgroundColor: '#1F2937',
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
  },
  goalTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
  },
  goalRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  goalItem: {
    alignItems: 'center',
  },
  goalDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginBottom: 8,
  },
  goalLabel: {
    color: '#6B7280',
    fontSize: 12,
  },
  goalValue: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 4,
  },
});
