// frontend/src/utils/volumeCalc.ts
// Volume-calculation helpers for ProgressOverviewScreen.
// Follows charts-agent.md data conventions.

import { startOfWeek, addWeeks, format } from 'date-fns';

// ── Local types (mirrors progress.tsx StoredWorkout schema) ──────────────────

export interface VolumeSet {
  reps: number;
  weight: number;
  completed?: boolean;
}

export interface VolumeExercise {
  exercise_name?: string;
  name?: string;
  sets: VolumeSet[];
}

export interface VolumeWorkout {
  date: string;
  exercises?: VolumeExercise[];
}

// ── Muscle-group keyword map ──────────────────────────────────────────────────

const MUSCLE_KEYWORDS: ReadonlyArray<{ keywords: string[]; group: string }> = [
  {
    keywords: ['bench', 'chest', 'pec', 'fly', 'flye', 'push-up', 'pushup', 'dip', 'cable cross'],
    group: 'Chest',
  },
  {
    keywords: [
      'squat', 'leg press', 'lunge', 'leg curl', 'leg extension',
      'calf', 'glute', 'hamstring', 'quad', 'rdl', 'sumo',
    ],
    group: 'Legs',
  },
  {
    keywords: [
      'deadlift', 'row', 'lat pulldown', 'pull-up', 'pullup',
      'chin-up', 'chinup', 'cable pull', 'back extension', 't-bar',
    ],
    group: 'Back',
  },
  {
    keywords: [
      'overhead press', 'shoulder press', 'lateral raise', 'front raise',
      'delt', 'upright row', ' ohp', 'arnold',
    ],
    group: 'Shoulders',
  },
  {
    keywords: [
      'curl', 'tricep', 'bicep', 'hammer curl', 'skullcrusher',
      'pushdown', 'triceps extension', 'preacher',
    ],
    group: 'Arms',
  },
  {
    keywords: ['crunch', 'plank', 'core', ' ab ', 'abs', 'sit-up', 'situp', 'cable crunch', 'leg raise', 'oblique'],
    group: 'Core',
  },
  {
    keywords: ['run', 'bike', 'cardio', 'swim', 'treadmill', 'elliptical', 'rowing machine', 'stair'],
    group: 'Cardio',
  },
];

/**
 * Infers a canonical muscle group from an exercise name using keyword matching.
 * Falls back to 'Other'.
 */
export function inferMuscleGroup(exerciseName: string): string {
  const lower = ` ${exerciseName.toLowerCase()} `;
  for (const { keywords, group } of MUSCLE_KEYWORDS) {
    if (keywords.some((k) => lower.includes(k))) return group;
  }
  return 'Other';
}

// ── Volume helpers ────────────────────────────────────────────────────────────

/** Volume for a single set (weight × reps). Returns 0 for invalid sets. */
function setVol(s: VolumeSet): number {
  const w = Number(s.weight ?? 0);
  const r = Number(s.reps ?? 0);
  return w > 0 && r > 0 ? w * r : 0;
}

/** Exercise display name — handles both 'exercise_name' and 'name' fields. */
function exName(ex: VolumeExercise): string {
  return (ex.exercise_name ?? ex.name ?? '').trim();
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Computes total training volume (kg) per week for the last `numWeeks` weeks.
 * Returns `{ labels, data }` shaped for react-native-chart-kit BarChart.
 *
 * Weeks begin on Monday. Labels are formatted "MMM d" (e.g. "Mar 10").
 */
export function getWeeklyTotalVolume(
  workouts: VolumeWorkout[],
  numWeeks = 8,
): { labels: string[]; data: number[] } {
  const now = new Date();
  const weekStarts = Array.from({ length: numWeeks }, (_, i) =>
    startOfWeek(addWeeks(now, -(numWeeks - 1 - i)), { weekStartsOn: 1 }),
  );

  const data = weekStarts.map((weekStart) => {
    const weekEnd = addWeeks(weekStart, 1);
    return workouts
      .filter((w) => {
        const d = new Date(w.date);
        return !isNaN(d.getTime()) && d >= weekStart && d < weekEnd;
      })
      .reduce(
        (total, w) =>
          total +
          (w.exercises ?? []).reduce(
            (et, ex) => et + (ex.sets ?? []).reduce((st, s) => st + setVol(s), 0),
            0,
          ),
        0,
      );
  });

  const labels = weekStarts.map((ws) => format(ws, 'MMM d'));
  return { labels, data };
}

/**
 * Computes per-muscle-group volume for the current (Monday-start) week.
 * Returns `{ labels, data }` sorted descending by volume.
 * Returns `{ labels: [], data: [] }` when no workouts exist in the current week.
 */
export function getMuscleGroupVolumeLatestWeek(
  workouts: VolumeWorkout[],
): { labels: string[]; data: number[] } {
  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = addWeeks(weekStart, 1);

  const map = new Map<string, number>();

  workouts
    .filter((w) => {
      const d = new Date(w.date);
      return !isNaN(d.getTime()) && d >= weekStart && d < weekEnd;
    })
    .forEach((w) => {
      (w.exercises ?? []).forEach((ex) => {
        const group = inferMuscleGroup(exName(ex));
        const vol = (ex.sets ?? []).reduce((st, s) => st + setVol(s), 0);
        map.set(group, (map.get(group) ?? 0) + vol);
      });
    });

  if (map.size === 0) return { labels: [], data: [] };

  const sorted = [...map.entries()].sort((a, b) => b[1] - a[1]);
  return {
    labels: sorted.map(([g]) => g),
    data: sorted.map(([, v]) => Math.round(v)),
  };
}
