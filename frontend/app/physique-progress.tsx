// app/physique-progress.tsx
// Physique progress photo tracker — up to 5 photos per day, linked to that day's workout log.

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList,
  Alert,
  TextInput,
  Modal,
  Dimensions,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { format, addDays, subDays, parseISO, isToday } from 'date-fns';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, typography, spacing, radii } from '../src/constants/theme';
import {
  getPhysiquePhotosForDate,
  savePhysiquePhoto,
  deletePhysiquePhoto,
  MAX_PHOTOS_PER_DAY,
  getPhysiquePhotos,
} from '../src/services/storage';
import {
  PhysiquePhoto,
  PhysiqueWorkoutLogSnapshot,
  PhysiqueWorkoutSummary,
  Workout,
  WorkoutExercise,
  WorkoutSet,
} from '../src/types';

// ── Constants ─────────────────────────────────────────────────────────────────

const { width: SCREEN_W } = Dimensions.get('window');
const THUMB_SIZE = (SCREEN_W - spacing[4] * 2 - spacing[3] * 4) / 5;
const WORKOUTS_KEY = 'gaintrack_workouts';
const PHYSIQUE_DIR = (FileSystem.documentDirectory ?? '') + 'physique_photos/';

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

/** Reads that day's workouts from AsyncStorage and builds a summary. */
async function getTodayWorkoutSummary(date: string): Promise<PhysiqueWorkoutSummary | null> {
  try {
    const raw = await AsyncStorage.getItem(WORKOUTS_KEY);
    if (!raw) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let parsed: any = JSON.parse(raw);
    // Support both raw array and { workouts: [] } envelope
    const workouts: any[] = Array.isArray(parsed) ? parsed : (parsed?.workouts ?? []);
    const dayWorkouts: any[] = workouts.filter((w: any) => {
      if (!w.date) return false;
      const d = typeof w.date === 'string' ? w.date.slice(0, 10) : '';
      return d === date;
    });
    if (dayWorkouts.length === 0) return null;
    const detailedWorkouts: PhysiqueWorkoutLogSnapshot[] = dayWorkouts.map((w: Workout) => {
      const detailedExercises = (w.exercises ?? [])
        .map((exercise: WorkoutExercise) => {
          const completedSets = (exercise.sets ?? [])
            .filter((set: WorkoutSet) => set.completed)
            .map((set: WorkoutSet, index: number) => ({
              setNumber: Number(set.set_number ?? index + 1),
              reps: Number(set.reps ?? 0),
              weight: Number(set.weight ?? 0),
              rpe: typeof set.rpe === 'number' ? set.rpe : undefined,
              isWarmup: Boolean(set.is_warmup),
            }));

          return {
            exerciseName: exercise.exercise_name,
            notes: exercise.notes,
            sets: completedSets,
          };
        })
        .filter((exercise) => exercise.sets.length > 0);

      return {
        workoutId: String(w.workout_id ?? generateId()),
        name: w.name ?? 'Workout',
        date: w.date,
        exercises: detailedExercises,
      };
    });

    // Aggregate across all workouts for the day
    let exerciseCount = 0;
    let totalSets = 0;
    let totalVolume = 0;
    let workoutName = dayWorkouts[0]?.name ?? 'Workout';
    detailedWorkouts.forEach((w) => {
      const exercises = w.exercises ?? [];
      exerciseCount += exercises.length;
      exercises.forEach((ex) => {
        const sets = ex.sets ?? [];
        totalSets += sets.length;
        sets.forEach((s) => {
          totalVolume += (s.weight ?? 0) * (s.reps ?? 0);
        });
      });
    });
    if (dayWorkouts.length > 1) workoutName = `${dayWorkouts.length} workouts`;
    return {
      name: workoutName,
      exerciseCount,
      totalSets,
      totalVolume,
      workouts: detailedWorkouts,
    };
  } catch {
    return null;
  }
}

/** Ensures the photos directory exists. */
async function ensureDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(PHYSIQUE_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(PHYSIQUE_DIR, { intermediates: true });
  }
}

/** Copies a temp URI to permanent storage and returns the new URI. */
async function persistPhoto(tempUri: string, id: string): Promise<string> {
  await ensureDir();
  const dest = PHYSIQUE_DIR + id + '.jpg';
  await FileSystem.copyAsync({ from: tempUri, to: dest });
  return dest;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function WorkoutSummaryCard({ summary }: { summary: PhysiqueWorkoutSummary }) {
  return (
    <View style={styles.workoutCard}>
      <View style={styles.workoutCardHeader}>
        <Ionicons name="barbell-outline" size={16} color={colors.primary} />
        <Text style={styles.workoutCardTitle} numberOfLines={1}>{summary.name}</Text>
      </View>
      <View style={styles.workoutStats}>
        <View style={styles.workoutStat}>
          <Text style={styles.workoutStatValue}>{summary.exerciseCount}</Text>
          <Text style={styles.workoutStatLabel}>exercises</Text>
        </View>
        <View style={styles.workoutStatDivider} />
        <View style={styles.workoutStat}>
          <Text style={styles.workoutStatValue}>{summary.totalSets}</Text>
          <Text style={styles.workoutStatLabel}>sets</Text>
        </View>
        <View style={styles.workoutStatDivider} />
        <View style={styles.workoutStat}>
          <Text style={styles.workoutStatValue}>{Math.round(summary.totalVolume).toLocaleString()}</Text>
          <Text style={styles.workoutStatLabel}>kg volume</Text>
        </View>
      </View>
    </View>
  );
}

function WorkoutDetailedLog({ summary }: { summary: PhysiqueWorkoutSummary }) {
  const workouts = summary.workouts ?? [];

  return (
    <View style={styles.workoutDetailsWrap}>
      <WorkoutSummaryCard summary={summary} />

      {workouts.map((workout, workoutIndex) => (
        <View key={`${workout.workoutId}_${workoutIndex}`} style={styles.workoutDetailsCard}>
          <Text style={styles.workoutDetailsTitle}>{workout.name || `Workout ${workoutIndex + 1}`}</Text>

          {workout.exercises.map((exercise, exerciseIndex) => (
            <View key={`${workout.workoutId}_${exercise.exerciseName}_${exerciseIndex}`} style={styles.exerciseDetailsCard}>
              <Text style={styles.exerciseDetailsTitle}>{exercise.exerciseName}</Text>
              {exercise.notes ? <Text style={styles.exerciseDetailsNotes}>{exercise.notes}</Text> : null}

              <View style={styles.exerciseTableHeader}>
                <Text style={[styles.exerciseTableHeaderText, styles.exerciseColSet]}>Set</Text>
                <Text style={[styles.exerciseTableHeaderText, styles.exerciseColReps]}>Reps</Text>
                <Text style={[styles.exerciseTableHeaderText, styles.exerciseColWeight]}>Weight</Text>
                <Text style={[styles.exerciseTableHeaderText, styles.exerciseColRpe]}>RPE</Text>
              </View>

              {exercise.sets.map((set, setIndex) => (
                <View key={`${exercise.exerciseName}_${set.setNumber}_${setIndex}`} style={styles.exerciseSetRow}>
                  <Text style={[styles.exerciseCellText, styles.exerciseColSet]}>
                    {set.setNumber}
                    {set.isWarmup ? ' W' : ''}
                  </Text>
                  <Text style={[styles.exerciseCellText, styles.exerciseColReps]}>{set.reps}</Text>
                  <Text style={[styles.exerciseCellText, styles.exerciseColWeight]}>{set.weight}</Text>
                  <Text style={[styles.exerciseCellText, styles.exerciseColRpe]}>{typeof set.rpe === 'number' ? set.rpe : '-'}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function EmptyPhotos({ onAdd, canAdd }: { onAdd: () => void; canAdd: boolean }) {
  return (
    <View style={styles.emptyState}>
      <Ionicons name="camera-outline" size={52} color={colors.textSecondary} />
      <Text style={styles.emptyTitle}>No photos yet</Text>
      <Text style={styles.emptyBody}>Document your physique progress — up to {MAX_PHOTOS_PER_DAY} photos per day</Text>
      {canAdd && (
        <TouchableOpacity style={styles.emptyAddBtn} onPress={onAdd} activeOpacity={0.8}>
          <Ionicons name="add" size={18} color={colors.background} />
          <Text style={styles.emptyAddBtnText}>Add First Photo</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Full-screen photo viewer ──────────────────────────────────────────────────

function PhotoViewer({
  photo,
  onClose,
  onDelete,
}: {
  photo: PhysiquePhoto;
  onClose: () => void;
  onDelete: (id: string) => void;
}) {
  const handleDelete = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    Alert.alert('Delete Photo', 'Delete this photo? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          onDelete(photo.id);
          onClose();
        },
      },
    ]);
  };

  return (
    <Modal visible animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.viewerBg}>
        <Image
          source={{ uri: photo.uri }}
          style={styles.viewerImage}
          resizeMode="contain"
        />
        <SafeAreaView style={styles.viewerOverlay} edges={['top', 'bottom']}>
          {/* Header */}
          <View style={styles.viewerHeader}>
            <TouchableOpacity style={styles.viewerClose} onPress={onClose} activeOpacity={0.75}>
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.viewerDate}>
              {format(parseISO(photo.capturedAt), 'MMM d, yyyy · h:mm a')}
            </Text>
            <TouchableOpacity style={styles.viewerDelete} onPress={handleDelete} activeOpacity={0.75}>
              <Ionicons name="trash-outline" size={22} color={colors.error} />
            </TouchableOpacity>
          </View>
          {/* Notes */}
          {photo.notes ? (
            <View style={styles.viewerNotes}>
              <Text style={styles.viewerNotesText}>{photo.notes}</Text>
            </View>
          ) : null}
          {/* Workout summary */}
          {photo.workoutSummary ? (
            <View style={styles.viewerWorkout}>
              <WorkoutDetailedLog summary={photo.workoutSummary} />
            </View>
          ) : null}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

// ── Add Photo Modal (notes input) ─────────────────────────────────────────────

function AddPhotoModal({
  tempUri,
  onConfirm,
  onCancel,
  saving,
}: {
  tempUri: string;
  onConfirm: (notes: string) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [notes, setNotes] = useState('');

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onCancel}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.addModalWrap}
      >
        <View style={styles.addModalSheet}>
          <View style={styles.addModalHandle} />
          <Text style={styles.addModalTitle}>Save Photo</Text>
          <Image source={{ uri: tempUri }} style={styles.addModalPreview} resizeMode="cover" />
          <TextInput
            style={styles.addModalInput}
            placeholder="Add a note (optional)…"
            placeholderTextColor={colors.textSecondary}
            value={notes}
            onChangeText={setNotes}
            multiline
            maxLength={200}
          />
          <View style={styles.addModalRow}>
            <TouchableOpacity
              style={[styles.addModalBtn, styles.addModalBtnCancel]}
              onPress={onCancel}
              activeOpacity={0.75}
              disabled={saving}
            >
              <Text style={styles.addModalBtnCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.addModalBtn, styles.addModalBtnSave]}
              onPress={() => onConfirm(notes.trim())}
              activeOpacity={0.8}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color={colors.background} />
              ) : (
                <Text style={styles.addModalBtnSaveText}>Save</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function PhysiqueProgressScreen() {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [photos, setPhotos] = useState<PhysiquePhoto[]>([]);
  const [workoutSummary, setWorkoutSummary] = useState<PhysiqueWorkoutSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewingPhoto, setViewingPhoto] = useState<PhysiquePhoto | null>(null);
  const [addingPhoto, setAddingPhoto] = useState<{ tempUri: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const canAdd = photos.length < MAX_PHOTOS_PER_DAY;
  const isCurrentDay = selectedDate === format(new Date(), 'yyyy-MM-dd');

  // ── Load data for selected date ──────────────────────────────────────────
  const loadDate = useCallback(async (date: string) => {
    setLoading(true);
    try {
      const [dayPhotos, summary] = await Promise.all([
        getPhysiquePhotosForDate(date),
        getTodayWorkoutSummary(date),
      ]);
      setPhotos(dayPhotos);
      setWorkoutSummary(summary);
    } catch (e) {
      console.error('[PhysiqueProgress] loadDate error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadDate(selectedDate); }, [selectedDate, loadDate]);

  // ── Date navigation ──────────────────────────────────────────────────────
  const goBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedDate((d) => format(subDays(parseISO(d), 1), 'yyyy-MM-dd'));
  };

  const goForward = () => {
    const next = addDays(parseISO(selectedDate), 1);
    if (next > new Date()) return; // cant go into the future
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedDate(format(next, 'yyyy-MM-dd'));
  };

  const goToday = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedDate(format(new Date(), 'yyyy-MM-dd'));
  };

  // ── Pick photo ───────────────────────────────────────────────────────────
  const handleAddPhoto = () => {
    if (!canAdd) {
      Alert.alert('Limit reached', `You can only add ${MAX_PHOTOS_PER_DAY} photos per day.`);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert('Add Photo', 'Choose a source', [
      { text: 'Camera', onPress: () => openPicker('camera') },
      { text: 'Photo Library', onPress: () => openPicker('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const openPicker = async (source: 'camera' | 'library') => {
    try {
      let result: ImagePicker.ImagePickerResult;

      if (source === 'camera') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission required', 'Camera access is needed to take photos.');
          return;
        }
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.75,
          allowsEditing: true,
          aspect: [3, 4],
        });
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission required', 'Photo library access is needed to select photos.');
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.75,
          allowsEditing: true,
          aspect: [3, 4],
        });
      }

      if (!result.canceled && result.assets.length > 0) {
        setAddingPhoto({ tempUri: result.assets[0].uri });
      }
    } catch (e) {
      Alert.alert('Error', 'Could not access photos. ' + String(e));
    }
  };

  // ── Save photo ───────────────────────────────────────────────────────────
  const handleConfirmSave = async (notes: string) => {
    if (!addingPhoto) return;
    setSaving(true);
    try {
      const id = generateId();
      const permanentUri = await persistPhoto(addingPhoto.tempUri, id);
      const summary = await getTodayWorkoutSummary(selectedDate);
      const photo: PhysiquePhoto = {
        id,
        date: selectedDate,
        uri: permanentUri,
        capturedAt: new Date().toISOString(),
        notes: notes || undefined,
        workoutSummary: summary,
      };
      await savePhysiquePhoto(photo);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setAddingPhoto(null);
      loadDate(selectedDate);
    } catch (e) {
      Alert.alert('Save failed', String(e));
    } finally {
      setSaving(false);
    }
  };

  // ── Delete photo ─────────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    try {
      // Find the photo to get its URI for file deletion
      const all = await getPhysiquePhotos();
      const photo = all.find((p) => p.id === id);
      await deletePhysiquePhoto(id);
      // Try to delete the physical file too
      if (photo?.uri) {
        FileSystem.deleteAsync(photo.uri, { idempotent: true }).catch(() => {});
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      loadDate(selectedDate);
    } catch (e) {
      Alert.alert('Delete failed', String(e));
    }
  };

  // ── Format date label ─────────────────────────────────────────────────────
  const dateLabel = (() => {
    const d = parseISO(selectedDate);
    if (format(d, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')) return 'Today';
    const yesterday = subDays(new Date(), 1);
    if (format(d, 'yyyy-MM-dd') === format(yesterday, 'yyyy-MM-dd')) return 'Yesterday';
    return format(d, 'MMMM d, yyyy');
  })();

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.back(); }}
          activeOpacity={0.75}
        >
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Physique Progress</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Date navigator */}
      <View style={styles.dateNav}>
        <TouchableOpacity style={styles.dateNavBtn} onPress={goBack} activeOpacity={0.75}>
          <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={!isCurrentDay ? goToday : undefined} activeOpacity={0.75}>
          <Text style={styles.dateLabel}>{dateLabel}</Text>
          {!isCurrentDay && (
            <Text style={styles.dateTodayHint}>tap to go to today</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.dateNavBtn, isCurrentDay && styles.dateNavBtnDisabled]}
          onPress={goForward}
          disabled={isCurrentDay}
          activeOpacity={0.75}
        >
          <Ionicons name="chevron-forward" size={20} color={isCurrentDay ? colors.textSecondary : colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* Photo count badge */}
      <View style={styles.countRow}>
        <View style={styles.countBadge}>
          <Ionicons name="images-outline" size={13} color={colors.primary} />
          <Text style={styles.countText}>{photos.length} / {MAX_PHOTOS_PER_DAY} photos</Text>
        </View>
        {canAdd && (
          <TouchableOpacity style={styles.addBtn} onPress={handleAddPhoto} activeOpacity={0.8}>
            <Ionicons name="camera" size={16} color={colors.background} />
            <Text style={styles.addBtnText}>Add Photo</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : photos.length === 0 ? (
          <EmptyPhotos onAdd={handleAddPhoto} canAdd={canAdd} />
        ) : (
          <>
            {/* Photo thumbnails grid */}
            <View style={styles.grid}>
              {photos.map((photo) => (
                <TouchableOpacity
                  key={photo.id}
                  style={styles.thumb}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setViewingPhoto(photo); }}
                  activeOpacity={0.85}
                >
                  <Image source={{ uri: photo.uri }} style={styles.thumbImage} resizeMode="cover" />
                  {photo.notes ? (
                    <View style={styles.thumbNoteIcon}>
                      <Ionicons name="chatbubble-ellipses" size={10} color={colors.textPrimary} />
                    </View>
                  ) : null}
                </TouchableOpacity>
              ))}
              {/* Add slot if under limit */}
              {canAdd && (
                <TouchableOpacity style={[styles.thumb, styles.thumbAdd]} onPress={handleAddPhoto} activeOpacity={0.8}>
                  <Ionicons name="add" size={26} color={colors.primary} />
                </TouchableOpacity>
              )}
            </View>

            {/* Workout summary for the day */}
            {workoutSummary && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Today's Workout</Text>
                <WorkoutDetailedLog summary={workoutSummary} />
              </View>
            )}

            {/* Individual photo notes list */}
            {photos.some((p) => p.notes) && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Notes</Text>
                {photos.filter((p) => p.notes).map((p) => (
                  <View key={p.id} style={styles.noteRow}>
                    <Ionicons name="chatbubble-ellipses-outline" size={14} color={colors.primary} style={{ marginTop: 1 }} />
                    <Text style={styles.noteText}>{p.notes}</Text>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Modals */}
      {viewingPhoto && (
        <PhotoViewer
          photo={viewingPhoto}
          onClose={() => setViewingPhoto(null)}
          onDelete={handleDelete}
        />
      )}
      {addingPhoto && (
        <AddPhotoModal
          tempUri={addingPhoto.tempUri}
          onConfirm={handleConfirmSave}
          onCancel={() => setAddingPhoto(null)}
          saving={saving}
        />
      )}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold as any,
    color: colors.textPrimary,
  },

  // Date navigator
  dateNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  dateNavBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.full,
    backgroundColor: colors.charcoal,
  },
  dateNavBtnDisabled: {
    opacity: 0.35,
  },
  dateLabel: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold as any,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  dateTodayHint: {
    fontSize: typography.fontSize.xs,
    color: colors.primary,
    textAlign: 'center',
    marginTop: 2,
  },

  // Count row
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  countBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing[3],
    paddingVertical: 5,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  countText: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    fontWeight: typography.fontWeight.medium as any,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    borderRadius: radii.full,
  },
  addBtnText: {
    color: colors.background,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold as any,
  },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[8],
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[8],
  },

  // Photo grid
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
    marginTop: spacing[3],
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE * 1.33,
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: colors.charcoal,
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  thumbNoteIcon: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 8,
    padding: 3,
  },
  thumbAdd: {
    alignItems: 'center',
    justifyContent: 'center',
    borderStyle: 'dashed',
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: 'transparent',
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing[8],
    gap: spacing[3],
  },
  emptyTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold as any,
    color: colors.textPrimary,
  },
  emptyBody: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 260,
    lineHeight: 20,
  },
  emptyAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[3],
    borderRadius: radii.full,
    marginTop: spacing[2],
  },
  emptyAddBtnText: {
    color: colors.background,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold as any,
  },

  // Sections
  section: {
    marginTop: spacing[5],
  },
  sectionTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold as any,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing[3],
  },

  // Workout card
  workoutCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing[4],
    borderWidth: 1,
    borderColor: colors.divider,
  },
  workoutCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    marginBottom: spacing[3],
  },
  workoutCardTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold as any,
    color: colors.textPrimary,
    flex: 1,
  },
  workoutStats: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  workoutStat: {
    flex: 1,
    alignItems: 'center',
  },
  workoutStatValue: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold as any,
    color: colors.textPrimary,
  },
  workoutStatLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  workoutStatDivider: {
    width: 1,
    height: 32,
    backgroundColor: colors.divider,
  },

  workoutDetailsWrap: {
    gap: spacing[3],
  },
  workoutDetailsCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.divider,
    padding: spacing[3],
    gap: spacing[3],
  },
  workoutDetailsTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.bold as any,
    color: colors.textPrimary,
  },
  exerciseDetailsCard: {
    backgroundColor: colors.charcoal,
    borderRadius: radii.md,
    padding: spacing[3],
    gap: spacing[2],
  },
  exerciseDetailsTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold as any,
    color: colors.textPrimary,
  },
  exerciseDetailsNotes: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
    marginBottom: spacing[1],
  },
  exerciseTableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    paddingBottom: spacing[1],
  },
  exerciseTableHeaderText: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
    fontWeight: typography.fontWeight.medium as any,
  },
  exerciseSetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing[1],
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  exerciseCellText: {
    fontSize: typography.fontSize.sm,
    color: colors.textPrimary,
  },
  exerciseColSet: {
    width: 48,
  },
  exerciseColReps: {
    width: 56,
  },
  exerciseColWeight: {
    flex: 1,
  },
  exerciseColRpe: {
    width: 48,
    textAlign: 'right',
  },

  // Notes
  noteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[2],
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing[3],
    marginBottom: spacing[2],
  },
  noteText: {
    flex: 1,
    fontSize: typography.fontSize.sm,
    color: colors.textPrimary,
    lineHeight: 20,
  },

  // Full-screen viewer
  viewerBg: {
    flex: 1,
    backgroundColor: '#000',
  },
  viewerImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  viewerOverlay: {
    flex: 1,
    justifyContent: 'space-between',
  },
  viewerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  viewerClose: {
    padding: spacing[2],
  },
  viewerDate: {
    flex: 1,
    textAlign: 'center',
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
  },
  viewerDelete: {
    padding: spacing[2],
  },
  viewerNotes: {
    marginHorizontal: spacing[4],
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: radii.md,
    padding: spacing[3],
  },
  viewerNotesText: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
    lineHeight: 20,
  },
  viewerWorkout: {
    margin: spacing[4],
  },

  // Add photo modal
  addModalWrap: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  addModalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    padding: spacing[5],
    paddingBottom: spacing[8],
    alignItems: 'center',
    gap: spacing[4],
  },
  addModalHandle: {
    width: 40,
    height: 4,
    backgroundColor: colors.divider,
    borderRadius: 2,
    marginBottom: spacing[1],
  },
  addModalTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold as any,
    color: colors.textPrimary,
  },
  addModalPreview: {
    width: SCREEN_W * 0.5,
    height: SCREEN_W * 0.67,
    borderRadius: radii.lg,
    backgroundColor: colors.charcoal,
  },
  addModalInput: {
    width: '100%',
    minHeight: 72,
    backgroundColor: colors.charcoal,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.divider,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    color: colors.textPrimary,
    fontSize: typography.fontSize.base,
    textAlignVertical: 'top',
  },
  addModalRow: {
    flexDirection: 'row',
    gap: spacing[3],
    width: '100%',
  },
  addModalBtn: {
    flex: 1,
    paddingVertical: spacing[3],
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addModalBtnCancel: {
    backgroundColor: colors.charcoal,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  addModalBtnSave: {
    backgroundColor: colors.primary,
  },
  addModalBtnCancelText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.medium as any,
  },
  addModalBtnSaveText: {
    color: colors.background,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold as any,
  },
});
