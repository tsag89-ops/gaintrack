import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { progressionApi } from '../src/services/api';

interface ProgressionSuggestion {
  exercise_name: string;
  current_weight: number;
  suggested_weight: number;
  increase_amount: number;
  increase_percentage: number;
  confidence: string;
  reason: string;
  recent_performance: Array<{
    date: string;
    max_weight: number;
    sets_completed: number;
    total_reps: number;
    avg_rpe: number;
  }>;
}

interface ExerciseHistory {
  exercise_name: string;
  history: Array<{
    date: string;
    max_weight: number;
    total_volume: number;
    sets: number;
    total_reps: number;
    avg_rpe: number;
  }>;
  personal_records: {
    max_weight: number;
    max_volume: number;
  };
  trend: string;
  total_sessions: number;
}

const CONFIDENCE_COLORS: Record<string, string> = {
  high: '#10B981',
  medium: '#F59E0B',
  low: '#6B7280',
};

const TREND_ICONS: Record<string, { icon: string; color: string }> = {
  improving: { icon: 'trending-up', color: '#10B981' },
  stable: { icon: 'remove', color: '#F59E0B' },
  declining: { icon: 'trending-down', color: '#EF4444' },
  not_enough_data: { icon: 'help-circle', color: '#6B7280' },
  no_data: { icon: 'help-circle', color: '#6B7280' },
};

export default function ProgressionScreen() {
  const router = useRouter();
  const [suggestions, setSuggestions] = useState<ProgressionSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null);
  const [exerciseHistory, setExerciseHistory] = useState<ExerciseHistory | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [totalAnalyzed, setTotalAnalyzed] = useState(0);

  const fetchSuggestions = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await progressionApi.getSuggestions();
      setSuggestions(data.suggestions || []);
      setTotalAnalyzed(data.total_exercises_analyzed || 0);
    } catch (error) {
      console.error('Error fetching progression suggestions:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSuggestions();
  }, [fetchSuggestions]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchSuggestions();
    setRefreshing(false);
  };

  const handleViewHistory = async (exerciseName: string) => {
    setSelectedExercise(exerciseName);
    try {
      const data = await progressionApi.getExerciseProgression(exerciseName);
      setExerciseHistory(data);
      setShowHistory(true);
    } catch (error) {
      console.error('Error fetching exercise history:', error);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color="#FFFFFF" />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>AI Progression</Text>
          <Text style={styles.headerSubtitle}>Smart weight recommendations</Text>
        </View>
        <View style={styles.aiIcon}>
          <Ionicons name="sparkles" size={24} color="#10B981" />
        </View>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#10B981" />
          <Text style={styles.loadingText}>Analyzing your workouts...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10B981" />
          }
        >
          {/* Stats Card */}
          <View style={styles.statsCard}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{totalAnalyzed}</Text>
              <Text style={styles.statLabel}>Exercises Tracked</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{suggestions.length}</Text>
              <Text style={styles.statLabel}>Ready to Progress</Text>
            </View>
          </View>

          {suggestions.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="analytics-outline" size={64} color="#374151" />
              <Text style={styles.emptyTitle}>No Suggestions Yet</Text>
              <Text style={styles.emptySubtitle}>
                Complete more workouts to get personalized progression recommendations.
                We need at least 2 sessions per exercise to analyze your performance.
              </Text>
            </View>
          ) : (
            <>
              <Text style={styles.sectionTitle}>Progression Suggestions</Text>
              {suggestions.map((suggestion, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.suggestionCard}
                  onPress={() => handleViewHistory(suggestion.exercise_name)}
                  activeOpacity={0.7}
                >
                  <View style={styles.suggestionHeader}>
                    <View style={styles.exerciseInfo}>
                      <Text style={styles.exerciseName}>{suggestion.exercise_name}</Text>
                      <View
                        style={[
                          styles.confidenceBadge,
                          { backgroundColor: CONFIDENCE_COLORS[suggestion.confidence] + '30' },
                        ]}
                      >
                        <Ionicons
                          name={
                            suggestion.confidence === 'high'
                              ? 'checkmark-circle'
                              : suggestion.confidence === 'medium'
                              ? 'alert-circle'
                              : 'help-circle'
                          }
                          size={14}
                          color={CONFIDENCE_COLORS[suggestion.confidence]}
                        />
                        <Text
                          style={[
                            styles.confidenceText,
                            { color: CONFIDENCE_COLORS[suggestion.confidence] },
                          ]}
                        >
                          {suggestion.confidence} confidence
                        </Text>
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#6B7280" />
                  </View>

                  <View style={styles.progressionInfo}>
                    <View style={styles.weightChange}>
                      <Text style={styles.currentWeight}>{suggestion.current_weight}</Text>
                      <Ionicons name="arrow-forward" size={20} color="#10B981" />
                      <Text style={styles.suggestedWeight}>{suggestion.suggested_weight}</Text>
                      <Text style={styles.weightUnit}>lbs</Text>
                    </View>
                    <View style={styles.increaseInfo}>
                      <Text style={styles.increaseAmount}>
                        +{suggestion.increase_amount} lbs ({suggestion.increase_percentage}%)
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.reason}>{suggestion.reason}</Text>

                  <View style={styles.recentPerformance}>
                    <Text style={styles.recentTitle}>Recent Sessions:</Text>
                    <View style={styles.performanceRow}>
                      {suggestion.recent_performance.slice(0, 3).map((perf, idx) => (
                        <View key={idx} style={styles.perfItem}>
                          <Text style={styles.perfDate}>{formatDate(perf.date)}</Text>
                          <Text style={styles.perfWeight}>{perf.max_weight} lbs</Text>
                          <Text style={styles.perfRpe}>RPE {perf.avg_rpe}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </>
          )}
        </ScrollView>
      )}

      {/* Exercise History Modal */}
      <Modal visible={showHistory} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />

            {exerciseHistory && (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>{exerciseHistory.exercise_name}</Text>
                  <TouchableOpacity onPress={() => setShowHistory(false)}>
                    <Ionicons name="close" size={24} color="#9CA3AF" />
                  </TouchableOpacity>
                </View>

                <View style={styles.prCard}>
                  <View style={styles.prItem}>
                    <Ionicons name="trophy" size={24} color="#F59E0B" />
                    <Text style={styles.prValue}>{exerciseHistory.personal_records.max_weight} lbs</Text>
                    <Text style={styles.prLabel}>Max Weight</Text>
                  </View>
                  <View style={styles.prItem}>
                    <Ionicons name="flame" size={24} color="#EF4444" />
                    <Text style={styles.prValue}>{exerciseHistory.personal_records.max_volume}</Text>
                    <Text style={styles.prLabel}>Max Volume</Text>
                  </View>
                  <View style={styles.prItem}>
                    <Ionicons
                      name={TREND_ICONS[exerciseHistory.trend]?.icon as any || 'help-circle'}
                      size={24}
                      color={TREND_ICONS[exerciseHistory.trend]?.color || '#6B7280'}
                    />
                    <Text style={[styles.prValue, { textTransform: 'capitalize' }]}>
                      {exerciseHistory.trend.replace('_', ' ')}
                    </Text>
                    <Text style={styles.prLabel}>Trend</Text>
                  </View>
                </View>

                <Text style={styles.historyTitle}>
                  Session History ({exerciseHistory.total_sessions} total)
                </Text>

                <ScrollView style={styles.historyList}>
                  {exerciseHistory.history.map((session, idx) => (
                    <View key={idx} style={styles.historyItem}>
                      <View style={styles.historyDate}>
                        <Text style={styles.historyDateText}>{formatDate(session.date)}</Text>
                      </View>
                      <View style={styles.historyStats}>
                        <View style={styles.historyStat}>
                          <Text style={styles.historyValue}>{session.max_weight}</Text>
                          <Text style={styles.historyLabel}>lbs</Text>
                        </View>
                        <View style={styles.historyStat}>
                          <Text style={styles.historyValue}>{session.sets}x{Math.round(session.total_reps / session.sets)}</Text>
                          <Text style={styles.historyLabel}>sets×reps</Text>
                        </View>
                        <View style={styles.historyStat}>
                          <Text style={styles.historyValue}>{session.avg_rpe}</Text>
                          <Text style={styles.historyLabel}>RPE</Text>
                        </View>
                        <View style={styles.historyStat}>
                          <Text style={styles.historyValue}>{session.total_volume}</Text>
                          <Text style={styles.historyLabel}>volume</Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>
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
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
  },
  aiIcon: {
    marginLeft: 'auto',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#10B98120',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#6B7280',
    fontSize: 14,
    marginTop: 12,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  statsCard: {
    flexDirection: 'row',
    backgroundColor: '#1F2937',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
  },
  statLabel: {
    color: '#6B7280',
    fontSize: 12,
    marginTop: 4,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
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
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 22,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  suggestionCard: {
    backgroundColor: '#1F2937',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  suggestionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  exerciseInfo: {
    flex: 1,
  },
  exerciseName: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  confidenceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 6,
    alignSelf: 'flex-start',
    gap: 4,
  },
  confidenceText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  progressionInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  weightChange: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  currentWeight: {
    color: '#9CA3AF',
    fontSize: 24,
    fontWeight: '700',
  },
  suggestedWeight: {
    color: '#10B981',
    fontSize: 24,
    fontWeight: '700',
  },
  weightUnit: {
    color: '#6B7280',
    fontSize: 14,
    marginLeft: 4,
  },
  increaseInfo: {
    backgroundColor: '#10B98120',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  increaseAmount: {
    color: '#10B981',
    fontSize: 12,
    fontWeight: '600',
  },
  reason: {
    color: '#9CA3AF',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  recentPerformance: {
    borderTopWidth: 1,
    borderTopColor: '#374151',
    paddingTop: 12,
  },
  recentTitle: {
    color: '#6B7280',
    fontSize: 12,
    marginBottom: 8,
  },
  performanceRow: {
    flexDirection: 'row',
    gap: 12,
  },
  perfItem: {
    flex: 1,
    backgroundColor: '#111827',
    borderRadius: 8,
    padding: 8,
    alignItems: 'center',
  },
  perfDate: {
    color: '#6B7280',
    fontSize: 10,
  },
  perfWeight: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 2,
  },
  perfRpe: {
    color: '#9CA3AF',
    fontSize: 10,
    marginTop: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1F2937',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 34,
    maxHeight: '85%',
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#4B5563',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
  },
  prCard: {
    flexDirection: 'row',
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  prItem: {
    flex: 1,
    alignItems: 'center',
  },
  prValue: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 8,
  },
  prLabel: {
    color: '#6B7280',
    fontSize: 11,
    marginTop: 4,
  },
  historyTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  historyList: {
    maxHeight: 300,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111827',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  historyDate: {
    width: 60,
  },
  historyDateText: {
    color: '#10B981',
    fontSize: 12,
    fontWeight: '600',
  },
  historyStats: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  historyStat: {
    alignItems: 'center',
  },
  historyValue: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  historyLabel: {
    color: '#6B7280',
    fontSize: 10,
    marginTop: 2,
  },
});
