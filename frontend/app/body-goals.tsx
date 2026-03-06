// app/body-goals.tsx
// Body Composition Goal-Setting Screen
// Set target weight, body fat %, weekly change rate — live projected timeline

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  PanResponder,
  Animated,
  LayoutChangeEvent,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { format, addWeeks } from 'date-fns';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../src/config/firebase';
import { useAuthStore } from '../src/store/authStore';
import type { BodyCompositionGoals } from '../src/types/bodyGoals';

// ── Constants ──────────────────────────────────────────────────────────────────
export const BODY_GOALS_KEY = 'gaintrack_body_goals';
const BODYWEIGHT_KEY = 'gaintrack_bodyweight';
const MEASUREMENTS_KEY = 'gaintrack_measurements';

const SLIDER_MIN = -1.0;
const SLIDER_MAX = 0.5;
const SLIDER_STEP = 0.1;

// ── Helpers ───────────────────────────────────────────────────────────────────
function getPhaseLabel(rate: number): string {
  if (rate < -0.75) return 'Aggressive Cut';
  if (rate < -0.25) return 'Cutting';
  if (rate < 0.1) return 'Maintenance';
  if (rate <= 0.3) return 'Lean Bulk';
  return 'Bulk';
}

function getPhaseColor(label: string): string {
  switch (label) {
    case 'Aggressive Cut': return '#F44336';
    case 'Cutting':        return '#2196F3';
    case 'Maintenance':    return '#4CAF50';
    case 'Lean Bulk':      return '#FF9800';
    case 'Bulk':           return '#9C27B0';
    default:               return '#B0B0B0';
  }
}

function getTimelineColor(weeks: number, weeklyGoal: number): string {
  if (weeklyGoal === 0) return '#F44336';
  if (weeks > 104)     return '#F44336';
  if (weeks > 52)      return '#FF6200';
  return '#4CAF50';
}

async function saveGoalToFirestore(uid: string, goal: BodyCompositionGoals): Promise<void> {
  try {
    await setDoc(doc(db, 'users', uid, 'goals', 'body_composition'), goal as unknown as Record<string, unknown>, { merge: true });
  } catch {
    try {
      await (db as any).collection('users').doc(uid).collection('goals').doc('body_composition').set(goal, { merge: true });
    } catch (e2) {
      console.warn('[BodyGoals] Firestore save failed:', e2);
    }
  }
}

// ── Custom Slider ──────────────────────────────────────────────────────────────
interface SliderProps {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}

const THUMB_SIZE = 26;

function GoalSlider({ value, min, max, step, onChange }: SliderProps) {
  const widthRef    = useRef(0);
  const startRef    = useRef(0);
  const valRef      = useRef(value);
  const cbRef       = useRef(onChange);
  const thumbX      = useRef(new Animated.Value(0)).current;

  // Keep mutable refs current on every render
  valRef.current = value;
  cbRef.current  = onChange;

  const toPos = (v: number): number => {
    const maxPos = Math.max(1, widthRef.current - THUMB_SIZE);
    return Math.max(0, ((v - min) / (max - min)) * maxPos);
  };

  const toVal = (p: number): number => {
    const maxPos = Math.max(1, widthRef.current - THUMB_SIZE);
    const pct    = Math.max(0, Math.min(1, p / maxPos));
    const raw    = min + pct * (max - min);
    const snap   = Math.round(raw / step) * step;
    return Math.max(min, Math.min(max, Math.round(snap * 10) / 10));
  };

  // Sync thumb when value changes from parent
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { thumbX.setValue(toPos(value)); }, [value]);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,
      onPanResponderGrant: () => {
        startRef.current = toPos(valRef.current);
      },
      onPanResponderMove: (_, gs) => {
        const maxPos = Math.max(1, widthRef.current - THUMB_SIZE);
        const p = Math.max(0, Math.min(maxPos, startRef.current + gs.dx));
        thumbX.setValue(p);
        const v = toVal(p);
        if (v !== valRef.current) {
          valRef.current = v;
          cbRef.current(v);
          if (Platform.OS !== 'web') {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }
        }
      },
      onPanResponderRelease: (_, gs) => {
        const maxPos = Math.max(1, widthRef.current - THUMB_SIZE);
        const p = Math.max(0, Math.min(maxPos, startRef.current + gs.dx));
        const v = toVal(p);
        thumbX.setValue(toPos(v)); // snap to grid
        valRef.current = v;
        cbRef.current(v);
        if (Platform.OS !== 'web') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }
      },
    }),
  ).current;

  const fillPct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));

  return (
    <View
      onLayout={(e: LayoutChangeEvent) => {
        widthRef.current = e.nativeEvent.layout.width;
        thumbX.setValue(toPos(valRef.current));
      }}
      style={sliderSt.container}
    >
      {/* Background track */}
      <View style={sliderSt.track} />
      {/* Filled portion */}
      <View style={[sliderSt.fill, { width: `${fillPct}%` }]} />
      {/* Draggable thumb */}
      <Animated.View
        style={[sliderSt.thumb, { transform: [{ translateX: thumbX }] }]}
        {...pan.panHandlers}
      />
    </View>
  );
}

const sliderSt = StyleSheet.create({
  container: {
    height: THUMB_SIZE + 8,
    justifyContent: 'center',
  },
  track: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#2D2D2D',
  },
  fill: {
    position: 'absolute',
    left: 0,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#FF6200',
  },
  thumb: {
    position: 'absolute',
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: '#FF6200',
    top: 4,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
  },
});

// ── Screen ─────────────────────────────────────────────────────────────────────
export default function BodyGoalsScreen() {
  const router    = useRouter();
  const { user }  = useAuthStore();

  const [loading,         setLoading]         = useState(true);
  const [saving,          setSaving]          = useState(false);
  const [currentWeight,   setCurrentWeight]   = useState('');
  const [currentBodyFat,  setCurrentBodyFat]  = useState('');
  const [targetWeight,    setTargetWeight]     = useState('');
  const [targetBodyFat,   setTargetBodyFat]    = useState('');
  const [weeklyRate,      setWeeklyRate]       = useState(-0.5);
  const [showToast,       setShowToast]        = useState(false);

  const toastOpacity = useRef(new Animated.Value(0)).current;

  // ── Load data on mount ─────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const [bwRaw, mRaw, gRaw] = await Promise.all([
          AsyncStorage.getItem(BODYWEIGHT_KEY),
          AsyncStorage.getItem(MEASUREMENTS_KEY),
          AsyncStorage.getItem(BODY_GOALS_KEY),
        ]);

        // Determine current bodyweight
        let bw: number | null = null;
        if (bwRaw) {
          const parsed = JSON.parse(bwRaw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const sorted = [...parsed].sort(
              (a: any, b: any) => (b.date ?? '').localeCompare(a.date ?? ''),
            );
            bw = sorted[0]?.weight ?? sorted[0]?.value ?? null;
          } else if (typeof parsed === 'number') {
            bw = parsed;
          }
        }
        // Fallback to measurements
        if (bw === null && mRaw) {
          const mArr: any[] = JSON.parse(mRaw);
          if (mArr.length > 0) {
            const sorted = [...mArr].sort((a, b) => b.date.localeCompare(a.date));
            bw =
              sorted[0]?.weight ??
              sorted[0]?.bodyweight ??
              sorted[0]?.body_weight ??
              null;
          }
        }
        if (bw !== null) setCurrentWeight(String(bw));

        // Load existing goal
        if (gRaw) {
          const g: BodyCompositionGoals = JSON.parse(gRaw);
          if (g.targetWeight)            setTargetWeight(String(g.targetWeight));
          if (g.targetBodyFatPercent)    setTargetBodyFat(String(g.targetBodyFatPercent));
          if (g.currentBodyFatPercent)   setCurrentBodyFat(String(g.currentBodyFatPercent));
          if (g.weeklyWeightChangeGoal !== undefined) setWeeklyRate(g.weeklyWeightChangeGoal);
        }
      } catch (e) {
        console.error('[BodyGoals] load error:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ── Projection ─────────────────────────────────────────────────────────────
  const projection = useMemo(() => {
    const cw = parseFloat(currentWeight);
    const tw = parseFloat(targetWeight);
    if (!cw || !tw || isNaN(cw) || isNaN(tw) || cw === tw) return null;
    if (weeklyRate === 0) return null;

    const delta = tw - cw;
    // Direction guard
    if ((weeklyRate > 0 && delta < 0) || (weeklyRate < 0 && delta > 0)) return null;

    const weeks        = Math.abs(delta / weeklyRate);
    const projDate     = addWeeks(new Date(), weeks);
    const projDateStr  = format(projDate, 'MMMM d, yyyy');
    const color        = getTimelineColor(weeks, weeklyRate);

    return {
      weeks:       Math.round(weeks * 10) / 10,
      projDateStr,
      color,
    };
  }, [currentWeight, targetWeight, weeklyRate]);

  // ── Toast ──────────────────────────────────────────────────────────────────
  const triggerToast = useCallback(() => {
    setShowToast(true);
    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.delay(1800),
      Animated.timing(toastOpacity, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start(() => setShowToast(false));
  }, [toastOpacity]);

  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    const cw  = parseFloat(currentWeight);
    const tw  = parseFloat(targetWeight);
    const tbf = parseFloat(targetBodyFat);
    const cbf = parseFloat(currentBodyFat);

    if (!tw || isNaN(tw)) return;

    if (weeklyRate !== 0) {
      const delta  = tw - (isNaN(cw) ? 0 : cw);
      const mismatch =
        (weeklyRate < 0 && delta > 0) || (weeklyRate > 0 && delta < 0);
      if (mismatch) return; // silently no-op — UI already shows mismatch
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSaving(true);

    try {
      const goal: BodyCompositionGoals = {
        targetWeight:          tw,
        targetBodyFatPercent:  !isNaN(tbf) && tbf > 0 ? tbf : 0,
        currentBodyFatPercent: !isNaN(cbf) && cbf > 0 ? cbf : undefined,
        weeklyWeightChangeGoal: weeklyRate,
        targetDate:            projection
          ? format(addWeeks(new Date(), projection.weeks), 'yyyy-MM-dd')
          : undefined,
        updatedAt: format(new Date(), 'yyyy-MM-dd'),
      };

      await AsyncStorage.setItem(BODY_GOALS_KEY, JSON.stringify(goal));

      // Firestore sync (best effort)
      if (user?.id) {
        saveGoalToFirestore(user.id, goal);
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      triggerToast();
    } catch (e) {
      console.error('[BodyGoals] save error:', e);
    } finally {
      setSaving(false);
    }
  };

  // ── UI ─────────────────────────────────────────────────────────────────────
  const phaseLabel = getPhaseLabel(weeklyRate);
  const phaseColor = getPhaseColor(phaseLabel);
  const weightUnit = (user as any)?.units?.weight ?? 'kg';

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF6200" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={28} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Body Composition Goal</Text>
          <Text style={styles.headerSubtitle}>Set your target & projected timeline</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Current weight (read-only) */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Current Weight</Text>
            <View style={styles.readOnlyRow}>
              <Ionicons name="scale-outline" size={20} color="#B0B0B0" />
              <Text style={styles.readOnlyValue}>
                {currentWeight ? `${currentWeight} ${weightUnit}` : 'Not logged'}
              </Text>
              <Text style={styles.readOnlyHint}>from latest measurement</Text>
            </View>
          </View>

          {/* Target Weight */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Target Weight ({weightUnit})</Text>
            <TextInput
              style={styles.input}
              value={targetWeight}
              onChangeText={setTargetWeight}
              keyboardType="decimal-pad"
              placeholder={`e.g. ${weightUnit === 'lbs' ? '165' : '75'}`}
              placeholderTextColor="#555"
              returnKeyType="done"
            />
          </View>

          {/* Body Fat Row */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Body Fat % (optional)</Text>
            <View style={styles.inputRow}>
              <View style={[styles.inputHalf, { marginRight: 8 }]}>
                <Text style={styles.inputLabel}>Current</Text>
                <TextInput
                  style={styles.input}
                  value={currentBodyFat}
                  onChangeText={setCurrentBodyFat}
                  keyboardType="decimal-pad"
                  placeholder="e.g. 20"
                  placeholderTextColor="#555"
                  returnKeyType="done"
                />
              </View>
              <View style={styles.inputHalf}>
                <Text style={styles.inputLabel}>Target</Text>
                <TextInput
                  style={styles.input}
                  value={targetBodyFat}
                  onChangeText={setTargetBodyFat}
                  keyboardType="decimal-pad"
                  placeholder="e.g. 15"
                  placeholderTextColor="#555"
                  returnKeyType="done"
                />
              </View>
            </View>
          </View>

          {/* Weekly Change Slider */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Weekly Change Goal</Text>
            <View style={styles.sliderLabelRow}>
              <Text style={styles.sliderRangeLabel}>−1.0 {weightUnit}/wk</Text>
              <Text style={styles.sliderRangeLabel}>+0.5 {weightUnit}/wk</Text>
            </View>
            <GoalSlider
              value={weeklyRate}
              min={SLIDER_MIN}
              max={SLIDER_MAX}
              step={SLIDER_STEP}
              onChange={setWeeklyRate}
            />
            <View style={styles.sliderValueRow}>
              <View style={[styles.phaseBadge, { backgroundColor: phaseColor + '20', borderColor: phaseColor }]}>
                <Text style={[styles.phaseText, { color: phaseColor }]}>{phaseLabel}</Text>
              </View>
              <Text style={styles.sliderValue}>
                {weeklyRate >= 0 ? '+' : ''}{weeklyRate.toFixed(1)} {weightUnit}/week
              </Text>
            </View>
          </View>

          {/* Projected Timeline */}
          {projection ? (
            <View style={[styles.card, styles.projectionCard]}>
              <Ionicons name="calendar-outline" size={20} color={projection.color} />
              <View style={styles.projectionText}>
                <Text style={[styles.projectionMain, { color: projection.color }]}>
                  Estimated to reach goal by {projection.projDateStr}
                </Text>
                <Text style={styles.projectionSub}>
                  (~{Math.round(projection.weeks)} week{Math.round(projection.weeks) !== 1 ? 's' : ''})
                </Text>
              </View>
            </View>
          ) : (weeklyRate === 0 || (!targetWeight)) ? (
            <View style={[styles.card, styles.projectionCard]}>
              <Ionicons name="information-circle-outline" size={20} color="#B0B0B0" />
              <Text style={styles.projectionHint}>
                {weeklyRate === 0
                  ? 'Set a weekly rate to see a projected timeline.'
                  : 'Enter a target weight to see a projected timeline.'}
              </Text>
            </View>
          ) : null}

          {/* Save Button */}
          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={saving || !targetWeight}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="checkmark-circle-outline" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.saveBtnText}>Save Goal</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Toast */}
      {showToast && (
        <Animated.View style={[styles.toast, { opacity: toastOpacity }]}>
          <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
          <Text style={styles.toastText}>Goal saved!</Text>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1A1A1A',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  backBtn: {
    padding: 4,
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
  },
  headerSubtitle: {
    color: '#B0B0B0',
    fontSize: 13,
    marginTop: 2,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
    gap: 12,
  },
  card: {
    backgroundColor: '#252525',
    borderRadius: 16,
    padding: 16,
  },
  cardTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 12,
  },
  readOnlyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  readOnlyValue: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  readOnlyHint: {
    color: '#555',
    fontSize: 12,
    marginLeft: 4,
  },
  input: {
    backgroundColor: '#1A1A1A',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#FFFFFF',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#2D2D2D',
  },
  inputRow: {
    flexDirection: 'row',
  },
  inputHalf: {
    flex: 1,
  },
  inputLabel: {
    color: '#B0B0B0',
    fontSize: 12,
    marginBottom: 6,
  },
  sliderLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sliderRangeLabel: {
    color: '#555',
    fontSize: 11,
  },
  sliderValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  phaseBadge: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  phaseText: {
    fontSize: 13,
    fontWeight: '700',
  },
  sliderValue: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  projectionCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  projectionText: {
    flex: 1,
  },
  projectionMain: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  projectionSub: {
    color: '#B0B0B0',
    fontSize: 12,
    marginTop: 2,
  },
  projectionHint: {
    color: '#B0B0B0',
    fontSize: 13,
    flex: 1,
  },
  saveBtn: {
    backgroundColor: '#FF6200',
    borderRadius: 14,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  saveBtnDisabled: {
    opacity: 0.5,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  toast: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#4CAF50',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  toastText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
