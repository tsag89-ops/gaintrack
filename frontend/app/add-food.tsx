import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { foodApi } from '../src/services/api';
import { saveDailyNutrition } from '../src/services/firestore';
import { useAuthStore } from '../src/store/authStore';
import { usePro } from '../src/hooks/usePro';
import { Food, MealType } from '../src/types';
import { useNutritionStore } from '../src/store/nutritionStore';
import { searchFood, FoodItem } from '../src/services/foodSearch';
import BarcodeScanner from '../src/components/BarcodeScanner';
import { useLanguage } from '../src/context/LanguageContext';


const CATEGORIES = ['all', 'protein', 'carbs', 'fats', 'vegetables', 'dairy'];

export default function AddFoodScreen() {
  const router = useRouter();
  const { t } = useLanguage();
  const { mealType, date } = useLocalSearchParams<{ mealType: string; date: string }>();
  const { setTodayNutrition } = useNutritionStore();
  const userId = useAuthStore((s) => s.user?.id);
  const { isPro } = usePro();
  const [foods, setFoods] = useState<Food[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFood, setSelectedFood] = useState<Food | null>(null);
  const [servings, setServings] = useState('1');
  const [isAdding, setIsAdding] = useState(false);
  const [recentFoods, setRecentFoods] = useState<Food[]>([]);
  // Open Food Facts search
  const [offResults, setOffResults] = useState<FoodItem[]>([]);
  const [offLoading, setOffLoading] = useState(false);
  const [onlineSearchUnavailable, setOnlineSearchUnavailable] = useState(false);
  const [selectedOFFFood, setSelectedOFFFood] = useState<FoodItem | null>(null);
  const [servingGrams, setServingGrams] = useState('100');
  const [showScanner, setShowScanner] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createCalories, setCreateCalories] = useState('');
  const [createProtein, setCreateProtein] = useState('');
  const [createCarbs, setCreateCarbs] = useState('');
  const [createFat, setCreateFat] = useState('');
  const [createUnit, setCreateUnit] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    fetchFoods();
    loadRecentFoods();
  }, []);

  // Debounced Open Food Facts search
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    if (searchQuery.trim().length < 2) {
      setOffResults([]);
      setOnlineSearchUnavailable(false);
      return;
    }
    debounceTimer.current = setTimeout(async () => {
      try {
        setOffLoading(true);
        setOnlineSearchUnavailable(false);
        const results = await searchFood(searchQuery.trim());
        setOffResults(results);
      } catch {
        // Keep local food search usable when online lookup is unavailable.
        setOffResults([]);
        setOnlineSearchUnavailable(true);
      } finally {
        setOffLoading(false);
      }
    }, 500);
    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current); };
  }, [searchQuery]);

  const fetchFoods = async () => {
    try {
      setIsLoading(true);
      const data = await foodApi.getAll();
      setFoods(data);
    } catch (error) {
      console.error('Error fetching foods:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadRecentFoods = async () => {
    const recent = await foodApi.getRecentFoods();
    setRecentFoods(recent as Food[]);
  };

  const handleCreateFood = async () => {
    if (!createName.trim()) return;
    try {
      setIsCreating(true);
      const newFood = await foodApi.createCustomFood({
        name: createName.trim(),
        calories: parseFloat(createCalories) || 0,
        protein: parseFloat(createProtein) || 0,
        carbs: parseFloat(createCarbs) || 0,
        fat: parseFloat(createFat) || 0,
        unit: createUnit.trim() || t('addFood.defaultServingUnit'),
      });
      setFoods(prev => [...prev, newFood as Food]);
      setShowCreateModal(false);
      setCreateName(''); setCreateCalories(''); setCreateProtein('');
      setCreateCarbs(''); setCreateFat(''); setCreateUnit('');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      handleSelectFood(newFood as Food);
    } catch (e) {
      Alert.alert(t('common.error'), t('addFood.createFailed'));
    } finally {
      setIsCreating(false);
    }
  };

  const filteredFoods = useMemo(() => foods.filter((food) => {
    const matchesCategory = selectedCategory === 'all' || food.category === selectedCategory;
    const matchesSearch = !searchQuery || food.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  }), [foods, selectedCategory, searchQuery]);

  // ── Virtualised flat data array for FlatList ──────────────────────────────
  // Combines OFFResults, recentFoods, and filteredFoods into a single typed
  // array so all items are rendered in one windowed FlatList instead of a
  // ScrollView that mounts every node simultaneously.
  type ListRow =
    | { kind: 'header'; label: string; key: string }
    | { kind: 'off';    item: FoodItem; key: string }
    | { kind: 'recent'; food: Food;    key: string }
    | { kind: 'local';  food: Food;    key: string };

  const foodListData = useMemo((): ListRow[] => {
    const rows: ListRow[] = [];
    if (offResults.length > 0) {
      rows.push({ kind: 'header', label: t('addFood.openFoodFactsResults'), key: 'h-off' });
      offResults.forEach((item) => rows.push({ kind: 'off', item, key: 'off-' + item.id }));
      rows.push({ kind: 'header', label: t('addFood.localFoods'), key: 'h-local-sep' });
    }
    if (!searchQuery && selectedCategory === 'all' && recentFoods.length > 0) {
      rows.push({ kind: 'header', label: t('addFood.recent'), key: 'h-recent' });
      recentFoods.forEach((food) => rows.push({ kind: 'recent', food, key: 'recent-' + food.food_id }));
      rows.push({ kind: 'header', label: t('addFood.allFoods'), key: 'h-all' });
    }
    filteredFoods.forEach((food) => rows.push({ kind: 'local', food, key: 'local-' + food.food_id }));
    return rows;
  }, [offResults, recentFoods, filteredFoods, searchQuery, selectedCategory, t]);

  const renderFoodRow = ({ item: row }: { item: ListRow }) => {
    if (row.kind === 'header') {
      return <Text style={styles.sectionHeader}>{row.label}</Text>;
    }
    if (row.kind === 'off') {
      const item = row.item;
      return (
        <TouchableOpacity
          style={[styles.foodCard, selectedOFFFood?.id === item.id && styles.foodCardSelected]}
          onPress={() => handleSelectOFFFood(item)}
        >
          {item.imageUrl ? (
            <Image source={{ uri: item.imageUrl }} style={styles.foodThumb} resizeMode="cover" />
          ) : (
            <View style={styles.foodThumbPlaceholder}>
              <Ionicons name="nutrition-outline" size={20} color="#6B7280" />
            </View>
          )}
          <View style={styles.foodInfo}>
            <Text style={styles.foodName} numberOfLines={1}>{item.name}</Text>
            {item.brand ? <Text style={styles.foodServing} numberOfLines={1}>{item.brand}</Text> : null}
            <Text style={styles.foodServing}>{t('addFood.per100g')}</Text>
          </View>
          <View style={styles.foodMacros}>
            <Text style={styles.foodCalories}>{`${Math.round(item.calories)} ${t('addFood.kcalShort')}`}</Text>
            <View style={styles.macroRow}>
              <Text style={[styles.macroText, { color: '#EF4444' }]}>{`${t('addFood.protein').charAt(0).toUpperCase()} ${Math.round(item.protein)}${t('addFood.gramsSuffix')}`}</Text>
              <Text style={[styles.macroText, { color: '#3B82F6' }]}>{`${t('addFood.carbs').charAt(0).toUpperCase()} ${Math.round(item.carbs)}${t('addFood.gramsSuffix')}`}</Text>
              <Text style={[styles.macroText, { color: '#F59E0B' }]}>{`${t('addFood.fat').charAt(0).toUpperCase()} ${Math.round(item.fat)}${t('addFood.gramsSuffix')}`}</Text>
            </View>
          </View>
        </TouchableOpacity>
      );
    }
    if (row.kind === 'recent') {
      const food = row.food;
      return (
        <TouchableOpacity
          style={[styles.foodCard, selectedFood?.food_id === food.food_id && styles.foodCardSelected]}
          onPress={() => handleSelectFood(food)}
        >
          <View style={styles.foodInfo}>
            <Text style={styles.foodName}>{food.name}</Text>
            <Text style={styles.foodServing}>{food.unit}</Text>
          </View>
          <View style={styles.foodMacros}>
            <Text style={styles.foodCalories}>{food.calories} {t('addFood.calAbbrev')}</Text>
            <View style={styles.macroRow}>
              <Text style={[styles.macroText, { color: '#EF4444' }]}>{`${t('addFood.protein').charAt(0).toUpperCase()} ${food.protein}${t('addFood.gramsSuffix')}`}</Text>
              <Text style={[styles.macroText, { color: '#3B82F6' }]}>{`${t('addFood.carbs').charAt(0).toUpperCase()} ${food.carbs}${t('addFood.gramsSuffix')}`}</Text>
              <Text style={[styles.macroText, { color: '#F59E0B' }]}>{`${t('addFood.fat').charAt(0).toUpperCase()} ${food.fat}${t('addFood.gramsSuffix')}`}</Text>
            </View>
          </View>
        </TouchableOpacity>
      );
    }
    // kind === 'local'
    const food = row.food;
    return (
      <TouchableOpacity
        style={[styles.foodCard, selectedFood?.food_id === food.food_id && styles.foodCardSelected]}
        onPress={() => handleSelectFood(food)}
      >
        <View style={styles.foodInfo}>
          <Text style={styles.foodName}>{food.name}</Text>
          <Text style={styles.foodServing}>{food.unit}</Text>
        </View>
        <View style={styles.foodMacros}>
          <Text style={styles.foodCalories}>{food.calories} {t('addFood.calAbbrev')}</Text>
          <View style={styles.macroRow}>
            <Text style={[styles.macroText, { color: '#EF4444' }]}>{`${t('addFood.protein').charAt(0).toUpperCase()} ${food.protein}${t('addFood.gramsSuffix')}`}</Text>
            <Text style={[styles.macroText, { color: '#3B82F6' }]}>{`${t('addFood.carbs').charAt(0).toUpperCase()} ${food.carbs}${t('addFood.gramsSuffix')}`}</Text>
            <Text style={[styles.macroText, { color: '#F59E0B' }]}>{`${t('addFood.fat').charAt(0).toUpperCase()} ${food.fat}${t('addFood.gramsSuffix')}`}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const handleSelectFood = (food: Food) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedOFFFood(null);
    setSelectedFood(food);
    setServings('1');
  };

  const handleSelectOFFFood = (item: FoodItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedFood(null);
    setSelectedOFFFood(item);
    setServingGrams('100');
  };

  const handleBarcodeFoodFound = (item: FoodItem) => {
    setShowScanner(false);
    handleSelectOFFFood(item);
  };

  const handleBarcodeNotFound = (barcode: string) => {
    setShowScanner(false);
    // Pre-fill create modal with barcode so user can add manually
    setCreateName('');
    setCreateCalories('');
    setCreateProtein('');
    setCreateCarbs('');
    setCreateFat('');
    setCreateUnit(t('addFood.defaultBarcodeUnit'));
    setShowCreateModal(true);
  };

  const handleAddFood = async () => {
    if (!mealType || !date) return;

    const isOFF = !!selectedOFFFood;
    const grams = parseFloat(servingGrams) || 100;
    const servingCount = parseFloat(servings) || 1;

    if (!isOFF && !selectedFood) return;

    try {
      setIsAdding(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      const entry = isOFF
        ? {
            date,
            meal_type: mealType,
            food_id: selectedOFFFood!.id,
            food_name: selectedOFFFood!.name,
            servings: grams / 100,
            calories: (selectedOFFFood!.calories * grams) / 100,
            protein: (selectedOFFFood!.protein * grams) / 100,
            carbs: (selectedOFFFood!.carbs * grams) / 100,
            fat: (selectedOFFFood!.fat * grams) / 100,
            imageUrl: selectedOFFFood!.imageUrl,
          }
        : {
            date,
            meal_type: mealType,
            food_id: selectedFood!.food_id,
            food_name: selectedFood!.name,
            servings: servingCount,
            calories: selectedFood!.calories * servingCount,
            protein: selectedFood!.protein * servingCount,
            carbs: selectedFood!.carbs * servingCount,
            fat: selectedFood!.fat * servingCount,
          };

      const updatedNutrition = await foodApi.addMealEntry(entry);
      setTodayNutrition(updatedNutrition);
      if (!isOFF) await foodApi.recordRecentFood(selectedFood!.food_id);
      // [PRO] Persist to Firestore for cross-device sync
      if (isPro && userId) {
        saveDailyNutrition(userId, updatedNutrition).catch(() => {});
      }
      router.back();
    } catch (error) {
      console.error('Error adding food:', error);
      Alert.alert(t('common.error'), t('addFood.addFailed'));
    } finally {
      setIsAdding(false);
    }
  };


  const getMealTitle = () => {
    const titles: Record<string, string> = {
      breakfast: t('nutritionTab.meals.breakfast'),
      lunch: t('nutritionTab.meals.lunch'),
      dinner: t('nutritionTab.meals.dinner'),
      snacks: t('nutritionTab.meals.snacks'),
    };
    return titles[mealType || ''] || t('addFood.meal');
  };

  const servingCount = parseFloat(servings) || 1;
  const gramsVal = parseFloat(servingGrams) || 100;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Barcode Scanner Modal */}
      <Modal visible={showScanner} animationType="slide" statusBarTranslucent onRequestClose={() => setShowScanner(false)}>
        <BarcodeScanner
          onFoodFound={handleBarcodeFoodFound}
          onNotFound={handleBarcodeNotFound}
          onClose={() => setShowScanner(false)}
        />
      </Modal>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.closeButton}>
            <Ionicons name="close" size={28} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('addFood.addToMeal', { meal: getMealTitle() })}</Text>
          <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setShowCreateModal(true); }} style={styles.closeButton}>
            <Ionicons name="add-circle-outline" size={28} color="#FF6200" />
          </TouchableOpacity>
        </View>

        {/* Search + Scan row */}
        <View style={styles.searchRow}>
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color="#6B7280" />
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder={t('addFood.searchPlaceholder')}
              placeholderTextColor="#6B7280"
            />
            {offLoading && <ActivityIndicator size="small" color="#FF6200" style={{ marginRight: 4 }} />}
            {searchQuery.length > 0 && !offLoading && (
              <TouchableOpacity onPress={() => { setSearchQuery(''); setOffResults([]); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={18} color="#6B7280" />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity
            style={styles.scanButton}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowScanner(true); }}
          >
            <Ionicons name="barcode-outline" size={22} color="#FF6200" />
          </TouchableOpacity>
        </View>

        {onlineSearchUnavailable && searchQuery.trim().length >= 2 ? (
          <Text style={styles.offlineSearchNotice}>
            {t('addFood.onlineSearchUnavailable')}
          </Text>
        ) : null}

        {/* Categories */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoryScroll}
          contentContainerStyle={styles.categoryScrollContent}
        >
          {CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat}
              style={[
                styles.categoryChip,
                selectedCategory === cat && styles.categoryChipActive,
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setSelectedCategory(cat);
              }}
            >
              <Text
                style={[
                  styles.categoryChipText,
                  selectedCategory === cat && styles.categoryChipTextActive,
                ]}
              >
                {t(`addFood.categories.${cat}`)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#FF6200" />
          </View>
        ) : (
          <FlatList
            data={foodListData}
            keyExtractor={(row) => row.key}
            renderItem={renderFoodRow}
            style={styles.content}
            contentContainerStyle={styles.scrollContent}
            initialNumToRender={15}
            maxToRenderPerBatch={10}
            windowSize={5}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          />
        )}

        {/* Selected OFF Food Panel (grams-based) */}
        {selectedOFFFood && (
          <View style={styles.selectedPanel}>
            <View style={styles.selectedHeader}>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, marginRight: 8 }}>
                {selectedOFFFood.imageUrl ? (
                  <Image source={{ uri: selectedOFFFood.imageUrl }} style={styles.selectedThumb} />
                ) : null}
                <View style={{ flex: 1 }}>
                  <Text style={styles.selectedName} numberOfLines={1}>{selectedOFFFood.name}</Text>
                  {selectedOFFFood.brand ? <Text style={{ color: '#B0B0B0', fontSize: 12 }}>{selectedOFFFood.brand}</Text> : null}
                </View>
              </View>
              <TouchableOpacity onPress={() => setSelectedOFFFood(null)}>
                <Ionicons name="close-circle" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <View style={styles.servingsRow}>
              <Text style={styles.servingsLabel}>{t('addFood.servingGrams')}</Text>
              <View style={styles.servingsInput}>
                <TouchableOpacity
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setServingGrams(String(Math.max(5, gramsVal - 5))); }}
                  style={styles.servingsButton}
                >
                  <Ionicons name="remove" size={20} color="#FFFFFF" />
                </TouchableOpacity>
                <TextInput
                  style={styles.servingsValue}
                  value={servingGrams}
                  onChangeText={setServingGrams}
                  keyboardType="decimal-pad"
                />
                <TouchableOpacity
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setServingGrams(String(gramsVal + 5)); }}
                  style={styles.servingsButton}
                >
                  <Ionicons name="add" size={20} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.totalMacros}>
              <View style={styles.totalMacroItem}>
                <Text style={styles.totalMacroValue}>{Math.round((selectedOFFFood.calories * gramsVal) / 100)}</Text>
                <Text style={styles.totalMacroLabel}>{t('addFood.calories')}</Text>
              </View>
              <View style={styles.totalMacroItem}>
                <Text style={[styles.totalMacroValue, { color: '#EF4444' }]}>{`${Math.round((selectedOFFFood.protein * gramsVal) / 100)}${t('addFood.gramsSuffix')}`}</Text>
                <Text style={styles.totalMacroLabel}>{t('addFood.protein')}</Text>
              </View>
              <View style={styles.totalMacroItem}>
                <Text style={[styles.totalMacroValue, { color: '#3B82F6' }]}>{`${Math.round((selectedOFFFood.carbs * gramsVal) / 100)}${t('addFood.gramsSuffix')}`}</Text>
                <Text style={styles.totalMacroLabel}>{t('addFood.carbs')}</Text>
              </View>
              <View style={styles.totalMacroItem}>
                <Text style={[styles.totalMacroValue, { color: '#F59E0B' }]}>{`${Math.round((selectedOFFFood.fat * gramsVal) / 100)}${t('addFood.gramsSuffix')}`}</Text>
                <Text style={styles.totalMacroLabel}>{t('addFood.fat')}</Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.addButton, isAdding && styles.addButtonDisabled]}
              onPress={handleAddFood}
              disabled={isAdding}
            >
              <Ionicons name="add-circle" size={22} color="#FFFFFF" />
              <Text style={styles.addButtonText}>{isAdding ? t('addFood.adding') : t('addFood.addToMeal', { meal: getMealTitle() })}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Selected Local Food Panel */}
        {selectedFood && (
          <View style={styles.selectedPanel}>
            <View style={styles.selectedHeader}>
              <Text style={styles.selectedName}>{selectedFood.name}</Text>
              <TouchableOpacity onPress={() => setSelectedFood(null)}>
                <Ionicons name="close-circle" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <View style={styles.servingsRow}>
              <Text style={styles.servingsLabel}>{t('nutritionTab.servings')}</Text>
              <View style={styles.servingsInput}>
                <TouchableOpacity
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setServings(String(Math.max(0.5, servingCount - 0.5)));
                  }}
                  style={styles.servingsButton}
                >
                  <Ionicons name="remove" size={20} color="#FFFFFF" />
                </TouchableOpacity>
                <TextInput
                  style={styles.servingsValue}
                  value={servings}
                  onChangeText={setServings}
                  keyboardType="decimal-pad"
                />
                <TouchableOpacity
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setServings(String(servingCount + 0.5));
                  }}
                  style={styles.servingsButton}
                >
                  <Ionicons name="add" size={20} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.totalMacros}>
              <View style={styles.totalMacroItem}>
                <Text style={styles.totalMacroValue}>
                  {Math.round(selectedFood.calories * servingCount)}
                </Text>
                <Text style={styles.totalMacroLabel}>{t('addFood.calories')}</Text>
              </View>
              <View style={styles.totalMacroItem}>
                <Text style={[styles.totalMacroValue, { color: '#EF4444' }]}>
                  {`${Math.round(selectedFood.protein * servingCount)}${t('addFood.gramsSuffix')}`}
                </Text>
                <Text style={styles.totalMacroLabel}>{t('addFood.protein')}</Text>
              </View>
              <View style={styles.totalMacroItem}>
                <Text style={[styles.totalMacroValue, { color: '#3B82F6' }]}>
                  {`${Math.round(selectedFood.carbs * servingCount)}${t('addFood.gramsSuffix')}`}
                </Text>
                <Text style={styles.totalMacroLabel}>{t('addFood.carbs')}</Text>
              </View>
              <View style={styles.totalMacroItem}>
                <Text style={[styles.totalMacroValue, { color: '#F59E0B' }]}>
                  {`${Math.round(selectedFood.fat * servingCount)}${t('addFood.gramsSuffix')}`}
                </Text>
                <Text style={styles.totalMacroLabel}>{t('addFood.fat')}</Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.addButton, isAdding && styles.addButtonDisabled]}
              onPress={handleAddFood}
              disabled={isAdding}
            >
              <Ionicons name="add-circle" size={22} color="#FFFFFF" />
              <Text style={styles.addButtonText}>
                {isAdding ? t('addFood.adding') : t('addFood.addToMeal', { meal: getMealTitle() })}
              </Text>
            </TouchableOpacity>
          </View>
        )}
        {/* Create Food Modal */}
        <Modal visible={showCreateModal} animationType="slide" transparent onRequestClose={() => setShowCreateModal(false)}>
          <View style={styles.createModalOverlay}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
              <View style={styles.createModalContent}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>{t('addFood.createFood')}</Text>
                  <TouchableOpacity onPress={() => setShowCreateModal(false)}>
                    <Ionicons name="close" size={24} color="#B0B0B0" />
                  </TouchableOpacity>
                </View>
                <View style={styles.createField}>
                  <Text style={styles.createLabel}>{t('addFood.foodNameRequired')}</Text>
                  <TextInput style={styles.createInput} value={createName} onChangeText={setCreateName} placeholder={t('addFood.foodNamePlaceholder')} placeholderTextColor="#6B7280" />
                </View>
                <View style={styles.createField}>
                  <Text style={styles.createLabel}>{t('addFood.servingSize')}</Text>
                  <TextInput style={styles.createInput} value={createUnit} onChangeText={setCreateUnit} placeholder={t('addFood.servingSizePlaceholder')} placeholderTextColor="#6B7280" />
                </View>
                <View style={styles.createMacroGrid}>
                  <View style={styles.createMacroCell}>
                    <Text style={styles.createLabel}>{t('addFood.calories')}</Text>
                    <TextInput style={styles.createInput} value={createCalories} onChangeText={setCreateCalories} keyboardType="decimal-pad" placeholder="0" placeholderTextColor="#6B7280" />
                  </View>
                  <View style={styles.createMacroCell}>
                    <Text style={styles.createLabel}>{t('addFood.proteinGrams')}</Text>
                    <TextInput style={styles.createInput} value={createProtein} onChangeText={setCreateProtein} keyboardType="decimal-pad" placeholder="0" placeholderTextColor="#6B7280" />
                  </View>
                  <View style={styles.createMacroCell}>
                    <Text style={styles.createLabel}>{t('addFood.carbsGrams')}</Text>
                    <TextInput style={styles.createInput} value={createCarbs} onChangeText={setCreateCarbs} keyboardType="decimal-pad" placeholder="0" placeholderTextColor="#6B7280" />
                  </View>
                  <View style={styles.createMacroCell}>
                    <Text style={styles.createLabel}>{t('addFood.fatGrams')}</Text>
                    <TextInput style={styles.createInput} value={createFat} onChangeText={setCreateFat} keyboardType="decimal-pad" placeholder="0" placeholderTextColor="#6B7280" />
                  </View>
                </View>
                <TouchableOpacity
                  style={[styles.addButton, (!createName.trim() || isCreating) && styles.addButtonDisabled]}
                  onPress={handleCreateFood}
                  disabled={!createName.trim() || isCreating}
                >
                  <Text style={styles.addButtonText}>{isCreating ? t('common.saving') : t('addFood.saveFood')}</Text>
                </TouchableOpacity>
              </View>
            </KeyboardAvoidingView>
          </View>
        </Modal>
      </KeyboardAvoidingView>
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
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  closeButton: {
    padding: 4,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    gap: 10,
    marginBottom: 12,
  },
  scanButton: {
    backgroundColor: '#252525',
    borderRadius: 10,
    padding: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#252525',
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 16,
    paddingVertical: 12,
    marginLeft: 8,
  },
  categoryScroll: {
    maxHeight: 44,
    marginBottom: 8,
  },
  categoryScrollContent: {
    paddingHorizontal: 20,
    gap: 8,
  },
  categoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#2D2D2D',
    borderRadius: 20,
  },
  categoryChipActive: {
    backgroundColor: '#FF6200',
  },
  categoryChipText: {
    color: '#B0B0B0',
    fontSize: 14,
    fontWeight: '500',
  },
  categoryChipTextActive: {
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
    paddingBottom: 200,
  },
  foodCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#252525',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  foodCardSelected: {
    borderColor: '#FF6200',
  },
  foodInfo: {
    flex: 1,
  },
  foodName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  foodServing: {
    color: '#B0B0B0',
    fontSize: 12,
    marginTop: 2,
  },
  foodMacros: {
    alignItems: 'flex-end',
  },
  foodCalories: {
    color: '#FF6200',
    fontSize: 14,
    fontWeight: '600',
  },
  macroRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  macroText: {
    fontSize: 11,
    fontWeight: '500',
  },
  selectedPanel: {
    backgroundColor: '#252525',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 34,
  },
  selectedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  selectedName: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  servingsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  servingsLabel: {
    color: '#B0B0B0',
    fontSize: 14,
  },
  servingsInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderRadius: 8,
  },
  servingsButton: {
    padding: 10,
  },
  servingsValue: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    minWidth: 50,
    textAlign: 'center',
  },
  totalMacros: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  totalMacroItem: {
    alignItems: 'center',
  },
  totalMacroValue: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  totalMacroLabel: {
    color: '#B0B0B0',
    fontSize: 11,
    marginTop: 4,
  },
  foodThumb: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#2D2D2D',
    marginRight: 10,
  },
  foodThumbPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#2D2D2D',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  selectedThumb: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#2D2D2D',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF6200',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  addButtonDisabled: {
    opacity: 0.7,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  sectionHeader: {
    color: '#B0B0B0',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
    marginTop: 4,
  },
  offlineSearchNotice: {
    color: '#F59E0B',
    fontSize: 12,
    fontWeight: '600',
    marginHorizontal: 20,
    marginBottom: 8,
  },
  createModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  createModalContent: {
    backgroundColor: '#252525',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  createField: {
    marginBottom: 12,
  },
  createLabel: {
    color: '#B0B0B0',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  createInput: {
    backgroundColor: '#1A1A1A',
    borderRadius: 10,
    padding: 12,
    color: '#FFFFFF',
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#3A3A3A',
  },
  createMacroGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 4,
  },
  createMacroCell: {
    width: '47%',
  },
});
