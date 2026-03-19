// src/components/ExercisePicker.tsx
// GainTrack — Hevy-style exercise picker
// Features: recently used, muscle-group chips, video preview, superset toggle [PRO], haptics

import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  SectionList,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Platform,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';

import { Exercise } from '../types';
import { theme } from '../constants/theme';
import { EXERCISES, MUSCLE_GROUPS, EQUIPMENT_TYPES } from '../constants/exercises';
import {
  getRecentlyUsedExercises,
  recordRecentlyUsedExercise,
  getFavoriteIds,
  toggleFavoriteExercise,
} from '../services/storage';
import { sendPaywallTelemetry } from '../services/notifications';
import { Input } from './ui/Input';
import { Badge } from './ui/Badge';
import { Card } from './ui/Card';
import { useLanguage } from '../context/LanguageContext';
import {
  localizeEquipmentLabel,
  localizeExerciseName,
  localizeMuscleGroup,
} from '../i18n/exerciseTranslations';

// Free tier: top 50 exercises by library index (IDs 1–50) [PRO]
const FREE_EXERCISE_LIMIT = 50;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExercisePickerProps {
  /** Called when user taps the add ("+") button on an exercise row */
  onAdd: (exercise: Exercise, addAsSuperset?: boolean) => void;
  /** Called when user taps the "✕ Close" button */
  onClose: () => void;
  /** Whether the signed-in user has a Pro subscription — gates superset & video */
  isPro: boolean;
  /** IDs already in the current workout (shows a checkmark) */
  addedExerciseIds?: string[];
  /** Standalone browse mode — hides close button, shows "Exercises" title, hides superset toggle */
  standalone?: boolean;
  /** Optional callback shown as a "From Template" button in standalone mode */
  onTemplatePress?: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const { width: SCREEN_W } = Dimensions.get('window');
const PREVIEW_HEIGHT = 200;

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Horizontal equipment filter chips */
const EquipmentChips: React.FC<{
  active: string;
  onChange: (eq: string) => void;
  locale: 'en' | 'el' | 'de' | 'fr' | 'it';
}> = ({ active, onChange, locale }) => (
  <ScrollView
    horizontal
    showsHorizontalScrollIndicator={false}
    style={chipStyles.scrollView}
    contentContainerStyle={chipStyles.row}
  >
    {EQUIPMENT_TYPES.map((eq) => {
      const isActive = active === eq;
      return (
        <TouchableOpacity
          key={eq}
          style={[chipStyles.chip, isActive && chipStyles.chipActive]}
          onPress={async () => {
            await Haptics.selectionAsync();
            onChange(eq);
          }}
          activeOpacity={0.75}
        >
          <Text style={[chipStyles.label, isActive && chipStyles.labelActive]}>
            {localizeEquipmentLabel(eq, locale)}
          </Text>
        </TouchableOpacity>
      );
    })}
  </ScrollView>
);

/** Horizontal muscle-group filter chips */
const MuscleChips: React.FC<{
  active: string;
  onChange: (group: string) => void;
  locale: 'en' | 'el' | 'de' | 'fr' | 'it';
}> = ({ active, onChange, locale }) => (
  <ScrollView
    horizontal
    showsHorizontalScrollIndicator={false}
    style={chipStyles.scrollView}
    contentContainerStyle={chipStyles.row}
  >
    {MUSCLE_GROUPS.map((group) => {
      const isActive = active === group;
      return (
        <TouchableOpacity
          key={group}
          style={[chipStyles.chip, isActive && chipStyles.chipActive]}
          onPress={async () => {
            await Haptics.selectionAsync();
            onChange(group);
          }}
          activeOpacity={0.75}
        >
          <Text style={[chipStyles.label, isActive && chipStyles.labelActive]}>
            {localizeMuscleGroup(group, locale)}
          </Text>
        </TouchableOpacity>
      );
    })}
  </ScrollView>
);

const chipStyles = StyleSheet.create({
  scrollView: {
    minHeight: 48,
    overflow: 'visible',
  },
  row: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    gap: 8,
    alignItems: 'center',
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    minHeight: 36,
    borderRadius: 20,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: theme.primary,
    borderColor: theme.primary,
  },
  label: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: theme.textSecondary,
    includeFontPadding: false,
  },
  labelActive: { color: theme.textPrimary },
});

/** Inline video/GIF preview panel (collapses/expands) */
const VideoPreview: React.FC<{ exercise: Exercise; isPro: boolean }> = ({
  exercise,
  isPro,
}) => {
  if (!isPro) {
    return (
      <View style={previewStyles.locked}>
        <Ionicons name="lock-closed-outline" size={20} color={theme.primary} />
        <Text style={previewStyles.lockedText}>
          Upgrade to Pro to unlock video previews
        </Text>
      </View>
    );
  }

  if (!exercise.videoUrl) {
    return (
      <View style={previewStyles.locked}>
        <Text style={previewStyles.lockedText}>No video available</Text>
      </View>
    );
  }

  // Web: show link
  if (Platform.OS === 'web') {
    return (
      <TouchableOpacity
        style={previewStyles.webLink}
        onPress={() => Linking.openURL(exercise.videoUrl)}
      >
        <Ionicons name="play-circle-outline" size={18} color={theme.primary} />
        <Text style={previewStyles.webLinkText}>Open exercise video</Text>
      </TouchableOpacity>
    );
  }

  // Native: WebView for YouTube / generic URL
  return (
    <View style={previewStyles.webviewContainer}>
      <WebView
        source={{ uri: exercise.videoUrl }}
        style={{ flex: 1 }}
        allowsFullscreenVideo
        javaScriptEnabled
      />
    </View>
  );
};

const previewStyles = StyleSheet.create({
  locked: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: theme.charcoal,
    borderRadius: 8,
    margin: 12,
  },
  lockedText: { color: theme.textSecondary, fontSize: 13 },
  webviewContainer: {
    height: PREVIEW_HEIGHT,
    borderRadius: 10,
    overflow: 'hidden',
    marginHorizontal: 12,
    marginBottom: 8,
    backgroundColor: '#000',
  },
  webLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: theme.charcoal,
    borderRadius: 8,
    margin: 12,
  },
  webLinkText: { color: theme.primary, fontSize: 13, fontWeight: '600' },
});

/** Single exercise row */
const ExerciseRow: React.FC<{
  exercise: Exercise;
  isAdded: boolean;
  isFavorite: boolean;
  supersetMode: boolean;
  isPro: boolean;
  expandedId: string | null;
  locale: 'en' | 'el' | 'de' | 'fr' | 'it';
  t: (key: string, params?: Record<string, string | number>) => string;
  onExpand: (id: string | null) => void;
  onFavorite: (id: string) => void;
  onAdd: (exercise: Exercise, superset: boolean) => void;
}> = ({
  exercise,
  isAdded,
  isFavorite,
  supersetMode,
  isPro,
  expandedId,
  locale,
  t,
  onExpand,
  onFavorite,
  onAdd,
}) => {
  const isExpanded = expandedId === exercise.id;
  const localizedName = localizeExerciseName(exercise.name, locale);
  const localizedMuscleGroup = localizeMuscleGroup(exercise.muscleGroup, locale);

  const handleAdd = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onAdd(exercise, supersetMode);
  };

  const handleFavorite = async () => {
    await Haptics.selectionAsync();
    onFavorite(exercise.id);
  };

  const handleExpand = async () => {
    await Haptics.selectionAsync();
    onExpand(isExpanded ? null : exercise.id);
  };

  return (
    <View style={rowStyles.wrapper}>
      <TouchableOpacity
        style={rowStyles.row}
        onPress={handleExpand}
        activeOpacity={0.8}
      >
        {/* Left: muscle group color dot */}
        <View style={rowStyles.dot} />

        {/* Middle: name + meta */}
        <View style={rowStyles.info}>
          <Text style={rowStyles.name} numberOfLines={1}>
            {localizedName}
          </Text>
          <View style={rowStyles.meta}>
            <Text style={rowStyles.metaText}>{localizedMuscleGroup}</Text>
            {exercise.equipment_required.length > 0 && (
              <>
                <Text style={rowStyles.metaDot}>·</Text>
                <Text style={rowStyles.metaText} numberOfLines={1}>
                  {localizeEquipmentLabel(exercise.equipment_required[0], locale)}
                </Text>
              </>
            )}
            {exercise.is_compound && (
              <>
                <Text style={rowStyles.metaDot}>·</Text>
                <Text style={[rowStyles.metaText, { color: theme.accent }]}>
                  {t('exercisePicker.compound')}
                </Text>
              </>
            )}
          </View>
        </View>

        {/* Right: actions */}
        <View style={rowStyles.actions}>
          <TouchableOpacity onPress={handleFavorite} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons
              name={isFavorite ? 'heart' : 'heart-outline'}
              size={20}
              color={isFavorite ? theme.error : theme.textSecondary}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={[rowStyles.addBtn, isAdded && rowStyles.addBtnAdded]}
            onPress={handleAdd}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name={isAdded ? 'checkmark' : supersetMode ? 'git-merge-outline' : 'add'}
              size={20}
              color={isAdded ? theme.success : theme.textPrimary}
            />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>

      {/* Expandable preview */}
      {isExpanded && (
        <View>
          {exercise.instructions ? (
            <View style={rowStyles.instructions}>
              <Text style={rowStyles.instructionText}>{exercise.instructions}</Text>
            </View>
          ) : null}
          <VideoPreview exercise={exercise} isPro={isPro} />
        </View>
      )}
    </View>
  );
};

const rowStyles = StyleSheet.create({
  wrapper: {
    marginHorizontal: 16,
    marginVertical: 4,
    backgroundColor: theme.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 10,
  },
  dot: {
    width: 4,
    height: 36,
    borderRadius: 2,
    backgroundColor: theme.primary,
  },
  info: { flex: 1 },
  name: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  meta: { flexDirection: 'row', alignItems: 'center', marginTop: 2, gap: 4 },
  metaText: { fontSize: 12, color: theme.textSecondary },
  metaDot: { fontSize: 12, color: theme.textSecondary },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  addBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: theme.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addBtnAdded: { backgroundColor: 'rgba(76,175,80,0.2)' },
  instructions: {
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  instructionText: {
    fontSize: 13,
    color: theme.textSecondary,
    lineHeight: 19,
  },
});

// ─── Main Component ────────────────────────────────────────────────────────────

export const ExercisePicker: React.FC<ExercisePickerProps> = ({
  onAdd,
  onClose,
  isPro,
  addedExerciseIds = [],
  standalone = false,
  onTemplatePress,
}) => {
  const [query, setQuery]               = useState('');
  const [activeMuscle, setActiveMuscle] = useState<string>('All');
  const [activeEquipment, setActiveEquipment] = useState<string>('All');
  const [supersetMode, setSupersetMode] = useState(false);
  const [expandedId, setExpandedId]     = useState<string | null>(null);
  const [favoriteIds, setFavoriteIds]   = useState<string[]>([]);
  const [recentlyUsed, setRecentlyUsed] = useState<Exercise[]>([]);
  const [loading, setLoading]           = useState(true);
  const router = useRouter();
  const { t, locale } = useLanguage();

  // ── Load persisted state ─────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const [favs, recent] = await Promise.all([
        getFavoriteIds(),
        getRecentlyUsedExercises(),
      ]);
      setFavoriteIds(favs);
      setRecentlyUsed(recent);
      setLoading(false);
    })();
  }, []);

  // ── Filter / search logic ────────────────────────────────────────────────
  const filteredExercises = useMemo(() => {
    let list = isPro
      ? EXERCISES
      : EXERCISES.filter((ex) => parseInt(ex.id, 10) <= FREE_EXERCISE_LIMIT); // [PRO]
    if (activeMuscle !== 'All') {
      list = list.filter(
        (ex) =>
          ex.muscleGroup === activeMuscle ||
          ex.muscle_groups.some(
            (mg) => mg.toLowerCase() === activeMuscle.toLowerCase(),
          ),
      );
    }
    if (activeEquipment !== 'All') {
      const filterL = activeEquipment.toLowerCase();
      list = list.filter((ex) =>
        ex.equipment_required.some((eq) => {
          const eqL = eq.toLowerCase();
          // startsWith handles 'dumbbell' → 'dumbbells' and 'cable' → 'cable machine'
          // while exact checks keep 'machine' from matching 'cable machine'
          return eqL === filterL || eqL.startsWith(filterL);
        }),
      );
    }
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(
        (ex) =>
          ex.name.toLowerCase().includes(q) ||
          localizeExerciseName(ex.name, locale).toLowerCase().includes(q) ||
          ex.muscleGroup.toLowerCase().includes(q) ||
          localizeMuscleGroup(ex.muscleGroup, locale).toLowerCase().includes(q) ||
          ex.equipment_required.some((eq) => eq.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [activeMuscle, activeEquipment, query, isPro, locale]);

  // ── SectionList data: Favorites → Recently Used → All ───────────────────
  const sections = useMemo(() => {
    const isFiltered = query.trim() || activeMuscle !== 'All' || activeEquipment !== 'All';

    if (!isFiltered) {
      const favoriteExercises = EXERCISES.filter((ex) => favoriteIds.includes(ex.id));
      const recentFiltered    = recentlyUsed.filter((ex) => !favoriteIds.includes(ex.id));
      const result: { title: string; data: Exercise[] }[] = [];
      if (favoriteExercises.length > 0)
        result.push({ title: t('exercisePicker.favoritesCount', { count: favoriteExercises.length }), data: favoriteExercises });
      if (recentFiltered.length > 0)
        result.push({ title: t('exercisePicker.recentlyUsed'), data: recentFiltered });
      result.push({
        title: isPro
          ? t('exercisePicker.allExercisesCount', { count: filteredExercises.length })
          : t('exercisePicker.freeExercisesCount', { count: filteredExercises.length, limit: FREE_EXERCISE_LIMIT }), // [PRO]
        data: filteredExercises,
      });
      return result;
    }

    return [
      {
        title: query.trim()
          ? t('exercisePicker.resultsFor', { query: query.trim() })
          : t('exercisePicker.filteredCount', { count: filteredExercises.length }),
        data: filteredExercises,
      },
    ];
  }, [recentlyUsed, filteredExercises, query, activeMuscle, activeEquipment, favoriteIds, isPro, t]);

  // ── Detect Pro-gated empty: free user gets 0 results but full library has matches [PRO]
  const isGatedEmpty = useMemo(() => {
    if (isPro || filteredExercises.length > 0) return false;
    // Check if applying the same filters to the full EXERCISES list yields results
    let fullList = EXERCISES;
    if (activeMuscle !== 'All') {
      fullList = fullList.filter(
        (ex) =>
          ex.muscleGroup === activeMuscle ||
          ex.muscle_groups.some((mg) => mg.toLowerCase() === activeMuscle.toLowerCase()),
      );
    }
    if (activeEquipment !== 'All') {
      const filterL = activeEquipment.toLowerCase();
      fullList = fullList.filter((ex) =>
        ex.equipment_required.some((eq) => eq.toLowerCase() === filterL || eq.toLowerCase().startsWith(filterL)),
      );
    }
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      fullList = fullList.filter(
        (ex) =>
          ex.name.toLowerCase().includes(q) ||
          localizeExerciseName(ex.name, locale).toLowerCase().includes(q) ||
          ex.muscleGroup.toLowerCase().includes(q) ||
          localizeMuscleGroup(ex.muscleGroup, locale).toLowerCase().includes(q) ||
          ex.equipment_required.some((eq) => eq.toLowerCase().includes(q)),
      );
    }
    return fullList.length > 0; // there are Pro-only matches
  }, [isPro, filteredExercises.length, activeMuscle, activeEquipment, query, locale]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleAdd = useCallback(
    async (exercise: Exercise, superset: boolean) => {
      await recordRecentlyUsedExercise(exercise.id);
      // Refresh recently used list
      const updated = await getRecentlyUsedExercises();
      setRecentlyUsed(updated);
      onAdd(exercise, superset);
    },
    [onAdd],
  );

  const handleFavorite = useCallback(async (exerciseId: string) => {
    const updated = await toggleFavoriteExercise(exerciseId);
    setFavoriteIds(updated);
  }, []);

  const handleSupersetToggle = async () => {
    if (!isPro) return; // gate handled in UI
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSupersetMode((prev) => !prev);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* ── Sticky Header ─────────────────────────────────────────────── */}
      <View style={styles.header}>
        {standalone ? (
          <View style={{ width: 26 }} />
        ) : (
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={26} color={theme.textPrimary} />
          </TouchableOpacity>
        )}
        <Text style={styles.headerTitle}>{standalone ? t('exercisePicker.exercisesTitle') : t('exercisePicker.addExerciseTitle')}</Text>

        {/* Template button — shown in standalone mode when a handler is provided */}
        {standalone && onTemplatePress ? (
          <TouchableOpacity
            onPress={onTemplatePress}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
          >
            <Ionicons name="copy-outline" size={18} color={theme.primary} />
            <Text style={{ color: theme.primary, fontSize: 13, fontWeight: '600' }}>{t('exercisePicker.templates')}</Text>
          </TouchableOpacity>
        ) : null}

        {/* Superset toggle — PRO (hidden in standalone browse mode) */}
        {!standalone && (
          <TouchableOpacity
            style={[
              styles.supersetBtn,
              supersetMode && styles.supersetBtnActive,
              !isPro && styles.supersetBtnLocked,
            ]}
            onPress={handleSupersetToggle}
            disabled={!isPro}
          >
            <Ionicons
              name="git-merge-outline"
              size={18}
              color={supersetMode ? theme.textPrimary : theme.textSecondary}
            />
            <Text
              style={[
                styles.supersetLabel,
                supersetMode && styles.supersetLabelActive,
              ]}
            >
              {t('exercisePicker.superset')}
            </Text>
            {!isPro && (
              <Ionicons name="lock-closed" size={12} color={theme.primary} />
            )}
          </TouchableOpacity>
        )}
      </View>

      {supersetMode && (
        <View style={styles.supersetBanner}>
          <Ionicons name="git-merge-outline" size={14} color={theme.primary} />
          <Text style={styles.supersetBannerText}>
            {t('exercisePicker.supersetBanner')}
          </Text>
        </View>
      )}

      {/* ── Search ──────────────────────────────────────────────────────── */}
      <Input
        value={query}
        onChangeText={setQuery}
        placeholder={t('exercisePicker.searchPlaceholder')}
        containerStyle={styles.searchContainer}
        leftIcon={<Ionicons name="search-outline" size={18} color={theme.textSecondary} />}
        clearButtonMode="while-editing"
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
      />

      {/* ── Muscle group chips ───────────────────────────────────────────── */}
      <MuscleChips active={activeMuscle} onChange={setActiveMuscle} locale={locale} />

      {/* ── Equipment filter chips ───────────────────────────────────────── */}
      <EquipmentChips active={activeEquipment} onChange={setActiveEquipment} locale={locale} />

      {/* ── List ────────────────────────────────────────────────────────── */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : filteredExercises.length === 0 && recentlyUsed.length === 0 ? (
        isGatedEmpty ? ( // [PRO] — results exist but are locked behind Pro
          <View style={styles.center}>
            <View style={styles.gatedEmptyBox}>
              <Ionicons name="lock-closed" size={36} color={theme.primary} style={{ marginBottom: 10 }} />
              <Text style={styles.gatedEmptyTitle}>{t('exercisePicker.proOnlyTitle')}</Text>
              <Text style={styles.gatedEmptySubtitle}>
                {t('exercisePicker.proOnlySubtitle', { total: EXERCISES.length })}
              </Text>
              <TouchableOpacity
                style={styles.gatedEmptyBtn}
                onPress={() => {
                  sendPaywallTelemetry({
                    feature: 'exercise_library',
                    placement: 'gated_empty_state',
                    eventType: 'cta_click',
                    context: `${activeMuscle}_${activeEquipment}`,
                  }).catch(() => null);
                  router.push('/pro-paywall' as any);
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.gatedEmptyBtnText}>{t('exercisePicker.unlockPro')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.center}>
            <Ionicons name="search-outline" size={44} color={theme.charcoal} />
            <Text style={styles.emptyText}>{t('exercisePicker.noExercisesFound')}</Text>
          </View>
        )
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section: { title } }) => (
            <Text style={styles.sectionHeader}>{title}</Text>
          )}
          renderItem={({ item }) => (
            <ExerciseRow
              exercise={item}
              isAdded={addedExerciseIds.includes(item.id)}
              isFavorite={favoriteIds.includes(item.id)}
              supersetMode={supersetMode}
              isPro={isPro}
              expandedId={expandedId}
              locale={locale}
              t={t}
              onExpand={setExpandedId}
              onFavorite={handleFavorite}
              onAdd={handleAdd}
            />
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          initialNumToRender={20}
          maxToRenderPerBatch={20}
          windowSize={10}
          removeClippedSubviews={Platform.OS === 'android'}
          ListFooterComponent={
            !isPro ? ( // [PRO]
              <TouchableOpacity
                style={styles.proUpsellBanner}
                onPress={() => {
                  sendPaywallTelemetry({
                    feature: 'exercise_library',
                    placement: 'list_footer_banner',
                    eventType: 'cta_click',
                    context: 'unlock_full_library',
                  }).catch(() => null);
                  router.push('/pro-paywall' as any);
                }}
                activeOpacity={0.85}
              >
                <View style={styles.proUpsellInner}>
                  <Ionicons name="lock-closed" size={22} color={theme.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.proUpsellTitle}>
                      {t('exercisePicker.moreExercisesInPro', { count: EXERCISES.length - FREE_EXERCISE_LIMIT })}
                    </Text>
                    <Text style={styles.proUpsellSubtitle}>
                      {t('exercisePicker.unlockFullLibrary', { total: EXERCISES.length })}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={theme.primary} />
                </View>
              </TouchableOpacity>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
};

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 12,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: theme.textPrimary,
  },

  supersetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
  },
  supersetBtnActive: {
    backgroundColor: theme.primary,
    borderColor: theme.primary,
  },
  supersetBtnLocked: {
    opacity: 0.7,
  },
  supersetLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.textSecondary,
  },
  supersetLabelActive: {
    color: theme.textPrimary,
  },

  supersetBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,98,0,0.12)',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,98,0,0.25)',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  supersetBannerText: {
    fontSize: 12,
    color: theme.primary,
    fontWeight: '500',
  },

  searchContainer: {
    marginHorizontal: 16,
    marginVertical: 4,
  },

  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 6,
  },

  listContent: {
    paddingBottom: 32,
  },

  // Pro upsell footer banner [PRO]
  proUpsellBanner: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    borderRadius: 12,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.primary,
    overflow: 'hidden',
  },
  proUpsellInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  proUpsellTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.textPrimary,
  },
  proUpsellSubtitle: {
    fontSize: 13,
    color: theme.textSecondary,
    marginTop: 2,
  },

  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  emptyText: {
    color: theme.textSecondary,
    fontSize: 15,
  },

  // Pro-gated empty state styles [PRO]
  gatedEmptyBox: {
    marginHorizontal: 24,
    padding: 28,
    borderRadius: 16,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.primary,
    alignItems: 'center',
  },
  gatedEmptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: theme.textPrimary,
    textAlign: 'center',
    marginBottom: 8,
  },
  gatedEmptySubtitle: {
    fontSize: 14,
    color: theme.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  gatedEmptyBtn: {
    backgroundColor: theme.primary,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 24,
  },
  gatedEmptyBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.textPrimary,
  },
});

export default ExercisePicker;
