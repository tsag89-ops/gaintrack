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
import { format, addDays, subDays } from 'date-fns';
import { nutritionApi } from '../../src/services/api';
import { useNutritionStore } from '../../src/store/nutritionStore';
import { useAuthStore } from '../../src/store/authStore';
import { MacroBar } from '../../src/components/MacroBar';
import { DailyNutrition, MealType } from '../../src/types';

const MEAL_TYPES: { key: MealType; label: string; icon: string }[] = [
  { key: 'breakfast', label: 'Breakfast', icon: 'sunny-outline' },
  { key: 'lunch', label: 'Lunch', icon: 'restaurant-outline' },
  { key: 'dinner', label: 'Dinner', icon: 'moon-outline' },
  { key: 'snacks', label: 'Snacks', icon: 'cafe-outline' },
];

export default function NutritionScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { todayNutrition, setTodayNutrition, selectedDate, setSelectedDate, isLoading, setLoading } = useNutritionStore();
  const [refreshing, setRefreshing] = useState(false);

  const goals = user?.goals || {
    daily_calories: 2000,
    protein_grams: 150,
    carbs_grams: 200,
    fat_grams: 65,
  };

  const fetchNutrition = useCallback(async () => {
    try {
      setLoading(true);
      const data = await nutritionApi.getDaily(selectedDate);
      setTodayNutrition(data);
    } catch (error) {
      console.error('Error fetching nutrition:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    fetchNutrition();
  }, [fetchNutrition]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchNutrition();
    setRefreshing(false);
  };

  const changeDate = (direction: 'prev' | 'next') => {
    const currentDate = new Date(selectedDate);
    const newDate = direction === 'prev' ? subDays(currentDate, 1) : addDays(currentDate, 1);
    setSelectedDate(format(newDate, 'yyyy-MM-dd'));
  };

  const handleAddFood = (mealType: MealType) => {
    router.push(`/add-food?mealType=${mealType}&date=${selectedDate}`);
  };

  const getMealCalories = (mealType: MealType): number => {
    if (!todayNutrition?.meals[mealType]) return 0;
    return todayNutrition.meals[mealType].reduce((sum, entry) => sum + entry.calories, 0);
  };

  const isToday = selectedDate === format(new Date(), 'yyyy-MM-dd');

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Nutrition</Text>
        <Text style={styles.headerSubtitle}>Track your macros</Text>
      </View>

      {/* Date Selector */}
      <View style={styles.dateSelector}>
        <TouchableOpacity onPress={() => changeDate('prev')} style={styles.dateArrow}>
          <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.dateCenter}>
          <Text style={styles.dateText}>
            {isToday ? 'Today' : format(new Date(selectedDate), 'MMM d, yyyy')}
          </Text>
        </View>
        <TouchableOpacity onPress={() => changeDate('next')} style={styles.dateArrow}>
          <Ionicons name="chevron-forward" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {isLoading && !todayNutrition ? (
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
          {/* Macro Summary */}
          <View style={styles.macroCard}>
            <View style={styles.calorieHeader}>
              <View>
                <Text style={styles.calorieValue}>
                  {Math.round(todayNutrition?.total_calories || 0)}
                </Text>
                <Text style={styles.calorieLabel}>of {goals.daily_calories} cal</Text>
              </View>
              <View style={styles.calorieRing}>
                <Text style={styles.caloriePercent}>
                  {Math.round(((todayNutrition?.total_calories || 0) / goals.daily_calories) * 100)}%
                </Text>
              </View>
            </View>

            <View style={styles.macroBars}>
              <MacroBar
                label="Protein"
                current={todayNutrition?.total_protein || 0}
                goal={goals.protein_grams}
                color="#EF4444"
              />
              <MacroBar
                label="Carbs"
                current={todayNutrition?.total_carbs || 0}
                goal={goals.carbs_grams}
                color="#3B82F6"
              />
              <MacroBar
                label="Fat"
                current={todayNutrition?.total_fat || 0}
                goal={goals.fat_grams}
                color="#F59E0B"
              />
            </View>
          </View>

          {/* Meals */}
          {MEAL_TYPES.map((meal) => (
            <View key={meal.key} style={styles.mealCard}>
              <View style={styles.mealHeader}>
                <View style={styles.mealTitleRow}>
                  <Ionicons name={meal.icon as any} size={20} color="#10B981" />
                  <Text style={styles.mealTitle}>{meal.label}</Text>
                </View>
                <Text style={styles.mealCalories}>{Math.round(getMealCalories(meal.key))} cal</Text>
              </View>

              {todayNutrition?.meals[meal.key]?.map((entry, idx) => (
                <View key={idx} style={styles.foodEntry}>
                  <View style={styles.foodInfo}>
                    <Text style={styles.foodName}>{entry.food_name}</Text>
                    <Text style={styles.foodServings}>{entry.servings} serving(s)</Text>
                  </View>
                  <Text style={styles.foodCalories}>{Math.round(entry.calories)} cal</Text>
                </View>
              ))}

              <TouchableOpacity
                style={styles.addFoodBtn}
                onPress={() => handleAddFood(meal.key)}
              >
                <Ionicons name="add" size={20} color="#10B981" />
                <Text style={styles.addFoodText}>Add Food</Text>
              </TouchableOpacity>
            </View>
          ))}
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
  dateSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  dateArrow: {
    padding: 8,
  },
  dateCenter: {
    flex: 1,
    alignItems: 'center',
  },
  dateText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
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
  macroCard: {
    backgroundColor: '#1F2937',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  calorieHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  calorieValue: {
    fontSize: 36,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  calorieLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  calorieRing: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#10B98120',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#10B981',
  },
  caloriePercent: {
    color: '#10B981',
    fontSize: 14,
    fontWeight: '700',
  },
  macroBars: {
    gap: 4,
  },
  mealCard: {
    backgroundColor: '#1F2937',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  mealHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  mealTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mealTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  mealCalories: {
    color: '#6B7280',
    fontSize: 14,
  },
  foodEntry: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  foodInfo: {
    flex: 1,
  },
  foodName: {
    color: '#FFFFFF',
    fontSize: 14,
  },
  foodServings: {
    color: '#6B7280',
    fontSize: 12,
    marginTop: 2,
  },
  foodCalories: {
    color: '#9CA3AF',
    fontSize: 14,
  },
  addFoodBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginTop: 8,
    backgroundColor: '#10B98115',
    borderRadius: 8,
    gap: 6,
  },
  addFoodText: {
    color: '#10B981',
    fontSize: 14,
    fontWeight: '600',
  },
});
