import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { foodApi, nutritionApi } from '../src/services/api';
import { Food, MealType } from '../src/types';
import { useNutritionStore } from '../src/store/nutritionStore';


const CATEGORIES = ['all', 'protein', 'carbs', 'fats', 'vegetables', 'dairy'];

export default function AddFoodScreen() {
  const router = useRouter();
  const { mealType, date } = useLocalSearchParams<{ mealType: string; date: string }>();
  const { setTodayNutrition } = useNutritionStore();
  const [foods, setFoods] = useState<Food[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFood, setSelectedFood] = useState<Food | null>(null);
  const [servings, setServings] = useState('1');
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    fetchFoods();
  }, []);

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

  const filteredFoods = foods.filter((food) => {
    const matchesCategory = selectedCategory === 'all' || food.category === selectedCategory;
    const matchesSearch = !searchQuery || food.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const handleSelectFood = (food: Food) => {
    setSelectedFood(food);
    setServings('1');
  };

  const handleAddFood = async () => {
  if (!selectedFood || !mealType || !date) return;

  const servingCount = parseFloat(servings) || 1;

  try {
    setIsAdding(true);
    const updatedNutrition = await foodApi.addMealEntry({
      date,
      meal_type: mealType,
      food_id: selectedFood.food_id,
      food_name: selectedFood.name,
      servings: servingCount,
      calories: selectedFood.calories * servingCount,
      protein: selectedFood.protein * servingCount,
      carbs: selectedFood.carbs * servingCount,
      fat: selectedFood.fat * servingCount,
    });
    setTodayNutrition(updatedNutrition);
    router.back();
  } catch (error) {
    console.error('Error adding food:', error);
    Alert.alert('Error', 'Failed to add food');
  } finally {
    setIsAdding(false);
  }
};


  const getMealTitle = () => {
    const titles: Record<string, string> = {
      breakfast: 'Breakfast',
      lunch: 'Lunch',
      dinner: 'Dinner',
      snacks: 'Snacks',
    };
    return titles[mealType || ''] || 'Meal';
  };

  const servingCount = parseFloat(servings) || 1;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.closeButton}>
            <Ionicons name="close" size={28} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Add to {getMealTitle()}</Text>
          <View style={{ width: 28 }} />
        </View>

        {/* Search */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#6B7280" />
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search foods..."
            placeholderTextColor="#6B7280"
          />
        </View>

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
              onPress={() => setSelectedCategory(cat)}
            >
              <Text
                style={[
                  styles.categoryChipText,
                  selectedCategory === cat && styles.categoryChipTextActive,
                ]}
              >
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#10B981" />
          </View>
        ) : (
          <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
            {filteredFoods.map((food) => (
              <TouchableOpacity
                key={food.food_id}
                style={[
                  styles.foodCard,
                  selectedFood?.food_id === food.food_id && styles.foodCardSelected,
                ]}
                onPress={() => handleSelectFood(food)}
              >
                <View style={styles.foodInfo}>
                  <Text style={styles.foodName}>{food.name}</Text>
                  <Text style={styles.foodServing}>{food.serving_size}</Text>
                </View>
                <View style={styles.foodMacros}>
                  <Text style={styles.foodCalories}>{food.calories} cal</Text>
                  <View style={styles.macroRow}>
                    <Text style={[styles.macroText, { color: '#EF4444' }]}>P {food.protein}g</Text>
                    <Text style={[styles.macroText, { color: '#3B82F6' }]}>C {food.carbs}g</Text>
                    <Text style={[styles.macroText, { color: '#F59E0B' }]}>F {food.fat}g</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Selected Food Panel */}
        {selectedFood && (
          <View style={styles.selectedPanel}>
            <View style={styles.selectedHeader}>
              <Text style={styles.selectedName}>{selectedFood.name}</Text>
              <TouchableOpacity onPress={() => setSelectedFood(null)}>
                <Ionicons name="close-circle" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <View style={styles.servingsRow}>
              <Text style={styles.servingsLabel}>Servings</Text>
              <View style={styles.servingsInput}>
                <TouchableOpacity
                  onPress={() => setServings(String(Math.max(0.5, servingCount - 0.5)))}
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
                  onPress={() => setServings(String(servingCount + 0.5))}
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
                <Text style={styles.totalMacroLabel}>Calories</Text>
              </View>
              <View style={styles.totalMacroItem}>
                <Text style={[styles.totalMacroValue, { color: '#EF4444' }]}>
                  {Math.round(selectedFood.protein * servingCount)}g
                </Text>
                <Text style={styles.totalMacroLabel}>Protein</Text>
              </View>
              <View style={styles.totalMacroItem}>
                <Text style={[styles.totalMacroValue, { color: '#3B82F6' }]}>
                  {Math.round(selectedFood.carbs * servingCount)}g
                </Text>
                <Text style={styles.totalMacroLabel}>Carbs</Text>
              </View>
              <View style={styles.totalMacroItem}>
                <Text style={[styles.totalMacroValue, { color: '#F59E0B' }]}>
                  {Math.round(selectedFood.fat * servingCount)}g
                </Text>
                <Text style={styles.totalMacroLabel}>Fat</Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.addButton, isAdding && styles.addButtonDisabled]}
              onPress={handleAddFood}
              disabled={isAdding}
            >
              <Ionicons name="add-circle" size={22} color="#FFFFFF" />
              <Text style={styles.addButtonText}>
                {isAdding ? 'Adding...' : 'Add to ' + getMealTitle()}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
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
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1F2937',
    marginHorizontal: 20,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 12,
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
    backgroundColor: '#374151',
    borderRadius: 20,
  },
  categoryChipActive: {
    backgroundColor: '#10B981',
  },
  categoryChipText: {
    color: '#9CA3AF',
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
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  foodCardSelected: {
    borderColor: '#10B981',
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
    color: '#6B7280',
    fontSize: 12,
    marginTop: 2,
  },
  foodMacros: {
    alignItems: 'flex-end',
  },
  foodCalories: {
    color: '#10B981',
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
    backgroundColor: '#1F2937',
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
    color: '#9CA3AF',
    fontSize: 14,
  },
  servingsInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111827',
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
    backgroundColor: '#111827',
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
    color: '#6B7280',
    fontSize: 11,
    marginTop: 4,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
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
});
