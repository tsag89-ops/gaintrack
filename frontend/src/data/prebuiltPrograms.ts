import { format } from 'date-fns';
import { ProgramDay, ProgramExercise, ProgressionRule, WorkoutProgram } from '../types';

export interface PrebuiltProgramTemplate {
  id: string;
  name: string;
  description: string;
  daysPerWeek: number;
  estimatedSessionMinutes: number;
  level: 'Beginner' | 'Intermediate';
  days: Array<{
    label: string;
    exercises: Array<{
      exerciseName: string;
      sets: number;
      reps: number;
      weight: number;
      progression: ProgressionRule;
    }>;
  }>;
}

const PROGRAM_ID_PREFIX = 'tpl';

const weightSessionSmall: ProgressionRule = { type: 'weight', increment: 2.5, every: 'session' };
const weightCycleSmall: ProgressionRule = { type: 'weight', increment: 2.5, every: 'cycle' };

export const PREBUILT_PROGRAMS: PrebuiltProgramTemplate[] = [
  {
    id: 'starter_full_body_3d',
    name: 'Starter Full Body',
    description: 'Simple full-body split for first 8-12 weeks.',
    daysPerWeek: 3,
    estimatedSessionMinutes: 50,
    level: 'Beginner',
    days: [
      {
        label: 'Day A - Full Body',
        exercises: [
          { exerciseName: 'Barbell Squat', sets: 3, reps: 5, weight: 40, progression: weightSessionSmall },
          { exerciseName: 'Bench Press', sets: 3, reps: 5, weight: 35, progression: weightSessionSmall },
          { exerciseName: 'Bent Over Row', sets: 3, reps: 8, weight: 30, progression: weightCycleSmall },
        ],
      },
      {
        label: 'Day B - Full Body',
        exercises: [
          { exerciseName: 'Deadlift', sets: 3, reps: 5, weight: 50, progression: weightSessionSmall },
          { exerciseName: 'Overhead Press', sets: 3, reps: 5, weight: 25, progression: weightSessionSmall },
          { exerciseName: 'Lat Pulldown', sets: 3, reps: 10, weight: 30, progression: weightCycleSmall },
        ],
      },
      {
        label: 'Day C - Full Body',
        exercises: [
          { exerciseName: 'Romanian Deadlift', sets: 3, reps: 8, weight: 40, progression: weightCycleSmall },
          { exerciseName: 'Incline Dumbbell Press', sets: 3, reps: 10, weight: 14, progression: weightCycleSmall },
          { exerciseName: 'Seated Cable Row', sets: 3, reps: 10, weight: 30, progression: weightCycleSmall },
        ],
      },
    ],
  },
  {
    id: 'ppl_6d_hypertrophy',
    name: 'Push Pull Legs',
    description: 'Classic 6-day hypertrophy split with repeat rotation.',
    daysPerWeek: 6,
    estimatedSessionMinutes: 65,
    level: 'Intermediate',
    days: [
      {
        label: 'Day A - Push',
        exercises: [
          { exerciseName: 'Bench Press', sets: 4, reps: 6, weight: 40, progression: weightSessionSmall },
          { exerciseName: 'Incline Dumbbell Press', sets: 3, reps: 10, weight: 16, progression: weightCycleSmall },
          { exerciseName: 'Triceps Pushdown', sets: 3, reps: 12, weight: 18, progression: weightCycleSmall },
        ],
      },
      {
        label: 'Day B - Pull',
        exercises: [
          { exerciseName: 'Barbell Row', sets: 4, reps: 8, weight: 40, progression: weightSessionSmall },
          { exerciseName: 'Lat Pulldown', sets: 3, reps: 10, weight: 35, progression: weightCycleSmall },
          { exerciseName: 'Dumbbell Curl', sets: 3, reps: 12, weight: 10, progression: weightCycleSmall },
        ],
      },
      {
        label: 'Day C - Legs',
        exercises: [
          { exerciseName: 'Back Squat', sets: 4, reps: 6, weight: 50, progression: weightSessionSmall },
          { exerciseName: 'Leg Press', sets: 3, reps: 10, weight: 100, progression: weightCycleSmall },
          { exerciseName: 'Leg Curl', sets: 3, reps: 12, weight: 30, progression: weightCycleSmall },
        ],
      },
      {
        label: 'Day D - Push',
        exercises: [
          { exerciseName: 'Overhead Press', sets: 4, reps: 6, weight: 30, progression: weightSessionSmall },
          { exerciseName: 'Cable Fly', sets: 3, reps: 12, weight: 12, progression: weightCycleSmall },
          { exerciseName: 'Lateral Raise', sets: 3, reps: 15, weight: 7, progression: weightCycleSmall },
        ],
      },
      {
        label: 'Day E - Pull',
        exercises: [
          { exerciseName: 'One Arm Dumbbell Row', sets: 4, reps: 8, weight: 20, progression: weightSessionSmall },
          { exerciseName: 'Seated Cable Row', sets: 3, reps: 10, weight: 35, progression: weightCycleSmall },
          { exerciseName: 'Face Pull', sets: 3, reps: 15, weight: 15, progression: weightCycleSmall },
        ],
      },
      {
        label: 'Day F - Legs',
        exercises: [
          { exerciseName: 'Romanian Deadlift', sets: 4, reps: 8, weight: 50, progression: weightSessionSmall },
          { exerciseName: 'Walking Lunge', sets: 3, reps: 12, weight: 12, progression: weightCycleSmall },
          { exerciseName: 'Standing Calf Raise', sets: 4, reps: 12, weight: 30, progression: weightCycleSmall },
        ],
      },
    ],
  },
  {
    id: 'dumbbell_home_4d',
    name: 'Dumbbell Home Plan',
    description: 'Minimal-equipment home split using dumbbells and bodyweight.',
    daysPerWeek: 4,
    estimatedSessionMinutes: 45,
    level: 'Beginner',
    days: [
      {
        label: 'Day A - Upper',
        exercises: [
          { exerciseName: 'Incline Dumbbell Press', sets: 3, reps: 10, weight: 12, progression: weightCycleSmall },
          { exerciseName: 'One Arm Dumbbell Row', sets: 3, reps: 10, weight: 14, progression: weightCycleSmall },
          { exerciseName: 'Push-Up', sets: 3, reps: 12, weight: 0, progression: { type: 'reps', increment: 1, every: 'session' } },
        ],
      },
      {
        label: 'Day B - Lower',
        exercises: [
          { exerciseName: 'Goblet Squat', sets: 4, reps: 10, weight: 20, progression: weightCycleSmall },
          { exerciseName: 'Dumbbell Romanian Deadlift', sets: 3, reps: 10, weight: 18, progression: weightCycleSmall },
          { exerciseName: 'Split Squat', sets: 3, reps: 10, weight: 10, progression: weightCycleSmall },
        ],
      },
      {
        label: 'Day C - Upper',
        exercises: [
          { exerciseName: 'Dumbbell Shoulder Press', sets: 3, reps: 10, weight: 10, progression: weightCycleSmall },
          { exerciseName: 'Dumbbell Floor Press', sets: 3, reps: 12, weight: 12, progression: weightCycleSmall },
          { exerciseName: 'Dumbbell Curl', sets: 3, reps: 12, weight: 8, progression: weightCycleSmall },
        ],
      },
      {
        label: 'Day D - Lower',
        exercises: [
          { exerciseName: 'Dumbbell Step Up', sets: 3, reps: 12, weight: 10, progression: weightCycleSmall },
          { exerciseName: 'Glute Bridge', sets: 3, reps: 15, weight: 0, progression: { type: 'reps', increment: 1, every: 'session' } },
          { exerciseName: 'Standing Calf Raise', sets: 4, reps: 15, weight: 0, progression: { type: 'reps', increment: 1, every: 'session' } },
        ],
      },
    ],
  },
];

const makeId = () => `${PROGRAM_ID_PREFIX}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const toSetDetails = (exercise: ProgramExercise) =>
  Array.from({ length: exercise.sets }, () => ({ reps: exercise.reps, weight: exercise.weight }));

export const createProgramFromTemplate = (template: PrebuiltProgramTemplate): WorkoutProgram => {
  const days: ProgramDay[] = template.days.map((day) => {
    const exercises: ProgramExercise[] = day.exercises.map((exercise) => ({
      ...exercise,
      setDetails: toSetDetails(exercise),
    }));

    return {
      id: makeId(),
      label: day.label,
      exercises,
    };
  });

  return {
    id: makeId(),
    name: template.name,
    daysPerWeek: template.daysPerWeek,
    days,
    currentCycle: 1,
    currentDayIndex: 0,
    createdAt: format(new Date(), 'yyyy-MM-dd'),
  };
};