// app/programs/builder.tsx
// GainTrack — 4-step Program Builder wizard
// Step 1: Name + frequency  Step 2: Per-day exercises  Step 3: Progression rules  Step 4: Review + Save

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, {
  FadeInRight,
  FadeOutLeft,
  FadeInLeft,
  FadeOutRight,
  LinearTransition,
} from 'react-native-reanimated';
import DraggableFlatList, { RenderItemParams } from 'react-native-draggable-flatlist';
import { format } from 'date-fns';
import { usePrograms } from '../../src/hooks/usePrograms';
import { usePro } from '../../src/hooks/usePro';
import { useWeightUnit } from '../../src/hooks/useWeightUnit';
import { DayBlock } from '../../src/components/programs/DayBlock';
import { ProgressionBadge } from '../../src/components/programs/ProgressionBadge';
import { ExercisePicker } from '../../src/components/ExercisePicker';
import {
  WorkoutProgram,
  ProgramDay,
  ProgramExercise,
  ProgressionRule,
} from '../../src/types';
import { colors, typography, radii, spacing, shadows } from '../../src/constants/theme';
import { getPrograms } from '../../src/services/storage';
import { useLanguage } from '../../src/context/LanguageContext';

// ─── Constants ───────────────────────────────────────────────────────────────

const FREE_PROGRAM_LIMIT = 1;
const FREE_EXERCISE_LIMIT = 3; // [PRO]

const PROGRESSION_OPTIONS: Array<{
  label: string;
  rule: ProgressionRule;
  proOnly?: boolean;
}> = [
  { label: '+2.5 kg / session', rule: { type: 'weight', increment: 2.5, every: 'session' } },
  { label: '+5 kg / session', rule: { type: 'weight', increment: 5, every: 'session' }, proOnly: true }, // [PRO]
  { label: '+1 rep / session', rule: { type: 'reps', increment: 1, every: 'session' }, proOnly: true }, // [PRO]
  { label: '+2.5 kg / cycle', rule: { type: 'weight', increment: 2.5, every: 'cycle' }, proOnly: true }, // [PRO]
  { label: '+5 kg / cycle', rule: { type: 'weight', increment: 5, every: 'cycle' }, proOnly: true }, // [PRO]
  { label: 'Custom', rule: { type: 'custom', increment: 0, every: 'session' }, proOnly: true }, // [PRO]
];

const DEFAULT_PROGRESSION: ProgressionRule = PROGRESSION_OPTIONS[0].rule;

const DAY_LABELS = ['Push', 'Pull', 'Legs', 'Upper', 'Lower', 'Full Body', 'Cardio'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const makeDays = (count: number): ProgramDay[] =>
  Array.from({ length: count }, (_, i) => ({
    id: makeId(),
    label: `Day ${String.fromCharCode(65 + i)} — ${DAY_LABELS[i % DAY_LABELS.length]}`,
    exercises: [],
  }));

// ─── Component ───────────────────────────────────────────────────────────────

export default function ProgramBuilderScreen() {
  const router = useRouter();
  const { t } = useLanguage();
  const { id: editId } = useLocalSearchParams<{ id?: string }>();
  const { programs, saveOne } = usePrograms();
  const { isPro } = usePro();
  const weightUnit = useWeightUnit();

  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [daysPerWeek, setDaysPerWeek] = useState(3);
  const [days, setDays] = useState<ProgramDay[]>(makeDays(3));
  const [saving, setSaving] = useState(false);

  // Exercise picker state
  const [pickerVisible, setPickerVisible] = useState(false);
  const [activeDayId, setActiveDayId] = useState<string | null>(null);

  // Progression modal state
  const [progressionModal, setProgressionModal] = useState<{
    dayId: string;
    exerciseName: string;
    current: ProgressionRule;
  } | null>(null);
  const [customIncrement, setCustomIncrement] = useState('');
  const [customRuleType, setCustomRuleType] = useState<'weight' | 'reps'>('weight');
  const [customRulePeriod, setCustomRulePeriod] = useState<'session' | 'week' | 'cycle'>('session');

  // Set editor modal state
  const [setEditorModal, setSetEditorModal] = useState<{
    dayId: string;
    exerciseName: string;
  } | null>(null);
  const [editingSets, setEditingSets] = useState<Array<{ weight: string; reps: string }>>([]);

  // Load existing program for edit mode
  useEffect(() => {
    if (!editId) return;
    (async () => {
      const all = await getPrograms();
      const prog = all.find((p) => p.id === editId);
      if (prog) {
        setName(prog.name);
        setDaysPerWeek(prog.daysPerWeek);
        setDays(prog.days);
      }
    })();
  }, [editId]);

  // Sync day count when daysPerWeek changes
  const handleFrequencyChange = useCallback(
    (n: number) => {
      Haptics.selectionAsync();
      setDaysPerWeek(n);
      setDays((prev) => {
        if (n > prev.length) {
          const extra = Array.from({ length: n - prev.length }, (_, i) => ({
            id: makeId(),
            label: `Day ${String.fromCharCode(65 + prev.length + i)} — ${DAY_LABELS[(prev.length + i) % DAY_LABELS.length]}`,
            exercises: [],
          }));
          return [...prev, ...extra];
        }
        return prev.slice(0, n);
      });
    },
    [],
  );

  // Step navigation
  const goNext = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (step === 0 && !name.trim()) {
      Alert.alert(t('programBuilder.nameRequiredTitle'), t('programBuilder.nameRequiredMessage'));
      return;
    }
    setStep((s) => Math.min(3, s + 1));
  }, [step, name, t]);

  const goBack = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (step === 0) {
      router.back();
    } else {
      setStep((s) => Math.max(0, s - 1));
    }
  }, [step, router]);

  // ─── Exercise picker ──────────────────────────────────────────────────────

  const openPicker = useCallback((dayId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveDayId(dayId);
    setPickerVisible(true);
  }, []);

  const handlePickerAdd = useCallback(
    (exercise: any) => {
      if (!activeDayId) return;
      const defaultSets: Array<{ reps: number; weight: number }> = [
        { reps: 8, weight: 0 },
        { reps: 8, weight: 0 },
        { reps: 8, weight: 0 },
      ];
      let added = false;
      setDays((prev) =>
        prev.map((d) => {
          if (d.id !== activeDayId) return d;
          if (!isPro && d.exercises.length >= FREE_EXERCISE_LIMIT) return d; // [PRO]
          if (d.exercises.some((e) => e.exerciseName === exercise.name)) return d;
          added = true;
          const newEx: ProgramExercise = {
            exerciseName: exercise.name,
            sets: 3,
            reps: 8,
            weight: 0,
            progression: DEFAULT_PROGRESSION,
            setDetails: defaultSets,
          };
          return { ...d, exercises: [...d.exercises, newEx] };
        }),
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (added) {
        // Immediately open set editor for the newly added exercise
        setEditingSets(defaultSets.map(s => ({ weight: String(s.weight), reps: String(s.reps) })));
        setSetEditorModal({ dayId: activeDayId, exerciseName: exercise.name });
      }
    },
    [activeDayId, isPro],
  );

  const handleLabelChange = useCallback((dayId: string, label: string) => {
    setDays((prev) => prev.map((d) => d.id === dayId ? { ...d, label } : d));
  }, []);

  const handleEditExercise = useCallback((dayId: string, exerciseName: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const day = days.find((d) => d.id === dayId);
    if (!day) return;
    const ex = day.exercises.find((e) => e.exerciseName === exerciseName);
    if (!ex) return;
    const sets = ex.setDetails && ex.setDetails.length > 0
      ? ex.setDetails
      : Array.from({ length: ex.sets }, () => ({ weight: ex.weight, reps: ex.reps }));
    setEditingSets(sets.map((s) => ({ weight: String(s.weight), reps: String(s.reps) })));
    setSetEditorModal({ dayId, exerciseName });
  }, [days]);

  const handleSaveExerciseSets = useCallback(() => {
    if (!setEditorModal) return;
    const { dayId, exerciseName } = setEditorModal;
    const setDetails = editingSets.map((s) => ({
      weight: parseFloat(s.weight) || 0,
      reps: parseInt(s.reps) || 0,
    }));
    setDays((prev) =>
      prev.map((d) =>
        d.id === dayId
          ? {
              ...d,
              exercises: d.exercises.map((e) =>
                e.exerciseName === exerciseName
                  ? { ...e, sets: setDetails.length, setDetails }
                  : e,
              ),
            }
          : d,
      ),
    );
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSetEditorModal(null);
  }, [setEditorModal, editingSets]);

  const handleRemoveExercise = useCallback((dayId: string, exerciseName: string) => {
    setDays((prev) =>
      prev.map((d) =>
        d.id === dayId
          ? { ...d, exercises: d.exercises.filter((e) => e.exerciseName !== exerciseName) }
          : d,
      ),
    );
  }, []);

  const handleDeleteDay = useCallback((dayId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setDays((prev) => prev.filter((d) => d.id !== dayId));
    setDaysPerWeek((n) => Math.max(2, n - 1));
  }, []);

  // ─── Progression ─────────────────────────────────────────────────────────

  const applyProgression = useCallback(
    (rule: ProgressionRule) => {
      if (!progressionModal) return;
      const { dayId, exerciseName } = progressionModal;
      const finalRule =
        rule.type === 'custom' && customIncrement
          ? { ...rule, increment: parseFloat(customIncrement) || 2.5 }
          : rule;
      setDays((prev) =>
        prev.map((d) =>
          d.id === dayId
            ? {
                ...d,
                exercises: d.exercises.map((e) =>
                  e.exerciseName === exerciseName ? { ...e, progression: finalRule } : e,
                ),
              }
            : d,
        ),
      );
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setProgressionModal(null);
    },
    [progressionModal, customIncrement],
  );

  // ─── Save ─────────────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSaving(true);
    try {
      const program: WorkoutProgram = {
        id: editId || makeId(),
        name: name.trim(),
        daysPerWeek,
        days,
        currentCycle: 1,
        currentDayIndex: 0,
        createdAt: format(new Date(), 'yyyy-MM-dd'),
      };
      await saveOne(program);
      router.replace(`/programs/${program.id}` as any);
    } catch (err) {
      Alert.alert(t('common.error'), t('programBuilder.saveError'));
    } finally {
      setSaving(false);
    }
  }, [editId, name, daysPerWeek, days, saveOne, router, t]);

  // ─── Render helpers ───────────────────────────────────────────────────────

  const enterAnim = step > 0 ? FadeInRight.springify() : FadeInLeft.springify();
  const exitAnim = step > 0 ? FadeOutLeft.springify() : FadeOutRight.springify();

  const renderStep0 = () => (
    <Animated.View entering={FadeInRight.springify()} exiting={FadeOutLeft.springify()} style={styles.stepContent}>
      <Text style={styles.stepTitle}>{t('programBuilder.nameStepTitle')}</Text>
      <Text style={styles.stepSubtitle}>{t('programBuilder.nameStepSubtitle')}</Text>

      <TextInput
        style={styles.nameInput}
        placeholder={t('programBuilder.namePlaceholder')}
        placeholderTextColor={colors.textDisabled}
        value={name}
        onChangeText={setName}
        autoFocus
        maxLength={40}
      />

      <Text style={styles.sectionLabel}>{t('programBuilder.daysPerWeek')}</Text>
      <View style={styles.freqRow}>
        {[2, 3, 4, 5, 6].map((n) => (
          <TouchableOpacity
            key={n}
            style={[styles.freqChip, daysPerWeek === n && styles.freqChipActive]}
            onPress={() => handleFrequencyChange(n)}
          >
            <Text style={[styles.freqChipText, daysPerWeek === n && styles.freqChipTextActive]}>
              {n}×
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {!isPro && programs.filter((p) => !editId || p.id !== editId).length >= FREE_PROGRAM_LIMIT && (
        <View style={styles.upsellCard}>
          <Ionicons name="lock-closed" size={16} color={colors.accent} />
          <Text style={styles.upsellText}>
            {t('programBuilder.freeTierLimit')} {/* [PRO] */}
          </Text>
          <TouchableOpacity onPress={() => router.push('/pro-paywall' as any)}>
            <Text style={styles.upsellLink}>{t('programBuilder.upgrade')}</Text>
          </TouchableOpacity>
        </View>
      )}
    </Animated.View>
  );

  const renderStep1 = () => (
    <Animated.View entering={FadeInRight.springify()} exiting={FadeOutLeft.springify()} style={styles.stepContent}>
      <Text style={styles.stepTitle}>{t('programBuilder.daysStepTitle')}</Text>
      <Text style={styles.stepSubtitle}>{t('programBuilder.daysStepSubtitle')}</Text>

      <DraggableFlatList
        data={days}
        keyExtractor={(item) => item.id}
        onDragEnd={({ data }) => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setDays(data);
        }}
        renderItem={({ item, drag, isActive }: RenderItemParams<ProgramDay>) => (
          <DayBlock
            day={item}
            index={days.indexOf(item)}
            isPro={isPro}
            onAddExercise={openPicker}
            onRemoveExercise={handleRemoveExercise}
            onDelete={handleDeleteDay}
            onLabelChange={handleLabelChange}
            onEditExercise={handleEditExercise}
            drag={drag}
            isActive={isActive}
          />
        )}
        scrollEnabled={false}
        activationDistance={10}
      />
    </Animated.View>
  );

  const renderStep2 = () => (
    <Animated.View entering={FadeInRight.springify()} exiting={FadeOutLeft.springify()} style={styles.stepContent}>
      <Text style={styles.stepTitle}>{t('programBuilder.progressionStepTitle')}</Text>
      <Text style={styles.stepSubtitle}>
        {t('programBuilder.progressionStepSubtitle')}
      </Text>

      {days.map((day) =>
        day.exercises.length > 0 ? (
          <View key={day.id} style={styles.progDaySection}>
            <Text style={styles.progDayLabel}>{day.label}</Text>
            {day.exercises.map((ex) => {
              const optionLabel =
                PROGRESSION_OPTIONS.find(
                  (o) =>
                    o.rule.type === ex.progression.type &&
                    o.rule.increment === ex.progression.increment &&
                    o.rule.every === ex.progression.every,
                )?.label ?? 'Custom';
              return (
                <TouchableOpacity
                  key={ex.exerciseName}
                  style={styles.progExRow}
                  onPress={() => {
                    if (!isPro && ex.progression.type !== 'weight') {
                      router.push('/pro-paywall' as any);
                      return;
                    }
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setCustomIncrement(String(ex.progression.increment));
                    setCustomRuleType(ex.progression.type === 'reps' ? 'reps' : 'weight');
                    setCustomRulePeriod(ex.progression.every ?? 'session');
                    setProgressionModal({
                      dayId: day.id,
                      exerciseName: ex.exerciseName,
                      current: ex.progression,
                    });
                  }}
                >
                  <View style={styles.progExInfo}>
                    <Text style={styles.progExName}>{ex.exerciseName}</Text>
                    <ProgressionBadge rule={ex.progression} cycle={1} compact />
                  </View>
                  <View style={styles.progPill}>
                    <Text style={styles.progPillText}>{optionLabel}</Text>
                    <Ionicons name="chevron-down" size={14} color={colors.textSecondary} />
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null,
      )}

      {days.every((d) => d.exercises.length === 0) && (
        <Text style={styles.noExercisesHint}>
          {t('programBuilder.addExercisesFirst')}
        </Text>
      )}
    </Animated.View>
  );

  const renderStep3 = () => (
    <Animated.View entering={FadeInRight.springify()} exiting={FadeOutLeft.springify()} style={styles.stepContent}>
      <Text style={styles.stepTitle}>{t('programBuilder.reviewStepTitle')}</Text>
      <Text style={styles.stepSubtitle}>{t('programBuilder.reviewStepSubtitle')}</Text>

      <View style={styles.reviewCard}>
        <Text style={styles.reviewName}>{name || t('programBuilder.emptyName')}</Text>
        <Text style={styles.reviewMeta}>{t('programBuilder.reviewMeta', { daysPerWeek, exercises: days.reduce((acc, d) => acc + d.exercises.length, 0) })}</Text>
      </View>

      {days.map((day, i) => (
        <View key={day.id} style={styles.reviewDayRow}>
          <Text style={styles.reviewDayLabel}>
            {t('programBuilder.reviewDayLabel', { count: i + 1, label: day.label })}
          </Text>
          {day.exercises.length === 0 ? (
            <Text style={styles.reviewExEmpty}>{t('programBuilder.noExercises')}</Text>
          ) : (
            day.exercises.map((ex) => {
              const meta = ex.setDetails && ex.setDetails.length > 0
                ? ex.setDetails.map(s => `${s.weight}kg×${s.reps}`).join(' / ')
                : `${ex.sets}×${ex.reps} @ ${ex.weight} kg`;
              return (
                <View key={ex.exerciseName} style={styles.reviewExRow}>
                  <Text style={styles.reviewExName}>{ex.exerciseName}</Text>
                  <Text style={styles.reviewExMeta}>
                    {meta} ·{' '}
                    {PROGRESSION_OPTIONS.find(
                      (o) =>
                        o.rule.type === ex.progression.type &&
                        o.rule.increment === ex.progression.increment,
                    )?.label ?? 'Custom'}
                  </Text>
                </View>
              );
            })
          )}
        </View>
      ))}
    </Animated.View>
  );

  const steps = [renderStep0, renderStep1, renderStep2, renderStep3];

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={goBack} hitSlop={8}>
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {editId ? t('programBuilder.editProgram') : t('programBuilder.newProgram')}
          </Text>
          {/* Step dots */}
          <View style={styles.stepDots}>
            {[0, 1, 2, 3].map((i) => (
              <View
                key={i}
                style={[styles.dot, step === i && styles.dotActive, step > i && styles.dotDone]}
              />
            ))}
          </View>
        </View>

        {/* Step content */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {steps[step]?.()}
        </ScrollView>

        {/* Footer buttons */}
        <View style={styles.footer}>
          {step > 0 && (
            <TouchableOpacity style={styles.backBtn} onPress={goBack}>
              <Text style={styles.backBtnText}>{t('programBuilder.back')}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.nextBtn, saving && styles.nextBtnDisabled]}
            onPress={step === 3 ? handleSave : goNext}
            disabled={saving}
          >
            <Text style={styles.nextBtnText}>
              {step === 3 ? (saving ? t('common.saving') : t('programBuilder.saveProgram')) : t('programBuilder.next')}
            </Text>
            {step < 3 && <Ionicons name="arrow-forward" size={16} color={colors.textPrimary} />}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Exercise Picker Modal */}
      <Modal visible={pickerVisible} animationType="slide" presentationStyle="pageSheet">
        <ExercisePicker
          onAdd={(exercise) => {
            handlePickerAdd(exercise);
            setPickerVisible(false);
          }}
          onClose={() => setPickerVisible(false)}
          isPro={isPro}
        />
      </Modal>

      {/* Set Editor Modal */}
      <Modal
        visible={!!setEditorModal}
        transparent
        animationType="slide"
        onRequestClose={() => setSetEditorModal(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setSetEditorModal(null)}
        >
          <TouchableOpacity style={styles.setEditorSheet} activeOpacity={1}>
            <View style={styles.setEditorHandle} />
            <View style={styles.setEditorHeader}>
              <Text style={styles.progressionTitle}>{setEditorModal?.exerciseName}</Text>
              <TouchableOpacity onPress={() => setSetEditorModal(null)} hitSlop={8}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.setEditorColRow}>
              <Text style={[styles.setEditorColLabel, { flex: 0.5 }]}>{t('programBuilder.set')}</Text>
              <Text style={[styles.setEditorColLabel, { flex: 1 }]}>{t('programBuilder.weightKg')}</Text>
              <Text style={[styles.setEditorColLabel, { flex: 1 }]}>{t('programBuilder.reps')}</Text>
              <View style={{ width: 28 }} />
            </View>

            <ScrollView style={{ maxHeight: 260 }} keyboardShouldPersistTaps="handled">
              {editingSets.map((set, i) => (
                <View key={i} style={styles.setEditorRow}>
                  <Text style={[styles.setEditorIndex, { flex: 0.5 }]}>{i + 1}</Text>
                  <TextInput
                    style={[styles.setEditorInput, { flex: 1 }]}
                    value={set.weight}
                    onChangeText={(v) => {
                      const updated = [...editingSets];
                      updated[i] = { ...updated[i], weight: v };
                      setEditingSets(updated);
                    }}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={colors.textDisabled}
                  />
                  <TextInput
                    style={[styles.setEditorInput, { flex: 1 }]}
                    value={set.reps}
                    onChangeText={(v) => {
                      const updated = [...editingSets];
                      updated[i] = { ...updated[i], reps: v };
                      setEditingSets(updated);
                    }}
                    keyboardType="number-pad"
                    placeholder="0"
                    placeholderTextColor={colors.textDisabled}
                  />
                  <TouchableOpacity
                    onPress={() => {
                      if (editingSets.length > 1)
                        setEditingSets(editingSets.filter((_, idx) => idx !== i));
                    }}
                    hitSlop={8}
                    style={{ width: 28, alignItems: 'center' }}
                  >
                    <Ionicons name="trash-outline" size={16} color={colors.error} />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>

            <TouchableOpacity
              style={styles.addSetEditorBtn}
              onPress={() => {
                const last = editingSets[editingSets.length - 1];
                setEditingSets([...editingSets, { weight: last?.weight ?? '0', reps: last?.reps ?? '0' }]);
              }}
            >
              <Ionicons name="add" size={18} color={colors.success} />
              <Text style={styles.addSetEditorText}>{t('programBuilder.addSet')}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.setEditorDoneBtn} onPress={handleSaveExerciseSets}>
              <Text style={styles.setEditorDoneText}>{t('programBuilder.done')}</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Progression Rule Modal */}
      <Modal
        visible={!!progressionModal}
        transparent
        animationType="fade"
        onRequestClose={() => setProgressionModal(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setProgressionModal(null)}
        >
          <TouchableOpacity style={styles.progressionSheet} activeOpacity={1}>
            <Text style={styles.progressionTitle}>
              {progressionModal?.exerciseName}
            </Text>
            <Text style={styles.progressionSubtitle}>{t('programBuilder.chooseProgression')}</Text>

            {PROGRESSION_OPTIONS.map((opt) => {
              const locked = opt.proOnly && !isPro; // [PRO]
              const isSelected =
                progressionModal?.current.type === opt.rule.type &&
                progressionModal?.current.increment === opt.rule.increment &&
                progressionModal?.current.every === opt.rule.every;
              return (
                <TouchableOpacity
                  key={opt.label}
                  style={[
                    styles.progressionOption,
                    isSelected && styles.progressionOptionSelected,
                    locked && styles.progressionOptionLocked,
                  ]}
                  onPress={() => {
                    if (locked) {
                      router.push('/pro-paywall' as any);
                      return;
                    }
                    if (opt.rule.type === 'custom') {
                      // switch to custom editor mode
                      setProgressionModal((prev) =>
                        prev
                          ? {
                              ...prev,
                              current: { type: 'custom', increment: parseFloat(customIncrement) || 2.5, every: customRulePeriod },
                            }
                          : prev,
                      );
                      return;
                    }
                    applyProgression(opt.rule);
                  }}
                >
                  <Text
                    style={[
                      styles.progressionOptionText,
                      isSelected && styles.progressionOptionTextSelected,
                      locked && styles.progressionOptionTextLocked,
                    ]}
                  >
                    {opt.label}
                  </Text>
                  {locked && (
                    <View style={styles.lockBadge}>
                      <Ionicons name="lock-closed" size={12} color={colors.accent} />
                      <Text style={styles.lockText}>{t('programBuilder.pro')}</Text>
                    </View>
                  )}
                  {isSelected && !locked && (
                    <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
                  )}
                </TouchableOpacity>
              );
            })}

            {/* Custom rule editor (Pro only) */}
            {progressionModal?.current.type === 'custom' && isPro && (
              <View style={styles.customEditor}>
                {/* Type selector */}
                <Text style={styles.customSectionLabel}>{t('programBuilder.whatToIncrease')}</Text>
                <View style={styles.toggleRow}>
                  {(['weight', 'reps'] as const).map((ruleType) => (
                    <TouchableOpacity
                      key={ruleType}
                      style={[styles.toggleChip, customRuleType === ruleType && styles.toggleChipActive]}
                      onPress={() => setCustomRuleType(ruleType)}
                    >
                      <Text style={[styles.toggleChipText, customRuleType === ruleType && styles.toggleChipTextActive]}>
                        {ruleType === 'weight' ? t('programBuilder.weight') : t('programBuilder.reps')}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Increment */}
                <Text style={styles.customSectionLabel}>{t('programBuilder.amountPer', { period: t(`programBuilder.periods.${customRulePeriod}`) })}</Text>
                <View style={styles.customIncrementRow}>
                  <TextInput
                    style={styles.customInput}
                    value={customIncrement}
                    onChangeText={setCustomIncrement}
                    keyboardType="decimal-pad"
                    placeholder={customRuleType === 'weight' ? '2.5' : '1'}
                    placeholderTextColor={colors.textDisabled}
                  />
                  <Text style={styles.customUnit}>
                    {customRuleType === 'weight' ? weightUnit : 'rep'}
                  </Text>
                </View>

                {/* Period selector */}
                <Text style={styles.customSectionLabel}>{t('programBuilder.every')}</Text>
                <View style={styles.toggleRow}>
                  {(['session', 'week', 'cycle'] as const).map((p) => (
                    <TouchableOpacity
                      key={p}
                      style={[styles.toggleChip, customRulePeriod === p && styles.toggleChipActive]}
                      onPress={() => setCustomRulePeriod(p)}
                    >
                      <Text style={[styles.toggleChipText, customRulePeriod === p && styles.toggleChipTextActive]}>
                        {t(`programBuilder.periods.${p}`)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TouchableOpacity
                  style={styles.customApplyBtn}
                  onPress={() =>
                    applyProgression({
                      type: customRuleType,
                      increment: parseFloat(customIncrement) || (customRuleType === 'weight' ? 2.5 : 1),
                      every: customRulePeriod,
                    })
                  }
                >
                  <Text style={styles.customApplyText}>{t('programBuilder.applyCustomRule')}</Text>
                </TouchableOpacity>
              </View>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    gap: spacing[3],
  },
  headerTitle: {
    flex: 1,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
  },
  stepDots: { flexDirection: 'row', gap: 6 },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radii.full,
    backgroundColor: colors.charcoal,
  },
  dotActive: { backgroundColor: colors.primary, width: 20 },
  dotDone: { backgroundColor: colors.primaryDark },
  scrollContent: { paddingHorizontal: spacing[4], paddingBottom: spacing[8] },
  stepContent: { gap: spacing[4] },
  stepTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
    marginTop: spacing[2],
  },
  stepSubtitle: {
    fontSize: typography.fontSize.base,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  nameInput: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing[4],
    fontSize: typography.fontSize.lg,
    color: colors.textPrimary,
    borderWidth: 2,
    borderColor: colors.border,
  },
  sectionLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: spacing[2],
  },
  freqRow: { flexDirection: 'row', gap: spacing[2] },
  freqChip: {
    flex: 1,
    paddingVertical: spacing[3],
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  freqChipActive: {
    backgroundColor: colors.primaryMuted,
    borderColor: colors.primary,
  },
  freqChipText: {
    fontSize: typography.fontSize.md,
    color: colors.textSecondary,
    fontWeight: typography.fontWeight.semibold,
  },
  freqChipTextActive: { color: colors.primary },
  upsellCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    backgroundColor: 'rgba(255,212,179,0.08)',
    borderRadius: radii.lg,
    padding: spacing[3],
    borderWidth: 1,
    borderColor: `${colors.accent}40`,
    flexWrap: 'wrap',
  },
  upsellText: { flex: 1, fontSize: typography.fontSize.sm, color: colors.textSecondary },
  upsellLink: {
    fontSize: typography.fontSize.sm,
    color: colors.primary,
    fontWeight: typography.fontWeight.semibold,
  },
  progDaySection: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing[3],
    gap: spacing[2],
  },
  progDayLabel: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textPrimary,
    marginBottom: spacing[1],
  },
  progExRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing[2],
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  progExInfo: { flex: 1, gap: 2 },
  progExName: {
    fontSize: typography.fontSize.sm,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.medium,
  },
  progPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.charcoal,
    borderRadius: radii.full,
    paddingHorizontal: spacing[2],
    paddingVertical: 4,
  },
  progPillText: { fontSize: typography.fontSize.xs, color: colors.textSecondary },
  noExercisesHint: {
    textAlign: 'center',
    color: colors.textSecondary,
    fontSize: typography.fontSize.base,
    marginTop: spacing[8],
  },
  reviewCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing[4],
    marginBottom: spacing[2],
  },
  reviewName: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
  },
  reviewMeta: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    marginTop: 4,
  },
  reviewDayRow: {
    backgroundColor: colors.charcoal,
    borderRadius: radii.lg,
    padding: spacing[3],
    marginBottom: spacing[2],
  },
  reviewDayLabel: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textPrimary,
    marginBottom: spacing[2],
  },
  reviewExEmpty: {
    fontSize: typography.fontSize.sm,
    color: colors.textDisabled,
    fontStyle: 'italic',
  },
  reviewExRow: { marginBottom: spacing[1] },
  reviewExName: {
    fontSize: typography.fontSize.sm,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.medium,
  },
  reviewExMeta: { fontSize: typography.fontSize.xs, color: colors.textSecondary },
  footer: {
    flexDirection: 'row',
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  backBtn: {
    flex: 1,
    paddingVertical: spacing[3],
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnText: {
    fontSize: typography.fontSize.base,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.semibold,
  },
  nextBtn: {
    flex: 2,
    paddingVertical: spacing[3],
    borderRadius: radii.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    ...shadows.sm,
  },
  nextBtnDisabled: { opacity: 0.6 },
  nextBtnText: {
    fontSize: typography.fontSize.base,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.bold,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  setEditorSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii['2xl'],
    borderTopRightRadius: radii['2xl'],
    padding: spacing[5],
    gap: spacing[3],
  },
  setEditorHandle: {
    width: 40,
    height: 4,
    borderRadius: radii.full,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing[1],
  },
  setEditorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  setEditorColRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 2,
    marginBottom: 4,
  },
  setEditorColLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    textAlign: 'center',
  },
  setEditorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    marginBottom: 8,
  },
  setEditorIndex: {
    fontSize: typography.fontSize.base,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  setEditorInput: {
    backgroundColor: colors.charcoal,
    borderRadius: radii.md,
    paddingHorizontal: spacing[2],
    paddingVertical: 8,
    color: colors.textPrimary,
    fontSize: typography.fontSize.base,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  addSetEditorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingVertical: 6,
  },
  addSetEditorText: {
    fontSize: typography.fontSize.sm,
    color: colors.success,
    fontWeight: typography.fontWeight.semibold,
  },
  setEditorDoneBtn: {
    backgroundColor: colors.primary,
    borderRadius: radii.lg,
    paddingVertical: spacing[3],
    alignItems: 'center',
    marginTop: spacing[2],
  },
  setEditorDoneText: {
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.bold,
    fontSize: typography.fontSize.base,
  },
  progressionSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii['2xl'],
    borderTopRightRadius: radii['2xl'],
    padding: spacing[6],
    gap: spacing[2],
  },
  progressionTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
  },
  progressionSubtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing[2],
  },
  progressionOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[3],
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  progressionOptionSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryMuted,
  },
  progressionOptionLocked: { opacity: 0.5 },
  progressionOptionText: {
    fontSize: typography.fontSize.base,
    color: colors.textPrimary,
  },
  progressionOptionTextSelected: { color: colors.primary, fontWeight: typography.fontWeight.semibold },
  progressionOptionTextLocked: { color: colors.textDisabled },
  lockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(255,212,179,0.12)',
    borderRadius: radii.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  lockText: { fontSize: typography.fontSize.xs, color: colors.accent },
  customEditor: {
    marginTop: spacing[3],
    gap: spacing[2],
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing[3],
  },
  customSectionLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  toggleChip: {
    flex: 1,
    paddingVertical: spacing[2],
    borderRadius: radii.md,
    backgroundColor: colors.charcoal,
    alignItems: 'center',
  },
  toggleChipActive: {
    backgroundColor: colors.primary,
  },
  toggleChipText: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    fontWeight: typography.fontWeight.semibold,
  },
  toggleChipTextActive: {
    color: colors.textPrimary,
  },
  customIncrementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  customInput: {
    backgroundColor: colors.charcoal,
    borderRadius: radii.md,
    padding: spacing[2],
    color: colors.textPrimary,
    width: 80,
    textAlign: 'center',
    fontSize: typography.fontSize.base,
  },
  customUnit: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
  },
  customApplyBtn: {
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    alignItems: 'center',
    marginTop: spacing[2],
  },
  customApplyText: {
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.semibold,
    fontSize: typography.fontSize.sm,
  },
});
