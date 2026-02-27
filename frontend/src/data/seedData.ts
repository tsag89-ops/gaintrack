import { Food, Exercise } from '../types';

export const seedFoods: Food[] = [
  { id: '1', name: 'Chicken Breast', protein: 31, carbs: 0, fats: 3.6, calories: 165, unit: '100g' },
  { id: '2', name: 'Greek Yogurt', protein: 10, carbs: 3.6, fats: 0.4, calories: 59, unit: '100g' },
  { id: '3', name: 'Oats', protein: 13, carbs: 68, fats: 6.5, calories: 389, unit: '100g' },
  { id: '4', name: 'Egg (Large)', protein: 6, carbs: 0.6, fats: 5, calories: 70, unit: '1 egg' },
  { id: '5', name: 'Rice (White)', protein: 2.7, carbs: 28, fats: 0.3, calories: 130, unit: '100g' },
  { id: '6', name: 'Broccoli', protein: 2.8, carbs: 7, fats: 0.4, calories: 34, unit: '100g' },
  { id: '7', name: 'Almonds', protein: 21, carbs: 22, fats: 49, calories: 579, unit: '100g' },
  { id: '8', name: 'Salmon', protein: 20, carbs: 0, fats: 13, calories: 208, unit: '100g' },
  { id: '9', name: 'Banana', protein: 1.1, carbs: 23, fats: 0.3, calories: 89, unit: '1 medium' },
  { id: '10', name: 'Cottage Cheese', protein: 11, carbs: 3.4, fats: 4.3, calories: 98, unit: '100g' },
];

export const seedExercises: Exercise[] = [
  { 
    id: '1', 
    name: 'Bench Press', 
    muscleGroup: 'Chest',
    videoUrl: 'https://www.youtube.com/embed/rT7DgCr-3pg',
    instructions: 'Lie flat on bench, grip bar slightly wider than shoulders, lower to chest, press up.'
  },
  { 
    id: '2', 
    name: 'Squat', 
    muscleGroup: 'Legs',
    videoUrl: 'https://www.youtube.com/embed/bEv6CCg2BC8',
    instructions: 'Bar on upper back, feet shoulder-width, squat down until thighs parallel, stand up.'
  },
  { 
    id: '3', 
    name: 'Deadlift', 
    muscleGroup: 'Back',
    videoUrl: 'https://www.youtube.com/embed/1ZXobu7JvvE',
    instructions: 'Feet under bar, grip bar, keep back straight, stand up by extending hips and knees.'
  },
  { 
    id: '4', 
    name: 'Overhead Press', 
    muscleGroup: 'Shoulders',
    videoUrl: 'https://www.youtube.com/embed/2yjwXTZQDDI',
    instructions: 'Bar at shoulder height, press overhead until arms fully extended, lower with control.'
  },
  { 
    id: '5', 
    name: 'Barbell Row', 
    muscleGroup: 'Back',
    videoUrl: 'https://www.youtube.com/embed/9efgcAjQe7E',
    instructions: 'Bend at hips, back straight, pull bar to lower chest, squeeze shoulder blades.'
  },
  { 
    id: '6', 
    name: 'Lunges', 
    muscleGroup: 'Legs',
    videoUrl: 'https://www.youtube.com/embed/L8fvyBHUPew',
    instructions: 'Step forward, lower hips until both knees at 90 degrees, return to starting position.'
  },
];
