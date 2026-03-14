// app/(tabs)/progress/ProgressOverviewScreen.tsx
// Weekly training volume overview — 8-week total & per-muscle-group breakdown.
//
// [PRO] Both charts are Pro-only. Free users see an upsell card.
// Charts powered by react-native-chart-kit (charts-agent.md conventions).
// Data from AsyncStorage via useWorkoutVolume hook (offline-first).

import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BarChart } from 'react-native-chart-kit';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { colors, typography, spacing, radii } from '../../../src/constants/theme';
import { usePro } from '../../../src/hooks/usePro';
import { useWorkoutVolume } from '../../../src/hooks/useWorkoutVolume';

// ── Constants ─────────────────────────────────────────────────────────────────

const SCREEN_W = Dimensions.get('window').width;
const CHART_WIDTH = SCREEN_W - spacing[4] * 2; // full-width minus horizontal padding

/** Shared chart config (charts-agent.md pattern) */
const CHART_CONFIG = {
  backgroundColor:        colors.surface,
  backgroundGradientFrom: colors.surface,
  backgroundGradientTo:   colors.charcoal,
  decimalPlaces:          0,
  color:                  (opacity = 1) => `rgba(255, 98, 0, ${opacity})`,
  labelColor:             (opacity = 1) => `rgba(176, 176, 176, ${opacity})`,
  barPercentage:          0.6,
  style:                  { borderRadius: radii.md },
  propsForBackgroundLines: { strokeDasharray: '', stroke: colors.divider },
} as const;

// ── Sub-components ────────────────────────────────────────────────────────────

/** Shown while data loads */
function LoadingState() {
  return (
    <View style={styles.centeredState}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.stateText}>Loading volume data…</Text>
    </View>
  );
}

/** Shown on AsyncStorage read error */
function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={styles.centeredState}>
      <Ionicons name="alert-circle-outline" size={40} color={colors.error} />
      <Text style={styles.stateText}>Could not load data.</Text>
      <TouchableOpacity style={styles.retryBtn} onPress={onRetry}>
        <Text style={styles.retryText}>Try Again</Text>
      </TouchableOpacity>
    </View>
  );
}

/** [PRO] Upsell card — replaces both charts for free users */
function ProUpsellCard() {
  const router = useRouter();

  const handleUpgrade = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push('/pro-paywall' as any);
  }, [router]);

  return (
    <View style={styles.proGate}>
      <View style={styles.proGateIconWrap}>
        <Ionicons name="lock-closed" size={28} color={colors.primary} />
      </View>
      <Text style={styles.proGateTitle}>Volume Analytics</Text>
      <Text style={styles.proGateBody}>
        Track weekly training volume and muscle-group breakdown with GainTrack Pro.
      </Text>
      <TouchableOpacity
        style={styles.proGateBtn}
        activeOpacity={0.85}
        onPress={handleUpgrade}
      >
        <Ionicons name="flash" size={14} color={colors.background} />
        <Text style={styles.proGateBtnText}>Upgrade — $4.99/yr</Text>
      </TouchableOpacity>
    </View>
  );
}

/** Chart section wrapper with title */
function ChartSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

/** Shown when a chart has no data yet */
function EmptyChart({ message }: { message: string }) {
  return (
    <View style={styles.emptyChart}>
      <Ionicons name="bar-chart-outline" size={36} color={colors.textDisabled} />
      <Text style={styles.emptyChartText}>{message}</Text>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function ProgressOverviewScreen() {
  const { isPro, loading: proLoading } = usePro();
  const { volumeData, loading: dataLoading, error, refresh } = useWorkoutVolume();

  const isLoading = proLoading || dataLoading;

  // ── Render ────────────────────────────────────────────────────────────────

  function renderContent() {
    if (isLoading) return <LoadingState />;
    if (error)     return <ErrorState onRetry={refresh} />;

    // [PRO] gate — free users never see chart data
    if (!isPro) return <ProUpsellCard />;

    const { weekly, muscleGroup } = volumeData ?? {
      weekly:      { labels: [], data: [] },
      muscleGroup: { labels: [], data: [] },
    };

    const hasWeeklyData      = weekly.data.some((v) => v > 0);
    const hasMuscleGroupData = muscleGroup.data.length > 0;

    return (
      <>
        {/* ── Chart 1: Weekly Total Volume ── */}
        <ChartSection title="Weekly Total Volume (Last 8 Weeks)">
          {hasWeeklyData ? (
            <BarChart
              data={{
                labels:   weekly.labels,
                datasets: [{ data: weekly.data }],
              }}
              width={CHART_WIDTH}
              height={220}
              yAxisSuffix=" kg"
              yAxisLabel=""
              chartConfig={CHART_CONFIG}
              style={styles.chart}
              withInnerLines={false}
              showValuesOnTopOfBars={false}
              fromZero
            />
          ) : (
            <EmptyChart message="Log workouts to see your weekly volume trend." />
          )}
        </ChartSection>

        {/* ── Chart 2: Per-Muscle-Group Volume (This Week) ── */}
        <ChartSection title="This Week — Volume by Muscle Group">
          {hasMuscleGroupData ? (
            <BarChart
              data={{
                labels:   muscleGroup.labels,
                datasets: [{ data: muscleGroup.data }],
              }}
              width={CHART_WIDTH}
              height={220}
              yAxisSuffix=" kg"
              yAxisLabel=""
              chartConfig={CHART_CONFIG}
              style={styles.chart}
              withInnerLines={false}
              showValuesOnTopOfBars
              fromZero
              verticalLabelRotation={muscleGroup.labels.length > 4 ? 30 : 0}
            />
          ) : (
            <EmptyChart message="No workouts logged this week yet." />
          )}
        </ChartSection>
      </>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={dataLoading && !isLoading}
            onRefresh={refresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Volume Overview</Text>
          <Text style={styles.headerSubtitle}>Sets × Reps × Weight per week</Text>
        </View>

        {renderContent()}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
    flex:            1,
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing[4],
    paddingBottom:     spacing[8],
  },

  // ── Header ────────────────────────────────────────────────────────────────
  header: {
    paddingTop:    spacing[4],
    paddingBottom: spacing[3],
  },
  headerTitle: {
    color:      colors.textPrimary,
    fontSize:   typography.fontSize.md + 4, // 20 sp
    fontWeight: '700',
    letterSpacing: typography.letterSpacing.tight,
  },
  headerSubtitle: {
    color:     colors.textSecondary,
    fontSize:  typography.fontSize.sm,
    marginTop: spacing[1],
  },

  // ── Sections ─────────────────────────────────────────────────────────────
  section: {
    backgroundColor: colors.surface,
    borderRadius:    radii.lg,
    padding:         spacing[4],
    marginBottom:    spacing[4],
  },
  sectionTitle: {
    color:         colors.textPrimary,
    fontSize:      typography.fontSize.base,
    fontWeight:    '600',
    marginBottom:  spacing[3],
  },

  // ── Chart ─────────────────────────────────────────────────────────────────
  chart: {
    borderRadius: radii.md,
    marginLeft:   -spacing[2], // compensate chart-kit internal padding
  },

  // ── Empty chart ───────────────────────────────────────────────────────────
  emptyChart: {
    height:         160,
    alignItems:     'center',
    justifyContent: 'center',
    gap:            spacing[2],
  },
  emptyChartText: {
    color:     colors.textSecondary,
    fontSize:  typography.fontSize.sm,
    textAlign: 'center',
  },

  // ── Centered state (loading / error) ─────────────────────────────────────
  centeredState: {
    paddingTop:     spacing[12],
    alignItems:     'center',
    justifyContent: 'center',
    gap:            spacing[3],
  },
  stateText: {
    color:    colors.textSecondary,
    fontSize: typography.fontSize.base,
  },
  retryBtn: {
    paddingHorizontal: spacing[5],
    paddingVertical:   spacing[2],
    backgroundColor:   colors.surface,
    borderRadius:      radii.md,
  },
  retryText: {
    color:      colors.primary,
    fontWeight: '600',
    fontSize:   typography.fontSize.base,
  },

  // ── [PRO] Upsell card ─────────────────────────────────────────────────────
  proGate: {
    backgroundColor: colors.surface,
    borderRadius:    radii.lg,
    padding:         spacing[6],
    alignItems:      'center',
    marginTop:       spacing[4],
    gap:             spacing[3],
  },
  proGateIconWrap: {
    width:           56,
    height:          56,
    borderRadius:    radii.full,
    backgroundColor: colors.primaryMuted,
    alignItems:      'center',
    justifyContent:  'center',
  },
  proGateTitle: {
    color:      colors.textPrimary,
    fontSize:   typography.fontSize.md + 2,
    fontWeight: '700',
    textAlign:  'center',
  },
  proGateBody: {
    color:     colors.textSecondary,
    fontSize:  typography.fontSize.base,
    textAlign: 'center',
    lineHeight: 22,
  },
  proGateBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    backgroundColor:   colors.primary,
    paddingHorizontal: spacing[6],
    paddingVertical:   spacing[3],
    borderRadius:      radii.full,
    gap:               spacing[1],
    marginTop:         spacing[2],
  },
  proGateBtnText: {
    color:      colors.background,
    fontWeight: '700',
    fontSize:   typography.fontSize.base,
  },
});
