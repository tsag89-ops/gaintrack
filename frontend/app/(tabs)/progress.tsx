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
import { BarChart, LineChart } from 'react-native-gifted-charts';
import { statsApi } from '../../src/services/api';
import { useAuthStore } from '../../src/store/authStore';

const screenWidth = Dimensions.get('window').width;

export default function ProgressScreen() {
  const { user } = useAuthStore();
  const [volumeData, setVolumeData] = useState<any[]>([]);
  const [nutritionData, setNutritionData] = useState<any[]>([]);
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

      // Transform volume data for chart
      const volumeChartData = volume.slice(-10).map((item: any) => ({
        value: item.volume / 1000, // Convert to thousands
        label: new Date(item.date).getDate().toString(),
        frontColor: '#10B981',
      }));
      setVolumeData(volumeChartData);

      // Transform nutrition data for chart
      const nutritionChartData = nutrition.map((item: any) => ({
        value: item.protein,
        label: new Date(item.date).getDate().toString(),
        dataPointText: `${item.protein}g`,
      }));
      setNutritionData(nutritionChartData);
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

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Progress</Text>
        <Text style={styles.headerSubtitle}>Track your gains over time</Text>
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
                <Text style={styles.chartSubtitle}>Total weight lifted (in thousands)</Text>
                {volumeData.length > 0 ? (
                  <View style={styles.chartContainer}>
                    <BarChart
                      data={volumeData}
                      barWidth={22}
                      spacing={16}
                      roundedTop
                      xAxisThickness={0}
                      yAxisThickness={0}
                      yAxisTextStyle={{ color: '#6B7280', fontSize: 10 }}
                      xAxisLabelTextStyle={{ color: '#6B7280', fontSize: 10 }}
                      noOfSections={4}
                      maxValue={Math.max(...volumeData.map(d => d.value)) * 1.2 || 10}
                      barBorderRadius={4}
                      frontColor="#10B981"
                      backgroundColor="transparent"
                      hideRules
                      width={screenWidth - 80}
                    />
                  </View>
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
                    {volumeData.length > 0
                      ? `${Math.round(volumeData.reduce((a, b) => a + b.value, 0))}k`
                      : '0'}
                  </Text>
                  <Text style={styles.statLabel}>Total Volume</Text>
                </View>
              </View>
            </>
          ) : (
            <>
              {/* Protein Chart */}
              <View style={styles.chartCard}>
                <Text style={styles.chartTitle}>Protein Intake (Last 7 Days)</Text>
                <Text style={styles.chartSubtitle}>Daily protein consumption in grams</Text>
                {nutritionData.length > 0 ? (
                  <View style={styles.chartContainer}>
                    <LineChart
                      data={nutritionData}
                      color="#EF4444"
                      thickness={3}
                      dataPointsColor="#EF4444"
                      dataPointsRadius={5}
                      xAxisThickness={0}
                      yAxisThickness={0}
                      yAxisTextStyle={{ color: '#6B7280', fontSize: 10 }}
                      xAxisLabelTextStyle={{ color: '#6B7280', fontSize: 10 }}
                      noOfSections={4}
                      maxValue={goals.protein_grams * 1.2}
                      backgroundColor="transparent"
                      hideRules
                      width={screenWidth - 80}
                      curved
                      areaChart
                      startFillColor="#EF444420"
                      endFillColor="#EF444405"
                    />
                  </View>
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
            </>
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
    marginBottom: 20,
  },
  chartContainer: {
    alignItems: 'center',
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
