// frontend/app/(tabs)/nutrition.tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Food } from '../../src/types';
import { getFoods } from '../../src/services/storage';
import { SearchInput } from '../../src/components/SearchInput';

interface FoodItemProps {
  food: Food;
  onPress: (food: Food) => void;
}

const FoodItem: React.FC<FoodItemProps> = ({ food, onPress }) => (
  <TouchableOpacity
    style={styles.item}
    onPress={() => onPress(food)}
    activeOpacity={0.7}
  >
    <View style={styles.header}>
      <Text style={styles.name}>{food.name}</Text>
      <Text style={styles.calories}>{food.calories} kcal</Text>
    </View>
    <Text style={styles.unit}>per {food.unit}</Text>
    <View style={styles.macros}>
      <View style={styles.macro}>
        <Text style={styles.macroValue}>{food.protein}g</Text>
        <Text style={styles.macroLabel}>Protein</Text>
      </View>
      <View style={styles.macro}>
        <Text style={styles.macroValue}>{food.carbs}g</Text>
        <Text style={styles.macroLabel}>Carbs</Text>
      </View>
      <View style={styles.macro}>
        <Text style={styles.macroValue}>{food.fats}g</Text>
        <Text style={styles.macroLabel}>Fats</Text>
      </View>
    </View>
  </TouchableOpacity>
);

export default function NutritionScreen() {
  const [foods, setFoods] = useState<Food[]>([]);
  const [filteredFoods, setFilteredFoods] = useState<Food[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const loadFoods = useCallback(async () => {
    const data = await getFoods();
    setFoods(data);
    setFilteredFoods(data);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadFoods();
    }, [loadFoods])
  );

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredFoods(foods);
    } else {
      const q = searchQuery.toLowerCase();
      const filtered = foods.filter((food) =>
        food.name.toLowerCase().includes(q)
      );
      setFilteredFoods(filtered);
    }
  }, [searchQuery, foods]);

  const handleFoodPress = (food: Food) => {
    Alert.alert(
      'Food logging coming soon',
      `${food.name}\n\nPer ${food.unit}:\n${food.calories} kcal\nProtein: ${food.protein}g\nCarbs: ${food.carbs}g\nFats: ${food.fats}g`
    );
  };

  return (
    <View style={styles.container}>
      <SearchInput
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder="Search foods..."
      />
      <FlatList
        data={filteredFoods}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <FoodItem food={item} onPress={handleFoodPress} />
        )}
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827', // dark to match the app
  },
  list: {
    paddingBottom: 20,
  },
  item: {
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 8,
    backgroundColor: '#1F2937',
    borderRadius: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  name: {
    fontSize: 18,
    fontWeight: '600',
    color: '#F9FAFB',
  },
  calories: {
    fontSize: 16,
    color: '#F97373',
    fontWeight: '600',
  },
  unit: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 12,
  },
  macros: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  macro: {
    alignItems: 'center',
  },
  macroValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#E5E7EB',
  },
  macroLabel: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 2,
  },
});
