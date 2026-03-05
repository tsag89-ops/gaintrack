// frontend/app/(tabs)/nutrition.tsx
// Daily nutrition log — macro summary + per-meal food entries
import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
  Modal,
  TextInput,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { format, addDays, subDays } from 'date-fns';
import { nutritionApi, foodApi } from '../../src/services/api';
import { getDailyNutritionFromFirestore, saveDailyNutrition } from '../../src/services/firestore';
import { useAuthStore } from '../../src/store/authStore';
import { usePro } from '../../src/hooks/usePro';
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

function SwipeableFoodEntry({ entry, onDelete, onEdit }: { entry: any; onDelete: () => void; onEdit: () => void }) {
  const swipeRef = useRef<Swipeable>(null);

  const renderLeftAction = (_: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>) => {
    const scale = dragX.interpolate({ inputRange: [0, 72], outputRange: [0.8, 1], extrapolate: 'clamp' });
    return (
      <TouchableOpacity
        style={styles.editAction}
        onPress={() => { swipeRef.current?.close(); onEdit(); }}
        activeOpacity={0.8}
      >
        <Animated.View style={{ transform: [{ scale }], alignItems: 'center' }}>
          <Ionicons name="pencil-outline" size={20} color="#FFFFFF" />
          <Text style={styles.editActionText}>Edit</Text>
        </Animated.View>
      </TouchableOpacity>
    );
  };

  const renderRightAction = (_: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>) => {
    const scale = dragX.interpolate({ inputRange: [-72, 0], outputRange: [1, 0.8], extrapolate: 'clamp' });
    return (
      <TouchableOpacity
        style={styles.deleteAction}
        onPress={() => {
          swipeRef.current?.close();
          onDelete();
        }}
        activeOpacity={0.8}
      >
        <Animated.View style={{ transform: [{ scale }], alignItems: 'center' }}>
          <Ionicons name="trash-outline" size={20} color="#FFFFFF" />
          <Text style={styles.deleteActionText}>Delete</Text>
        </Animated.View>
      </TouchableOpacity>
    );
  };

  return (
    <Swipeable ref={swipeRef} renderLeftActions={renderLeftAction} renderRightActions={renderRightAction} leftThreshold={40} rightThreshold={40} overshootLeft={false} overshootRight={false}>
      <View style={styles.foodEntry}>
        <Text style={styles.foodName} numberOfLines={1}>{entry.food_name ?? entry.name ?? 'Food'}</Text>
        <Text style={styles.foodMacros}>
          {Math.round(entry.calories ?? 0)} kcal · P {Math.round(entry.protein ?? 0)}g · C {Math.round(entry.carbs ?? 0)}g · F {Math.round(entry.fat ?? 0)}g
        </Text>
      </View>
    </Swipeable>
  );
}

export default function NutritionScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const userId = user?.id;
  const { isPro } = usePro();
  const goals = user?.goals ?? { daily_calories: 2000, protein_grams: 150, carbs_grams: 200, fat_grams: 65 };

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [nutrition, setNutrition] = useState<DailyNutrition | null>(null);

  const dateStr = format(selectedDate, 'yyyy-MM-dd');
  const isToday = dateStr === format(new Date(), 'yyyy-MM-dd');

  const load = useCallback(async () => {
    // Local-first: instant display, works offline
    const local = await nutritionApi.getDailyNutrition(dateStr);
    setNutrition(local);
    // [PRO] Sync from Firestore for cross-device data
    if (isPro && userId) {
      const remote = await getDailyNutritionFromFirestore(userId, dateStr);
      if (remote) {
        setNutrition(remote);
        // Keep local cache in sync with Firestore
        await nutritionApi.saveDailyNutrition(dateStr, remote);
      }
    }
  }, [dateStr, isPro, userId]);

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

  const handleDeleteEntry = useCallback(async (mealType: MealType, idx: number) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    const updated = await foodApi.deleteMealEntry(dateStr, mealType, idx);
    if (updated) {
      setNutrition({ ...updated });
      // [PRO] Keep Firestore in sync
      if (isPro && userId) {
        saveDailyNutrition(userId, updated).catch(() => {});
      }
    }
  }, [dateStr, isPro, userId]);

  const [editTarget, setEditTarget] = useState<{ entry: any; mealType: MealType; idx: number } | null>(null);
  const [editServings, setEditServings] = useState('1');

  const openEdit = useCallback((entry: any, mealType: MealType, idx: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditServings(String(entry.servings ?? 1));
    setEditTarget({ entry, mealType, idx });
  }, []);

  const handleEditEntry = useCallback(async () => {
    if (!editTarget) return;
    const s = parseFloat(editServings) || 1;
    const { entry, mealType, idx } = editTarget;
    const base = entry.servings && entry.servings > 0 ? 1 / entry.servings : 1;
    const updates = {
      servings: s,
      calories: (entry.calories ?? 0) * base * s,
      protein:  (entry.protein  ?? 0) * base * s,
      carbs:    (entry.carbs    ?? 0) * base * s,
      fat:      (entry.fat      ?? 0) * base * s,
    };
    const updated = await foodApi.updateMealEntry(dateStr, mealType, idx, updates);
    if (updated) {
      setNutrition({ ...updated });
      if (isPro && userId) saveDailyNutrition(userId, updated).catch(() => {});
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setEditTarget(null);
  }, [editTarget, editServings, dateStr, isPro, userId]);

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
                  <SwipeableFoodEntry
                    key={`${mealType}-${idx}`}
                    entry={entry}
                    onDelete={() => handleDeleteEntry(mealType, idx)}
                    onEdit={() => openEdit(entry, mealType, idx)}
                  />
                ))
              )}
            </View>
          );
        })}
      </ScrollView>

      {/* Edit Entry Modal */}
      <Modal visible={!!editTarget} transparent animationType="fade" onRequestClose={() => setEditTarget(null)}>
        <View style={styles.editModalOverlay}>
          <View style={styles.editModalContent}>
            <View style={styles.editModalHeader}>
              <Text style={styles.editModalTitle} numberOfLines={1}>
                {editTarget?.entry?.food_name ?? editTarget?.entry?.name ?? 'Edit Entry'}
              </Text>
              <TouchableOpacity onPress={() => setEditTarget(null)}>
                <Ionicons name="close" size={22} color="#B0B0B0" />
              </TouchableOpacity>
            </View>
            <View style={styles.editServingsRow}>
              <Text style={styles.editServingsLabel}>Servings</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <TouchableOpacity style={styles.editServingsBtn} onPress={() => { const v = Math.max(0.5, (parseFloat(editServings) || 1) - 0.5); setEditServings(String(v)); }}>
                  <Ionicons name="remove" size={18} color="#FF6200" />
                </TouchableOpacity>
                <TextInput
                  style={styles.editServingsInput}
                  value={editServings}
                  onChangeText={setEditServings}
                  keyboardType="decimal-pad"
                  selectTextOnFocus
                />
                <TouchableOpacity style={styles.editServingsBtn} onPress={() => { const v = (parseFloat(editServings) || 1) + 0.5; setEditServings(String(v)); }}>
                  <Ionicons name="add" size={18} color="#FF6200" />
                </TouchableOpacity>
              </View>
            </View>
            {editTarget && (() => {
              const s = parseFloat(editServings) || 1;
              const base = editTarget.entry.servings && editTarget.entry.servings > 0 ? 1 / editTarget.entry.servings : 1;
              const cal = Math.round((editTarget.entry.calories ?? 0) * base * s);
              const pro = Math.round((editTarget.entry.protein  ?? 0) * base * s);
              const car = Math.round((editTarget.entry.carbs    ?? 0) * base * s);
              const fat = Math.round((editTarget.entry.fat      ?? 0) * base * s);
              return (
                <View style={styles.editMacroRow}>
                  <View style={styles.editMacroItem}><Text style={styles.editMacroVal}>{cal}</Text><Text style={styles.editMacroLbl}>kcal</Text></View>
                  <View style={styles.editMacroItem}><Text style={[styles.editMacroVal, { color: '#FF6200' }]}>{pro}g</Text><Text style={styles.editMacroLbl}>P</Text></View>
                  <View style={styles.editMacroItem}><Text style={[styles.editMacroVal, { color: '#3B82F6' }]}>{car}g</Text><Text style={styles.editMacroLbl}>C</Text></View>
                  <View style={styles.editMacroItem}><Text style={[styles.editMacroVal, { color: '#F59E0B' }]}>{fat}g</Text><Text style={styles.editMacroLbl}>F</Text></View>
                </View>
              );
            })()}
            <TouchableOpacity style={styles.editSaveBtn} onPress={handleEditEntry}>
              <Text style={styles.editSaveBtnText}>Update Entry</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  foodEntry: { paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#2D2D2D', backgroundColor: '#252525' },
  foodName: { fontSize: 14, color: '#FFFFFF', fontWeight: '500' },
  foodMacros: { fontSize: 12, color: '#B0B0B0', marginTop: 2 },

  deleteAction: { justifyContent: 'center', alignItems: 'center', backgroundColor: '#F44336', width: 72, borderTopWidth: 1, borderTopColor: '#2D2D2D' },
  deleteActionText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700', marginTop: 3 },

  editAction: { justifyContent: 'center', alignItems: 'center', backgroundColor: '#3B82F6', width: 72, borderTopWidth: 1, borderTopColor: '#2D2D2D' },
  editActionText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700', marginTop: 3 },

  editModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  editModalContent: { backgroundColor: '#252525', borderRadius: 18, padding: 20, width: '100%' },
  editModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  editModalTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '700', flex: 1, marginRight: 8 },
  editServingsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  editServingsLabel: { color: '#B0B0B0', fontSize: 14, fontWeight: '600' },
  editServingsInput: { backgroundColor: '#1A1A1A', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, color: '#FFFFFF', fontSize: 16, fontWeight: '700', minWidth: 60, textAlign: 'center', borderWidth: 1, borderColor: '#3A3A3A' },
  editServingsBtn: { padding: 6 },
  editMacroRow: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: '#1A1A1A', borderRadius: 10, paddingVertical: 12, marginBottom: 16 },
  editMacroItem: { alignItems: 'center' },
  editMacroVal: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  editMacroLbl: { color: '#B0B0B0', fontSize: 11, marginTop: 2 },
  editSaveBtn: { backgroundColor: '#FF6200', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  editSaveBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
