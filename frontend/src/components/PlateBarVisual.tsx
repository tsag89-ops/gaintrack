// src/components/PlateBarVisual.tsx
// Presentational component — no state, just props.
//
// Renders a top-down view of a barbell with colored plate blocks on each side,
// inspired by visual online calculators (StrengthLog, RP Strength, etc.)
// and competition plate color conventions (rough IWF/IPF-style).
//
// Layout (left → right):
//   [small plates] [collar] [sleeve] [knurl] [sleeve] [collar] [large plates]
//
// Why "small plates on the outside"?  Because plates are loaded with the
// heaviest first (against the collar), exactly as you'd load a real bar.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { PlateSideConfig, Unit } from '../types/plates';
import { colors, spacing, radii, typography } from '../constants/theme';
import { useLanguage } from '../context/LanguageContext';

interface Props {
  platesPerSide: PlateSideConfig[];
  unit: Unit;
  barWeight?: number;
}

// ── Color mapping ─────────────────────────────────────────────────────────────
// Rough IWF competition palette.  Not exact — just intuitive enough so the
// user can glance and know roughly what plates are on the bar.

interface PlateStyle {
  bg: string;
  border: string;
}

function getPlateColor(weight: number, unit: Unit): PlateStyle {
  if (unit === 'kg') {
    if (weight >= 25) return { bg: '#C62828', border: '#B71C1C' }; // red    (25 kg)
    if (weight >= 20) return { bg: '#1565C0', border: '#0D47A1' }; // blue   (20 kg)
    if (weight >= 15) return { bg: '#F9A825', border: '#F57F17' }; // yellow (15 kg)
    if (weight >= 10) return { bg: '#2E7D32', border: '#1B5E20' }; // green  (10 kg)
    if (weight >= 5)  return { bg: '#424242', border: '#212121' }; // gray   ( 5 kg)
    if (weight >= 2.5) return { bg: '#757575', border: '#424242' }; // silver (2.5 kg)
    return { bg: '#9E9E9E', border: '#757575' };                    // silver (1.25 kg)
  }
  // lb plates
  if (weight >= 55) return { bg: '#C62828', border: '#B71C1C' }; // red      (55+ lb)
  if (weight >= 45) return { bg: '#1565C0', border: '#0D47A1' }; // blue     (45 lb)
  if (weight >= 35) return { bg: '#F9A825', border: '#F57F17' }; // yellow   (35 lb)
  if (weight >= 25) return { bg: '#2E7D32', border: '#1B5E20' }; // green    (25 lb)
  if (weight >= 10) return { bg: '#424242', border: '#212121' }; // gray     (10 lb)
  if (weight >= 5)  return { bg: '#C62828', border: '#B71C1C' }; // red      ( 5 lb)
  return { bg: '#9E9E9E', border: '#757575' };                   // silver   (2.5 lb)
}

// ── Visual dimensions ─────────────────────────────────────────────────────────
// Heavier plates are rendered taller so their size is visually obvious.

interface PlateDims {
  height: number;
  width: number;
}

function getPlateDims(weight: number): PlateDims {
  if (weight >= 20) return { height: 80, width: 18 };
  if (weight >= 15) return { height: 70, width: 16 };
  if (weight >= 10) return { height: 60, width: 14 };
  if (weight >= 5)  return { height: 48, width: 12 };
  if (weight >= 2.5) return { height: 38, width: 10 };
  return { height: 30, width: 8 };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Expand [{weight, countPerSide}] into a flat array of individual weights. */
function expandPlates(platesPerSide: PlateSideConfig[]): number[] {
  const out: number[] = [];
  for (const p of platesPerSide) {
    for (let i = 0; i < p.countPerSide; i++) {
      out.push(p.weight);
    }
  }
  return out;
}

const MAX_VISIBLE = 8; // cap so the bar doesn't overflow on-screen

// ── Component ─────────────────────────────────────────────────────────────────

const PlateBarVisual: React.FC<Props> = ({ platesPerSide, unit }) => {
  const { t } = useLanguage();
  const allPlates   = expandPlates(platesPerSide); // largest first
  const visible     = allPlates.slice(0, MAX_VISIBLE);
  const overflowCt  = Math.max(0, allPlates.length - MAX_VISIBLE);

  // A single colored plate block.  The label is rotated -90° so it reads
  // vertically — same trick used in real barbell-loading diagrams.
  const PlateBlock = ({ w, keyPfx, idx }: { w: number; keyPfx: string; idx: number }) => {
    const { bg, border } = getPlateColor(w, unit);
    const { height, width } = getPlateDims(w);
    const fontSize = height > 50 ? 7 : 6;
    return (
      <View
        key={`${keyPfx}-${idx}`}
        style={[
          styles.plate,
          { height, width, backgroundColor: bg, borderColor: border },
        ]}
      >
        <Text
          style={[
            styles.plateText,
            { fontSize, width: height /* after -90° rotation, text width = plate height */ },
          ]}
          numberOfLines={1}
        >
          {w}
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.sectionLabel}>{t('plateCalculatorTab.visualPreview')}</Text>

      <View style={styles.barbellRow}>
        {/* ── Left side: reversed so the largest plate is next to the collar ── */}
        <View style={styles.side}>
          {[...visible].reverse().map((w, i) => (
            <PlateBlock key={`l-${i}`} w={w} keyPfx="l" idx={i} />
          ))}
        </View>

        {/* ── Collar ── */}
        <View style={styles.collar} />

        {/* ── Sleeve ── */}
        <View style={styles.sleeve} />

        {/* ── Knurled centre bar ── */}
        <View style={styles.knurl}>
          {Array.from({ length: 6 }).map((_, i) => (
            <View key={i} style={styles.knurlLine} />
          ))}
        </View>

        {/* ── Sleeve ── */}
        <View style={styles.sleeve} />

        {/* ── Collar ── */}
        <View style={styles.collar} />

        {/* ── Right side: largest plate next to collar (same order as array) ── */}
        <View style={styles.side}>
          {visible.map((w, i) => (
            <PlateBlock key={`r-${i}`} w={w} keyPfx="r" idx={i} />
          ))}
        </View>
      </View>

      {overflowCt > 0 && (
        <Text style={styles.overflow}>
          {t('plateCalculatorTab.morePlatesNotShown', {
            count: overflowCt,
            suffix: overflowCt > 1 ? t('workoutActive.pluralSuffix') : '',
          })}
        </Text>
      )}
    </View>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing[4],
    marginBottom: spacing[4],
  },
  sectionLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textSecondary,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: spacing[3],
  },
  barbellRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 90,
  },
  side: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  plate: {
    borderRadius: 3,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 1,
    overflow: 'hidden',
  },
  plateText: {
    color: '#FFFFFF',
    fontWeight: '700',
    textAlign: 'center',
    transform: [{ rotate: '-90deg' }],
  },
  collar: {
    width: 8,
    height: 28,
    backgroundColor: '#888888',
    borderRadius: 3,
  },
  sleeve: {
    width: 20,
    height: 10,
    backgroundColor: '#9E9E9E',
    borderRadius: 2,
  },
  knurl: {
    flex: 1,
    maxWidth: 80,
    height: 14,
    backgroundColor: '#757575',
    borderRadius: 3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingHorizontal: 4,
  },
  knurlLine: {
    width: 2,
    height: 10,
    backgroundColor: '#555555',
    borderRadius: 1,
  },
  overflow: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing[2],
  },
});

export default PlateBarVisual;
