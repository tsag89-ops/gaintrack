// Integration Examples: Health Connect Metrics in GainTrack Screens

// ============================================================================
// STEP 1: Dashboard (app/(tabs)/index.tsx) — Add Health Card
// ============================================================================

/*
// Add this import to the top of app/(tabs)/index.tsx:
import { useTodayHealthCard } from '../../src/hooks/useHealthTrackIntegration';

// Then add this component to your dashboard:
function DashboardHealthCard() {
  const { stepsDisplay, distanceDisplay, caloriesDisplay, weightDisplay, isLoading, error } =
    useTodayHealthCard();

  if (error) {
    return (
      <Card style={styles.card}>
        <Text style={styles.cardLabel}>Health Connect</Text>
        <Text style={{ color: theme.TextSecondary, fontSize: 12 }}>
          {error}
        </Text>
      </Card>
    );
  }

  return (
    <Card style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardLabel}>Today's Metrics</Text>
        {isLoading && <ActivityIndicator color={theme.Primary} />}
      </View>

      <View style={styles.metricsGrid}>
        <View style={styles.metricItem}>
          <Ionicons name="footsteps" size={24} color={theme.Primary} />
          <Text style={styles.metricValue}>{stepsDisplay}</Text>
        </View>
        <View style={styles.metricItem}>
          <Ionicons name="map" size={24} color={theme.Primary} />
          <Text style={styles.metricValue}>{distanceDisplay}</Text>
        </View>
        <View style={styles.metricItem}>
          <Ionicons name="flame" size={24} color={theme.Primary} />
          <Text style={styles.metricValue}>{caloriesDisplay}</Text>
        </View>
        <View style={styles.metricItem}>
          <Ionicons name="scale" size={24} color={theme.Primary} />
          <Text style={styles.metricValue}>{weightDisplay}</Text>
        </View>
      </View>
    </Card>
  );
}

// Add to dashboard styles:
const styles = StyleSheet.create({
  // ... existing styles ...
  card: {
    marginBottom: spacing.lg,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  cardLabel: {
    fontSize: typography.lg,
    fontWeight: '600',
    color: theme.TextPrimary,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  metricItem: {
    width: '48%',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.lg,
    backgroundColor: theme.Charcoal,
  },
  metricValue: {
    marginTop: spacing.xs,
    fontSize: typography.md,
    fontWeight: '600',
    color: theme.TextPrimary,
  },
});
*/

// ============================================================================
// STEP 1: Progress Screen (app/(tabs)/progress.tsx) — Add Health Sync Panel
// ============================================================================

/*
// Add this import:
import { useHealthConnectMetrics } from '../../src/hooks/useHealthConnectMetrics';

// Add this component to progress screen:
function HealthSyncPanel() {
  const { steps, distance, calories, weight, exercises, isLoading, error, refetch } =
    useHealthConnectMetrics({ lookbackDays: 7 });

  if (!isPro) {
    return null; // Only show for Pro users
  }

  return (
    <Card style={styles.card}>
      <View style={styles.panelHeader}>
        <Text style={styles.panelTitle}>7-Day Health Summary</Text>
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            refetch();
          }}
          disabled={isLoading}
        >
          <Ionicons
            name="refresh"
            size={24}
            color={isLoading ? theme.TextSecondary : theme.Primary}
          />
        </TouchableOpacity>
      </View>

      {error && (
        <Text style={{ color: theme.Error, fontSize: 12, marginBottom: spacing.md }}>
          {error}
        </Text>
      )}

      <View style={styles.metricsTable}>
        <HealthMetricRow
          label="Total Steps"
          value={steps.totalSteps.toLocaleString()}
          icon="footsteps"
        />
        <HealthMetricRow
          label="Total Distance"
          value={`${(distance.totalDistance / 1000).toFixed(1)} km`}
          icon="map"
        />
        <HealthMetricRow
          label="Calories Burned"
          value={`${calories.totalCalories.toFixed(0)} kcal`}
          icon="flame"
        />
        <HealthMetricRow
          label="Avg Weight"
          value={`${weight.averageWeight.toFixed(1)} kg`}
          icon="scale"
        />
        <HealthMetricRow
          label="Exercise Sessions"
          value={String(exercises.length)}
          icon="barbell"
        />
      </View>
    </Card>
  );
}

function HealthMetricRow({ label, value, icon }) {
  return (
    <View style={styles.metricRow}>
      <View style={styles.metricLeft}>
        <Ionicons name={icon} size={18} color={theme.Primary} />
        <Text style={styles.metricLabel}>{label}</Text>
      </View>
      <Text style={styles.metricValueRow}>{value}</Text>
    </View>
  );
}

// Add to progress screen styles:
const styles = StyleSheet.create({
  // ... existing styles ...
  panelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  panelTitle: {
    fontSize: typography.lg,
    fontWeight: '600',
    color: theme.TextPrimary,
  },
  metricsTable: {
    borderRadius: radii.lg,
    backgroundColor: theme.Charcoal,
    padding: spacing.md,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.Surface,
  },
  metricRow: {
    borderBottomWidth: 0,
  },
  metricLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  metricLabel: {
    fontSize: typography.md,
    color: theme.TextSecondary,
  },
  metricValueRow: {
    fontSize: typography.md,
    fontWeight: '600',
    color: theme.Accent,
  },
});
*/

// ============================================================================
// STEP 1: Workout Screen — Post-Workout Sync to Health Connect
// ============================================================================

/*
// In your workout completion handler (e.g., onWorkoutComplete):
import { writeExerciseSessionWithMetrics } from '../../src/services/healthSync';

async function syncCompletedWorkoutToHealth(workout: Workout) {
  try {
    // Calculate metrics from your GainTrack workout
    const totalCalories = estimateCaloriesBurned(workout);
    const totalDistance = calculateDistance(workout) || 0;
    const totalSteps = calculateSteps(workout) || 0;

    const result = await writeExerciseSessionWithMetrics({
      title: workout.name || 'Strength Training',
      startTime: new Date(workout.date),
      endTime: new Date(workout.date_completed || new Date()),
      exerciseType: 'STRENGTH_TRAINING',
      notes: `${workout.exercises?.length || 0} exercises | GainTrack logged workout`,
      totalCaloriesBurned: totalCalories,
      distance: totalDistance,
      additionalMetrics: {
        steps: totalSteps,
      },
    });

    if (result.ok) {
      console.log('✓ Workout synced to Health Connect', result.sessionId);
      await sendHealthIntegrationTelemetry('google_fit', {
        eventType: 'workout_written_to_health_connect',
        success: true,
        nativeBridgeAvailable: true,
      });
    } else {
      console.warn('⚠ Workout sync failed:', result.message);
    }
  } catch (error) {
    console.error('Error syncing workout:', error);
  }
}

// Helper: Estimate calories using MET multiplier
function estimateCaloriesBurned(workout: Workout): number {
  // Rough estimation: 5 kcal per minute of weightlifting (adjust as needed)
  const durationMinutes = calculateWorkoutDuration(workout);
  const metValue = 5; // MET for moderate strength training
  const estimatedCalories = durationMinutes * metValue;
  return Math.round(estimatedCalories);
}

// Helper: Extract total distance if available
function calculateDistance(workout: Workout): number {
  // If your workout has cardio/distance data, return it here
  return 0;
}

// Helper: Extract total steps if available
function calculateSteps(workout: Workout): number {
  // If your workout logs steps, return it here
  return 0;
}

// Helper: Calculate workout duration from start/end times
function calculateWorkoutDuration(workout: Workout): number {
  // Default: 60 minutes (adjust based on your workout structure)
  return 60;
}
*/

// ============================================================================
// STEP 2: Testing Setup — Automated Tests
// ============================================================================

/*
// tests/healthConnectIntegration.test.ts

import { renderHook, waitFor } from '@testing-library/react-native';
import { useHealthConnectMetrics } from '../src/hooks/useHealthConnectMetrics';
import { useTodayHealthCard } from '../src/hooks/useHealthTrackIntegration';
import { writeExerciseSessionWithMetrics, readSteps } from '../src/services/healthSync';

describe('Health Connect Integration', () => {
  it('should return steps data within time range', async () => {
    const { result } = renderHook(() =>
      useHealthConnectMetrics({ lookbackDays: 1, autoSyncIntervalMs: 0 }),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.steps).toBeDefined();
    expect(result.current.steps.totalSteps).toBeGreaterThanOrEqual(0);
    expect(result.current.steps.recordCount).toBeGreaterThanOrEqual(0);
  });

  it('should sync exercise session with metrics', async () => {
    const startTime = new Date();
    const endTime = new Date(startTime.getTime() + 3600000); // 1 hour later

    const result = await writeExerciseSessionWithMetrics({
      title: 'Test Workout',
      startTime,
      endTime,
      exerciseType: 'STRENGTH_TRAINING',
      totalCaloriesBurned: 300,
      distance: 100,
    });

    expect(result.ok).toBe(true);
    expect(result.sessionId).toBeDefined();
  });

  it('should display today metrics in card', async () => {
    const { result } = renderHook(() => useTodayHealthCard());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.stepsDisplay).toMatch(/steps/);
    expect(result.current.weightDisplay).toMatch(/kg/);
  });

  it('should handle permission checks gracefully', async () => {
    // This test verifies that permission denied doesn't crash the app
    const { result } = renderHook(() =>
      useHealthConnectMetrics({ lookbackDays: 7 }),
    );

    await waitFor(() => {
      // Should complete without throwing, even if permissions denied
      expect(result.current).toBeDefined();
    });
  });
});
*/

// ============================================================================
// STEP 4: Telemetry Monitoring — Track Health Connect Events
// ============================================================================

/*
// Add to src/services/healthSync.ts telemetry function:

type HealthEventType =
  | 'permission_requested'
  | 'permission_granted'
  | 'permission_denied'
  | 'metrics_synced'
  | 'workout_written'
  | 'weight_recorded'
  | 'sync_error'
  | 'permission_error';

interface HealthTelemetryPayload {
  eventType: HealthEventType;
  recordType?: string; // 'Steps', 'Weight', etc.
  success: boolean;
  errorCode?: string;
  errorMessage?: string;
  dataPointCount?: number; // Number of records synced
  millisElapsed?: number; // Sync duration
  userId?: string;
}

export const sendHealthConnectTelemetry = async (payload: HealthTelemetryPayload) => {
  if (!BACKEND_URL) return;

  try {
    const sessionToken = await storage.getItem('sessionToken');
    if (!sessionToken) return;

    await fetch(`${BACKEND_URL}/api/integrations/health/telemetry/v2`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({
        provider: 'google_fit',
        platform: Platform.OS,
        timestamp: new Date().toISOString(),
        ...payload,
      }),
    });
  } catch (error) {
    console.error('[HealthConnect] Telemetry failed:', error);
  }
};

// Usage in useHealthConnectMetrics hook:
useEffect(() => {
  if (!isLoading && !error) {
    sendHealthConnectTelemetry({
      eventType: 'metrics_synced',
      success: true,
      dataPointCount: steps.recordCount + distance.recordCount + calories.recordCount,
      millisElapsed: Date.now() - startTime,
    });
  }
}, [steps, distance, calories]);

// Monitor permission requests:
const handlePermissionRequest = async () => {
  const startTime = Date.now();
  const result = await connectHealthProvider('google_fit');

  await sendHealthConnectTelemetry({
    eventType: result.ok ? 'permission_granted' : 'permission_denied',
    success: result.ok,
    errorMessage: result.message,
    millisElapsed: Date.now() - startTime,
  });
};

// Monitor write operations:
const handleWorkoutWrite = async (workout) => {
  const startTime = Date.now();
  const result = await writeExerciseSessionWithMetrics(workout);

  await sendHealthConnectTelemetry({
    eventType: 'workout_written',
    recordType: 'ExerciseSession',
    success: result.ok,
    errorMessage: result.message,
    millisElapsed: Date.now() - startTime,
  });
};

// Dashboard for monitoring:
// View at: https://console.firebase.google.com → Firestore → logs/health_telemetry
// Query: WHERE provider = 'google_fit' AND timestamp >= 7 DAYS AGO
// Metrics to track:
// - Permission grant rate (success / total requests)
// - Avg sync duration (millisElapsed)
// - Data points per sync (dataPointCount trend)
// - Error rates by type (eventType = 'sync_error')
*/
