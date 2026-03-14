import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

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

const HEALTH_SYNC_SETTINGS_KEY = 'gaintrack_health_sync_settings';
const HEALTH_SYNC_SNAPSHOT_PREFIX = 'gaintrack_health_sync_snapshot_';

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
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const healthConnect = require('react-native-health-connect');
    const initialized = await healthConnect.initialize();
    if (!initialized) {
      return { ok: false, message: 'Health Connect failed to initialize on this device.' };
    }

    const grantedPermissions = await healthConnect.requestPermission([
      { accessType: 'read', recordType: 'Steps' },
      { accessType: 'read', recordType: 'ExerciseSession' },
      { accessType: 'read', recordType: 'TotalCaloriesBurned' },
    ]);

    if (!Array.isArray(grantedPermissions) || grantedPermissions.length === 0) {
      return { ok: false, message: 'No Health Connect permissions were granted.' };
    }

    return { ok: true, message: 'Google Fit (Health Connect) permissions granted.' };
  } catch (error: any) {
    return { ok: false, message: error?.message ?? 'Health Connect permission flow failed.' };
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
    return {
      ok: false,
      message: 'Native health bridge is unavailable. Install and prebuild with HealthKit/Health Connect modules to enable direct reads.',
    };
  }

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

  return {
    ok: true,
    message: 'Baseline sync completed.',
    snapshot,
  };
};

export const getProviderLabel = (provider: HealthProvider): string => {
  return provider === 'apple_health' ? 'Apple Health' : 'Google Fit';
};

export const getSupportedProvidersForDevice = (): HealthProvider[] => {
  if (Platform.OS === 'ios') return ['apple_health'];
  if (Platform.OS === 'android') return ['google_fit'];
  return [];
};
