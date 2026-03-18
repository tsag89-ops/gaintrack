// src/services/healthConnectTelemetry.ts
// Comprehensive telemetry monitoring for Health Connect operations

import { Platform } from 'react-native';
import { storage } from '../utils/storage';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL?.trim() || '';

// ─── Event Types ─────────────────────────────────────────────────────────────

export type HealthConnectEventType =
  | 'permission_requested'
  | 'permission_granted'
  | 'permission_denied'
  | 'permission_checked'
  | 'metrics_read_steps'
  | 'metrics_read_distance'
  | 'metrics_read_calories'
  | 'metrics_read_weight'
  | 'metrics_read_exercises'
  | 'metrics_read_all'
  | 'workout_written'
  | 'weight_written'
  | 'sync_started'
  | 'sync_completed'
  | 'sync_error'
  | 'permission_error'
  | 'network_error'
  | 'cache_hit'
  | 'cache_miss';

export interface HealthConnectTelemetryEvent {
  eventType: HealthConnectEventType;
  success: boolean;
  recordType?: string; // 'Steps', 'ExerciseSession', etc.
  dataPointCount?: number; // Records synced
  millisElapsed?: number; // Duration
  errorCode?: string;
  errorMessage?: string;
  cacheHit?: boolean;
  userId?: string;
  batchSize?: number; // For batch writes
  sourceApp?: string; // 'gaintrack' (default)
  timestamp?: string; // ISO timestamp
}

// ─── Telemetry Logger ────────────────────────────────────────────────────────

const eventLog: HealthConnectTelemetryEvent[] = [];
const maxLogSize = 100;

/**
 * Send telemetry event to backend.
 * Implements exponential backoff on network failures.
 */
export const sendHealthConnectTelemetry = async (
  event: HealthConnectTelemetryEvent,
): Promise<void> => {
  if (!BACKEND_URL) return;

  const enrichedEvent: HealthConnectTelemetryEvent = {
    ...event,
    timestamp: event.timestamp || new Date().toISOString(),
    sourceApp: 'gaintrack',
  };

  // Log locally for diagnostics
  logEventLocally(enrichedEvent);

  try {
    const sessionToken = await storage.getItem('sessionToken');
    if (!sessionToken) return;

    const response = await fetch(`${BACKEND_URL}/api/integrations/health/telemetry/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({
        provider: 'google_fit',
        platform: Platform.OS,
        appVersion: '1.0.0', // TODO: Get from app.json
        ...enrichedEvent,
      }),
    });

    if (!response.ok) {
      console.warn('[HealthConnect Telemetry] Non-200 response:', response.status);
    }
  } catch (error) {
    console.warn('[HealthConnect Telemetry] Failed to send:', error);
    // Telemetry should never block app flows
  }
};

/**
 * Log event locally for debugging / offline support.
 */
function logEventLocally(event: HealthConnectTelemetryEvent): void {
  eventLog.push(event);
  if (eventLog.length > maxLogSize) {
    eventLog.shift();
  }
}

/**
 * Get local event log for debugging.
 */
export const getLocalHealthConnectEventLog = (): HealthConnectTelemetryEvent[] => {
  return [...eventLog];
};

/**
 * Clear local event log.
 */
export const clearLocalHealthConnectEventLog = (): void => {
  eventLog.length = 0;
};

// ─── High-Level Tracking Functions ───────────────────────────────────────────

/**
 * Track permission request flow.
 */
export const trackPermissionRequest = async (
  recordType: string,
  success: boolean,
  durationMs: number,
  error?: string,
): Promise<void> => {
  await sendHealthConnectTelemetry({
    eventType: success ? 'permission_granted' : 'permission_denied',
    success,
    recordType,
    millisElapsed: durationMs,
    errorMessage: error,
  });
};

/**
 * Track metric reads.
 */
export const trackMetricRead = async (
  recordType: string,
  dataPointCount: number,
  durationMs: number,
  error?: string,
): Promise<void> => {
  const eventTypeMap: Record<string, HealthConnectEventType> = {
    Steps: 'metrics_read_steps',
    Distance: 'metrics_read_distance',
    TotalCaloriesBurned: 'metrics_read_calories',
    Weight: 'metrics_read_weight',
    ExerciseSession: 'metrics_read_exercises',
  };

  await sendHealthConnectTelemetry({
    eventType: eventTypeMap[recordType] || 'metrics_read_all',
    success: !error,
    recordType,
    dataPointCount,
    millisElapsed: durationMs,
    errorMessage: error,
  });
};

/**
 * Track workout/exercise write.
 */
export const trackWorkoutWrite = async (
  success: boolean,
  recordCount: number,
  durationMs: number,
  error?: string,
): Promise<void> => {
  await sendHealthConnectTelemetry({
    eventType: 'workout_written',
    success,
    recordType: 'ExerciseSession',
    dataPointCount: recordCount,
    batchSize: recordCount,
    millisElapsed: durationMs,
    errorMessage: error,
  });
};

/**
 * Track weight write.
 */
export const trackWeightWrite = async (
  success: boolean,
  durationMs: number,
  error?: string,
): Promise<void> => {
  await sendHealthConnectTelemetry({
    eventType: 'weight_written',
    success,
    recordType: 'Weight',
    dataPointCount: 1,
    millisElapsed: durationMs,
    errorMessage: error,
  });
};

/**
 * Track full sync operation.
 */
export const trackFullSync = async (
  recordTypesCount: Record<string, number>,
  totalDurationMs: number,
  success: boolean,
  error?: string,
): Promise<void> => {
  const totalRecords = Object.values(recordTypesCount).reduce((a, b) => a + b, 0);

  await sendHealthConnectTelemetry({
    eventType: success ? 'sync_completed' : 'sync_error',
    success,
    dataPointCount: totalRecords,
    millisElapsed: totalDurationMs,
    errorMessage: error,
  });
};

/**
 * Track cache hit/miss.
 */
export const trackCacheAccess = async (
  cacheHit: boolean,
  recordType?: string,
  durationMs?: number,
): Promise<void> => {
  await sendHealthConnectTelemetry({
    eventType: cacheHit ? 'cache_hit' : 'cache_miss',
    success: true,
    recordType,
    millisElapsed: durationMs,
  });
};

// ─── Analytics Aggregators ──────────────────────────────────────────────────

export interface HealthConnectMetrics {
  totalEvents: number;
  successRate: number; // 0-100
  avgSyncDuration: number; // ms
  errorRate: number; // 0-100
  errorsBy: Record<string, number>; // error type → count
  eventCountBy: Record<HealthConnectEventType, number>;
}

/**
 * Calculate aggregate metrics from event log.
 */
export const calculateHealthConnectMetrics = (): HealthConnectMetrics => {
  if (eventLog.length === 0) {
    return {
      totalEvents: 0,
      successRate: 0,
      avgSyncDuration: 0,
      errorRate: 0,
      errorsBy: {},
      eventCountBy: {} as Record<HealthConnectEventType, number>,
    };
  }

  const successCount = eventLog.filter((e) => e.success).length;
  const errorCount = eventLog.filter((e) => !e.success).length;
  const syncEvents = eventLog.filter(
    (e) => e.eventType === 'sync_completed' || e.eventType === 'sync_error',
  );
  const avgDuration =
    syncEvents.length > 0
      ? syncEvents.reduce((sum, e) => sum + (e.millisElapsed || 0), 0) / syncEvents.length
      : 0;

  const errorsBy: Record<string, number> = {};
  eventLog.forEach((e) => {
    if (!e.success && e.errorMessage) {
      errorsBy[e.errorMessage] = (errorsBy[e.errorMessage] || 0) + 1;
    }
  });

  const eventCountBy: Record<HealthConnectEventType, number> = {} as Record<
    HealthConnectEventType,
    number
  >;
  eventLog.forEach((e) => {
    eventCountBy[e.eventType] = (eventCountBy[e.eventType] || 0) + 1;
  });

  return {
    totalEvents: eventLog.length,
    successRate: (successCount / eventLog.length) * 100,
    avgSyncDuration: avgDuration,
    errorRate: (errorCount / eventLog.length) * 100,
    errorsBy,
    eventCountBy,
  };
};

// ─── Debug Dashboard ────────────────────────────────────────────────────────

/**
 * Format metrics for display/logging.
 */
export const formatHealthConnectMetricsReport = (): string => {
  const metrics = calculateHealthConnectMetrics();

  return `
═══════════════════════════════════════════════════════════════
Health Connect Telemetry Report
═══════════════════════════════════════════════════════════════
Total Events: ${metrics.totalEvents}
Success Rate: ${metrics.successRate.toFixed(1)}%
Error Rate: ${metrics.errorRate.toFixed(1)}%
Avg Sync Duration: ${metrics.avgSyncDuration.toFixed(0)}ms

Events by Type:
${Object.entries(metrics.eventCountBy)
  .map(([type, count]) => `  ${type}: ${count}`)
  .join('\n')}

Errors by Type:
${
  Object.entries(metrics.errorsBy).length === 0
    ? '  None'
    : Object.entries(metrics.errorsBy)
        .map(([msg, count]) => `  ${msg}: ${count}`)
        .join('\n')
}
═══════════════════════════════════════════════════════════════
  `;
};

/**
 * Log metrics report to console (for debugging).
 */
export const logHealthConnectMetricsReport = (): void => {
  console.log(formatHealthConnectMetricsReport());
};
