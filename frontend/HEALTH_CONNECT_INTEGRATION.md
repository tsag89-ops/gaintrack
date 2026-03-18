# Android Health Connect Integration Guide

## Overview
This integration provides full read + write support for Google Health Connect on Android (API 26+) with comprehensive TypeScript helpers and React hooks.

## Configuration Complete ✓

### 1. Android Permissions (AndroidManifest.xml)
All required Health Connect permissions are now declared:
```xml
<!-- Read/Write Permissions for Health Connect Record Types -->
<uses-permission android:name="android.permission.health.READ_STEPS"/>
<uses-permission android:name="android.permission.health.WRITE_STEPS"/>
<uses-permission android:name="android.permission.health.READ_DISTANCE"/>
<uses-permission android:name="android.permission.health.WRITE_DISTANCE"/>
<uses-permission android:name="android.permission.health.READ_TOTAL_CALORIES_BURNED"/>
<uses-permission android:name="android.permission.health.WRITE_TOTAL_CALORIES_BURNED"/>
<uses-permission android:name="android.permission.health.READ_WEIGHT"/>
<uses-permission android:name="android.permission.health.WRITE_WEIGHT"/>
<uses-permission android:name="android.permission.health.READ_EXERCISE"/>
<uses-permission android:name="android.permission.health.WRITE_EXERCISE"/>
```

### 2. App Configuration (app.json)
Permissions synced in `android.permissions` array to match manifest.

### 3. Permission Request Flow (healthSync.ts)
Extended `connectGoogleFit()` to request all 10 permissions (read + write for each record type) with fallback to manual Health Connect settings if needed.

---

## Usage Examples

### Example 1: Display Today's Metrics in a Dashboard Screen

```tsx
import { useTodayHealthMetrics } from '../hooks/useHealthConnectMetrics';
import { Text, View } from 'react-native';

function DashboardScreen() {
  const { steps, distance, calories, weight, isLoading, error } = useTodayHealthMetrics();

  if (error) {
    return <Text>Error: {error}</Text>;
  }

  return (
    <View>
      {isLoading ? (
        <Text>Syncing...</Text>
      ) : (
        <>
          <Text>Steps Today: {steps.totalSteps.toLocaleString()}</Text>
          <Text>Distance: {(distance.totalDistance / 1000).toFixed(2)} km</Text>
          <Text>Calories Burned: {calories.totalCalories.toFixed(0)} kcal</Text>
          <Text>Current Weight: {weight.latestWeight.toFixed(1)} kg</Text>
        </>
      )}
    </View>
  );
}
```

### Example 2: Auto-Sync Metrics with Interval

```tsx
import { useHealthConnectMetrics } from '../hooks/useHealthConnectMetrics';
import { useEffect } from 'react';
import { storage } from '../utils/storage';

function MyWorkoutComponent() {
  const { steps, distance, calories, exercises, refetch } = useHealthConnectMetrics({
    autoSyncIntervalMs: 300000, // 5 minutes
    lookbackDays: 7,
  });

  // Persist steps to local storage whenever they update
  useEffect(() => {
    if (steps.totalSteps > 0) {
      storage.setItem(
        'health_sync_snapshot',
        JSON.stringify({
          steps: steps.totalSteps,
          distance: distance.totalDistance,
          calories: calories.totalCalories,
          weight: weight.latestWeight,
          timestamp: new Date().toISOString(),
        }),
      );
    }
  }, [steps, distance, calories, weight]);

  return (
    <View>
      <Text>Total Steps (7 days): {steps.totalSteps}</Text>
      <Text>Exercises Logged: {exercises.length}</Text>
      <Button title="Refresh" onPress={() => refetch()} />
    </View>
  );
}
```

### Example 3: Post-Workout Sync – Write Exercise Session with Metrics

```tsx
import {
  writeExerciseSessionWithMetrics,
  readExerciseSessionsWithIntensity,
} from '../services/healthSync';

async function logWorkoutToHealthConnect() {
  const startTime = new Date('2025-03-18T10:00:00Z');
  const endTime = new Date('2025-03-18T10:45:00Z');

  const result = await writeExerciseSessionWithMetrics({
    title: '45-min Strength Training',
    startTime,
    endTime,
    exerciseType: 'STRENGTH_TRAINING',
    notes: 'Push/Pull/Legs workout',
    totalCaloriesBurned: 350,
    distance: 0,
    additionalMetrics: {
      steps: 2500,
      caloriesAdditional: 50,
    },
  });

  if (result.ok) {
    console.log(`✓ Workout synced! ID: ${result.sessionId}`);
    console.log(result.message);
  } else {
    console.error(`✗ Sync failed: ${result.message}`);
  }
}
```

### Example 4: Read Exercise Sessions with Intensity Data

```tsx
import {
  readExerciseSessionsWithIntensity,
  TimeRange,
} from '../services/healthSync';

async function fetchWorkoutHistory() {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30); // Last 30 days

  const timeRange: TimeRange = {
    startTime: startDate,
    endTime: new Date(),
  };

  const { exercises, intensityData } = await readExerciseSessionsWithIntensity(timeRange);

  console.log(`Found ${exercises.length} workouts:`);
  exercises.forEach((ex) => {
    console.log(
      `  ${ex.title} (${ex.startTime.toLocaleString()} - ${ex.endTime.toLocaleString()})`,
    );
    console.log(`    Distance: ${ex.distance}m, Calories: ${ex.totalCaloriesBurned}kcal`);
  });

  console.log(`Intensity levels: ${intensityData.map((i) => i.intensity).join(', ')}`);
}
```

### Example 5: Check Individual Permissions

```tsx
import { useHealthConnectPermission } from '../hooks/useHealthConnectMetrics';
import { Text, Button } from 'react-native';

function PermissionChecker() {
  const { granted: stepsGranted, loading: stepsLoading } = useHealthConnectPermission(
    'Steps',
    'read',
  );
  const { granted: exerciseGranted, loading: exerciseLoading } = useHealthConnectPermission(
    'ExerciseSession',
    'write',
  );

  if (stepsLoading || exerciseLoading) {
    return <Text>Checking permissions...</Text>;
  }

  return (
    <>
      <Text>Read Steps: {stepsGranted ? '✓ Granted' : '✗ Denied'}</Text>
      <Text>Write Exercise: {exerciseGranted ? '✓ Granted' : '✗ Denied'}</Text>
    </>
  );
}
```

### Example 6: Direct API Calls for Fine-Grained Control

```tsx
import {
  readSteps,
  readDistance,
  readTotalCalories,
  readWeight,
  writeWeight,
  TimeRange,
} from '../services/healthSync';

async function syncAllMetrics() {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const timeRange: TimeRange = {
    startTime: sevenDaysAgo,
    endTime: now,
  };

  // Read all metrics
  const [steps, distance, calories, weight] = await Promise.all([
    readSteps(timeRange),
    readDistance(timeRange),
    readTotalCalories(timeRange),
    readWeight(timeRange),
  ]);

  console.log('7-Day Summary:');
  console.log(`  Total Steps: ${steps.totalSteps}`);
  console.log(`  Total Distance: ${(distance.totalDistance / 1000).toFixed(2)} km`);
  console.log(`  Total Calories: ${calories.totalCalories.toFixed(0)} kcal`);
  console.log(`  Latest Weight: ${weight.latestWeight.toFixed(1)} kg`);

  // Write a new weight record
  const weightResult = await writeWeight(75.5, new Date());
  if (weightResult.ok) {
    console.log('✓ Weight recorded:', weightResult.message);
  }
}
```

---

## Record Types & Data Structures

### Health Connect Record Types Supported

| Record Type | Read | Write | Primary Use |
|---|---|---|---|
| `Steps` | ✓ | ✓ | Daily step count |
| `Distance` | ✓ | ✓ | Running, walking distance |
| `TotalCaloriesBurned` | ✓ | ✓ | Daily calorie burn |
| `Weight` | ✓ | ✓ | Body weight tracking |
| `ExerciseSession` | ✓ | ✓ | Workout logging |

### Data Type Interfaces

```typescript
// Steps
interface StepsData {
  totalSteps: number;
  recordCount: number;
  averageStepsPerRecord: number;
}

// Distance (in meters)
interface DistanceData {
  totalDistance: number;
  recordCount: number;
  averageDistancePerRecord: number;
}

// Calories (in kcal)
interface CaloriesData {
  totalCalories: number;
  recordCount: number;
  averageCaloriesPerRecord: number;
}

// Weight (in kg)
interface WeightData {
  latestWeight: number;
  averageWeight: number;
  recordCount: number;
  timestamp?: Date;
}

// Exercise
interface ExerciseRecord {
  id: string;
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  activityType?: string;
  distance?: number; // meters
  totalCaloriesBurned?: number;
  exerciseType?: string;
  notes?: string;
}
```

---

## Permission Request Flow

When user calls `await connectHealthProvider('google_fit')`:

1. ✓ Initialize Health Connect SDK on device
2. ✓ Check if SDK is available / needs update
3. ✓ Request ALL permissions (read + write for 5 record types)
4. ✓ If user denies, show fallback message to manually enable in Health Connect app
5. ✓ Verify permissions were granted via `getGrantedPermissions()`

---

## API Reference

### Export Functions

#### Permission Helpers
- `isHealthConnectPermissionGranted(recordType, accessType): Promise<boolean>`
- `getAllGrantedPermissions(): Promise<Array<{recordType, accessType}>>`

#### Read Helpers
- `readSteps(timeRange): Promise<StepsData>`
- `readDistance(timeRange): Promise<DistanceData>`
- `readTotalCalories(timeRange): Promise<CaloriesData>`
- `readWeight(timeRange): Promise<WeightData>`
- `readExerciseSessions(timeRange): Promise<ExerciseRecord[]>`
- `readExerciseSessionsWithIntensity(timeRange): Promise<{exercises, intensityData}>`

#### Write Helpers
- `writeExerciseSessionWithMetrics(params): Promise<{ok, sessionId, message}>`
- `writeWeight(weight, timestamp): Promise<{ok, message}>`

### React Hooks

#### `useHealthConnectMetrics(options?)`
Full metrics snapshot with auto-sync capability.

```typescript
const {
  timestamp,
  steps,
  distance,
  calories,
  weight,
  exercises,
  isLoading,
  error,
  refetch,
} = useHealthConnectMetrics({
  autoSyncIntervalMs: 3600000, // 1 hour (0 to disable)
  lookbackDays: 7,
});
```

#### `useTodayHealthMetrics()`
Today's metrics only (last 24 hours).

```typescript
const { steps, distance, calories, weight, isLoading, error, refetch } = useTodayHealthMetrics();
```

#### `useHealthConnectPermission(recordType, accessType)`
Check if a specific permission is granted.

```typescript
const { granted, loading } = useHealthConnectPermission('Steps', 'read');
```

---

## Error Handling

All helpers gracefully return empty/default values if permissions are not granted or errors occur:

```typescript
try {
  const stepsData = await readSteps(timeRange);
  if (stepsData.totalSteps === 0 && stepsData.recordCount === 0) {
    // Either no data or permission denied/error
    console.warn('No steps data or permission issue');
  }
} catch (error) {
  console.error('Unexpected error:', error);
}
```

---

## Testing Checklist

- [ ] Build app for Android device/emulator: `eas build --platform android --profile preview`
- [ ] Install and grant permissions in Health Connect app
- [ ] Test read flows: `useHealthConnectMetrics` displays current metrics
- [ ] Test write flows: `writeExerciseSessionWithMetrics` creates records in Health Connect
- [ ] Test permission checks: `useHealthConnectPermission` returns correct status
- [ ] Test time range filtering: Different lookbackDays produces expected results
- [ ] Test auto-sync: Metrics update at intervals without manual refetch
- [ ] Verify Firestore sync (if Pro): Records sync to backend when `isPro === true`

---

## Integration with GainTrack Store

Suggested integration with local AsyncStorage:

```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useHealthConnectMetrics } from '../hooks/useHealthConnectMetrics';

function useGainTrackHealthSync() {
  const healthMetrics = useHealthConnectMetrics({ autoSyncIntervalMs: 600000 });

  useEffect(() => {
    if (!healthMetrics.isLoading && !healthMetrics.error) {
      // Persist to local store
      AsyncStorage.setItem(
        'gaintrack_health_snapshot',
        JSON.stringify({
          steps: healthMetrics.steps,
          distance: healthMetrics.distance,
          calories: healthMetrics.calories,
          weight: healthMetrics.weight,
          exercises: healthMetrics.exercises,
          syncedAt: new Date().toISOString(),
        }),
      );
    }
  }, [healthMetrics.steps, healthMetrics.distance, healthMetrics.calories, healthMetrics.weight, healthMetrics.exercises]);

  return healthMetrics;
}
```

Then in Firestore sync (if Pro):

```typescript
async function syncHealthDataToFirestore(userId: string) {
  const snapshot = await AsyncStorage.getItem('gaintrack_health_snapshot');
  if (!snapshot) return;

  const data = JSON.parse(snapshot);
  await firestore
    .collection(`users/${userId}/health_sync`)
    .doc('today')
    .set(data, { merge: true });
}
```

---

## Next Steps

1. ✓ Permissions configured in both manifest and app.json
2. ✓ `healthSync.ts` extended with all read/write helpers
3. ✓ `useHealthConnectMetrics` hook created for easy integration
4. ✓ Permission request flow updated to include all record types
5. → Integrate hooks into your screens (Dashboard, Progress, Workout screens)
6. → Add Firestore sync for Pro users
7. → Test on physical Android device (API 26+) with Health Connect app installed

---

## Health Connect Data Standards

**Units:**
- Distance: **meters** (m)
- Weight: **kilograms** (kg)
- Calories: **kilocalories** (kcal)
- Steps: **count**

**Timestamps:**
All timestamps use ISO 8601 format and should be in UTC or device timezone (Health Connect handles conversion).

**Exercise Types:**
Supported values include: `RUNNING`, `WALKING`, `CYCLING`, `SWIMMING`, `STRENGTH_TRAINING`, `YOGA`, `PILATES`, `ZUMBA`, etc.
See official [Health Connect exercise types](https://developer.android.com/health-and-fitness/guides/health-connect/data-types) for complete list.

---

**Status:** ✓ Implementation Complete  
**Date:** 2025-03-18  
**GainTrack Version:** 1.0.0+
