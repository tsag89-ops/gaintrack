import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Food } from '../types';

interface FoodCardProps {
  food: Food;
  onPress: () => void;
}

export const FoodCard: React.FC<FoodCardProps> = ({ food, onPress }) => {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.info}>
        <Text style={styles.name}>{food.name}</Text>
        <Text style={styles.serving}>{food.serving_size}</Text>
      </View>
      
      <View style={styles.macros}>
        <View style={styles.macroItem}>
          <Text style={styles.macroValue}>{food.calories}</Text>
          <Text style={styles.macroLabel}>cal</Text>
        </View>
        <View style={styles.macroItem}>
          <Text style={[styles.macroValue, { color: '#EF4444' }]}>{food.protein}g</Text>
          <Text style={styles.macroLabel}>P</Text>
        </View>
        <View style={styles.macroItem}>
          <Text style={[styles.macroValue, { color: '#3B82F6' }]}>{food.carbs}g</Text>
          <Text style={styles.macroLabel}>C</Text>
        </View>
        <View style={styles.macroItem}>
          <Text style={[styles.macroValue, { color: '#F59E0B' }]}>{food.fat}g</Text>
          <Text style={styles.macroLabel}>F</Text>
        </View>
      </View>
      
      <Ionicons name="add-circle" size={28} color="#10B981" />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  info: {
    flex: 1,
  },
  name: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  serving: {
    color: '#6B7280',
    fontSize: 12,
    marginTop: 2,
  },
  macros: {
    flexDirection: 'row',
    marginRight: 12,
    gap: 12,
  },
  macroItem: {
    alignItems: 'center',
  },
  macroValue: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  macroLabel: {
    color: '#6B7280',
    fontSize: 10,
  },
});
