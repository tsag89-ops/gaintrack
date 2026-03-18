# Step 4: Telemetry Monitoring — Implementation Guide

## Overview
Monitor Health Connect operations with detailed telemetry tracking. This guide shows how to integrate telemetry into existing read/write helpers and set up dashboards.

---

## Quick Start: Add Tracking to Read Helpers

### Before (Original readSteps)
```typescript
export const readSteps = async (timeRange: TimeRange): Promise<StepsData> => {
  if (Platform.OS !== 'android') {
    return { totalSteps: 0, recordCount: 0, averageStepsPerRecord: 0 };
  }

  try {
    const healthConnect = require('react-native-health-connect');
    const hasPermission = await isHealthConnectPermissionGranted(HealthConnectRecordType.Steps, 'read');
    if (!hasPermission) {
      throw new Error('Steps read permission not granted');
    }

    const result = await healthConnect.readRecords(HealthConnectRecordType.Steps, {
      timeRangeFilter: {
        operator: 'between',
        startTime: timeRange.startTime.toISOString(),
        endTime: timeRange.endTime.toISOString(),
      },
    });

    const records = Array.isArray(result?.records) ? result.records : [];
    const totalSteps = records.reduce((sum: number, record: any) => {
      const count = Number(record?.count ?? 0);
      return Number.isFinite(count) ? sum + count : sum;
    }, 0);

    return {
      totalSteps,
      recordCount: records.length,
      averageStepsPerRecord: records.length > 0 ? totalSteps / records.length : 0,
    };
  } catch (error: any) {
    console.error('[HealthConnect] Error reading steps:', error?.message);
    return { totalSteps: 0, recordCount: 0, averageStepsPerRecord: 0 };
  }
};
```

### After (With Telemetry)
```typescript
import { trackMetricRead } from '../services/healthConnectTelemetry';

export const readSteps = async (timeRange: TimeRange): Promise<StepsData> => {
  if (Platform.OS !== 'android') {
    return { totalSteps: 0, recordCount: 0, averageStepsPerRecord: 0 };
  }

  const startTime = Date.now();
  let error: string | undefined;

  try {
    const healthConnect = require('react-native-health-connect');
    const hasPermission = await isHealthConnectPermissionGranted(HealthConnectRecordType.Steps, 'read');
    if (!hasPermission) {
      throw new Error('Steps read permission not granted');
    }

    const result = await healthConnect.readRecords(HealthConnectRecordType.Steps, {
      timeRangeFilter: {
        operator: 'between',
        startTime: timeRange.startTime.toISOString(),
        endTime: timeRange.endTime.toISOString(),
      },
    });

    const records = Array.isArray(result?.records) ? result.records : [];
    const totalSteps = records.reduce((sum: number, record: any) => {
      const count = Number(record?.count ?? 0);
      return Number.isFinite(count) ? sum + count : sum;
    }, 0);

    const durationMs = Date.now() - startTime;
    
    // Track successful read
    await trackMetricRead('Steps', records.length, durationMs);

    return {
      totalSteps,
      recordCount: records.length,
      averageStepsPerRecord: records.length > 0 ? totalSteps / records.length : 0,
    };
  } catch (err: any) {
    error = err?.message;
    const durationMs = Date.now() - startTime;
    
    // Track failed read
    await trackMetricRead('Steps', 0, durationMs, error);
    
    console.error('[HealthConnect] Error reading steps:', error);
    return { totalSteps: 0, recordCount: 0, averageStepsPerRecord: 0 };
  }
};
```

---

## Add Tracking to Write Helpers

### Before (Original writeExerciseSessionWithMetrics)
```typescript
export const writeExerciseSessionWithMetrics = async (
  params: WriteExerciseSessionParams,
): Promise<{ ok: boolean; sessionId?: string; message: string }> => {
  if (Platform.OS !== 'android') {
    return { ok: false, message: 'Exercise session writing only supported on Android' };
  }

  try {
    const healthConnect = require('react-native-health-connect');
    const hasExercisePermission = await isHealthConnectPermissionGranted(
      HealthConnectRecordType.ExerciseSession,
      'write',
    );

    if (!hasExercisePermission) {
      throw new Error('ExerciseSession write permission not granted');
    }

    // ... build records ...
    
    const result = await healthConnect.insertRecords(recordsToInsert);
    const sessionId = Array.isArray(result) ? result[0] : result?.id;

    return {
      ok: true,
      sessionId,
      message: `Exercise session and ${recordsToInsert.length - 1} associated metrics uploaded.`,
    };
  } catch (error: any) {
    console.error('[HealthConnect] Error writing exercise session:', error?.message);
    return {
      ok: false,
      message: `Failed to write exercise session: ${error?.message}`,
    };
  }
};
```

### After (With Telemetry)
```typescript
import { trackWorkoutWrite } from '../services/healthConnectTelemetry';

export const writeExerciseSessionWithMetrics = async (
  params: WriteExerciseSessionParams,
): Promise<{ ok: boolean; sessionId?: string; message: string }> => {
  if (Platform.OS !== 'android') {
    return { ok: false, message: 'Exercise session writing only supported on Android' };
  }

  const startTime = Date.now();
  let recordCount = 0;

  try {
    const healthConnect = require('react-native-health-connect');
    const hasExercisePermission = await isHealthConnectPermissionGranted(
      HealthConnectRecordType.ExerciseSession,
      'write',
    );

    if (!hasExercisePermission) {
      throw new Error('ExerciseSession write permission not granted');
    }

    // ... build records ...
    recordCount = recordsToInsert.length;
    
    const result = await healthConnect.insertRecords(recordsToInsert);
    const sessionId = Array.isArray(result) ? result[0] : result?.id;

    const durationMs = Date.now() - startTime;
    
    // Track successful write
    await trackWorkoutWrite(true, recordCount, durationMs);

    return {
      ok: true,
      sessionId,
      message: `Exercise session and ${recordsToInsert.length - 1} associated metrics uploaded.`,
    };
  } catch (error: any) {
    const durationMs = Date.now() - startTime;
    
    // Track failed write
    await trackWorkoutWrite(false, recordCount, durationMs, error?.message);
    
    console.error('[HealthConnect] Error writing exercise session:', error?.message);
    return {
      ok: false,
      message: `Failed to write exercise session: ${error?.message}`,
    };
  }
};
```

---

## Integrate into useHealthConnectMetrics Hook

```typescript
// In src/hooks/useHealthConnectMetrics.ts

import { trackFullSync, trackCacheAccess } from '../services/healthConnectTelemetry';

export const useHealthConnectMetrics = (options: UseHealthConnectMetricsOptions = {}) => {
  // ... existing code ...

  const refetch = useCallback(async () => {
    if (Platform.OS !== 'android') {
      setSnapshot((prev) => ({...prev, error: 'Health Connect metrics only available on Android'}));
      return;
    }

    setSnapshot((prev) => ({ ...prev, isLoading: true, error: null }));
    const syncStartTime = Date.now();
    const recordTypesCount: Record<string, number> = {};

    try {
      const timeRange = calculateTimeRange(lookbackDays);
      const permissions = await getAllGrantedPermissions();
      
      if (permissions.length === 0) {
        throw new Error('No Health Connect permissions granted');
      }

      // Fetch all metrics in parallel
      const [stepsData, distanceData, caloriesData, weightData, exerciseData] = await Promise.all(
        [
          readSteps(timeRange),
          readDistance(timeRange),
          readTotalCalories(timeRange),
          readWeight(timeRange),
          readExerciseSessions(timeRange),
        ],
      );

      // Track counts
      recordTypesCount['Steps'] = stepsData.recordCount;
      recordTypesCount['Distance'] = distanceData.recordCount;
      recordTypesCount['TotalCaloriesBurned'] = caloriesData.recordCount;
      recordTypesCount['Weight'] = weightData.recordCount;
      recordTypesCount['ExerciseSession'] = exerciseData.length;

      const syncDurationMs = Date.now() - syncStartTime;

      // Track full sync
      await trackFullSync(recordTypesCount, syncDurationMs, true);

      setSnapshot({
        timestamp: new Date(),
        steps: stepsData,
        distance: distanceData,
        calories: caloriesData,
        weight: weightData,
        exercises: exerciseData,
        isLoading: false,
        error: null,
      });
    } catch (error: any) {
      const syncDurationMs = Date.now() - syncStartTime;
      
      // Track failed sync
      await trackFullSync(recordTypesCount, syncDurationMs, false, error?.message);
      
      console.error('[useHealthConnectMetrics] Sync error:', error?.message);
      setSnapshot((prev) => ({
        ...prev,
        isLoading: false,
        error: error?.message ?? 'Failed to sync health metrics',
      }));
    }
  }, [lookbackDays, calculateTimeRange]);

  // ... rest of hook ...
};
```

---

## Debug Dashboard Implementation

```typescript
// src/screens/HealthDebugDashboard.tsx (Developer-only screen)

import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  getLocalHealthConnectEventLog,
  calculateHealthConnectMetrics,
  formatHealthConnectMetricsReport,
  logHealthConnectMetricsReport,
  clearLocalHealthConnectEventLog,
} from '../services/healthConnectTelemetry';

export const HealthDebugDashboard = () => {
  const [metrics, setMetrics] = useState(null);

  useEffect(() => {
    // Refresh metrics every 5 seconds
    const interval = setInterval(() => {
      const newMetrics = calculateHealthConnectMetrics();
      setMetrics(newMetrics);
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const handleLogReport = () => {
    logHealthConnectMetricsReport();
    console.log('Report logged to console');
  };

  const handleClearLogs = () => {
    clearLocalHealthConnectEventLog();
    setMetrics(null);
  };

  if (!metrics) return null;

  return (
    <SafeAreaView>
      <ScrollView style={{ padding: 16 }}>
        <Text style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 12 }}>
          Health Connect Debug
        </Text>

        <View
          style={{
            backgroundColor: '#f0f0f0',
            padding: 12,
            borderRadius: 8,
            marginBottom: 12,
          }}
        >
          <Text>Total Events: {metrics.totalEvents}</Text>
          <Text>Success Rate: {metrics.successRate.toFixed(1)}%</Text>
          <Text>Error Rate: {metrics.errorRate.toFixed(1)}%</Text>
          <Text>Avg Sync Duration: {metrics.avgSyncDuration.toFixed(0)}ms</Text>
        </View>

        <TouchableOpacity
          onPress={handleLogReport}
          style={{
            backgroundColor: '#0066cc',
            padding: 12,
            borderRadius: 6,
            marginBottom: 12,
          }}
        >
          <Text style={{ color: 'white', fontWeight: '600' }}>Log Full Report</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleClearLogs}
          style={{
            backgroundColor: '#cc0000',
            padding: 12,
            borderRadius: 6,
          }}
        >
          <Text style={{ color: 'white', fontWeight: '600' }}>Clear Logs</Text>
        </TouchableOpacity>

        <Text style={{ marginTop: 20, fontSize: 14, color: '#666' }}>
          Event Log ({getLocalHealthConnectEventLog().length} events):
        </Text>
        {getLocalHealthConnectEventLog().map((event, i) => (
          <View
            key={i}
            style={{
              padding: 8,
              marginTop: 8,
              backgroundColor: event.success ? '#e8f5e9' : '#ffebee',
              borderRadius: 4,
            }}
          >
            <Text style={{ fontSize: 12 }}>
              {event.eventType} - {event.success ? '✓' : '✗'}
            </Text>
            {event.millisElapsed && (
              <Text style={{ fontSize: 11, color: '#666' }}>
                {event.millisElapsed}ms
              </Text>
            )}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
};
```

---

## Backend Endpoint Setup (Optional)

If you want to persist telemetry events, configure your backend:

```python
# Backend API (pseudocode)

@router.post("/api/integrations/health/telemetry/events")
async def log_health_telemetry(request: Request, payload: HealthTelemetryPayload):
    """
    Log Health Connect events to database for analytics.
    
    Query examples:
    - SELECT COUNT(*) WHERE eventType = 'sync_completed' AND success = true
    - SELECT AVG(millisElapsed) WHERE eventType = 'sync_completed'
    - SELECT errorMessage, COUNT(*) WHERE eventType = 'sync_error' GROUP BY errorMessage
    """
    
    # Store event
    await db.health_telemetry.insert_one({
        'user_id': request.state.user_id,
        'provider': payload.provider,
        'platform': payload.platform,
        'event_type': payload.eventType,
        'success': payload.success,
        'data_point_count': payload.dataPointCount,
        'duration_ms': payload.millisElapsed,
        'error_message': payload.errorMessage,
        'timestamp': datetime.fromisoformat(payload.timestamp),
    })
    
    return {'ok': True}
```

---

## Monitoring Queries

```sql
-- Success rate over time
SELECT 
  DATE(timestamp) as date,
  ROUND(SUM(CASE WHEN success = true THEN 1 ELSE 0 END) / COUNT(*) * 100, 2) as success_rate
FROM health_telemetry
WHERE eventType IN ('sync_completed', 'sync_error')
GROUP BY DATE(timestamp)
ORDER BY date DESC
LIMIT 30;

-- Average sync duration by day
SELECT 
  DATE(timestamp) as date,
  ROUND(AVG(duration_ms), 0) as avg_duration_ms,
  COUNT(*) as sync_count
FROM health_telemetry
WHERE eventType = 'sync_completed'
GROUP BY DATE(timestamp)
ORDER BY date DESC;

-- Top errors encountered
SELECT 
  error_message,
  COUNT(*) as count,
  ROUND(SUM(CASE WHEN success = true THEN 1 ELSE 0 END) / COUNT(*) * 100, 2) as failure_rate
FROM health_telemetry
WHERE error_message IS NOT NULL
GROUP BY error_message
ORDER BY count DESC;

-- Performance metrics by record type
SELECT 
  recordType,
  COUNT(*) as read_count,
  ROUND(AVG(duration_ms), 0) as avg_duration_ms,
  ROUND(AVG(dataPointCount), 0) as avg_records_per_read
FROM health_telemetry
WHERE eventType LIKE 'metrics_read%'
GROUP BY recordType;
```

---

## Integration Checklist

- [ ] Import `trackMetricRead` and `trackWorkoutWrite` in healthSync.ts
- [ ] Wrap all read operations with tracking
- [ ] Wrap all write operations with tracking
- [ ] Add telemetry to `useHealthConnectMetrics` hook
- [ ] Create debug dashboard screen
- [ ] Test telemetry events in local event log
- [ ] Set up backend endpoint for persistence
- [ ] Create Grafana/Datadog dashboard for monitoring
- [ ] Add alerts for error rate > 10%
- [ ] Add alerts for avg sync duration > 5000ms

---

**Status:** ✓ Telemetry Framework Complete  
**Next:** Deploy and monitor in production
