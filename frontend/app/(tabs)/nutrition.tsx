// frontend/app/(tabs)/nutrition.tsx
// Daily nutrition log — macro summary + per-meal food entries
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format, addDays, subDays } from 'date-fns';
import { nutritionApi } from '../../src/services/api';
import { useAuthStore } from '../../src/store/authStore';
import { DailyNutrition, MealType } from '../../src/types';

const MEAL_ICONS: Record<MealType, string> = {
  breakfast: 'sunny-outline',
  lunch: 'partly-sunny-outline',
  dinner: 'moon-outline',
  snacks: 'cafe-outline',
};

const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snacks: 'Snacks',
};

const MEALS: MealType[] = ['breakfast', 'lunch', 'dinner', 'snacks'];

function MacroBar({ label, current, goal, color }: { label: string; current: number; goal: number; color: string }) {
  const pct = goal > 0 ? Math.min(current / goal, 1) : 0;
  return (
    <View style={styles.macroBarWrap}>
      <View style={styles.macroBarRow}>
        <Text style={styles.macroLabel}>{label}</Text>
        <Text style={styles.macroValue}>{Math.round(current)}<Text style={styles.macroGoal}> / {goal}</Text></Text>
      </View>
      <View style={styles.macroTrack}>
        <View style={[styles.macroFill, { width: `${pct * 100}%` as any, backgroundColor: color }]} />
      </View>
    </View>
  );
}

export default function NutritionScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const goals = user?.goals ?? { daily_calories: 2000, protein_grams: 150, carbs_grams: 200, fat_grams: 65 };

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [nutrition, setNutrition] = useState<DailyNutrition | null>(null);

  const dateStr = format(selectedDate, 'yyyy-MM-dd');
  const isToday = dateStr === format(new Date(), 'yyyy-MM-dd');

  const load = useCallback(async () => {
    const data = await nutritionApi.getDailyNutrition(dateStr);
    setNutrition(data);
  }, [dateStr]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const meals = nutrition?.meals ?? { breakfast: [], lunch: [], dinner: [], snacks: [] };
  const totals = {
    calories: nutrition?.total_calories ?? 0,
    protein: nutrition?.total_protein ?? 0,
    carbs: nutrition?.total_carbs ?? 0,
    fat: nutrition?.total_fat ?? 0,
  };

  const getMealCalories = (type: MealType) =>
    (meals[type] ?? []).reduce((sum, e: any) => sum + (e.calories ?? 0), 0);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Date navigator */}
      <View style={styles.dateNav}>
        <TouchableOpacity onPress={() => setSelectedDate(d => subDays(d, 1))} style={styles.navBtn}>
          <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.dateText}>
          {isToday ? 'Today' : format(selectedDate, 'EEE, MMM d')}
        </Text>
        <TouchableOpacity
          onPress={() => setSelectedDate(d => addDays(d, 1))}
          style={styles.navBtn}
          disabled={isToday}
        >
          <Ionicons name="chevron-forward" size={22} color={isToday ? '#444' : '#FFFFFF'} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Calorie ring summary */}
        <View style={styles.calorieCard}>
          <View style={styles.calorieRow}>
            <View style={styles.calorieMain}>
              <Text style={styles.calorieNum}>{Math.round(totals.calories)}</Text>
              <Text style={styles.calorieLabel}>kcal eaten</Text>
            </View>
            <View style={styles.calorieSep} />
            <View style={styles.calorieMain}>
              <Text style={[styles.calorieNum, { color: totals.calories > goals.daily_calories ? '#F44336' : '#4CAF50' }]}>
                {Math.max(0, goals.daily_calories - Math.round(totals.calories))}
              </Text>
              <Text style={styles.calorieLabel}>kcal left</Text>
            </View>
            <View style={styles.calorieSep} />
            <View style={styles.calorieMain}>
              <Text style={styles.calorieNum}>{goals.daily_calories}</Text>
              <Text style={styles.calorieLabel}>kcal goal</Text>
            </View>
          </View>
        </View>

        {/* Macro bars */}
        <View style={styles.macroCard}>
          <MacroBar label="Protein" current={totals.protein} goal={goals.protein_grams} color="#FF6200" />
          <MacroBar label="Carbs"   current={totals.carbs}   goal={goals.carbs_grams}   color="#3B82F6" />
          <MacroBar label="Fat"     current={totals.fat}     goal={goals.fat_grams}      color="#F59E0B" />
        </View>

        {/* Meal sections */}
        {MEALS.map((mealType) => {
          const entries: any[] = meals[mealType] ?? [];
          const mealKcal = getMealCalories(mealType);
          return (
            <View key={mealType} style={styles.mealCard}>
              <View style={styles.mealHeader}>
                <View style={styles.mealHeaderLeft}>
                  <Ionicons name={MEAL_ICONS[mealType] as any} size={18} color="#FF6200" />
                  <Text style={styles.mealTitle}>{MEAL_LABELS[mealType]}</Text>
                  {mealKcal > 0 && <Text style={styles.mealKcal}>{Math.round(mealKcal)} kcal</Text>}
                </View>
                <TouchableOpacity
                  style={styles.addBtn}
                  onPress={() => router.push({ pathname: '/add-food', params: { mealType, date: dateStr } })}
                >
                  <Ionicons name="add" size={20} color="#FF6200" />
                </TouchableOpacity>
              </View>

              {entries.length === 0 ? (
                <Text style={styles.emptyMeal}>No foods logged</Text>
              ) : (
                entries.map((entry: any, idx: number) => (
                  <View key={idx} style={styles.foodEntry}>
                    <Text style={styles.foodName} numberOfLines={1}>{entry.food_name ?? entry.name ?? 'Food'}</Text>
                    <Text style={styles.foodMacros}>
                      {Math.round(entry.calories ?? 0)} kcal · P {Math.round(entry.protein ?? 0)}g · C {Math.round(entry.carbs ?? 0)}g · F {Math.round(entry.fat ?? 0)}g
                    </Text>
                  </View>
                ))
              )}
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1A1A1A' },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 32 },

  dateNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  navBtn: { padding: 6 },
  dateText: { fontSize: 17, fontWeight: '700', color: '#FFFFFF' },

  calorieCard: { marginHorizontal: 16, marginBottom: 12, backgroundColor: '#252525', borderRadius: 14, padding: 16 },
  calorieRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  calorieMain: { alignItems: 'center', flex: 1 },
  calorieSep: { width: 1, height: 40, backgroundColor: '#3A3A3A' },
  calorieNum: { fontSize: 22, fontWeight: '800', color: '#FFFFFF' },
  calorieLabel: { fontSize: 11, color: '#B0B0B0', marginTop: 2 },

  macroCard: { marginHorizontal: 16, marginBottom: 12, backgroundColor: '#252525', borderRadius: 14, padding: 16, gap: 10 },
  macroBarWrap: { gap: 4 },
  macroBarRow: { flexDirection: 'row', justifyContent: 'space-between' },
  macroLabel: { fontSize: 13, color: '#B0B0B0' },
  macroValue: { fontSize: 13, color: '#FFFFFF', fontWeight: '600' },
  macroGoal: { fontWeight: '400', color: '#B0B0B0' },
  macroTrack: { height: 6, backgroundColor: '#3A3A3A', borderRadius: 3, overflow: 'hidden' },
  macroFill: { height: 6, borderRadius: 3 },

  mealCard: { marginHorizontal: 16, marginBottom: 10, backgroundColor: '#252525', borderRadius: 14, overflow: 'hidden' },
  mealHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12 },
  mealHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mealTitle: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  mealKcal: { fontSize: 12, color: '#B0B0B0' },
  addBtn: { padding: 4 },
  emptyMeal: { fontSize: 13, color: '#666', paddingHorizontal: 14, paddingBottom: 12 },
  foodEntry: { paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#2D2D2D' },
  foodName: { fontSize: 14, color: '#FFFFFF', fontWeight: '500' },
  foodMacros: { fontSize: 12, color: '#B0B0B0', marginTop: 2 },
});
