import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { storage } from '../utils/storage';

export type HealthProvider = 'apple_health' | 'google_fit';
export type HealthSyncStatus = 'idle' | 'success' | 'failed';

export interface HealthProviderState {
  enabled: boolean;
  connected: boolean;
  nativeBridgeAvailable: boolean;
  lastPermissionAt?: string;
  lastSyncAt?: string;
  lastSyncStatus?: HealthSyncStatus;
  lastError?: string;
}

export interface HealthSyncSettings {
  consentGiven: boolean;
  providers: Record<HealthProvider, HealthProviderState>;
  updatedAt: string;
}

export interface HealthSyncResult {
  ok: boolean;
  message: string;
  snapshot?: {
    workoutsImported: number;
    nutritionDaysImported: number;
    measurementsImported: number;
    providerRecordsRead: number;
  };
}

export interface HealthSyncSnapshot {
  provider: HealthProvider;
  syncedAt: string;
  snapshot: {
    workoutsImported: number;
    nutritionDaysImported: number;
    measurementsImported: number;
    providerRecordsRead: number;
  };
}

export interface StravaReadinessResult {
  lookback_days: number;
  evaluated_at: string;
  metrics: {
    users_with_health_interest: number;
    adopted_users: number;
    adoption_rate_percent: number;
    avg_sync_events_per_adopted_user: number;
    active_providers: number;
  };
  evaluation: {
    score: number;
    recommendation: 'proceed_now' | 'validate_further' | 'defer';
    rationale: string;
  };
}

const HEALTH_SYNC_SETTINGS_KEY = 'gaintrack_health_sync_settings';
const HEALTH_SYNC_SNAPSHOT_PREFIX = 'gaintrack_health_sync_snapshot_';
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL?.trim() || '';

const sendHealthIntegrationTelemetry = async (
  provider: HealthProvider,
  payload: {
    eventType: string;
    success: boolean;
    nativeBridgeAvailable: boolean;
    providerRecordsRead?: number;
    errorMessage?: string;
  },
): Promise<void> => {
  if (!BACKEND_URL) return;

  try {
    const sessionToken = await storage.getItem('sessionToken');
    if (!sessionToken) return;

    await fetch(`${BACKEND_URL}/api/integrations/health/telemetry`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({
        provider,
        event_type: payload.eventType,
        success: payload.success,
        native_bridge_available: payload.nativeBridgeAvailable,
        provider_records_read: payload.providerRecordsRead ?? 0,
        error_message: payload.errorMessage,
      }),
    });
  } catch {
    // Telemetry should not block primary UX flows.
  }
};

const isProviderSupportedOnPlatform = (provider: HealthProvider): boolean => {
  if (provider === 'apple_health') return Platform.OS === 'ios';
  if (provider === 'google_fit') return Platform.OS === 'android';
  return false;
};

const detectNativeBridgeAvailability = (provider: HealthProvider): boolean => {
  if (!isProviderSupportedOnPlatform(provider)) return false;

  try {
    if (provider === 'apple_health') {
      // Optional dependency; do not crash if package is not present in this build.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const bridge = require('react-native-health');
      return typeof bridge?.initHealthKit === 'function';
    }

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const bridge = require('react-native-health-connect');
    return typeof bridge?.initialize === 'function';
  } catch {
    return false;
  }
};

const connectAppleHealth = async (): Promise<{ ok: boolean; message: string }> => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const appleHealthKit = require('react-native-health');
    const permissions = {
      permissions: {
        read: [
          appleHealthKit?.Constants?.Permissions?.StepCount,
          appleHealthKit?.Constants?.Permissions?.Workout,
        ].filter(Boolean),
        write: [appleHealthKit?.Constants?.Permissions?.Workout].filter(Boolean),
      },
    };

    await new Promise<void>((resolve, reject) => {
      appleHealthKit.initHealthKit(permissions, (error: string) => {
        if (error) {
          reject(new Error(error));
          return;
        }
        resolve();
      });
    });

    return { ok: true, message: 'Apple Health permission granted.' };
  } catch (error: any) {
    return { ok: false, message: error?.message ?? 'Apple Health permission flow failed.' };
  }
};

const connectGoogleFit = async (): Promise<{ ok: boolean; message: string }> => {
  if (Platform.OS !== 'android') {
    return { ok: false, message: 'Android Health Connect is only available on Android devices.' };
  }

  const androidVersion = Number(Platform.Version);
  if (Number.isFinite(androidVersion) && androidVersion < 26) {
    return { ok: false, message: 'Android Health Connect requires Android 8.0 (API 26) or newer.' };
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const healthConnect = require('react-native-health-connect');

    // Guard before initialize/requestPermission to avoid native crashes when
    // Health Connect provider is missing/outdated on certain devices.
    if (typeof healthConnect?.getSdkStatus === 'function') {
      const status = await healthConnect.getSdkStatus();
      const sdkAvailable = healthConnect?.SdkAvailabilityStatus?.SDK_AVAILABLE ?? 3;
      const sdkUpdateRequired = healthConnect?.SdkAvailabilityStatus?.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED ?? 2;

      if (status === sdkUpdateRequired) {
        return {
          ok: false,
          message: 'Health Connect needs to be installed or updated. Open Play Store, update Health Connect, then try Connect again.',
        };
      }

      if (status !== sdkAvailable) {
        return {
          ok: false,
          message: 'Health Connect is unavailable on this device right now. Install/update Health Connect and retry.',
        };
      }
    }

    const initialized = await healthConnect.initialize();
    if (!initialized) {
      return { ok: false, message: 'Health Connect failed to initialize on this device.' };
    }

    const existingPermissions = typeof healthConnect?.getGrantedPermissions === 'function'
      ? await healthConnect.getGrantedPermissions()
      : [];

    if (Array.isArray(existingPermissions) && existingPermissions.length > 0) {
      return { ok: true, message: 'Android Health Connect permissions already granted.' };
    }

    const grantedPermissions = await healthConnect.requestPermission([
      // Steps
      { accessType: 'read', recordType: 'Steps' },
      { accessType: 'write', recordType: 'Steps' },
      // Distance
      { accessType: 'read', recordType: 'Distance' },
      { accessType: 'write', recordType: 'Distance' },
      // Total Calories Burned
      { accessType: 'read', recordType: 'TotalCaloriesBurned' },
      { accessType: 'write', recordType: 'TotalCaloriesBurned' },
      // Weight
      { accessType: 'read', recordType: 'Weight' },
      { accessType: 'write', recordType: 'Weight' },
      // Exercise Sessions
      { accessType: 'read', recordType: 'ExerciseSession' },
      { accessType: 'write', recordType: 'ExerciseSession' },
    ]);

    if (!Array.isArray(grantedPermissions) || grantedPermissions.length === 0) {
      const afterRequestPermissions = typeof healthConnect?.getGrantedPermissions === 'function'
        ? await healthConnect.getGrantedPermissions()
        : [];

      if (Array.isArray(afterRequestPermissions) && afterRequestPermissions.length > 0) {
        return { ok: true, message: 'Android Health Connect permissions granted.' };
      }

      if (typeof healthConnect?.openHealthConnectSettings === 'function') {
        try {
          healthConnect.openHealthConnectSettings();
        } catch {
          // No-op; fallback message below explains manual recovery path.
        }
      }

      return {
        ok: false,
        message: 'Health permissions are not enabled yet. Open Health Connect and allow access for GainTrack, then try again.',
      };
    }

    return { ok: true, message: 'Android Health Connect permissions granted.' };
  } catch {
    return {
      ok: false,
      message: 'Could not connect to Health Connect right now. Please try again in a moment.',
    };
  }
};

const readAppleHealthStepCount = async (): Promise<number> => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const appleHealthKit = require('react-native-health');
  const now = new Date();
  const startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  return new Promise<number>((resolve) => {
    appleHealthKit.getStepCount(
      {
        startDate: startDate.toISOString(),
        endDate: now.toISOString(),
      },
      (error: string, result: { value?: number }) => {
        if (error) {
          resolve(0);
          return;
        }
        resolve(Number(result?.value ?? 0));
      },
    );
  });
};

const readGoogleFitStepCount = async (): Promise<number> => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const healthConnect = require('react-native-health-connect');
  const now = new Date();
  const startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const stepsResult = await healthConnect.readRecords('Steps', {
    timeRangeFilter: {
      operator: 'between',
      startTime: startDate.toISOString(),
      endTime: now.toISOString(),
    },
  });

  const records = Array.isArray(stepsResult?.records) ? stepsResult.records : [];
  return records.reduce((sum: number, record: any) => {
    const count = Number(record?.count ?? 0);
    return Number.isFinite(count) ? sum + count : sum;
  }, 0);
};

const createDefaultSettings = (): HealthSyncSettings => ({
  consentGiven: false,
  providers: {
    apple_health: {
      enabled: false,
      connected: false,
      nativeBridgeAvailable: detectNativeBridgeAvailability('apple_health'),
      lastSyncStatus: 'idle',
    },
    google_fit: {
      enabled: false,
      connected: false,
      nativeBridgeAvailable: detectNativeBridgeAvailability('google_fit'),
      lastSyncStatus: 'idle',
    },
  },
  updatedAt: new Date().toISOString(),
});

const saveSettings = async (settings: HealthSyncSettings): Promise<void> => {
  await AsyncStorage.setItem(HEALTH_SYNC_SETTINGS_KEY, JSON.stringify(settings));
};

export const getHealthSyncSettings = async (): Promise<HealthSyncSettings> => {
  const raw = await AsyncStorage.getItem(HEALTH_SYNC_SETTINGS_KEY);
  const base = createDefaultSettings();

  if (!raw) {
    await saveSettings(base);
    return base;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<HealthSyncSettings>;
    const merged: HealthSyncSettings = {
      ...base,
      ...parsed,
      providers: {
        apple_health: {
          ...base.providers.apple_health,
          ...parsed.providers?.apple_health,
          nativeBridgeAvailable: detectNativeBridgeAvailability('apple_health'),
        },
        google_fit: {
          ...base.providers.google_fit,
          ...parsed.providers?.google_fit,
          nativeBridgeAvailable: detectNativeBridgeAvailability('google_fit'),
        },
      },
      updatedAt: new Date().toISOString(),
    };

    await saveSettings(merged);
    return merged;
  } catch {
    await saveSettings(base);
    return base;
  }
};

export const setHealthSyncConsent = async (consentGiven: boolean): Promise<HealthSyncSettings> => {
  const settings = await getHealthSyncSettings();
  const next: HealthSyncSettings = {
    ...settings,
    consentGiven,
    updatedAt: new Date().toISOString(),
  };
  await saveSettings(next);

  await Promise.all(
    getSupportedProvidersForDevice().map((provider) =>
      sendHealthIntegrationTelemetry(provider, {
        eventType: consentGiven ? 'consent_enabled' : 'consent_disabled',
        success: true,
        nativeBridgeAvailable: next.providers[provider]?.nativeBridgeAvailable ?? false,
      }),
    ),
  );

  return next;
};

export const setHealthProviderEnabled = async (
  provider: HealthProvider,
  enabled: boolean,
): Promise<HealthSyncSettings> => {
  const settings = await getHealthSyncSettings();
  const next: HealthSyncSettings = {
    ...settings,
    providers: {
      ...settings.providers,
      [provider]: {
        ...settings.providers[provider],
        enabled,
      },
    },
    updatedAt: new Date().toISOString(),
  };
  await saveSettings(next);

  await sendHealthIntegrationTelemetry(provider, {
    eventType: 'provider_toggle',
    success: true,
    nativeBridgeAvailable: next.providers[provider].nativeBridgeAvailable,
  });

  return next;
};

export const connectHealthProvider = async (provider: HealthProvider): Promise<HealthSyncResult> => {
  const settings = await getHealthSyncSettings();

  if (!settings.consentGiven) {
    return { ok: false, message: 'Enable Health Data consent first.' };
  }

  if (!isProviderSupportedOnPlatform(provider)) {
    return { ok: false, message: 'This provider is not supported on your current platform.' };
  }

  const nativeBridgeAvailable = detectNativeBridgeAvailability(provider);

  if (!nativeBridgeAvailable) {
    const next: HealthSyncSettings = {
      ...settings,
      providers: {
        ...settings.providers,
        [provider]: {
          ...settings.providers[provider],
          nativeBridgeAvailable: false,
          connected: false,
          enabled: false,
          lastSyncStatus: 'failed',
          lastError: 'Native health bridge is not available in this build.',
        },
      },
      updatedAt: new Date().toISOString(),
    };

    await saveSettings(next);
    await sendHealthIntegrationTelemetry(provider, {
      eventType: 'connect_failed',
      success: false,
      nativeBridgeAvailable: false,
      errorMessage: 'Native health bridge is not available in this build.',
    });
    return {
      ok: false,
      message: 'Health connection is unavailable in this app version. Please update the app and try again.',
    };
  }

  await sendHealthIntegrationTelemetry(provider, {
    eventType: 'connect_attempt',
    success: true,
    nativeBridgeAvailable,
  });

  const connectionResult =
    provider === 'apple_health'
      ? await connectAppleHealth()
      : await connectGoogleFit();

  const next: HealthSyncSettings = {
    ...settings,
    providers: {
      ...settings.providers,
      [provider]: {
        ...settings.providers[provider],
        nativeBridgeAvailable,
        connected: connectionResult.ok,
        enabled: connectionResult.ok,
        lastPermissionAt: connectionResult.ok ? new Date().toISOString() : settings.providers[provider].lastPermissionAt,
        lastError: connectionResult.ok ? undefined : connectionResult.message,
      },
    },
    updatedAt: new Date().toISOString(),
  };

  await saveSettings(next);
  await sendHealthIntegrationTelemetry(provider, {
    eventType: connectionResult.ok ? 'connect_success' : 'connect_failed',
    success: connectionResult.ok,
    nativeBridgeAvailable,
    errorMessage: connectionResult.ok ? undefined : connectionResult.message,
  });

  return {
    ok: connectionResult.ok,
    message: connectionResult.ok ? 'Provider connected. You can now run sync.' : connectionResult.message,
  };
};

export const syncHealthProviderBaseline = async (provider: HealthProvider): Promise<HealthSyncResult> => {
  const settings = await getHealthSyncSettings();
  const providerState = settings.providers[provider];

  if (!settings.consentGiven) {
    return { ok: false, message: 'Enable Health Data consent first.' };
  }

  if (!providerState.connected || !providerState.enabled) {
    return { ok: false, message: 'Connect and enable the provider before syncing.' };
  }

  if (!providerState.nativeBridgeAvailable) {
    await sendHealthIntegrationTelemetry(provider, {
      eventType: 'sync_failed',
      success: false,
      nativeBridgeAvailable: false,
      errorMessage: 'Native health bridge unavailable',
    });
    return {
      ok: false,
      message: 'Native health bridge is unavailable in this build. Sync cannot read device health data yet.',
    };
  }

  const [workoutsRaw, nutritionRaw, measurementsRaw] = await Promise.all([
    AsyncStorage.getItem('gaintrack_workouts'),
    AsyncStorage.getItem('gaintrack_nutrition'),
    AsyncStorage.getItem('gaintrack_measurements'),
  ]);

  const safeParseArray = (raw: string | null): any[] => {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const workouts = safeParseArray(workoutsRaw);
  const nutrition = safeParseArray(nutritionRaw);
  const measurements = safeParseArray(measurementsRaw);

  let providerRecordsRead = 0;
  try {
    providerRecordsRead = provider === 'apple_health'
      ? await readAppleHealthStepCount()
      : await readGoogleFitStepCount();
  } catch {
    providerRecordsRead = 0;
  }

  const snapshot = {
    workoutsImported: workouts.length,
    nutritionDaysImported: nutrition.length,
    measurementsImported: measurements.length,
    providerRecordsRead,
  };

  await AsyncStorage.setItem(
    `${HEALTH_SYNC_SNAPSHOT_PREFIX}${provider}`,
    JSON.stringify({
      provider,
      syncedAt: new Date().toISOString(),
      snapshot,
    }),
  );

  const next: HealthSyncSettings = {
    ...settings,
    providers: {
      ...settings.providers,
      [provider]: {
        ...providerState,
        lastSyncAt: new Date().toISOString(),
        lastSyncStatus: 'success',
        lastError: undefined,
      },
    },
    updatedAt: new Date().toISOString(),
  };
  await saveSettings(next);

  await sendHealthIntegrationTelemetry(provider, {
    eventType: 'sync_success',
    success: true,
    nativeBridgeAvailable: true,
    providerRecordsRead: providerRecordsRead,
  });

  return {
    ok: true,
    message: 'Baseline sync completed.',
    snapshot,
  };
};

export const getStravaWearableReadiness = async (
  lookbackDays = 30,
): Promise<StravaReadinessResult | null> => {
  if (!BACKEND_URL) return null;

  try {
    const sessionToken = await storage.getItem('sessionToken');
    if (!sessionToken) return null;

    const response = await fetch(
      `${BACKEND_URL}/api/integrations/health/strava-readiness?lookback_days=${lookbackDays}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${sessionToken}`,
        },
      },
    );

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as StravaReadinessResult;
  } catch {
    return null;
  }
};

export const getProviderLabel = (provider: HealthProvider): string => {
  return provider === 'apple_health' ? 'Apple Health' : 'Android Health Connect';
};

export const getHealthSyncSnapshot = async (
  provider: HealthProvider,
): Promise<HealthSyncSnapshot | null> => {
  try {
    const raw = await AsyncStorage.getItem(`${HEALTH_SYNC_SNAPSHOT_PREFIX}${provider}`);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as HealthSyncSnapshot;
    if (!parsed?.syncedAt || !parsed?.snapshot) return null;
    return parsed;
  } catch {
    return null;
  }
};

export const getSupportedProvidersForDevice = (): HealthProvider[] => {
  if (Platform.OS === 'ios') return ['apple_health'];
  if (Platform.OS === 'android') return ['google_fit'];
  return [];
};

// ===== Health Connect Record Types & Permissions =====
export enum HealthConnectRecordType {
  Steps = 'Steps',
  Distance = 'Distance',
  TotalCaloriesBurned = 'TotalCaloriesBurned',
  Weight = 'Weight',
  ExerciseSession = 'ExerciseSession',
}

export interface TimeRange {
  startTime: Date;
  endTime: Date;
}

export interface StepsData {
  totalSteps: number;
  recordCount: number;
  averageStepsPerRecord: number;
}

export interface DistanceData {
  totalDistance: number; // meters
  recordCount: number;
  averageDistancePerRecord: number;
}

export interface CaloriesData {
  totalCalories: number;
  recordCount: number;
  averageCaloriesPerRecord: number;
}

export interface WeightData {
  latestWeight: number; // kg
  averageWeight: number;
  recordCount: number;
  timestamp?: Date;
}

export interface ExerciseRecord {
  id: string;
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  activityType?: string;
  distance?: number;
  totalCaloriesBurned?: number;
  exerciseType?: string;
  notes?: string;
}

export interface ActivityIntensityRecord {
  recordType: string;
  intensity: 'low' | 'moderate' | 'high' | 'very_high';
  startTime: Date;
  endTime: Date;
}

// Permission checking helpers
export const isHealthConnectPermissionGranted = async (
  recordType: HealthConnectRecordType,
  accessType: 'read' | 'write' = 'read',
): Promise<boolean> => {
  if (Platform.OS !== 'android') return false;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const healthConnect = require('react-native-health-connect');

    const grantedPermissions = typeof healthConnect?.getGrantedPermissions === 'function'
      ? await healthConnect.getGrantedPermissions()
      : [];

    if (!Array.isArray(grantedPermissions)) return false;

    return grantedPermissions.some(
      (perm: any) =>
        perm?.recordType === recordType && perm?.accessType === accessType,
    );
  } catch {
    return false;
  }
};

export const getAllGrantedPermissions = async (): Promise<
  Array<{ recordType: string; accessType: 'read' | 'write' }>
> => {
  if (Platform.OS !== 'android') return [];

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const healthConnect = require('react-native-health-connect');

    const grantedPermissions = typeof healthConnect?.getGrantedPermissions === 'function'
      ? await healthConnect.getGrantedPermissions()
      : [];

    return Array.isArray(grantedPermissions) ? grantedPermissions : [];
  } catch {
    return [];
  }
};

// ===== Read Helpers =====

export const readSteps = async (timeRange: TimeRange): Promise<StepsData> => {
  if (Platform.OS !== 'android') {
    return { totalSteps: 0, recordCount: 0, averageStepsPerRecord: 0 };
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
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

export const readDistance = async (timeRange: TimeRange): Promise<DistanceData> => {
  if (Platform.OS !== 'android') {
    return { totalDistance: 0, recordCount: 0, averageDistancePerRecord: 0 };
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const healthConnect = require('react-native-health-connect');

    const hasPermission = await isHealthConnectPermissionGranted(HealthConnectRecordType.Distance, 'read');
    if (!hasPermission) {
      throw new Error('Distance read permission not granted');
    }

    const result = await healthConnect.readRecords(HealthConnectRecordType.Distance, {
      timeRangeFilter: {
        operator: 'between',
        startTime: timeRange.startTime.toISOString(),
        endTime: timeRange.endTime.toISOString(),
      },
    });

    const records = Array.isArray(result?.records) ? result.records : [];
    const totalDistance = records.reduce((sum: number, record: any) => {
      const distance = Number(record?.distance ?? 0);
      return Number.isFinite(distance) ? sum + distance : sum;
    }, 0);

    return {
      totalDistance,
      recordCount: records.length,
      averageDistancePerRecord: records.length > 0 ? totalDistance / records.length : 0,
    };
  } catch (error: any) {
    console.error('[HealthConnect] Error reading distance:', error?.message);
    return { totalDistance: 0, recordCount: 0, averageDistancePerRecord: 0 };
  }
};

export const readTotalCalories = async (timeRange: TimeRange): Promise<CaloriesData> => {
  if (Platform.OS !== 'android') {
    return { totalCalories: 0, recordCount: 0, averageCaloriesPerRecord: 0 };
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const healthConnect = require('react-native-health-connect');

    const hasPermission = await isHealthConnectPermissionGranted(
      HealthConnectRecordType.TotalCaloriesBurned,
      'read',
    );
    if (!hasPermission) {
      throw new Error('TotalCaloriesBurned read permission not granted');
    }

    const result = await healthConnect.readRecords(HealthConnectRecordType.TotalCaloriesBurned, {
      timeRangeFilter: {
        operator: 'between',
        startTime: timeRange.startTime.toISOString(),
        endTime: timeRange.endTime.toISOString(),
      },
    });

    const records = Array.isArray(result?.records) ? result.records : [];
    const totalCalories = records.reduce((sum: number, record: any) => {
      const calories = Number(record?.energy ?? 0);
      return Number.isFinite(calories) ? sum + calories : sum;
    }, 0);

    return {
      totalCalories,
      recordCount: records.length,
      averageCaloriesPerRecord: records.length > 0 ? totalCalories / records.length : 0,
    };
  } catch (error: any) {
    console.error('[HealthConnect] Error reading calories:', error?.message);
    return { totalCalories: 0, recordCount: 0, averageCaloriesPerRecord: 0 };
  }
};

export const readWeight = async (timeRange: TimeRange): Promise<WeightData> => {
  if (Platform.OS !== 'android') {
    return {
      latestWeight: 0,
      averageWeight: 0,
      recordCount: 0,
    };
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const healthConnect = require('react-native-health-connect');

    const hasPermission = await isHealthConnectPermissionGranted(HealthConnectRecordType.Weight, 'read');
    if (!hasPermission) {
      throw new Error('Weight read permission not granted');
    }

    const result = await healthConnect.readRecords(HealthConnectRecordType.Weight, {
      timeRangeFilter: {
        operator: 'between',
        startTime: timeRange.startTime.toISOString(),
        endTime: timeRange.endTime.toISOString(),
      },
      ascendingOrder: false, // Latest first
    });

    const records = Array.isArray(result?.records) ? result.records : [];
    const latestWeight = records.length > 0 ? Number(records[0]?.weight ?? 0) : 0;
    const averageWeight =
      records.length > 0
        ? records.reduce((sum: number, record: any) => {
            const weight = Number(record?.weight ?? 0);
            return Number.isFinite(weight) ? sum + weight : sum;
          }, 0) / records.length
        : 0;

    return {
      latestWeight,
      averageWeight,
      recordCount: records.length,
      timestamp: records.length > 0 ? new Date(records[0]?.time) : undefined,
    };
  } catch (error: any) {
    console.error('[HealthConnect] Error reading weight:', error?.message);
    return {
      latestWeight: 0,
      averageWeight: 0,
      recordCount: 0,
    };
  }
};

export const readExerciseSessions = async (
  timeRange: TimeRange,
): Promise<ExerciseRecord[]> => {
  if (Platform.OS !== 'android') {
    return [];
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const healthConnect = require('react-native-health-connect');

    const hasPermission = await isHealthConnectPermissionGranted(
      HealthConnectRecordType.ExerciseSession,
      'read',
    );
    if (!hasPermission) {
      throw new Error('ExerciseSession read permission not granted');
    }

    const result = await healthConnect.readRecords(HealthConnectRecordType.ExerciseSession, {
      timeRangeFilter: {
        operator: 'between',
        startTime: timeRange.startTime.toISOString(),
        endTime: timeRange.endTime.toISOString(),
      },
      ascendingOrder: false,
    });

    const records = Array.isArray(result?.records) ? result.records : [];
    return records.map((record: any) => ({
      id: record?.metadata?.id ?? '',
      title: record?.title ?? 'Exercise',
      description: record?.notes,
      startTime: new Date(record?.startTime),
      endTime: new Date(record?.endTime),
      activityType: record?.exerciseType,
      distance: record?.distance,
      totalCaloriesBurned: record?.totalEnergyBurned,
      exerciseType: record?.exerciseType,
      notes: record?.notes,
    }));
  } catch (error: any) {
    console.error('[HealthConnect] Error reading exercise sessions:', error?.message);
    return [];
  }
};

export const readExerciseSessionsWithIntensity = async (
  timeRange: TimeRange,
): Promise<{
  exercises: ExerciseRecord[];
  intensityData: ActivityIntensityRecord[];
}> => {
  const exercises = await readExerciseSessions(timeRange);
  // ActivityIntensity is inferred from ExerciseSession intensity levels
  // Map exercise sessions to intensity records based on metadata
  const intensityData: ActivityIntensityRecord[] = exercises.map((exercise) => ({
    recordType: 'ExerciseSession',
    intensity: 'moderate', // Default; adjust based on actual HR/effort data
    startTime: exercise.startTime,
    endTime: exercise.endTime,
  }));

  return { exercises, intensityData };
};

// ===== Write Helpers =====

export interface WriteExerciseSessionParams {
  title: string;
  startTime: Date;
  endTime: Date;
  exerciseType?: string;
  notes?: string;
  distance?: number; // meters
  totalCaloriesBurned?: number;
  additionalMetrics?: {
    steps?: number;
    distanceAdditional?: number;
    caloriesAdditional?: number;
  };
}

export const writeExerciseSessionWithMetrics = async (
  params: WriteExerciseSessionParams,
): Promise<{ ok: boolean; sessionId?: string; message: string }> => {
  if (Platform.OS !== 'android') {
    return { ok: false, message: 'Exercise session writing only supported on Android' };
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const healthConnect = require('react-native-health-connect');

    const hasExercisePermission = await isHealthConnectPermissionGranted(
      HealthConnectRecordType.ExerciseSession,
      'write',
    );

    if (!hasExercisePermission) {
      throw new Error('ExerciseSession write permission not granted');
    }

    // Build records to insert
    const recordsToInsert: any[] = [];

    // Add exercise session record
    const sessionRecord = {
      recordType: HealthConnectRecordType.ExerciseSession,
      startTime: params.startTime.toISOString(),
      endTime: params.endTime.toISOString(),
      title: params.title,
      description: params.notes,
      exerciseType: params.exerciseType || 'UNKNOWN',
      notes: params.notes,
    };

    if (params.distance !== undefined) {
      (sessionRecord as any).distance = { value: params.distance, unit: 'm' };
    }

    if (params.totalCaloriesBurned !== undefined) {
      (sessionRecord as any).totalEnergyBurned = {
        value: params.totalCaloriesBurned,
        unit: 'kcal',
      };
    }

    recordsToInsert.push(sessionRecord);

    // Add optional distance record
    if (
      params.distance !== undefined &&
      (await isHealthConnectPermissionGranted(HealthConnectRecordType.Distance, 'write'))
    ) {
      recordsToInsert.push({
        recordType: HealthConnectRecordType.Distance,
        distance: { value: params.distance, unit: 'm' },
        startTime: params.startTime.toISOString(),
        endTime: params.endTime.toISOString(),
      });
    }

    // Add optional calories record
    if (
      params.totalCaloriesBurned !== undefined &&
      (await isHealthConnectPermissionGranted(HealthConnectRecordType.TotalCaloriesBurned, 'write'))
    ) {
      recordsToInsert.push({
        recordType: HealthConnectRecordType.TotalCaloriesBurned,
        energy: { value: params.totalCaloriesBurned, unit: 'kcal' },
        startTime: params.startTime.toISOString(),
        endTime: params.endTime.toISOString(),
      });
    }

    // Add optional steps record
    if (
      params.additionalMetrics?.steps !== undefined &&
      (await isHealthConnectPermissionGranted(HealthConnectRecordType.Steps, 'write'))
    ) {
      recordsToInsert.push({
        recordType: HealthConnectRecordType.Steps,
        count: params.additionalMetrics.steps,
        startTime: params.startTime.toISOString(),
        endTime: params.endTime.toISOString(),
      });
    }

    // Insert records
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

export const writeWeight = async (
  weight: number, // kg
  timestamp: Date = new Date(),
): Promise<{ ok: boolean; message: string }> => {
  if (Platform.OS !== 'android') {
    return { ok: false, message: 'Weight writing only supported on Android' };
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const healthConnect = require('react-native-health-connect');

    const hasPermission = await isHealthConnectPermissionGranted(
      HealthConnectRecordType.Weight,
      'write',
    );

    if (!hasPermission) {
      throw new Error('Weight write permission not granted');
    }

    const record = {
      recordType: HealthConnectRecordType.Weight,
      weight: { value: weight, unit: 'kg' },
      time: timestamp.toISOString(),
    };

    await healthConnect.insertRecords([record]);

    return {
      ok: true,
      message: `Weight record (${weight} kg) uploaded successfully.`,
    };
  } catch (error: any) {
    console.error('[HealthConnect] Error writing weight:', error?.message);
    return {
      ok: false,
      message: `Failed to write weight: ${error?.message}`,
    };
  }
};
