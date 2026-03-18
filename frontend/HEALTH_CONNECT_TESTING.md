# Health Connect Integration Testing Guide

## Overview
This guide covers testing setup for Health Connect integration on Android devices and emulators.

---

## Prerequisites

- **Android Device or Emulator**: API 26+ with Google Play Services
- **Health Connect App**: Installed and updated from Google Play Store
- **GainTrack Build**: Latest development or preview build
- **Test Data**: Sample workouts in GainTrack app

---

## Test Categories

### 1. Permission Flow Testing

#### Test Case 1.1: First-Time Permission Request
**Setup:**
- Fresh app install or cleared app data
- Health Connect app installed

**Steps:**
1. Open GainTrack app
2. Navigate to Settings → Health Integration
3. Toggle "Enable Health Data Sync" ON
4. Tap "Connect to Health Connect"

**Expected Result:**
- Permission dialog appears requesting read/write access for:
  - Steps
  - Distance
  - Total Calories Burned
  - Weight
  - Exercise Sessions
- User can grant or deny permissions
- If granted: Status shows "✓ Connected"
- If denied: Fallback message explains how to manually enable

**Telemetry Check:**
```
POST /api/integrations/health/telemetry
{
  "eventType": "permission_granted" | "permission_denied",
  "success": true | false,
  "millisElapsed": 2340
}
```

---

#### Test Case 1.2: Permission Persistence
**Setup:**
- Permissions already granted from Test 1.1

**Steps:**
1. Close and reopen GainTrack app
2. Navigate to Health Integration

**Expected Result:**
- Status immediately shows "✓ Connected" (no re-requesting)
- No dialog appears

---

### 2. Read Functionality Testing

#### Test Case 2.1: Read Today's Steps
**Setup:**
- Device with Health Connect app running background trackers
- Permissions granted

**Steps:**
1. Open GainTrack Dashboard
2. Verify "Today's Metrics" card displays step count
3. Tap refresh button
4. Wait for data to update

**Expected Result:**
- Steps count displays (e.g., "8,245 steps")
- Number increases after walking/running
- Refresh completes within 2-3 seconds

**Telemetry Check:**
```
POST /api/integrations/health/telemetry
{
  "eventType": "metrics_synced",
  "recordType": "Steps",
  "dataPointCount": 1,
  "millisElapsed": 1250
}
```

---

#### Test Case 2.2: Read Distance (Cardio)
**Setup:**
- Use device GPS or emulator with simulated location
- Log a running/cycling activity in native Health Connect

**Steps:**
1. Open GainTrack
2. Navigate to Progress screen (Pro feature)
3. Check "7-Day Health Summary" panel

**Expected Result:**
- Distance displays in km (e.g., "5.2 km")
- Matches data in Health Connect app

---

#### Test Case 2.3: Read Weight
**Setup:**
- Have a weight record in Health Connect

**Steps:**
1. Open GainTrack Dashboard
2. Check "Today's Metrics" card

**Expected Result:**
- Latest weight displays (e.g., "75.5 kg")
- Shows most recent recording timestamp

---

#### Test Case 2.4: Read Exercise Sessions (with intensity)
**Setup:**
- Log workouts in GainTrack
- Complete workouts (they should sync to Health Connect)

**Steps:**
1. Open GainTrack → Progress screen
2. Check "7-Day Health Summary"
3. Verify "Exercise Sessions" count

**Expected Result:**
- Shows count of exercise sessions logged
- Totals match GainTrack workout count

---

### 3. Write Functionality Testing

#### Test Case 3.1: Post-Workout Sync
**Setup:**
- Pro user with Health Connect connected
- Fresh workout ready to complete

**Steps:**
1. Open GainTrack
2. Start new workout: "Chest & Back" (5 exercises)
3. Log all sets/reps
4. Tap "Complete Workout"
5. Verify sync prompt/indicator

**Expected Result:**
- Confirmation: "✓ Workout synced to Health Connect"
- In Health Connect app: New "Strength Training" exercise session appears with:
  - Correct start/end time
  - Exercise name as title
  - Estimated calories burned
  - Duration calculated correctly

**Telemetry Check:**
```
POST /api/integrations/health/telemetry
{
  "eventType": "workout_written",
  "recordType": "ExerciseSession",
  "success": true,
  "millisElapsed": 850
}
```

---

#### Test Case 3.2: Batch Write (Multiple Metrics)
**Setup:**
- Same as 3.1 but workout includes distance/cardio estimation

**Steps:**
1. Complete cardio-heavy workout
2. Check Health Connect app after sync

**Expected Result:**
- ExerciseSession record created
- Distance record created (if applicable)
- TotalCaloriesBurned record created
- All records have matching timestamps

---

#### Test Case 3.3: Weight Write
**Setup:**
- Pro feature (if gated)

**Steps:**
1. Open GainTrack Measurements screen
2. Enter new weight: "76 kg"
3. Tap "Record Weight"

**Expected Result:**
- Local storage updates immediately
- Health Connect app shows new weight record (may take 1-2 seconds to sync)

**Telemetry:**
```
{
  "eventType": "weight_recorded",
  "success": true
}
```

---

### 4. Error Handling Testing

#### Test Case 4.1: Permission Denied
**Setup:**
- Health Connect app installed but permissions denied

**Steps:**
1. Try to enable Health Sync
2. Deny all permissions in dialog

**Expected Result:**
- Graceful error message: "Health permissions are not enabled yet. Open Health Connect and allow access for GainTrack, then try again."
- App does NOT crash
- User can retry or open Health Connect settings

**Telemetry:**
```
{
  "eventType": "permission_denied",
  "success": false,
  "errorMessage": "User denied permissions"
}
```

---

#### Test Case 4.2: Health Connect App Not Installed
**Setup:**
- Android device without Health Connect app

**Steps:**
1. Try to connect to Health Connect

**Expected Result:**
- Error: "Health Connect is unavailable on this device. Install/update Health Connect and retry or open Play Store."
- Link to Play Store provided
- App does NOT crash

---

#### Test Case 4.3: Network Error During Sync
**Setup:**
- Device in airplane mode or WiFi disabled

**Steps:**
1. With network OFF, try to tap refresh on metrics

**Expected Result:**
- Graceful error: "Failed to sync health metrics: Network error"
- Cached data may still display
- User can retry when network returns

---

#### Test Case 4.4: Old Health Connect Version
**Setup:**
- Old/outdated Health Connect app installed

**Steps:**
1. Try to connect

**Expected Result:**
- Error: "Health Connect needs to be installed or updated. Open Play Store, update Health Connect, then try Connect again."
- Actionable message
- Link to Play Store

---

### 5. Performance Testing

#### Test Case 5.1: Sync Duration
**Steps:**
1. Measure time taken for metrics refresh
2. Repeat 5 times

**Expected Result:**
- Each sync completes within 3-5 seconds
- Average: < 4 seconds
- No UI freezing

**Telemetry Metric:**
```
millisElapsed should be < 5000ms consistently
```

---

#### Test Case 5.2: Auto-Sync Frequency
**Setup:**
- Auto-sync enabled with 5-minute interval

**Steps:**
1. Open app and watch metrics update every 5 minutes
2. Monitor for 15 minutes

**Expected Result:**
- Metrics refresh at expected intervals
- No excessive battery drain
- Background task completes silently

---

#### Test Case 5.3: Memory Leaks
**Setup:**
- Monitoring app memory via Android Studio Profiler

**Steps:**
1. Open Health screen repeatedly
2. Trigger multiple refreshes
3. Monitor memory usage

**Expected Result:**
- Memory usage stable (no continuous growth)
- No memory leaks detected in Profiler

---

### 6. Data Consistency Testing

#### Test Case 6.1: Daily Steps Match
**Setup:**
- Walk/run with phone

**Steps:**
1. Check steps in native Health app: 8,500 steps
2. Check steps in GainTrack Dashboard

**Expected Result:**
- GainTrack shows same or very close count (within 100 steps)
- No significant discrepancies

---

#### Test Case 6.2: Calories Match
**Setup:**
- Complete workout

**Steps:**
1. After workout, check calories in Health Connect
2. Check "Metrics" notification in GainTrack

**Expected Result:**
- Calories reasonably match (allow ±10% variance for formula differences)

---

### 7. Integration Testing

#### Test Case 7.1: Dashboard → Health Card → Refresh
**Steps:**
1. Open Dashboard
2. Verify Health card displays metrics
3. Walk 500 steps
4. Tap refresh button

**Expected Result:**
- New step count reflects in < 3 seconds

---

#### Test Case 7.2: Progress Screen Health Summary
**Setup:**
- Pro user

**Steps:**
1. Navigate to Progress tab
2. Scroll to "7-Day Health Summary"
3. Tab items appear

**Expected Result:**
- All 5 metrics display (Steps, Distance, Calories, Weight, Exercises)
- Data matches expected ranges
- Tap refresh works

---

## Checklist for QA

- [ ] Permissions: First-time request works
- [ ] Permissions: Persistence across app restart
- [ ] Read Steps: Count matches Health Connect
- [ ] Read Distance: Cardio distance displays correctly
- [ ] Read Weight: Latest weight shows
- [ ] Read Exercise Sessions: Count accurate
- [ ] Write Workout: Session syncs to Health Connect
- [ ] Write Weight: Weight record created
- [ ] Error: Permission denied handled gracefully
- [ ] Error: Network error handled
- [ ] Error: No crashes on any error path
- [ ] Performance: Sync completes within 5 seconds
- [ ] Performance: Memory stable
- [ ] Data: Steps count within 1% of Health Connect
- [ ] Data: Calories within 10% of estimate
- [ ] Dashboard: Health card renders and refreshes
- [ ] Progress: Health summary panel appears (Pro)
- [ ] Telemetry: Events logged for all operations
- [ ] Accessibility: Tap targets > 44x44 pt

---

## Troubleshooting

### Metrics Showing 0 After Refresh
**Check:**
1. Health Connect app has permission to track Steps
2. Device hasn't been idle too long (some data requires 5-10 min delay)
3. User walked/ran since sync
4. Check Android logs: `adb logcat | grep HealthConnect`

---

### Workout Not Syncing to Health Connect
**Check:**
1. User is Pro (if gated)
2. Permissions granted for ExerciseSession write
3. Check telemetry logs for error message
4. Network connectivity OK

---

### High Sync Duration (> 8 seconds)
**Check:**
1. Device storage space available
2. No other intensive tasks running
3. Network latency: `adb shell ping 8.8.8.8`

---

## End-to-End Test Script

```bash
# Run on physical Android device with ADB
adb shell pm grant com.tsag89ops.gaintrack android.permission.health.READ_STEPS
adb shell pm grant com.tsag89ops.gaintrack android.permission.health.WRITE_STEPS
adb shell pm grant com.tsag89ops.gaintrack android.permission.health.READ_EXERCISE
adb shell pm grant com.tsag89ops.gaintrack android.permission.health.WRITE_EXERCISE

# Now open app and verify all read/write flows work
```

---

**Status:** ✓ Testing Framework Ready  
**Date:** 2025-03-18  
**Last Updated:** Include in QA checklist before each production release
