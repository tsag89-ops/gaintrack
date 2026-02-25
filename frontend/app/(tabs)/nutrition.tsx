import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Food } from '../types';
import { getFoods } from '../services/storage';
import { SearchInput } from '../components/SearchInput';

interface FoodItemProps {
  food: Food;
}

const FoodItem: React.FC<FoodItemProps> = ({ food }) => (
  <View style={styles.item}>
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
  </View>
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
      const filtered = foods.filter(food => 
        food.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredFoods(filtered);
    }
  }, [searchQuery, foods]);

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
        renderItem={({ item }) => <FoodItem food={item} />}
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  list: {
    paddingBottom: 20,
  },
  item: {
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 8,
    backgroundColor: '#f9f9f9',
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
  },
  calories: {
    fontSize: 16,
    color: '#ff6b6b',
    fontWeight: '600',
  },
  unit: {
    fontSize: 14,
    color: '#999',
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
    color: '#333',
  },
  macroLabel: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
});
