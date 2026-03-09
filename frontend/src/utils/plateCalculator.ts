// src/utils/plateCalculator.ts
// Pure function — no React, no side-effects, fully testable.
//
// Algorithm: Greedy "largest-first" plate selection.
// This is identical in concept to Strong, Hevy, StrengthLog, and most
// web-based barbell calculators:
//   1. Subtract the bar from the total → weight that must come from plates.
//   2. Divide by 2 → per-side target.
//   3. Walk plate sizes largest→smallest, fitting as many PAIRS as possible.
//   4. Return the loaded plates and whether the target was hit exactly.

import { Unit, Plate, PlateSideConfig, PlateCalcResult } from '../types/plates';

export function calculatePlates(options: {
  targetWeight: number;
  barWeight: number;
  unit: Unit;
  plates: Plate[];
}): PlateCalcResult {
  const { targetWeight, barWeight, plates } = options;

  // ── Step 1: How much weight must come from plates? ──────────────────────
  const weightForPlates = targetWeight - barWeight;

  // Target is at or below bare bar weight — return early
  if (weightForPlates <= 0) {
    return {
      success: targetWeight === barWeight,
      platesPerSide: [],
      achievedTotal: barWeight,
      missing: parseFloat((targetWeight - barWeight).toFixed(4)),
    };
  }

  // ── Step 2: Per-side target ─────────────────────────────────────────────
  const sideTarget = weightForPlates / 2;

  // ── Step 3: Sort plates largest → smallest ──────────────────────────────
  const sorted = [...plates].sort((a, b) => b.weight - a.weight);

  let remainingSide = sideTarget;
  const platesPerSide: PlateSideConfig[] = [];

  // ── Step 4: Greedy fill ─────────────────────────────────────────────────
  for (const plate of sorted) {
    if (remainingSide <= 0) break;

    // Need at least 2 single plates to make one pair (one per side)
    if (plate.count < 2) continue;

    // Maximum pairs this plate size can contribute
    const maxPairs = Math.floor(plate.count / 2);

    // Maximum pairs that fit into remaining weight on this side
    const maxPairsByWeight = Math.floor(remainingSide / plate.weight);

    const pairsToUse = Math.min(maxPairs, maxPairsByWeight);

    if (pairsToUse > 0) {
      platesPerSide.push({ weight: plate.weight, countPerSide: pairsToUse });
      // Subtract what we've loaded, parsed to 4 dp to avoid floating-point drift
      remainingSide = parseFloat(
        (remainingSide - pairsToUse * plate.weight).toFixed(4),
      );
    }
  }

  // ── Step 5: Compute result ─────────────────────────────────────────────
  const plateTotal = platesPerSide.reduce(
    (sum, p) => sum + p.weight * p.countPerSide * 2,
    0,
  );
  const achievedTotal = parseFloat((barWeight + plateTotal).toFixed(4));
  const missing = parseFloat((targetWeight - achievedTotal).toFixed(4));

  return {
    success: Math.abs(missing) < 0.01, // treat < 0.01 unit diff as exact
    platesPerSide,
    achievedTotal,
    missing,
  };
}
