import AsyncStorage from '@react-native-async-storage/async-storage';
import { Food, Exercise } from '../types';
import { seedFoods, seedExercises } from '../data/seedData';

const FOODS_KEY = 'foods';
const EXERCISES_KEY = 'exercises';

export const initializeData = async (): Promise<void> => {
  const [foodsExist, exercisesExist] = await Promise.all([
    AsyncStorage.getItem(FOODS_KEY),
    AsyncStorage.getItem(EXERCISES_KEY),
  ]);

  if (!foodsExist) {
    await AsyncStorage.setItem(FOODS_KEY, JSON.stringify(seedFoods));
  }
  
  if (!exercisesExist) {
    await AsyncStorage.setItem(EXERCISES_KEY, JSON.stringify(seedExercises));
  }
};

export const getFoods = async (): Promise<Food[]> => {
  const data = await AsyncStorage.getItem(FOODS_KEY);
  return data ? JSON.parse(data) : [];
};

export const getExercises = async (): Promise<Exercise[]> => {
  const data = await AsyncStorage.getItem(EXERCISES_KEY);
  return data ? JSON.parse(data) : [];
};
