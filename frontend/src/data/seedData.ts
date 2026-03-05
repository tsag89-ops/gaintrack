import { Food, Exercise } from '../types';

export const seedFoods: Food[] = [
  // Protein
  { id: '1',  food_id: 'f_1',  name: 'Chicken Breast',    protein: 31,  carbs: 0,    fats: 3.6,  fat: 3.6,  calories: 165, unit: '100g',      category: 'protein' },
  { id: '2',  food_id: 'f_2',  name: 'Salmon',            protein: 20,  carbs: 0,    fats: 13,   fat: 13,   calories: 208, unit: '100g',      category: 'protein' },
  { id: '3',  food_id: 'f_3',  name: 'Egg (Large)',        protein: 6,   carbs: 0.6,  fats: 5,    fat: 5,    calories: 70,  unit: '1 egg',     category: 'protein' },
  { id: '4',  food_id: 'f_4',  name: 'Tuna (Canned)',      protein: 25,  carbs: 0,    fats: 1,    fat: 1,    calories: 109, unit: '100g',      category: 'protein' },
  { id: '5',  food_id: 'f_5',  name: 'Turkey Breast',      protein: 29,  carbs: 0,    fats: 1,    fat: 1,    calories: 135, unit: '100g',      category: 'protein' },
  { id: '6',  food_id: 'f_6',  name: 'Ground Beef (90%)',  protein: 26,  carbs: 0,    fats: 10,   fat: 10,   calories: 196, unit: '100g',      category: 'protein' },
  { id: '7',  food_id: 'f_7',  name: 'Shrimp',             protein: 24,  carbs: 0.2,  fats: 0.3,  fat: 0.3,  calories: 99,  unit: '100g',      category: 'protein' },
  { id: '8',  food_id: 'f_8',  name: 'Whey Protein',       protein: 24,  carbs: 3,    fats: 2,    fat: 2,    calories: 122, unit: '1 scoop',   category: 'protein' },
  { id: '9',  food_id: 'f_9',  name: 'Edamame',            protein: 11,  carbs: 10,   fats: 5,    fat: 5,    calories: 122, unit: '100g',      category: 'protein' },
  // Carbs
  { id: '10', food_id: 'f_10', name: 'White Rice (cooked)',protein: 2.7, carbs: 28,   fats: 0.3,  fat: 0.3,  calories: 130, unit: '100g',      category: 'carbs' },
  { id: '11', food_id: 'f_11', name: 'Oats (rolled)',      protein: 13,  carbs: 68,   fats: 6.5,  fat: 6.5,  calories: 389, unit: '100g dry',  category: 'carbs' },
  { id: '12', food_id: 'f_12', name: 'Sweet Potato',       protein: 1.6, carbs: 20,   fats: 0.1,  fat: 0.1,  calories: 86,  unit: '100g',      category: 'carbs' },
  { id: '13', food_id: 'f_13', name: 'Banana',             protein: 1.1, carbs: 23,   fats: 0.3,  fat: 0.3,  calories: 89,  unit: '1 medium',  category: 'carbs' },
  { id: '14', food_id: 'f_14', name: 'Whole Wheat Bread',  protein: 4,   carbs: 12,   fats: 1,    fat: 1,    calories: 69,  unit: '1 slice',   category: 'carbs' },
  { id: '15', food_id: 'f_15', name: 'Quinoa (cooked)',    protein: 4,   carbs: 21,   fats: 2,    fat: 2,    calories: 120, unit: '100g',      category: 'carbs' },
  { id: '16', food_id: 'f_16', name: 'Apple',              protein: 0.3, carbs: 14,   fats: 0.2,  fat: 0.2,  calories: 52,  unit: '1 medium',  category: 'carbs' },
  { id: '17', food_id: 'f_17', name: 'Blueberries',        protein: 0.7, carbs: 14,   fats: 0.3,  fat: 0.3,  calories: 57,  unit: '100g',      category: 'carbs' },
  { id: '18', food_id: 'f_18', name: 'Brown Rice (cooked)',protein: 2.6, carbs: 23,   fats: 0.9,  fat: 0.9,  calories: 112, unit: '100g',      category: 'carbs' },
  { id: '19', food_id: 'f_19', name: 'Pasta (cooked)',     protein: 5,   carbs: 31,   fats: 0.9,  fat: 0.9,  calories: 158, unit: '100g',      category: 'carbs' },
  // Fats
  { id: '20', food_id: 'f_20', name: 'Almonds',            protein: 21,  carbs: 22,   fats: 49,   fat: 49,   calories: 579, unit: '100g',      category: 'fats' },
  { id: '21', food_id: 'f_21', name: 'Peanut Butter',      protein: 8,   carbs: 6,    fats: 16,   fat: 16,   calories: 188, unit: '2 tbsp',    category: 'fats' },
  { id: '22', food_id: 'f_22', name: 'Avocado',            protein: 2,   carbs: 9,    fats: 15,   fat: 15,   calories: 160, unit: '100g',      category: 'fats' },
  { id: '23', food_id: 'f_23', name: 'Olive Oil',          protein: 0,   carbs: 0,    fats: 14,   fat: 14,   calories: 119, unit: '1 tbsp',    category: 'fats' },
  { id: '24', food_id: 'f_24', name: 'Chia Seeds',         protein: 4.7, carbs: 12,   fats: 9,    fat: 9,    calories: 138, unit: '30g',       category: 'fats' },
  { id: '25', food_id: 'f_25', name: 'Walnuts',            protein: 15,  carbs: 14,   fats: 65,   fat: 65,   calories: 654, unit: '100g',      category: 'fats' },
  // Vegetables
  { id: '26', food_id: 'f_26', name: 'Broccoli',           protein: 2.8, carbs: 7,    fats: 0.4,  fat: 0.4,  calories: 34,  unit: '100g',      category: 'vegetables' },
  { id: '27', food_id: 'f_27', name: 'Spinach',            protein: 2.9, carbs: 3.6,  fats: 0.4,  fat: 0.4,  calories: 23,  unit: '100g',      category: 'vegetables' },
  { id: '28', food_id: 'f_28', name: 'Kale',               protein: 4.3, carbs: 9,    fats: 0.9,  fat: 0.9,  calories: 49,  unit: '100g',      category: 'vegetables' },
  { id: '29', food_id: 'f_29', name: 'Asparagus',          protein: 2.2, carbs: 3.9,  fats: 0.1,  fat: 0.1,  calories: 20,  unit: '100g',      category: 'vegetables' },
  { id: '30', food_id: 'f_30', name: 'Bell Pepper',        protein: 1,   carbs: 6,    fats: 0.3,  fat: 0.3,  calories: 31,  unit: '1 medium',  category: 'vegetables' },
  { id: '31', food_id: 'f_31', name: 'Cucumber',           protein: 0.7, carbs: 3.6,  fats: 0.1,  fat: 0.1,  calories: 15,  unit: '100g',      category: 'vegetables' },
  { id: '32', food_id: 'f_32', name: 'Zucchini',           protein: 1.2, carbs: 3.1,  fats: 0.3,  fat: 0.3,  calories: 17,  unit: '100g',      category: 'vegetables' },
  // Dairy
  { id: '33', food_id: 'f_33', name: 'Greek Yogurt',       protein: 10,  carbs: 3.6,  fats: 0.4,  fat: 0.4,  calories: 59,  unit: '100g',      category: 'dairy' },
  { id: '34', food_id: 'f_34', name: 'Cottage Cheese',     protein: 11,  carbs: 3.4,  fats: 4.3,  fat: 4.3,  calories: 98,  unit: '100g',      category: 'dairy' },
  { id: '35', food_id: 'f_35', name: 'Milk (2%)',          protein: 3.4, carbs: 5,    fats: 2,    fat: 2,    calories: 50,  unit: '100ml',     category: 'dairy' },
  { id: '36', food_id: 'f_36', name: 'Cheddar Cheese',     protein: 25,  carbs: 1.3,  fats: 33,   fat: 33,   calories: 403, unit: '100g',      category: 'dairy' },
  { id: '37', food_id: 'f_37', name: 'Mozzarella',         protein: 22,  carbs: 2.2,  fats: 22,   fat: 22,   calories: 300, unit: '100g',      category: 'dairy' },
];

export const seedExercises: Exercise[] = [
  { id: '1', exercise_id: 'ex_s1', name: 'Bench Press', muscleGroup: 'Chest', muscle_groups: ['chest', 'triceps'], category: 'chest', equipment_required: ['barbell', 'bench'], is_compound: true, videoUrl: 'https://www.youtube.com/embed/rT7DgCr-3pg', instructions: 'Lie flat on bench, grip bar slightly wider than shoulders, lower to chest, press up.' },
  { id: '2', exercise_id: 'ex_s2', name: 'Squat', muscleGroup: 'Legs', muscle_groups: ['quads', 'glutes'], category: 'legs', equipment_required: ['barbell'], is_compound: true, videoUrl: 'https://www.youtube.com/embed/bEv6CCg2BC8', instructions: 'Bar on upper back, feet shoulder-width, squat down until thighs parallel, stand up.' },
  { id: '3', exercise_id: 'ex_s3', name: 'Deadlift', muscleGroup: 'Back', muscle_groups: ['back', 'hamstrings'], category: 'back', equipment_required: ['barbell'], is_compound: true, videoUrl: 'https://www.youtube.com/embed/1ZXobu7JvvE', instructions: 'Feet under bar, grip bar, keep back straight, stand up by extending hips and knees.' },
  { id: '4', exercise_id: 'ex_s4', name: 'Overhead Press', muscleGroup: 'Shoulders', muscle_groups: ['shoulders', 'triceps'], category: 'shoulders', equipment_required: ['barbell'], is_compound: true, videoUrl: 'https://www.youtube.com/embed/2yjwXTZQDDI', instructions: 'Bar at shoulder height, press overhead until arms fully extended, lower with control.' },
  { id: '5', exercise_id: 'ex_s5', name: 'Barbell Row', muscleGroup: 'Back', muscle_groups: ['back', 'lats'], category: 'back', equipment_required: ['barbell'], is_compound: true, videoUrl: 'https://www.youtube.com/embed/9efgcAjQe7E', instructions: 'Bend at hips, back straight, pull bar to lower chest, squeeze shoulder blades.' },
  { id: '6', exercise_id: 'ex_s6', name: 'Lunges', muscleGroup: 'Legs', muscle_groups: ['quads', 'glutes'], category: 'legs', equipment_required: ['dumbbells'], is_compound: true, videoUrl: 'https://www.youtube.com/embed/L8fvyBHUPew', instructions: 'Step forward, lower hips until both knees at 90 degrees, return to starting position.' },
];
