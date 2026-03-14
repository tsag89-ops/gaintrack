// app/(tabs)/programs.tsx
// GainTrack — Programs tab: local program list dashboard with FAB

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  withSpring,
  useSharedValue,
  withSequence,
} from 'react-native-reanimated';
import { usePrograms } from '../../src/hooks/usePrograms';
import { usePro } from '../../src/hooks/usePro';
import { ProgramCard } from '../../src/components/programs/ProgramCard';
import { sendEngagementTelemetry, sendPaywallTelemetry } from '../../src/services/notifications';
import { WorkoutProgram } from '../../src/types';
import { colors, typography, radii, spacing, shadows } from '../../src/constants/theme';

const FREE_PROGRAM_LIMIT = 1;

export default function ProgramsScreen() {
  const router = useRouter();
  const { programs, isLoading, reload, removeOne, saveOne } = usePrograms();
  const { isPro } = usePro();
  const fabScale = useSharedValue(1);
  const [recentlyDeleted, setRecentlyDeleted] = useState<WorkoutProgram | null>(null);
  const undoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (undoTimeoutRef.current) {
        clearTimeout(undoTimeoutRef.current);
      }
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const handleFabPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    fabScale.value = withSequence(withSpring(0.88), withSpring(1));

    if (!isPro && programs.length >= FREE_PROGRAM_LIMIT) {
      // [PRO] Free tier: max 1 program
      sendPaywallTelemetry({
        feature: 'programs',
        placement: 'program_limit_gate',
        eventType: 'view',
        context: `count_${programs.length}`,
      }).catch(() => null);
      sendPaywallTelemetry({
        feature: 'programs',
        placement: 'program_limit_gate',
        eventType: 'cta_click',
        context: 'fab_create_program',
      }).catch(() => null);
      router.push('/pro-paywall' as any);
      return;
    }
    sendEngagementTelemetry({
      feature: 'programs',
      action: 'builder_opened',
      context: 'fab',
    }).catch(() => null);
    router.push('/programs/builder' as any);
  }, [isPro, programs.length, router, fabScale]);

  const handleCardPress = useCallback(
    (program: WorkoutProgram) => {
      router.push(`/programs/${program.id}` as any);
    },
    [router],
  );

  const handleCardLongPress = useCallback(
    (program: WorkoutProgram) => {
      Alert.alert(
        program.name,
        'What would you like to do?',
        [
          {
            text: 'Edit',
            onPress: () => router.push(`/programs/builder?id=${program.id}` as any),
          },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => {
              Alert.alert('Delete Program', `Delete "${program.name}"?`, [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: async () => {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                    await removeOne(program.id);
                    setRecentlyDeleted(program);

                    if (undoTimeoutRef.current) {
                      clearTimeout(undoTimeoutRef.current);
                    }

                    undoTimeoutRef.current = setTimeout(() => {
                      setRecentlyDeleted(null);
                      undoTimeoutRef.current = null;
                    }, 5000);
                  },
                },
              ]);
            },
          },
          { text: 'Cancel', style: 'cancel' },
        ],
      );
    },
    [router, removeOne],
  );

  const handleUndoDelete = useCallback(async () => {
    if (!recentlyDeleted) {
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await saveOne(recentlyDeleted);
    setRecentlyDeleted(null);

    if (undoTimeoutRef.current) {
      clearTimeout(undoTimeoutRef.current);
      undoTimeoutRef.current = null;
    }
  }, [recentlyDeleted, saveOne]);

  const fabStyle = useAnimatedStyle(() => ({
    transform: [{ scale: fabScale.value }],
  }));

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="barbell-outline" size={56} color={colors.textDisabled} />
      <Text style={styles.emptyTitle}>No programs yet</Text>
      <Text style={styles.emptySubtitle}>
        Tap the + button to build your first training program
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Programs</Text>
        {!isPro && (
          <TouchableOpacity
            style={styles.proBadge}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              sendPaywallTelemetry({
                feature: 'programs',
                placement: 'programs_header_badge',
                eventType: 'cta_click',
                context: 'header_go_pro',
              }).catch(() => null);
              router.push('/pro-paywall' as any);
            }}
          >
            <Ionicons name="star" size={12} color={colors.accent} />
            <Text style={styles.proBadgeText}>Go Pro</Text>
          </TouchableOpacity>
        )}
      </View>

      {isLoading ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : (
        <FlatList
          data={programs}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInDown.delay(index * 60).springify()}>
              <ProgramCard
                program={item}
                onPress={handleCardPress}
                onLongPress={handleCardLongPress}
              />
            </Animated.View>
          )}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          onRefresh={reload}
          refreshing={isLoading}
        />
      )}

      {/* FAB */}
      <Animated.View style={[styles.fab, fabStyle]}>
        <TouchableOpacity style={styles.fabBtn} onPress={handleFabPress} activeOpacity={0.85}>
          <Ionicons name="add" size={28} color={colors.textPrimary} />
        </TouchableOpacity>
      </Animated.View>

      {recentlyDeleted && (
        <View style={styles.undoBar}>
          <Text style={styles.undoText} numberOfLines={1}>
            Deleted {recentlyDeleted.name}
          </Text>
          <TouchableOpacity onPress={handleUndoDelete} hitSlop={8}>
            <Text style={styles.undoAction}>UNDO</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  title: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
  },
  proBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 212, 179, 0.12)',
    paddingHorizontal: spacing[2],
    paddingVertical: 4,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  proBadgeText: {
    fontSize: typography.fontSize.xs,
    color: colors.accent,
    fontWeight: typography.fontWeight.semibold,
  },
  loader: {
    flex: 1,
    alignSelf: 'center',
  },
  list: {
    paddingHorizontal: spacing[4],
    paddingBottom: 100,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 80,
    gap: spacing[3],
  },
  emptyTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
  },
  emptySubtitle: {
    fontSize: typography.fontSize.base,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: spacing[8],
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    ...shadows.lg,
  },
  fabBtn: {
    width: 56,
    height: 56,
    borderRadius: radii.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  undoBar: {
    position: 'absolute',
    left: spacing[4],
    right: spacing[4],
    bottom: 92,
    minHeight: 48,
    backgroundColor: colors.charcoal,
    borderWidth: 1,
    borderColor: colors.surface,
    borderRadius: radii.lg,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...shadows.md,
  },
  undoText: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
    marginRight: spacing[3],
  },
  undoAction: {
    color: colors.accent,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0.5,
  },
});
