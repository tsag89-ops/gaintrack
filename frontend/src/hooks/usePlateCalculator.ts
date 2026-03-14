// src/hooks/usePlateCalculator.ts
// Manages all state for the Plate Calculator tab:
//   – unit, barWeight, targetWeight, per-unit plate banks
//   – reads/writes via AsyncStorage so settings survive app restarts
//   – recomputes result automatically whenever inputs change
//   – exposes useInActiveWorkout() to send the result to the Active Workout screen

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { calculatePlates } from '../utils/plateCalculator';
import { Unit, Plate, PlateCalcResult } from '../types/plates';
import { storage } from '../utils/storage';

// ── AsyncStorage keys ────────────────────────────────────────────────────────
const KEY_UNIT     = 'gaintrack_plate_calc_unit';
const KEY_BAR      = 'gaintrack_plate_calc_bar_weight';
const KEY_TARGET   = 'gaintrack_plate_calc_target';
const KEY_PLATES_KG = 'gaintrack_plate_calc_plates_kg';
const KEY_PLATES_LB = 'gaintrack_plate_calc_plates_lb';

// ── Default values ───────────────────────────────────────────────────────────

/** Common bar options available in the bar-weight selector */
export const BAR_OPTIONS: Record<Unit, number[]> = {
  kg: [20, 15, 10, 7.5],
  lb: [45, 35, 25, 15],
};

/** Standard Olympic plate sets users typically own (8 of each by default) */
export const DEFAULT_PLATES: Record<Unit, Plate[]> = {
  kg: [
    { weight: 25,   count: 8 },
    { weight: 20,   count: 8 },
    { weight: 15,   count: 8 },
    { weight: 10,   count: 8 },
    { weight: 5,    count: 8 },
    { weight: 2.5,  count: 8 },
    { weight: 1.25, count: 8 },
  ],
  lb: [
    { weight: 45,  count: 8 },
    { weight: 35,  count: 8 },
    { weight: 25,  count: 8 },
    { weight: 10,  count: 8 },
    { weight: 5,   count: 8 },
    { weight: 2.5, count: 8 },
  ],
};

// ── Hook ─────────────────────────────────────────────────────────────────────

export function usePlateCalculator() {
  const router = useRouter();

  const [loading, setLoading]           = useState(true);
  const [unit, setUnitState]            = useState<Unit>('kg');
  const [barWeight, setBarWeightState]  = useState<number>(20);
  const [targetWeight, setTargetState]  = useState<string>('');
  const [platesKg, setPlatesKg]         = useState<Plate[]>(DEFAULT_PLATES.kg);
  const [platesLb, setPlatesLb]         = useState<Plate[]>(DEFAULT_PLATES.lb);

  // Derive active plate set from current unit
  const plates = unit === 'kg' ? platesKg : platesLb;

  // Parse the text-input string to a number for computation
  const parsedTarget = useMemo(() => {
    const n = parseFloat(targetWeight);
    return isNaN(n) ? 0 : n;
  }, [targetWeight]);

  // Automatically recompute plates whenever any input changes
  const result: PlateCalcResult | null = useMemo(() => {
    if (parsedTarget <= 0) return null;
    return calculatePlates({ targetWeight: parsedTarget, barWeight, unit, plates });
  }, [parsedTarget, barWeight, unit, plates]);

  // ── Load persisted settings on first mount ────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        const entries = await storage.multiGet([
          KEY_UNIT,
          KEY_BAR,
          KEY_TARGET,
          KEY_PLATES_KG,
          KEY_PLATES_LB,
        ]);
        const map = Object.fromEntries(entries);
        const savedUnit = map[KEY_UNIT];
        const savedBar = map[KEY_BAR];
        const savedTarget = map[KEY_TARGET];
        const savedKg = map[KEY_PLATES_KG];
        const savedLb = map[KEY_PLATES_LB];

        if (savedUnit === 'kg' || savedUnit === 'lb') {
          setUnitState(savedUnit);
        }
        if (savedBar) {
          const n = parseFloat(savedBar);
          if (!isNaN(n)) setBarWeightState(n);
        }
        if (savedTarget) setTargetState(savedTarget);
        if (savedKg) setPlatesKg(JSON.parse(savedKg) as Plate[]);
        if (savedLb) setPlatesLb(JSON.parse(savedLb) as Plate[]);
      } catch (e) {
        // Keep defaults silently on read failure
        console.warn('[PlateCalc] load failed:', e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // ── Actions ───────────────────────────────────────────────────────────────

  /** Switch unit; resets bar weight to that unit's first default */
  const setUnit = useCallback(async (u: Unit) => {
    const defaultBar = BAR_OPTIONS[u][0];
    setUnitState(u);
    setBarWeightState(defaultBar);
    setTargetState('');
    try {
      await storage.multiSet([
        [KEY_UNIT, u],
        [KEY_BAR, String(defaultBar)],
        [KEY_TARGET, ''],
      ]);
    } catch (e) {
      console.warn('[PlateCalc] save unit failed:', e);
    }
  }, []);

  /** Select a different bar weight */
  const setBarWeight = useCallback(async (w: number) => {
    setBarWeightState(w);
    try {
      await storage.setItem(KEY_BAR, String(w));
    } catch (e) {
      console.warn('[PlateCalc] save bar weight failed:', e);
    }
  }, []);

  /** Update the target-weight text field; also persists to AsyncStorage */
  const setTargetWeight = useCallback(async (value: string | number) => {
    const str = typeof value === 'number' ? String(value) : value;
    setTargetState(str);
    try {
      await storage.setItem(KEY_TARGET, str);
    } catch (e) {
      console.warn('[PlateCalc] save target failed:', e);
    }
  }, []);

  /** Update the count for one plate denomination in the current unit */
  const setPlateCount = useCallback(
    async (plateWeight: number, count: number) => {
      if (unit === 'kg') {
        const updated = platesKg.map((p) =>
          p.weight === plateWeight ? { ...p, count } : p,
        );
        setPlatesKg(updated);
        try {
          await storage.setItem(KEY_PLATES_KG, JSON.stringify(updated));
        } catch (e) {
          console.warn('[PlateCalc] save kg plates failed:', e);
        }
      } else {
        const updated = platesLb.map((p) =>
          p.weight === plateWeight ? { ...p, count } : p,
        );
        setPlatesLb(updated);
        try {
          await storage.setItem(KEY_PLATES_LB, JSON.stringify(updated));
        } catch (e) {
          console.warn('[PlateCalc] save lb plates failed:', e);
        }
      }
    },
    [unit, platesKg, platesLb],
  );

  /** Reset everything back to factory defaults and clear AsyncStorage */
  const resetToDefaults = useCallback(async () => {
    setUnitState('kg');
    setBarWeightState(BAR_OPTIONS.kg[0]);
    setTargetState('');
    setPlatesKg(DEFAULT_PLATES.kg);
    setPlatesLb(DEFAULT_PLATES.lb);
    try {
      await storage.multiRemove([
        KEY_UNIT, KEY_BAR, KEY_TARGET, KEY_PLATES_KG, KEY_PLATES_LB,
      ]);
    } catch (e) {
      console.warn('[PlateCalc] clear failed:', e);
    }
  }, []);

  /**
   * "Use in Active Workout" integration.
   *
   * Builds a human-readable summary and navigates to the Active Workout
   * screen with the achieved total pre-filled as the workout name.
   *
   * TODO: When active.tsx grows a dedicated `initialSetWeight` param,
   * pass `achievedTotal` there so it auto-fills the weight field on the
   * current set.  For now the param flows through the workout `name` so
   * no information is lost between iterations.
   */
  const useInActiveWorkout = useCallback(() => {
    if (!result) return;

    const total = result.achievedTotal;
    const summary = result.platesPerSide
      .map((p) => `${p.weight}${unit} × ${p.countPerSide}`)
      .join(', ');

    console.info('[PlateCalc] useInActiveWorkout', { total, summary });

    // Navigate to the Active Workout screen, carrying weight info in params.
    // expo-router passes params as string query values.
    router.push({
      pathname: '/workout/active' as const,
      params: {
        name: `Workout — ${total} ${unit}`,
        // plate_summary is available for future wiring inside active.tsx
        plate_summary: summary,
      },
    });
  }, [result, unit, router]);

  return {
    // ── State ──────────────────────────────────────────────────────────────
    unit,
    barWeight,
    targetWeight,
    plates,
    result,
    loading,
    // ── Actions ────────────────────────────────────────────────────────────
    setUnit,
    setBarWeight,
    setTargetWeight,
    setPlateCount,
    resetToDefaults,
    useInActiveWorkout,
  };
}
