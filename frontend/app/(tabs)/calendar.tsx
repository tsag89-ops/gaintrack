import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, addMonths, subMonths } from 'date-fns';
import { statsApi } from '../../src/services/api';
import { useRouter } from 'expo-router';

type DayData = {
  workouts: { workout_id: string; name: string; exercise_count: number }[];
  nutrition: { calories: number; protein: number } | null;
};

export default function CalendarScreen() {
  const router = useRouter();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [calendarData, setCalendarData] = useState<Record<string, DayData>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const fetchCalendarData = useCallback(async () => {
    try {
      setIsLoading(true);
      const year = currentMonth.getFullYear();
      const month = currentMonth.getMonth() + 1; // API expects 1-indexed month
      const data = await statsApi.getCalendarData(year, month);
      setCalendarData(data);
    } catch (error) {
      console.error('Error fetching calendar data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [currentMonth]);

  useEffect(() => {
    fetchCalendarData();
  }, [fetchCalendarData]);

  const changeMonth = (direction: 'prev' | 'next') => {
    setCurrentMonth(prev => direction === 'prev' ? subMonths(prev, 1) : addMonths(prev, 1));
    setSelectedDate(null);
  };

  const getDaysInMonth = () => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    return eachDayOfInterval({ start, end });
  };

  const getFirstDayOffset = () => {
    return startOfMonth(currentMonth).getDay(); // 0 = Sunday
  };

  const getDayData = (date: Date): DayData | null => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return calendarData[dateStr] || null;
  };

  const handleDayPress = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    setSelectedDate(prev => prev === dateStr ? null : dateStr);
  };

  const days = getDaysInMonth();
  const firstDayOffset = getFirstDayOffset();
  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const selectedDayData = selectedDate ? calendarData[selectedDate] : null;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Calendar</Text>
        <Text style={styles.headerSubtitle}>Your fitness schedule</Text>
      </View>

      {/* Month Selector */}
      <View style={styles.monthSelector}>
        <TouchableOpacity onPress={() => changeMonth('prev')} style={styles.monthArrow}>
          <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.monthText}>{format(currentMonth, 'MMMM yyyy')}</Text>
        <TouchableOpacity onPress={() => changeMonth('next')} style={styles.monthArrow}>
          <Ionicons name="chevron-forward" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#10B981" />
        </View>
      ) : (
        <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
          {/* Calendar Grid */}
          <View style={styles.calendarCard}>
            {/* Week days header */}
            <View style={styles.weekDaysRow}>
              {weekDays.map((day) => (
                <View key={day} style={styles.weekDayCell}>
                  <Text style={styles.weekDayText}>{day}</Text>
                </View>
              ))}
            </View>

            {/* Days grid */}
            <View style={styles.daysGrid}>
              {/* Empty cells for offset */}
              {Array.from({ length: firstDayOffset }).map((_, idx) => (
                <View key={`empty-${idx}`} style={styles.dayCell} />
              ))}

              {/* Actual days */}
              {days.map((date) => {
                const dateStr = format(date, 'yyyy-MM-dd');
                const dayData = getDayData(date);
                const hasWorkout = dayData?.workouts && dayData.workouts.length > 0;
                const hasNutrition = dayData?.nutrition && dayData.nutrition.calories > 0;
                const isSelected = selectedDate === dateStr;
                const today = isToday(date);

                return (
                  <TouchableOpacity
                    key={dateStr}
                    style={[
                      styles.dayCell,
                      today && styles.todayCell,
                      isSelected && styles.selectedCell,
                    ]}
                    onPress={() => handleDayPress(date)}
                  >
                    <Text
                      style={[
                        styles.dayNumber,
                        today && styles.todayText,
                        isSelected && styles.selectedText,
                      ]}
                    >
                      {date.getDate()}
                    </Text>
                    <View style={styles.indicators}>
                      {hasWorkout && <View style={[styles.indicator, { backgroundColor: '#10B981' }]} />}
                      {hasNutrition && <View style={[styles.indicator, { backgroundColor: '#3B82F6' }]} />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Legend */}
          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#10B981' }]} />
              <Text style={styles.legendText}>Workout</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#3B82F6' }]} />
              <Text style={styles.legendText}>Nutrition Logged</Text>
            </View>
          </View>

          {/* Selected Day Details */}
          {selectedDate && selectedDayData && (
            <View style={styles.detailsCard}>
              <Text style={styles.detailsTitle}>
                {format(new Date(selectedDate), 'EEEE, MMMM d')}
              </Text>

              {selectedDayData.workouts.length > 0 ? (
                <View style={styles.detailSection}>
                  <View style={styles.sectionHeader}>
                    <Ionicons name="barbell-outline" size={18} color="#10B981" />
                    <Text style={styles.sectionTitle}>Workouts</Text>
                  </View>
                  {selectedDayData.workouts.map((workout, idx) => (
                    <TouchableOpacity
                      key={idx}
                      style={styles.workoutItem}
                      onPress={() => router.push(`/workout/${workout.workout_id}`)}
                    >
                      <Text style={styles.workoutName}>{workout.name}</Text>
                      <Text style={styles.workoutMeta}>{workout.exercise_count} exercises</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                <View style={styles.emptySection}>
                  <Text style={styles.emptyText}>No workouts logged</Text>
                </View>
              )}

              {selectedDayData.nutrition ? (
                <View style={styles.detailSection}>
                  <View style={styles.sectionHeader}>
                    <Ionicons name="restaurant-outline" size={18} color="#3B82F6" />
                    <Text style={styles.sectionTitle}>Nutrition</Text>
                  </View>
                  <View style={styles.nutritionRow}>
                    <View style={styles.nutritionItem}>
                      <Text style={styles.nutritionValue}>{selectedDayData.nutrition.calories}</Text>
                      <Text style={styles.nutritionLabel}>Calories</Text>
                    </View>
                    <View style={styles.nutritionItem}>
                      <Text style={styles.nutritionValue}>{selectedDayData.nutrition.protein}g</Text>
                      <Text style={styles.nutritionLabel}>Protein</Text>
                    </View>
                  </View>
                </View>
              ) : (
                <View style={styles.emptySection}>
                  <Text style={styles.emptyText}>No nutrition logged</Text>
                </View>
              )}
            </View>
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
  monthSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  monthArrow: {
    padding: 8,
  },
  monthText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    marginHorizontal: 20,
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
  calendarCard: {
    backgroundColor: '#1F2937',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  weekDaysRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  weekDayCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  weekDayText: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '600',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.28%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
  },
  todayCell: {
    backgroundColor: '#10B98130',
    borderRadius: 8,
  },
  selectedCell: {
    backgroundColor: '#10B981',
    borderRadius: 8,
  },
  dayNumber: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  todayText: {
    color: '#10B981',
    fontWeight: '700',
  },
  selectedText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  indicators: {
    flexDirection: 'row',
    gap: 2,
    marginTop: 2,
  },
  indicator: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
    marginBottom: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    color: '#9CA3AF',
    fontSize: 12,
  },
  detailsCard: {
    backgroundColor: '#1F2937',
    borderRadius: 16,
    padding: 20,
  },
  detailsTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
  },
  detailSection: {
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  workoutItem: {
    backgroundColor: '#111827',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  workoutName: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  workoutMeta: {
    color: '#6B7280',
    fontSize: 12,
    marginTop: 4,
  },
  nutritionRow: {
    flexDirection: 'row',
    gap: 16,
  },
  nutritionItem: {
    flex: 1,
    backgroundColor: '#111827',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  nutritionValue: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  nutritionLabel: {
    color: '#6B7280',
    fontSize: 12,
    marginTop: 4,
  },
  emptySection: {
    padding: 16,
    alignItems: 'center',
  },
  emptyText: {
    color: '#6B7280',
    fontSize: 14,
  },
});
