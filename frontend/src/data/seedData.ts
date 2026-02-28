import { Food, Exercise } from '../types';

export const seedFoods: Food[] = [
  { id: '1', food_id: 'f_1', name: 'Chicken Breast', protein: 31, carbs: 0, fats: 3.6, fat: 3.6, calories: 165, unit: '100g' },
  { id: '2', food_id: 'f_2', name: 'Greek Yogurt', protein: 10, carbs: 3.6, fats: 0.4, fat: 0.4, calories: 59, unit: '100g' },
  { id: '3', food_id: 'f_3', name: 'Oats', protein: 13, carbs: 68, fats: 6.5, fat: 6.5, calories: 389, unit: '100g' },
  { id: '4', food_id: 'f_4', name: 'Egg (Large)', protein: 6, carbs: 0.6, fats: 5, fat: 5, calories: 70, unit: '1 egg' },
  { id: '5', food_id: 'f_5', name: 'Rice (White)', protein: 2.7, carbs: 28, fats: 0.3, fat: 0.3, calories: 130, unit: '100g' },
  { id: '6', food_id: 'f_6', name: 'Broccoli', protein: 2.8, carbs: 7, fats: 0.4, fat: 0.4, calories: 34, unit: '100g' },
  { id: '7', food_id: 'f_7', name: 'Almonds', protein: 21, carbs: 22, fats: 49, fat: 49, calories: 579, unit: '100g' },
  { id: '8', food_id: 'f_8', name: 'Salmon', protein: 20, carbs: 0, fats: 13, fat: 13, calories: 208, unit: '100g' },
  { id: '9', food_id: 'f_9', name: 'Banana', protein: 1.1, carbs: 23, fats: 0.3, fat: 0.3, calories: 89, unit: '1 medium' },
  { id: '10', food_id: 'f_10', name: 'Cottage Cheese', protein: 11, carbs: 3.4, fats: 4.3, fat: 4.3, calories: 98, unit: '100g' },
];

export const seedExercises: Exercise[] = [
  { id: '1', exercise_id: 'ex_s1', name: 'Bench Press', muscleGroup: 'Chest', muscle_groups: ['chest', 'triceps'], category: 'chest', equipment_required: ['barbell', 'bench'], is_compound: true, videoUrl: 'https://www.youtube.com/embed/rT7DgCr-3pg', instructions: 'Lie flat on bench, grip bar slightly wider than shoulders, lower to chest, press up.' },
  { id: '2', exercise_id: 'ex_s2', name: 'Squat', muscleGroup: 'Legs', muscle_groups: ['quads', 'glutes'], category: 'legs', equipment_required: ['barbell'], is_compound: true, videoUrl: 'https://www.youtube.com/embed/bEv6CCg2BC8', instructions: 'Bar on upper back, feet shoulder-width, squat down until thighs parallel, stand up.' },
  { id: '3', exercise_id: 'ex_s3', name: 'Deadlift', muscleGroup: 'Back', muscle_groups: ['back', 'hamstrings'], category: 'back', equipment_required: ['barbell'], is_compound: true, videoUrl: 'https://www.youtube.com/embed/1ZXobu7JvvE', instructions: 'Feet under bar, grip bar, keep back straight, stand up by extending hips and knees.' },
  { id: '4', exercise_id: 'ex_s4', name: 'Overhead Press', muscleGroup: 'Shoulders', muscle_groups: ['shoulders', 'triceps'], category: 'shoulders', equipment_required: ['barbell'], is_compound: true, videoUrl: 'https://www.youtube.com/embed/2yjwXTZQDDI', instructions: 'Bar at shoulder height, press overhead until arms fully extended, lower with control.' },
  { id: '5', exercise_id: 'ex_s5', name: 'Barbell Row', muscleGroup: 'Back', muscle_groups: ['back', 'lats'], category: 'back', equipment_required: ['barbell'], is_compound: true, videoUrl: 'https://www.youtube.com/embed/9efgcAjQe7E', instructions: 'Bend at hips, back straight, pull bar to lower chest, squeeze shoulder blades.' },
  { id: '6', exercise_id: 'ex_s6', name: 'Lunges', muscleGroup: 'Legs', muscle_groups: ['quads', 'glutes'], category: 'legs', equipment_required: ['dumbbells'], is_compound: true, videoUrl: 'https://www.youtube.com/embed/L8fvyBHUPew', instructions: 'Step forward, lower hips until both knees at 90 degrees, return to starting position.' },
];
