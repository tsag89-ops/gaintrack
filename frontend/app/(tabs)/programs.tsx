// app/(tabs)/programs.tsx
// GainTrack — Programs tab: local program list dashboard with FAB

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
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
import { useLanguage } from '../../src/context/LanguageContext';
import { ProgramCard } from '../../src/components/programs/ProgramCard';
import { sendEngagementTelemetry, sendPaywallTelemetry } from '../../src/services/notifications';
import { PREBUILT_PROGRAMS, createProgramFromTemplate } from '../../src/data/prebuiltPrograms';
import { WorkoutProgram } from '../../src/types';
import { colors, typography, radii, spacing, shadows } from '../../src/constants/theme';

const FREE_PROGRAM_LIMIT = 1;

export default function ProgramsScreen() {
  const router = useRouter();
  const { programs, isLoading, reload, removeOne, saveOne } = usePrograms();
  const { isPro } = usePro();
  const { t } = useLanguage();
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

  const handleUseTemplate = useCallback(
    async (templateId: string) => {
      const template = PREBUILT_PROGRAMS.find((item) => item.id === templateId);
      if (!template) {
        return;
      }

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      if (!isPro && programs.length >= FREE_PROGRAM_LIMIT) {
        // [PRO] Free tier: max 1 program
        sendPaywallTelemetry({
          feature: 'programs',
          placement: 'program_template_gate',
          eventType: 'view',
          context: `count_${programs.length}`,
        }).catch(() => null);
        sendPaywallTelemetry({
          feature: 'programs',
          placement: 'program_template_gate',
          eventType: 'cta_click',
          context: `template_${template.id}`,
        }).catch(() => null);
        router.push('/pro-paywall' as any);
        return;
      }

      const program = createProgramFromTemplate(template);
      await saveOne(program);
      sendEngagementTelemetry({
        feature: 'programs',
        action: 'template_started',
        context: template.id,
      }).catch(() => null);
      router.push(`/programs/${program.id}` as any);
    },
    [isPro, programs.length, router, saveOne],
  );

  const handleCardLongPress = useCallback(
    (program: WorkoutProgram) => {
      Alert.alert(
        program.name,
        t('programsTab.actionsPrompt'),
        [
          {
            text: t('programsTab.edit'),
            onPress: () => router.push(`/programs/builder?id=${program.id}` as any),
          },
          {
            text: t('programsTab.delete'),
            style: 'destructive',
            onPress: () => {
              Alert.alert(t('programsTab.deleteProgramTitle'), t('programsTab.deleteProgramMessage', { name: program.name }), [
                { text: t('common.cancel'), style: 'cancel' },
                {
                  text: t('programsTab.delete'),
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
          { text: t('common.cancel'), style: 'cancel' },
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
      <Text style={styles.emptyTitle}>{t('programsTab.emptyTitle')}</Text>
      <Text style={styles.emptySubtitle}>
        {t('programsTab.emptySubtitle')}
      </Text>
    </View>
  );

  const renderTemplateStrip = () => (
    <View style={styles.templateSection}>
      <View style={styles.templateSectionHeader}>
        <Text style={styles.templateSectionTitle}>{t('programsTab.quickStartTemplates')}</Text>
        <Text style={styles.templateSectionSubtitle}>{t('programsTab.quickStartSubtitle')}</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.templateRow}>
        {PREBUILT_PROGRAMS.map((template) => (
          <TouchableOpacity
            key={template.id}
            style={styles.templateCard}
            onPress={() => handleUseTemplate(template.id)}
            activeOpacity={0.85}
          >
            <View style={styles.templateBadgeRow}>
              <Text style={styles.templateLevelBadge}>{template.level}</Text>
              <Text style={styles.templateDuration}>{t('programsTab.minutesLabel', { minutes: template.estimatedSessionMinutes })}</Text>
            </View>

            <Text style={styles.templateName} numberOfLines={1}>{template.name}</Text>
            <Text style={styles.templateDescription} numberOfLines={2}>{template.description}</Text>

            <View style={styles.templateMetaRow}>
              <Ionicons name="calendar-outline" size={13} color={colors.textSecondary} />
              <Text style={styles.templateMetaText}>{t('programsTab.daysPerWeek', { count: template.daysPerWeek })}</Text>
            </View>

            <View style={styles.templateMetaRow}>
              <Ionicons name="barbell-outline" size={13} color={colors.textSecondary} />
              <Text style={styles.templateMetaText}>{t('programsTab.totalExercises', { count: template.days.reduce((sum, day) => sum + day.exercises.length, 0) })}</Text>
            </View>

            <View style={styles.templateCtaRow}>
              <Text style={styles.templateCtaText}>{t('programsTab.useTemplate')}</Text>
              <Ionicons name="arrow-forward" size={14} color={colors.accent} />
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{t('programsTab.title')}</Text>
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
            <Text style={styles.proBadgeText}>{t('programsTab.goPro')}</Text>
          </TouchableOpacity>
        )}
      </View>

      {isLoading ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : (
        <FlatList
          data={programs}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={renderTemplateStrip}
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
            {t('programsTab.deletedProgram', { name: recentlyDeleted.name })}
          </Text>
          <TouchableOpacity onPress={handleUndoDelete} hitSlop={8}>
            <Text style={styles.undoAction}>{t('programsTab.undo')}</Text>
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
  templateSection: {
    marginBottom: spacing[4],
  },
  templateSectionHeader: {
    marginBottom: spacing[2],
  },
  templateSectionTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
  },
  templateSectionSubtitle: {
    marginTop: 2,
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
  },
  templateRow: {
    paddingVertical: spacing[1],
    paddingRight: spacing[3],
  },
  templateCard: {
    width: 220,
    marginRight: spacing[3],
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing[3],
  },
  templateBadgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing[2],
  },
  templateLevelBadge: {
    fontSize: typography.fontSize.xs,
    color: colors.accent,
    backgroundColor: 'rgba(255, 212, 179, 0.14)',
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radii.full,
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    overflow: 'hidden',
  },
  templateDuration: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
  },
  templateName: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
  },
  templateDescription: {
    marginTop: 4,
    minHeight: 34,
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  templateMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing[1],
  },
  templateMetaText: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
  },
  templateCtaRow: {
    marginTop: spacing[3],
    paddingTop: spacing[2],
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  templateCtaText: {
    fontSize: typography.fontSize.sm,
    color: colors.accent,
    fontWeight: typography.fontWeight.semibold,
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
