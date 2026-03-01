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

import { Exercise } from '../types';
import { theme } from '../constants/theme';
import { EXERCISES, MUSCLE_GROUPS } from '../constants/exercises';
import {
  getRecentlyUsedExercises,
  recordRecentlyUsedExercise,
  getFavoriteIds,
  toggleFavoriteExercise,
} from '../services/storage';
import { Input } from './ui/Input';
import { Badge } from './ui/Badge';
import { Card } from './ui/Card';

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
}

// ─── Constants ────────────────────────────────────────────────────────────────

const { width: SCREEN_W } = Dimensions.get('window');
const PREVIEW_HEIGHT = 200;

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Horizontal pill filter chips */
const MuscleChips: React.FC<{
  active: string;
  onChange: (group: string) => void;
}> = ({ active, onChange }) => (
  <ScrollView
    horizontal
    showsHorizontalScrollIndicator={false}
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
            {group}
          </Text>
        </TouchableOpacity>
      );
    })}
  </ScrollView>
);

const chipStyles = StyleSheet.create({
  row: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
  },
  chipActive: {
    backgroundColor: theme.primary,
    borderColor: theme.primary,
  },
  label: { fontSize: 13, fontWeight: '600', color: theme.textSecondary },
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
  onExpand,
  onFavorite,
  onAdd,
}) => {
  const isExpanded = expandedId === exercise.id;

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
            {exercise.name}
          </Text>
          <View style={rowStyles.meta}>
            <Text style={rowStyles.metaText}>{exercise.muscleGroup}</Text>
            {exercise.equipment_required.length > 0 && (
              <>
                <Text style={rowStyles.metaDot}>·</Text>
                <Text style={rowStyles.metaText} numberOfLines={1}>
                  {exercise.equipment_required[0]}
                </Text>
              </>
            )}
            {exercise.is_compound && (
              <>
                <Text style={rowStyles.metaDot}>·</Text>
                <Text style={[rowStyles.metaText, { color: theme.accent }]}>
                  Compound
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
}) => {
  const [query, setQuery]               = useState('');
  const [activeMuscle, setActiveMuscle] = useState<string>('All');
  const [supersetMode, setSupersetMode] = useState(false);
  const [expandedId, setExpandedId]     = useState<string | null>(null);
  const [favoriteIds, setFavoriteIds]   = useState<string[]>([]);
  const [recentlyUsed, setRecentlyUsed] = useState<Exercise[]>([]);
  const [loading, setLoading]           = useState(true);

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
    let list = EXERCISES;
    if (activeMuscle !== 'All') {
      list = list.filter(
        (ex) =>
          ex.muscleGroup === activeMuscle ||
          ex.muscle_groups.some(
            (mg) => mg.toLowerCase() === activeMuscle.toLowerCase(),
          ),
      );
    }
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(
        (ex) =>
          ex.name.toLowerCase().includes(q) ||
          ex.muscleGroup.toLowerCase().includes(q) ||
          ex.equipment_required.some((eq) => eq.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [activeMuscle, query]);

  // ── SectionList data: always show Recently Used section when not searching ──
  const sections = useMemo(() => {
    const showRecent =
      recentlyUsed.length > 0 && !query.trim() && activeMuscle === 'All';

    if (showRecent) {
      return [
        { title: 'Recently Used', data: recentlyUsed },
        { title: `All Exercises (${filteredExercises.length})`, data: filteredExercises },
      ];
    }
    return [
      {
        title: query.trim()
          ? `Results for "${query.trim()}"`
          : activeMuscle === 'All'
          ? `All Exercises (${filteredExercises.length})`
          : `${activeMuscle} (${filteredExercises.length})`,
        data: filteredExercises,
      },
    ];
  }, [recentlyUsed, filteredExercises, query, activeMuscle]);

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
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="close" size={26} color={theme.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Add Exercise</Text>

        {/* Superset toggle — PRO */}
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
            Superset
          </Text>
          {!isPro && (
            <Ionicons name="lock-closed" size={12} color={theme.primary} />
          )}
        </TouchableOpacity>
      </View>

      {supersetMode && (
        <View style={styles.supersetBanner}>
          <Ionicons name="git-merge-outline" size={14} color={theme.primary} />
          <Text style={styles.supersetBannerText}>
            Superset mode — exercises added will be grouped
          </Text>
        </View>
      )}

      {/* ── Search ──────────────────────────────────────────────────────── */}
      <Input
        value={query}
        onChangeText={setQuery}
        placeholder="Search exercises…"
        containerStyle={styles.searchContainer}
        leftIcon={<Ionicons name="search-outline" size={18} color={theme.textSecondary} />}
        clearButtonMode="while-editing"
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
      />

      {/* ── Muscle group chips ───────────────────────────────────────────── */}
      <MuscleChips active={activeMuscle} onChange={setActiveMuscle} />

      {/* ── List ────────────────────────────────────────────────────────── */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : filteredExercises.length === 0 && recentlyUsed.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="search-outline" size={44} color={theme.charcoal} />
          <Text style={styles.emptyText}>No exercises found</Text>
        </View>
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
});

export default ExercisePicker;
