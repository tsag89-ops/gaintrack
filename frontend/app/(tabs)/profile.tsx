import React, { useState, useEffect } from 'react';
import {
  View,
  Platform,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput,
  Modal,
  Switch,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useAuthStore } from '../../src/store/authStore';
import { userApi } from '../../src/services/api';
import { deleteUserCloudData } from '../../src/services/firestore';
import { sendOnboardingTelemetry } from '../../src/services/notifications';
import { deleteAccount, signOut as nativeSignOut, REQUIRES_RECENT_LOGIN } from '../../src/services/authBridge';
import { usePro } from '../../src/hooks/usePro'; // [PRO]
import PlateCalculator from '../../src/components/PlateCalculator'; // [PRO]
import { useLanguage } from '../../src/context/LanguageContext';
import { SUPPORTED_LANGUAGES, SupportedLocale } from '../../src/i18n/translations';
import {
  HealthProvider,
  HealthSyncSettings,
  connectHealthProvider,
  getHealthSyncSnapshot,
  getHealthSyncSettings,
  getProviderLabel,
  getSupportedProvidersForDevice,
  setHealthProviderEnabled,
  setHealthSyncConsent,
  syncHealthProviderBaseline,
} from '../../src/services/healthSync'; // [PRO]

const EQUIPMENT_OPTIONS = [
  { id: 'dumbbells', icon: 'fitness-outline' },
  { id: 'barbell', icon: 'barbell-outline' },
  { id: 'pullup_bar', icon: 'body-outline' },
  { id: 'bench', icon: 'bed-outline' },
  { id: 'cables', icon: 'git-branch-outline' },
  { id: 'machines', icon: 'cog-outline' },
  { id: 'kettlebell', icon: 'football-outline' },
];

export default function ProfileScreen() {
  const router = useRouter();
  const { user, setUser, logout } = useAuthStore();
  const { locale, setLocale, t } = useLanguage();

  // [PRO] Reads user.isPro from authStore (Firestore-backed — updates on every login)
  const { isPro } = usePro();

  const [showGoalsModal, setShowGoalsModal] = useState(false);
  const [showEquipmentModal, setShowEquipmentModal] = useState(false);
  const [showPlateCalc, setShowPlateCalc] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Goals state
  const [calories, setCalories] = useState(String(user?.goals?.daily_calories || 2000));
  const [protein, setProtein] = useState(String(user?.goals?.protein_grams || 150));
  const [carbs, setCarbs] = useState(String(user?.goals?.carbs_grams || 200));
  const [fat, setFat] = useState(String(user?.goals?.fat_grams || 65));

  // TDEE wizard state
  const [showTDEE, setShowTDEE] = useState(false);
  const [tdeeWeight, setTdeeWeight] = useState('');
  const [tdeeHeight, setTdeeHeight] = useState('');
  const [tdeeAge, setTdeeAge] = useState('');
  const [tdeeSex, setTdeeSex] = useState<'male' | 'female'>('male');
  const [tdeeActivity, setTdeeActivity] = useState(1.55);

  // Equipment state
  const [selectedEquipment, setSelectedEquipment] = useState<string[]>(user?.equipment || []);

  // Units state
  const [weightUnit, setWeightUnit] = useState<'kg' | 'lbs'>(user?.units?.weight || 'kg');
  const [heightUnit, setHeightUnit] = useState<'cm' | 'in'>(user?.units?.height || 'cm');
  const [distanceUnit, setDistanceUnit] = useState<'km' | 'mi'>(user?.units?.distance || 'km');

  // Workout settings
  const AUTO_REST_KEY    = 'gaintrack_auto_rest_timer';
  const REST_DURATION_KEY = 'gaintrack_rest_duration';
  const AI_CONSENT_KEY    = 'gaintrack_ai_consent';
  const REST_PRESETS = [
    { label: '30s', value: 30 },
    { label: '60s', value: 60 },
    { label: '90s', value: 90 },
    { label: '2m', value: 120 },
    { label: '3m', value: 180 },
    { label: '5m', value: 300 },
  ];
  const [autoStartRestTimer, setAutoStartRestTimer] = useState(true);
  const [restDuration, setRestDuration] = useState(90);
  const [aiConsent, setAiConsent] = useState(false);
  const [healthSyncSettings, setHealthSyncSettings] = useState<HealthSyncSettings | null>(null); // [PRO]
  const [healthSyncSnapshots, setHealthSyncSnapshots] = useState<Partial<Record<HealthProvider, Awaited<ReturnType<typeof getHealthSyncSnapshot>>>>>({}); // [PRO]
  const [healthSyncProviderLoading, setHealthSyncProviderLoading] = useState<HealthProvider | null>(null); // [PRO]
  const supportedHealthProviders = getSupportedProvidersForDevice(); // [PRO]
  const activityOptions = [
    { label: t('profile.activitySedentary'), value: 1.2 },
    { label: t('profile.activityLight'), value: 1.375 },
    { label: t('profile.activityModerate'), value: 1.55 },
    { label: t('profile.activityActive'), value: 1.725 },
    { label: t('profile.activityVery'), value: 1.9 },
  ];

  const formatLocalDate = (value: string) => new Intl.DateTimeFormat(locale).format(new Date(value));
  const formatRelativeDays = (days: number) => {
    try {
      return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(-days, 'day');
    } catch {
      return `${days}`;
    }
  };
  const getLocalizedLanguageLabel = (code: SupportedLocale) => t(`profile.languages.${code}`);
  const getLocalizedEquipmentLabel = (equipmentId: string) => t(`profile.equipmentLabels.${equipmentId}`);
  const getRestDurationLabel = (seconds: number) => (seconds >= 60 ? `${seconds / 60}m` : `${seconds}s`);

  const handleLanguageSelect = async (nextLocale: SupportedLocale) => {
    if (nextLocale === locale) return;
    await Haptics.selectionAsync();
    await setLocale(nextLocale);
  };

  useEffect(() => {
    AsyncStorage.getItem(AUTO_REST_KEY)
      .then((v) => { if (v !== null) setAutoStartRestTimer(JSON.parse(v)); })
      .catch(() => null);
    AsyncStorage.getItem(REST_DURATION_KEY)
      .then((v) => { if (v !== null) setRestDuration(Number(v)); })
      .catch(() => null);
    AsyncStorage.getItem(AI_CONSENT_KEY)
      .then((v) => setAiConsent(v === 'true'))
      .catch(() => null);

    refreshHealthSyncSettings().catch(() => null);
  }, []);

  // Sync goals edit-state when the modal opens so it always shows the persisted value.
  useEffect(() => {
    if (showGoalsModal && user?.goals) {
      setCalories(String(user.goals.daily_calories || 2000));
      setProtein(String(user.goals.protein_grams || 150));
      setCarbs(String(user.goals.carbs_grams || 200));
      setFat(String(user.goals.fat_grams || 65));
    }
  }, [showGoalsModal]);

  // Sync equipment selection when the modal opens.
  useEffect(() => {
    if (showEquipmentModal) {
      setSelectedEquipment(user?.equipment || []);
    }
  }, [showEquipmentModal]);

  // Sync unit toggles whenever the persisted user.units changes (e.g. after setSession).
  useEffect(() => {
    if (user?.units) {
      setWeightUnit(user.units.weight || 'kg');
      setHeightUnit(user.units.height || 'cm');
      setDistanceUnit(user.units.distance || 'km');
    }
  }, [user?.units?.weight, user?.units?.height, user?.units?.distance]);

  const refreshHealthSyncSettings = async () => {
    const next = await getHealthSyncSettings();
    setHealthSyncSettings(next);

    const snapshotEntries = await Promise.all(
      supportedHealthProviders.map(async (provider) => [provider, await getHealthSyncSnapshot(provider)] as const),
    );
    const snapshots = Object.fromEntries(snapshotEntries) as Partial<Record<HealthProvider, Awaited<ReturnType<typeof getHealthSyncSnapshot>>>>;
    setHealthSyncSnapshots(snapshots);

    await userApi.updateUserPrefs({
      healthSyncSettings: next as unknown as Record<string, unknown>,
      healthSyncSnapshots: snapshots as unknown as Record<string, unknown>,
    }).catch(() => null);
  };

  const getHealthSyncQuality = (provider: HealthProvider) => {
    const providerState = healthSyncSettings?.providers?.[provider];
    const snapshot = healthSyncSnapshots[provider];

    if (!providerState?.nativeBridgeAvailable) {
      return { level: 'critical' as const, label: t('profile.health.bridgeMissing'), detail: t('profile.health.bridgeMissingDetail') };
    }
    if (!providerState?.connected) {
      return { level: 'warning' as const, label: t('profile.health.notConnected'), detail: t('profile.health.notConnectedDetail') };
    }
    if (providerState.lastSyncStatus === 'failed') {
      return { level: 'critical' as const, label: t('profile.health.syncFailed'), detail: providerState.lastError || t('profile.health.syncFailedDetail') };
    }
    if (!snapshot?.syncedAt) {
      return { level: 'warning' as const, label: t('profile.health.noSnapshot'), detail: t('profile.health.noSnapshotDetail') };
    }

    const daysSinceSync = Math.max(0, Math.floor((Date.now() - new Date(snapshot.syncedAt).getTime()) / (1000 * 60 * 60 * 24)));
    if (daysSinceSync >= 4) {
      return { level: 'warning' as const, label: t('profile.health.syncStale'), detail: formatRelativeDays(daysSinceSync) };
    }
    return {
      level: 'good' as const,
      label: t('profile.health.healthy'),
      detail: daysSinceSync === 0 ? t('profile.health.snapshotUpdatedToday') : t('profile.health.snapshotUpdatedDaysAgo', { days: daysSinceSync }),
    };
  };

  const showHealthTroubleshooting = async (provider: HealthProvider) => {
    await Haptics.selectionAsync();
    const quality = getHealthSyncQuality(provider);
    const providerState = healthSyncSettings?.providers?.[provider];
    const snapshot = healthSyncSnapshots[provider];

    const lines = [
      t('profile.health.status', { value: quality.label }),
      t('profile.health.detail', { value: quality.detail }),
      providerState?.lastError ? t('profile.health.lastError', { value: providerState.lastError }) : null,
      snapshot?.snapshot
        ? t('profile.health.records', {
            records: snapshot.snapshot.providerRecordsRead,
            workouts: snapshot.snapshot.workoutsImported,
            nutrition: snapshot.snapshot.nutritionDaysImported,
          })
        : null,
      '',
      t('profile.health.recommendedActions'),
      t('profile.health.action1'),
      t('profile.health.action2'),
      t('profile.health.action3'),
    ].filter(Boolean);

    Alert.alert(t('profile.health.troubleshootingTitle', { provider: getProviderLabel(provider) }), lines.join('\n'));
  };

  const requireProForHealthSync = async (): Promise<boolean> => {
    if (isPro) return true;
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert(
      t('profile.health.proFeatureTitle'),
      t('profile.health.proFeatureMessage'),
      [
        { text: t('profile.health.notNow'), style: 'cancel' },
        { text: t('profile.gainTrackPro'), onPress: () => router.push('/pro-paywall') },
      ],
    );
    return false;
  };

  const toggleHealthConsent = async (value: boolean) => {
    if (value && !(await requireProForHealthSync())) return;

    if (!value) {
      Alert.alert(
        t('profile.health.disableHealthSyncTitle'),
        t('profile.health.disableHealthSyncMessage'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('profile.disabled'),
            style: 'destructive',
            onPress: async () => {
              await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              const next = await setHealthSyncConsent(false);
              setHealthSyncSettings(next);
            },
          },
        ],
      );
      return;
    }

    await Haptics.selectionAsync();
    const next = await setHealthSyncConsent(true);
    setHealthSyncSettings(next);
  };

  const handleConnectHealthProvider = async (provider: HealthProvider) => {
    if (!(await requireProForHealthSync())) return;

    if (!healthSyncSettings?.consentGiven) {
      Alert.alert(t('profile.health.consentRequiredTitle'), t('profile.health.consentRequiredMessage'));
      return;
    }

    setHealthSyncProviderLoading(provider);
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const result = await connectHealthProvider(provider);
      if (!result.ok) {
        await refreshHealthSyncSettings();
        Alert.alert(t('profile.health.connectionIssueTitle'), result.message);
        return;
      }

      // Immediately hydrate GainTrack with provider data after a successful connect.
      const baseline = await syncHealthProviderBaseline(provider);
      await refreshHealthSyncSettings();

      if (baseline.ok && baseline.snapshot) {
        Alert.alert(
          t('profile.health.connectedAndSyncedTitle'),
          t('profile.health.connectedSyncedSummary', {
            message: result.message,
            records: baseline.snapshot.providerRecordsRead,
            workouts: baseline.snapshot.workoutsImported,
            nutrition: baseline.snapshot.nutritionDaysImported,
            measurements: baseline.snapshot.measurementsImported,
          }),
        );
      } else {
        Alert.alert(t('profile.health.connectedTitle'), `${result.message}\n\n${baseline.message}`);
      }
    } catch (error: any) {
      Alert.alert(
        t('profile.health.connectionIssueTitle'),
        error?.message ?? t('profile.health.connectionIssueFallback'),
      );
    } finally {
      setHealthSyncProviderLoading(null);
    }
  };

  const handleToggleHealthProvider = async (provider: HealthProvider, value: boolean) => {
    if (!(await requireProForHealthSync())) return;

    const next = await setHealthProviderEnabled(provider, value);
    setHealthSyncSettings(next);
    await Haptics.selectionAsync();
  };

  const handleSyncHealthProviderNow = async (provider: HealthProvider) => {
    if (!(await requireProForHealthSync())) return;

    setHealthSyncProviderLoading(provider);
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const result = await syncHealthProviderBaseline(provider);
      await refreshHealthSyncSettings();

      if (result.ok && result.snapshot) {
        Alert.alert(
          t('profile.health.syncCompleteTitle'),
          t('profile.health.syncedSummary', {
            provider: getProviderLabel(provider),
            records: result.snapshot.providerRecordsRead,
            workouts: result.snapshot.workoutsImported,
            nutrition: result.snapshot.nutritionDaysImported,
            measurements: result.snapshot.measurementsImported,
          }),
        );
      } else {
        Alert.alert(t('profile.health.syncUnavailableTitle'), result.message);
      }
    } catch (error: any) {
      Alert.alert(
        t('profile.health.syncIssueTitle'),
        error?.message ?? t('profile.health.syncIssueFallback'),
      );
    } finally {
      setHealthSyncProviderLoading(null);
    }
  };

  const toggleAutoRestTimer = async (value: boolean) => {
    setAutoStartRestTimer(value);
    await Haptics.selectionAsync();
    await AsyncStorage.setItem(AUTO_REST_KEY, JSON.stringify(value));
    await userApi.updateUserPrefs({ autoRestTimer: value }).catch(() => null);
  };

  const toggleAiConsent = async (value: boolean) => {
    if (!value) {
      // Confirm before revoking — AI chat history is unaffected but AI is disabled
      Alert.alert(
        t('profile.aiConsent.disableTitle'),
        t('profile.aiConsent.disableMessage'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('profile.aiConsent.revoke'),
            style: 'destructive',
            onPress: async () => {
              setAiConsent(false);
              await AsyncStorage.setItem(AI_CONSENT_KEY, 'false');
              await userApi.updateUserPrefs({ aiConsent: false }).catch(() => null);
              await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            },
          },
        ],
      );
    } else {
      setAiConsent(true);
      await AsyncStorage.setItem(AI_CONSENT_KEY, 'true');
      await userApi.updateUserPrefs({ aiConsent: true }).catch(() => null);
      await Haptics.selectionAsync();
    }
  };

  const selectRestDuration = async (seconds: number) => {
    setRestDuration(seconds);
    await Haptics.selectionAsync();
    await AsyncStorage.setItem(REST_DURATION_KEY, String(seconds));
    await userApi.updateUserPrefs({ restDuration: seconds }).catch(() => null);
  };

  const saveUnits = async (w: 'kg' | 'lbs', h: 'cm' | 'in', d: 'km' | 'mi') => {
    try {
      const units = { weight: w, height: h, distance: d };
      await userApi.updateUnits(units);
      if (user) setUser({ ...user, units });
    } catch (error) {
      console.error('Error saving units:', error);
    }
  };

  const clearLocalUserData = async () => {
    const explicitKeys = [
      'user',
      'gaintrack_pro_status',
      'workouts',
      'programs_v1',
      'progress',
      'foods',
      'exercises',
      'favorite_exercises',
      'recently_used_exercises',
      'gaintrack_physique_photos',
      'gaintrack_body_goal',
      'gaintrack_body_goals',
      'gaintrack_notification_settings',
      'notification_settings',
      'gaintrack_auto_rest_timer',
      'gaintrack_rest_duration',
      'gaintrack_ai_consent',
      'gaintrack_health_sync_settings',
      'gaintrack_health_sync_snapshot_apple_health',
      'gaintrack_health_sync_snapshot_google_fit',
      'gaintrack_weight_unit',
      'gaintrack_height_unit',
      'gaintrack_distance_unit',
    ];

    const allKeys = await AsyncStorage.getAllKeys();
    const prefixedKeys = allKeys.filter((key) =>
      key.startsWith('gaintrack_') ||
      key.startsWith('user_prefs_') ||
      key.startsWith('workout_') ||
      key.startsWith('program_')
    );

    const keysToRemove = Array.from(new Set([...explicitKeys, ...prefixedKeys]));
    if (keysToRemove.length > 0) {
      await AsyncStorage.multiRemove(keysToRemove);
    }
  };

const handleDeleteAccount = async () => {
  // Step 1: initial confirmation
  const confirmed = await new Promise<boolean>((resolve) =>
    Alert.alert(
      t('profile.accountAlerts.deleteTitle'),
      t('profile.accountAlerts.deleteMessage'),
      [
        { text: t('common.cancel'), onPress: () => resolve(false), style: 'cancel' },
        { text: t('profile.accountAlerts.delete'), onPress: () => resolve(true), style: 'destructive' },
      ],
    )
  );
  if (!confirmed) return;

  const userId = user?.id ?? user?.user_id;

  try {
    await deleteAccount();

    if (userId) {
      try {
        await deleteUserCloudData(userId);
      } catch (cloudErr) {
        console.warn('[Profile] deleteUserCloudData failed after deleteAccount:', cloudErr);
      }
    }

    await clearLocalUserData();
    // onAuthStateChanged fires automatically — no manual navigation needed
  } catch (error: any) {
    if (error?.code === REQUIRES_RECENT_LOGIN) {
      // Step 2: stale-session guard — offer to sign out so user can re-authenticate
      Alert.alert(
        t('profile.accountAlerts.reauthTitle'),
        t('profile.accountAlerts.reauthMessage'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('profile.accountAlerts.signOutNow'),
            style: 'destructive',
            onPress: async () => {
              try {
                await nativeSignOut();
                await clearLocalUserData();
                // onAuthStateChanged navigates to login automatically
              } catch (signOutErr) {
                console.error('[Profile] sign-out after re-auth prompt failed:', signOutErr);
              }
            },
          },
        ],
      );
    } else {
      Alert.alert(
        t('common.error'),
        error?.message ?? 'Failed to delete account. Please try again.',
      );
    }
  }
};

const handleLogout = async () => {
  const proceed = Platform.OS === 'web'
    ? window.confirm(t('profile.accountAlerts.logoutMessage'))
    : await new Promise((resolve) =>
        Alert.alert(t('profile.accountAlerts.logoutTitle'), t('profile.accountAlerts.logoutMessage'), [
          { text: t('common.cancel'), onPress: () => resolve(false), style: 'cancel' },
          { text: t('profile.logout'), onPress: () => resolve(true), style: 'destructive' },
        ])
      );

  if (!proceed) return;

  try {
    console.log('[Profile] Logging out...');
    await logout();
    await clearLocalUserData();
    router.replace('/login');
  } catch (error) {
    console.error('Logout error:', error);
  }
};

const handleExportMyData = async () => {
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const exportKeys = [
      'user',
      'gaintrack_pro_status',
      'workouts',
      'programs_v1',
      'progress',
      'foods',
      'exercises',
      'favorite_exercises',
      'recently_used_exercises',
      'gaintrack_physique_photos',
      'gaintrack_body_goal',
      'gaintrack_body_goals',
      'gaintrack_notification_settings',
      'notification_settings',
      'gaintrack_auto_rest_timer',
      'gaintrack_rest_duration',
      'gaintrack_ai_consent',
      'gaintrack_health_sync_settings',
      'gaintrack_health_sync_snapshot_apple_health',
      'gaintrack_health_sync_snapshot_google_fit',
      'gaintrack_weight_unit',
      'gaintrack_height_unit',
      'gaintrack_distance_unit',
    ];

    const dataEntries = await AsyncStorage.multiGet(exportKeys);
    const data = dataEntries.reduce<Record<string, unknown>>((acc, [key, value]) => {
      if (value === null) return acc;
      try {
        acc[key] = JSON.parse(value);
      } catch {
        acc[key] = value;
      }
      return acc;
    }, {});

    const payload = {
      exportedAt: new Date().toISOString(),
      app: 'GainTrack',
      schemaVersion: 1,
      userId: user?.id ?? user?.user_id ?? null,
      data,
    };

    const jsonString = JSON.stringify(payload, null, 2);
    const filename = `gaintrack_export_${new Date().toISOString().slice(0, 10)}.json`;

    if (Platform.OS === 'web') {
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }

    const path = `${FileSystem.documentDirectory ?? ''}${filename}`;
    await FileSystem.writeAsStringAsync(path, jsonString, { encoding: FileSystem.EncodingType.UTF8 });
    await Sharing.shareAsync(path, {
      mimeType: 'application/json',
      dialogTitle: t('profile.accountAlerts.exportDialogTitle'),
    });
  } catch (error: any) {
    Alert.alert(t('profile.accountAlerts.exportFailedTitle'), error?.message ?? t('profile.accountAlerts.exportFailedMessage'));
  }
};




  const calculateTDEE = () => {
    const w = parseFloat(tdeeWeight);
    const h = parseFloat(tdeeHeight);
    const a = parseInt(tdeeAge);
    if (!w || !h || !a) { Alert.alert(t('profile.goalsAlerts.missingInfoTitle'), t('profile.goalsAlerts.missingInfoMessage')); return; }
    const bmr = tdeeSex === 'male' ? 10 * w + 6.25 * h - 5 * a + 5 : 10 * w + 6.25 * h - 5 * a - 161;
    const tdee = Math.round(bmr * tdeeActivity);
    const prot = Math.round(w * 2.2);
    const fatG = Math.round(w * 0.9);
    const carbG = Math.max(0, Math.round((tdee - prot * 4 - fatG * 9) / 4));
    setCalories(String(tdee));
    setProtein(String(prot));
    setCarbs(String(carbG));
    setFat(String(fatG));
    setShowTDEE(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const saveGoals = async () => {
    try {
      setIsSaving(true);
      const goals = {
        daily_calories: parseInt(calories) || 2000,
        protein_grams: parseInt(protein) || 150,
        carbs_grams: parseInt(carbs) || 200,
        fat_grams: parseInt(fat) || 65,
        workouts_per_week: user?.goals?.workouts_per_week || 4,
      };
      await userApi.updateGoals(goals);
      if (user) {
        setUser({ ...user, goals });
      }
      sendOnboardingTelemetry({
        milestone: 'goals_set',
        context: `calories_${goals.daily_calories}`,
      }).catch(() => null);
      setShowGoalsModal(false);
      Alert.alert(t('common.success'), t('profile.goalsAlerts.goalsUpdated'));
    } catch (error) {
      console.error('Error saving goals:', error);
      Alert.alert(t('common.error'), t('profile.goalsAlerts.goalsFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  const toggleEquipment = (equipmentId: string) => {
    setSelectedEquipment(prev =>
      prev.includes(equipmentId)
        ? prev.filter(e => e !== equipmentId)
        : [...prev, equipmentId]
    );
  };

  const saveEquipment = async () => {
    try {
      setIsSaving(true);
      await userApi.updateEquipment(selectedEquipment);
      if (user) {
        setUser({ ...user, equipment: selectedEquipment });
      }
      sendOnboardingTelemetry({
        milestone: 'equipment_selected',
        context: `count_${selectedEquipment.length}`,
      }).catch(() => null);
      setShowEquipmentModal(false);
      Alert.alert(t('common.success'), t('profile.goalsAlerts.equipmentUpdated'));
    } catch (error) {
      console.error('Error saving equipment:', error);
      Alert.alert(t('common.error'), t('profile.goalsAlerts.equipmentFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
        {/* Profile Header */}
        <View style={styles.profileHeader}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={40} color="#10B981" />
          </View>
          <Text style={styles.userName}>{user?.name || t('common.user')}</Text>
          <Text style={styles.userEmail}>{user?.email || ''}</Text>
        </View>

        {/* ── Subscription Section ── [PRO] ──────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('profile.subscription')}</Text>
          <View style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <Ionicons
                name={isPro ? 'star' : 'star-outline'}
                size={22}
                color={isPro ? '#FF6200' : '#6B7280'}
              />
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>
                  {isPro ? t('profile.gainTrackPro') : t('profile.freePlan')}
                </Text>
                {isPro ? (
                  <Text style={[styles.settingValue, { color: '#FF6200' }]}>
                    {t('profile.proThanks')}
                  </Text>
                ) : (
                  <Text style={styles.settingValue}>{t('profile.unlockAllFeatures')}</Text>
                )}
              </View>
            </View>
            {/* Badge */}
            <View
              style={[
                styles.proBadge,
                isPro ? styles.proBadgeActive : styles.proBadgeFree,
              ]}
            >
              <Text
                style={[
                  styles.proBadgeText,
                  isPro ? styles.proBadgeTextActive : styles.proBadgeTextFree,
                ]}
              >
                {isPro ? 'PRO' : 'FREE'}
              </Text>
            </View>
          </View>
          {!isPro && (
            <TouchableOpacity
              style={styles.goProButton}
              onPress={() => router.push('/pro-paywall')}
            >
              <Ionicons name="flash" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.goProText}>{t('profile.goPro')}</Text>
            </TouchableOpacity>
          )}
        </View>
        {/* ──────────────────────────────────────────────────────────────── */}

        {/* Body Measurements Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('profile.bodyTracking')}</Text>
          <TouchableOpacity
            style={styles.settingItem}
            onPress={() => router.push('/measurements')}
          >
            <View style={styles.settingLeft}>
              <Ionicons name="body-outline" size={22} color="#8B5CF6" />
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>{t('profile.bodyMeasurements')}</Text>
                <Text style={styles.settingValue}>{t('profile.bodyMeasurementsDesc')}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#6B7280" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.settingItem}
            onPress={() => router.push('/body-composition-goal' as any)}
          >
            <View style={styles.settingLeft}>
              <Ionicons name="trending-down-outline" size={22} color="#FF6200" />
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>{t('profile.bodyCompositionGoal')}</Text>
                <Text style={styles.settingValue}>{t('profile.bodyCompositionGoalDesc')}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#6B7280" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.settingItem}
            onPress={() => router.push('/physique-progress' as any)}
          >
            <View style={styles.settingLeft}>
              <Ionicons name="camera-outline" size={22} color="#3B82F6" />
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>{t('profile.physiquePhotos')}</Text>
                <Text style={styles.settingValue}>{t('profile.physiquePhotosDesc')}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#6B7280" />
          </TouchableOpacity>
        </View>

        {/* Units Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('profile.units')}</Text>
          <View style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <Ionicons name="barbell-outline" size={22} color="#FF6200" />
              <Text style={styles.settingLabel}>{t('profile.weight')}</Text>
            </View>
            <View style={styles.unitToggleRow}>
              {(['kg', 'lbs'] as const).map((opt) => (
                <TouchableOpacity
                  key={opt}
                  style={[styles.unitPill, weightUnit === opt && styles.unitPillActive]}
                  onPress={() => { setWeightUnit(opt); saveUnits(opt, heightUnit, distanceUnit); }}
                >
                  <Text style={[styles.unitPillText, weightUnit === opt && styles.unitPillTextActive]}>{opt}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <View style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <Ionicons name="resize-outline" size={22} color="#FF6200" />
              <Text style={styles.settingLabel}>{t('profile.height')}</Text>
            </View>
            <View style={styles.unitToggleRow}>
              {(['cm', 'in'] as const).map((opt) => (
                <TouchableOpacity
                  key={opt}
                  style={[styles.unitPill, heightUnit === opt && styles.unitPillActive]}
                  onPress={() => { setHeightUnit(opt); saveUnits(weightUnit, opt, distanceUnit); }}
                >
                  <Text style={[styles.unitPillText, heightUnit === opt && styles.unitPillTextActive]}>{opt}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <View style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <Ionicons name="navigate-outline" size={22} color="#FF6200" />
              <Text style={styles.settingLabel}>{t('profile.distance')}</Text>
            </View>
            <View style={styles.unitToggleRow}>
              {(['km', 'mi'] as const).map((opt) => (
                <TouchableOpacity
                  key={opt}
                  style={[styles.unitPill, distanceUnit === opt && styles.unitPillActive]}
                  onPress={() => { setDistanceUnit(opt); saveUnits(weightUnit, heightUnit, opt); }}
                >
                  <Text style={[styles.unitPillText, distanceUnit === opt && styles.unitPillTextActive]}>{opt}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <View style={[styles.settingItem, { flexDirection: 'column', alignItems: 'flex-start' }]}>
            <View style={[styles.settingLeft, { marginBottom: 10 }]}>
              <Ionicons name="language-outline" size={22} color="#FF6200" />
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>{t('profile.language')}</Text>
                <Text style={styles.settingValue}>{t('profile.languageDesc')}</Text>
              </View>
            </View>
            <View style={[styles.unitToggleRow, { flexWrap: 'wrap' }]}>
              {SUPPORTED_LANGUAGES.map((entry) => (
                <TouchableOpacity
                  key={entry.code}
                  style={[styles.unitPill, locale === entry.code && styles.unitPillActive, { marginBottom: 8 }]}
                  onPress={() => handleLanguageSelect(entry.code)}
                >
                  <Text style={[styles.unitPillText, locale === entry.code && styles.unitPillTextActive]}>
                    {getLocalizedLanguageLabel(entry.code)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* Goals Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('profile.dailyGoals')}</Text>
          <TouchableOpacity
            style={styles.settingItem}
            onPress={() => setShowGoalsModal(true)}
          >
            <View style={styles.settingLeft}>
              <Ionicons name="nutrition-outline" size={22} color="#10B981" />
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>{t('profile.macroTargets')}</Text>
                <Text style={styles.settingValue}>
                  {user?.goals?.daily_calories || 2000} cal | {user?.goals?.protein_grams || 150}g P
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#6B7280" />
          </TouchableOpacity>
        </View>

        {/* Equipment Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('profile.homeGymEquipment')}</Text>
          <TouchableOpacity
            style={styles.settingItem}
            onPress={() => setShowEquipmentModal(true)}
          >
            <View style={styles.settingLeft}>
              <Ionicons name="barbell-outline" size={22} color="#3B82F6" />
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>{t('profile.myEquipment')}</Text>
                <Text style={styles.settingValue}>
                  {t('profile.itemsSelected', { count: user?.equipment?.length || 0 })}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#6B7280" />
          </TouchableOpacity>
          <Text style={styles.hint}>
            {t('profile.equipmentHint')}
          </Text>
        </View>

        {/* Workout Settings Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('profile.workout')}</Text>
          <View style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <Ionicons name="timer-outline" size={22} color="#FF6200" />
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>{t('profile.autoRestTimer')}</Text>
                <Text style={styles.settingValue}>{t('profile.autoRestTimerDesc')}</Text>
              </View>
            </View>
            <Switch
              value={autoStartRestTimer}
              onValueChange={toggleAutoRestTimer}
              trackColor={{ false: '#3A3A3A', true: '#FF6200' }}
              thumbColor="#FFFFFF"
            />
          </View>
          <View style={[styles.settingItem, { flexDirection: 'column', alignItems: 'flex-start' }]}>
            <View style={[styles.settingLeft, { marginBottom: 10 }]}>
              <Ionicons name="hourglass-outline" size={22} color="#FF6200" />
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>{t('profile.defaultRestDuration')}</Text>
                <Text style={styles.settingValue}>{t('profile.currentRestDuration', { duration: getRestDurationLabel(restDuration) })}</Text>
              </View>
            </View>
            <View style={styles.unitToggleRow}>
              {REST_PRESETS.map((p) => (
                <TouchableOpacity
                  key={p.value}
                  style={[styles.unitPill, restDuration === p.value && styles.unitPillActive]}
                  onPress={() => selectRestDuration(p.value)}
                >
                  <Text style={[styles.unitPillText, restDuration === p.value && styles.unitPillTextActive]}>{p.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* Tools Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('profile.tools')}</Text>
          <TouchableOpacity
            style={styles.settingItem}
            onPress={() => setShowPlateCalc(true)}
          >
            <View style={styles.settingLeft}>
              <Ionicons name="barbell-outline" size={22} color="#FF6200" />
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>{t('profile.plateCalculator')}</Text>
                <Text style={styles.settingValue}>{t('profile.plateCalculatorDesc')}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#6B7280" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.settingItem}
            onPress={() => router.push('/progression' as any)}
          >
            <View style={styles.settingLeft}>
              <Ionicons name="trending-up-outline" size={22} color="#FF6200" />
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>{t('profile.progressionTracker')}</Text>
                <Text style={styles.settingValue}>{t('profile.progressionTrackerDesc')}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#6B7280" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.settingItem}
            onPress={() => router.push('/social-leaderboard' as any)}
          >
            <View style={styles.settingLeft}>
              <Ionicons name="people-outline" size={22} color="#FF6200" />
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>{t('profile.privateLeaderboard')}</Text>
                <Text style={styles.settingValue}>{t('profile.privateLeaderboardDesc')}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#6B7280" />
          </TouchableOpacity>
        </View>

        {/* Notifications Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('profile.reminders')}</Text>
          <TouchableOpacity
            style={styles.settingItem}
            onPress={() => router.push('/notifications')}
          >
            <View style={styles.settingLeft}>
              <Ionicons name="notifications-outline" size={22} color="#F59E0B" />
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>{t('profile.pushNotifications')}</Text>
                <Text style={styles.settingValue}>{t('profile.pushNotificationsDesc')}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#6B7280" />
          </TouchableOpacity>
        </View>

        {/* Health Integrations Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('profile.healthIntegrations')}</Text>
          <View style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <Ionicons name="heart-outline" size={22} color="#FF6200" />
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>{t('profile.healthDataConsent')}</Text>
                <Text style={styles.settingValue}>
                  {healthSyncSettings?.consentGiven ? t('profile.healthDataEnabled') : t('profile.disabled')}
                </Text>
              </View>
            </View>
            <Switch
              value={Boolean(healthSyncSettings?.consentGiven)}
              onValueChange={toggleHealthConsent}
              trackColor={{ false: '#3A3A3A', true: '#FF6200' }}
              thumbColor="#FFFFFF"
            />
          </View>

          {supportedHealthProviders.length === 0 ? (
            <View style={[styles.settingItem, styles.healthProviderCard]}>
              <View style={styles.settingLeft}>
                <Ionicons name="phone-portrait-outline" size={20} color="#6B7280" />
                <View style={styles.settingInfo}>
                  <Text style={styles.settingLabel}>{t('profile.noProvider')}</Text>
                  <Text style={styles.settingValue}>{t('profile.noProviderDesc')}</Text>
                </View>
              </View>
            </View>
          ) : (
            supportedHealthProviders.map((provider) => {
              const providerState = healthSyncSettings?.providers[provider];
              const isBusy = healthSyncProviderLoading === provider;
              const quality = getHealthSyncQuality(provider);
              const qualityColor = quality.level === 'good' ? '#4CAF50' : quality.level === 'warning' ? '#F59E0B' : '#F44336';

              return (
                <View key={provider} style={[styles.settingItem, styles.healthProviderCard]}>
                  <View style={styles.healthProviderHeader}>
                    <View style={styles.settingLeft}>
                      <Ionicons
                        name={provider === 'apple_health' ? 'logo-apple' : 'logo-google'}
                        size={20}
                        color="#FF6200"
                      />
                      <View style={styles.settingInfo}>
                        <Text style={styles.settingLabel}>{getProviderLabel(provider)}</Text>
                        <Text style={styles.settingValue}>
                          {providerState?.connected ? t('profile.connected') : t('profile.notConnected')}
                          {providerState?.lastSyncAt ? ` • ${t('profile.lastSync', { date: formatLocalDate(providerState.lastSyncAt) })}` : ''}
                        </Text>
                      </View>
                    </View>
                    <Switch
                      value={Boolean(providerState?.enabled)}
                      onValueChange={(value) => handleToggleHealthProvider(provider, value)}
                      trackColor={{ false: '#3A3A3A', true: '#FF6200' }}
                      thumbColor="#FFFFFF"
                    />
                  </View>

                  {!providerState?.nativeBridgeAvailable ? (
                    <Text style={styles.healthWarningText}>
                      {t('profile.health.bridgeMissingDetail')}
                    </Text>
                  ) : null}

                  <View style={styles.healthProviderActions}>
                    <TouchableOpacity
                      style={[styles.healthActionButton, isBusy && styles.healthActionButtonDisabled]}
                      onPress={() => handleConnectHealthProvider(provider)}
                      disabled={isBusy}
                    >
                      <Text style={styles.healthActionText}>{isBusy ? t('profile.working') : t('profile.connect')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.healthActionButton, isBusy && styles.healthActionButtonDisabled]}
                      onPress={() => handleSyncHealthProviderNow(provider)}
                      disabled={isBusy}
                    >
                      <Text style={styles.healthActionText}>{isBusy ? t('profile.syncing') : t('profile.syncNow')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.healthActionButton, styles.healthTroubleshootButton]}
                      onPress={() => showHealthTroubleshooting(provider)}
                    >
                      <Text style={styles.healthActionText}>{t('profile.troubleshoot')}</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.healthQualityRow}>
                    <View style={[styles.healthQualityDot, { backgroundColor: qualityColor }]} />
                    <Text style={styles.healthQualityTitle}>{t('profile.syncQuality', { label: quality.label })}</Text>
                  </View>
                  <Text style={styles.healthQualityDetail}>{quality.detail}</Text>
                </View>
              );
            })
          )}

          <Text style={styles.hint}>
            {t('profile.healthHint')}
          </Text>
        </View>

        {/* Privacy Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('profile.privacy')}</Text>
          <View style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <Ionicons name="shield-checkmark-outline" size={22} color="#FF6200" />
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>{t('profile.aiCoachDataSharing')}</Text>
                <Text style={styles.settingValue}>
                  {aiConsent
                    ? t('profile.aiEnabled')
                    : t('profile.aiDisabled')}
                </Text>
              </View>
            </View>
            <Switch
              value={aiConsent}
              onValueChange={toggleAiConsent}
              trackColor={{ false: '#3A3A3A', true: '#FF6200' }}
              thumbColor="#FFFFFF"
            />
          </View>
          <Text style={styles.hint}>
            {t('profile.aiHint')}
          </Text>
          <TouchableOpacity
            style={[styles.settingItem, { marginTop: 8 }]}
            onPress={() => router.push('/privacy-policy' as any)}
          >
            <View style={styles.settingLeft}>
              <Ionicons name="document-text-outline" size={22} color="#FF6200" />
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>{t('profile.privacyPolicy')}</Text>
                <Text style={styles.settingValue}>{t('profile.privacyPolicyDesc')}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#6B7280" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.settingItem}
            onPress={() => router.push('/terms' as any)}
          >
            <View style={styles.settingLeft}>
              <Ionicons name="document-outline" size={22} color="#FF6200" />
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>{t('profile.termsOfService')}</Text>
                <Text style={styles.settingValue}>{t('profile.termsOfServiceDesc')}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#6B7280" />
          </TouchableOpacity>
        </View>

        {/* Account Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('profile.account')}</Text>
          <TouchableOpacity style={styles.settingItem} onPress={handleExportMyData}>
            <View style={styles.settingLeft}>
              <Ionicons name="download-outline" size={22} color="#FF6200" />
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>{t('profile.exportMyData')}</Text>
                <Text style={styles.settingValue}>{t('profile.exportMyDataDesc')}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#6B7280" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.settingItem} onPress={handleLogout}>
            <View style={styles.settingLeft}>
              <Ionicons name="log-out-outline" size={22} color="#EF4444" />
              <Text style={[styles.settingLabel, { color: '#EF4444' }]}>{t('profile.logout')}</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={styles.settingItem} onPress={handleDeleteAccount}>
            <View style={styles.settingLeft}>
              <Ionicons name="trash-outline" size={22} color="#EF4444" />
              <View style={styles.settingInfo}>
                <Text style={[styles.settingLabel, { color: '#EF4444' }]}>{t('profile.deleteAccount')}</Text>
                <Text style={styles.settingValue}>{t('profile.deleteAccountDesc')}</Text>
              </View>
            </View>
          </TouchableOpacity>
        </View>

        {/* App Info */}
        <View style={styles.appInfo}>
          <Text style={styles.appName}>GainTrack</Text>
          <Text style={styles.appVersion}>{t('profile.version')}</Text>
        </View>
      </ScrollView>

      {/* Goals Modal */}
      <Modal visible={showGoalsModal} animationType="slide" transparent onRequestClose={() => setShowGoalsModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('profile.editGoals')}</Text>
              <TouchableOpacity onPress={() => setShowGoalsModal(false)}>
                <Ionicons name="close" size={24} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.modalScrollContent} showsVerticalScrollIndicator={false}>
              {/* TDEE Wizard */}
              <TouchableOpacity style={styles.tdeeToggle} onPress={() => setShowTDEE(v => !v)}>
                <Ionicons name="calculator-outline" size={18} color="#FF6200" />
                <Text style={styles.tdeeToggleText}>{t('profile.calculateWithTdee')}</Text>
                <Ionicons name={showTDEE ? 'chevron-up' : 'chevron-down'} size={16} color="#B0B0B0" />
              </TouchableOpacity>
              {showTDEE && (
                <View style={styles.tdeeSection}>
                  <View style={styles.tdeeRow}>
                    <View style={[styles.inputGroup, { flex: 1 }]}>
                      <Text style={styles.inputLabel}>{t('profile.weightKg')}</Text>
                      <TextInput style={styles.input} value={tdeeWeight} onChangeText={setTdeeWeight} keyboardType="decimal-pad" placeholder="75" placeholderTextColor="#6B7280" />
                    </View>
                    <View style={[styles.inputGroup, { flex: 1 }]}>
                      <Text style={styles.inputLabel}>{t('profile.heightCm')}</Text>
                      <TextInput style={styles.input} value={tdeeHeight} onChangeText={setTdeeHeight} keyboardType="decimal-pad" placeholder="175" placeholderTextColor="#6B7280" />
                    </View>
                  </View>
                  <View style={styles.tdeeRow}>
                    <View style={[styles.inputGroup, { flex: 1 }]}>
                      <Text style={styles.inputLabel}>{t('profile.age')}</Text>
                      <TextInput style={styles.input} value={tdeeAge} onChangeText={setTdeeAge} keyboardType="numeric" placeholder="25" placeholderTextColor="#6B7280" />
                    </View>
                    <View style={[styles.inputGroup, { flex: 1 }]}>
                      <Text style={styles.inputLabel}>{t('profile.sex')}</Text>
                      <View style={styles.sexRow}>
                        {(['male', 'female'] as const).map(s => (
                          <TouchableOpacity key={s} style={[styles.sexPill, tdeeSex === s && styles.sexPillActive]} onPress={() => setTdeeSex(s)}>
                            <Text style={[styles.sexPillText, tdeeSex === s && styles.sexPillTextActive]}>{s === 'male' ? t('profile.male') : t('profile.female')}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  </View>
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>{t('profile.activityLevel')}</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        {activityOptions.map(opt => (
                          <TouchableOpacity key={opt.value} style={[styles.activityPill, tdeeActivity === opt.value && styles.activityPillActive]} onPress={() => setTdeeActivity(opt.value)}>
                            <Text style={[styles.activityPillText, tdeeActivity === opt.value && styles.activityPillTextActive]}>{opt.label}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </ScrollView>
                  </View>
                  <TouchableOpacity style={styles.tdeeCalcBtn} onPress={calculateTDEE}>
                    <Ionicons name="flash" size={16} color="#FFFFFF" />
                    <Text style={styles.tdeeCalcBtnText}>{t('profile.applyTdeeGoals')}</Text>
                  </TouchableOpacity>
                </View>
              )}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>{t('profile.dailyCalories')}</Text>
                <TextInput style={styles.input} value={calories} onChangeText={setCalories} keyboardType="numeric" placeholder="2000" placeholderTextColor="#6B7280" />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>{t('profile.protein')}</Text>
                <TextInput style={styles.input} value={protein} onChangeText={setProtein} keyboardType="numeric" placeholder="150" placeholderTextColor="#6B7280" />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>{t('profile.carbs')}</Text>
                <TextInput style={styles.input} value={carbs} onChangeText={setCarbs} keyboardType="numeric" placeholder="200" placeholderTextColor="#6B7280" />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>{t('profile.fat')}</Text>
                <TextInput style={styles.input} value={fat} onChangeText={setFat} keyboardType="numeric" placeholder="65" placeholderTextColor="#6B7280" />
              </View>
              <TouchableOpacity style={[styles.saveButton, isSaving && styles.saveButtonDisabled]} onPress={saveGoals} disabled={isSaving}>
                <Text style={styles.saveButtonText}>{isSaving ? t('common.saving') : t('profile.saveGoals')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.resetButton} onPress={() => {
                setCalories('2000');
                setProtein('150');
                setCarbs('200');
                setFat('65');
              }}>
                <Text style={styles.resetButtonText}>{t('common.restoreDefaults')}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Plate Calculator Modal */}
      <Modal visible={showPlateCalc} animationType="slide" transparent onRequestClose={() => setShowPlateCalc(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: 32 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('profile.plateCalculator')}</Text>
              <TouchableOpacity onPress={() => setShowPlateCalc(false)}>
                <Ionicons name="close" size={24} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
            <PlateCalculator />
          </View>
        </View>
      </Modal>

      {/* Equipment Modal */}
      <Modal visible={showEquipmentModal} animationType="slide" transparent onRequestClose={() => setShowEquipmentModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('profile.myEquipmentTitle')}</Text>
              <TouchableOpacity onPress={() => setShowEquipmentModal(false)}>
                <Ionicons name="close" size={24} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>{t('profile.myEquipmentSubtitle')}</Text>
            <View style={styles.equipmentGrid}>
              {EQUIPMENT_OPTIONS.map((eq) => (
                <TouchableOpacity
                  key={eq.id}
                  style={[styles.equipmentItem, selectedEquipment.includes(eq.id) && styles.equipmentItemSelected]}
                  onPress={() => toggleEquipment(eq.id)}
                >
                  <Ionicons name={eq.icon as any} size={28} color={selectedEquipment.includes(eq.id) ? '#10B981' : '#6B7280'} />
                  <Text style={[styles.equipmentLabel, selectedEquipment.includes(eq.id) && styles.equipmentLabelSelected]}>
                    {getLocalizedEquipmentLabel(eq.id)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={[styles.saveButton, isSaving && styles.saveButtonDisabled]} onPress={saveEquipment} disabled={isSaving}>
              <Text style={styles.saveButtonText}>{isSaving ? t('common.saving') : t('profile.saveEquipment')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.resetButton} onPress={() => setSelectedEquipment(['dumbbells', 'barbell', 'pullup_bar'])}>
              <Text style={styles.resetButtonText}>{t('common.restoreDefaults')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111827' },
  content: { flex: 1 },
  scrollContent: { paddingBottom: 40 },
  profileHeader: { alignItems: 'center', paddingVertical: 32 },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#10B98120', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  userName: { color: '#FFFFFF', fontSize: 24, fontWeight: '700' },
  userEmail: { color: '#6B7280', fontSize: 14, marginTop: 4 },
  section: { paddingHorizontal: 20, marginBottom: 24 },
  sectionTitle: { color: '#6B7280', fontSize: 12, fontWeight: '600', textTransform: 'uppercase', marginBottom: 12 },
  settingItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#1F2937', padding: 16, borderRadius: 12, marginBottom: 8, gap: 12 },
  settingLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 },
  settingInfo: { marginLeft: 4, flex: 1, minWidth: 0 },
  settingLabel: { color: '#FFFFFF', fontSize: 16, flexShrink: 1 },
  settingValue: { color: '#6B7280', fontSize: 12, marginTop: 2, flexShrink: 1, lineHeight: 16 },
  hint: { color: '#6B7280', fontSize: 12, marginTop: 8, paddingHorizontal: 4 },
  appInfo: { alignItems: 'center', paddingTop: 32 },
  appName: { color: '#10B981', fontSize: 18, fontWeight: '700' },
  appVersion: { color: '#6B7280', fontSize: 12, marginTop: 4 },
  // [PRO] Subscription section styles
  proBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  proBadgeActive: { backgroundColor: '#FF620020', borderWidth: 1, borderColor: '#FF6200' },
  proBadgeFree: { backgroundColor: '#2D2D2D', borderWidth: 1, borderColor: '#6B7280' },
  proBadgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  proBadgeTextActive: { color: '#FF6200' },
  proBadgeTextFree: { color: '#6B7280' },
  goProButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF6200',
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 8,
  },
  goProText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', flexShrink: 1, textAlign: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.6)', justifyContent: 'flex-end' },
  modalContent: { flex: 1, backgroundColor: '#1F2937', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 24, paddingTop: 24, maxHeight: '95%' },
  modalScrollContent: { paddingHorizontal: 0, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingRight: 0 },
  modalTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' },
  modalSubtitle: { color: '#9CA3AF', fontSize: 14, marginBottom: 20 },
  inputGroup: { marginBottom: 16 },
  inputLabel: { color: '#9CA3AF', fontSize: 14, marginBottom: 8 },
  input: { backgroundColor: '#111827', borderRadius: 12, padding: 16, color: '#FFFFFF', fontSize: 16 },
  saveButton: { backgroundColor: '#10B981', paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginTop: 20 },
  saveButtonDisabled: { opacity: 0.7 },
  saveButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  equipmentGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  equipmentItem: { width: '30%', aspectRatio: 1, backgroundColor: '#111827', borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: 'transparent' },
  equipmentItemSelected: { borderColor: '#10B981', backgroundColor: '#10B98115' },
  equipmentLabel: { color: '#6B7280', fontSize: 11, marginTop: 6, textAlign: 'center' },
  equipmentLabelSelected: { color: '#10B981' },
  resetButton: { paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  resetButtonText: { color: '#6B7280', fontSize: 14, textDecorationLine: 'underline' },
  unitToggleRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  unitPill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: '#111827', borderWidth: 1.5, borderColor: '#374151', minHeight: 36, justifyContent: 'center' },
  unitPillActive: { borderColor: '#FF6200', backgroundColor: '#FF620018' },
  unitPillText: { color: '#6B7280', fontSize: 13, fontWeight: '600', flexShrink: 1 },
  unitPillTextActive: { color: '#FF6200' },
  tdeeToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 4, marginBottom: 4 },
  tdeeToggleText: { flex: 1, color: '#FF6200', fontSize: 14, fontWeight: '600' },
  tdeeSection: { backgroundColor: '#111827', borderRadius: 12, padding: 14, marginBottom: 14 },
  tdeeRow: { flexDirection: 'row', gap: 12 },
  sexRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  sexPill: { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: '#1F2937', alignItems: 'center', borderWidth: 1.5, borderColor: 'transparent' },
  sexPillActive: { borderColor: '#FF6200', backgroundColor: '#FF620015' },
  sexPillText: { color: '#6B7280', fontSize: 13, fontWeight: '600' },
  sexPillTextActive: { color: '#FF6200' },
  activityPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#1F2937', borderWidth: 1.5, borderColor: 'transparent' },
  activityPillActive: { borderColor: '#FF6200', backgroundColor: '#FF620015' },
  activityPillText: { color: '#6B7280', fontSize: 13, fontWeight: '600' },
  activityPillTextActive: { color: '#FF6200' },
  tdeeCalcBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#FF6200', paddingVertical: 12, borderRadius: 10, marginTop: 8 },
  tdeeCalcBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  healthProviderCard: { flexDirection: 'column', alignItems: 'stretch', gap: 10 },
  healthProviderHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  healthProviderActions: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  healthTroubleshootButton: {
    backgroundColor: '#1F2937',
  },
  healthActionButton: {
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    minWidth: 92,
  },
  healthActionButtonDisabled: { opacity: 0.6 },
  healthActionText: { color: '#FF6200', fontSize: 13, fontWeight: '700', textAlign: 'center', flexShrink: 1 },
  healthQualityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  healthQualityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  healthQualityTitle: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  healthQualityDetail: {
    color: '#B0B0B0',
    fontSize: 12,
    lineHeight: 16,
  },
  healthWarningText: { color: '#F59E0B', fontSize: 12 },
});

