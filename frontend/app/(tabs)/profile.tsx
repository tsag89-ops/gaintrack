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
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useAuthStore } from '../../src/store/authStore';
import { userApi } from '../../src/services/api';
import { deleteUserCloudData } from '../../src/services/firestore';
import { getEquipmentLabel } from '../../src/utils/helpers';
import { useAuth } from '../../src/hooks/useAuth';
import { deleteAccount, signOut as nativeSignOut, REQUIRES_RECENT_LOGIN } from '../../src/services/authBridge';
import { usePro } from '../../src/hooks/usePro'; // [PRO]
import PlateCalculator from '../../src/components/PlateCalculator'; // [PRO]
import {
  HealthProvider,
  HealthSyncSettings,
  connectHealthProvider,
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
  const [healthSyncProviderLoading, setHealthSyncProviderLoading] = useState<HealthProvider | null>(null); // [PRO]
  const supportedHealthProviders = getSupportedProvidersForDevice(); // [PRO]

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

    getHealthSyncSettings()
      .then(setHealthSyncSettings)
      .catch(() => null);
  }, []);

  const refreshHealthSyncSettings = async () => {
    const next = await getHealthSyncSettings();
    setHealthSyncSettings(next);
  };

  const requireProForHealthSync = async (): Promise<boolean> => {
    if (isPro) return true;
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert(
      'Pro Feature',
      'HealthKit and Google Fit sync are available with GainTrack Pro ($4.99/yr).',
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Go Pro', onPress: () => router.push('/pro-paywall') },
      ],
    );
    return false;
  };

  const toggleHealthConsent = async (value: boolean) => {
    if (value && !(await requireProForHealthSync())) return;

    if (!value) {
      Alert.alert(
        'Disable Health Sync?',
        'This stops importing health data from connected providers until you enable it again.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Disable',
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
      Alert.alert('Consent required', 'Enable Health Data consent first.');
      return;
    }

    setHealthSyncProviderLoading(provider);
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const result = await connectHealthProvider(provider);
      await refreshHealthSyncSettings();
      Alert.alert(result.ok ? 'Connected' : 'Connection issue', result.message);
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
          'Sync complete',
          `${getProviderLabel(provider)} synced.\nProvider records: ${result.snapshot.providerRecordsRead}\nWorkouts: ${result.snapshot.workoutsImported}\nNutrition days: ${result.snapshot.nutritionDaysImported}\nMeasurements: ${result.snapshot.measurementsImported}`,
        );
      } else {
        Alert.alert('Sync unavailable', result.message);
      }
    } finally {
      setHealthSyncProviderLoading(null);
    }
  };

  const toggleAutoRestTimer = async (value: boolean) => {
    setAutoStartRestTimer(value);
    await Haptics.selectionAsync();
    await AsyncStorage.setItem(AUTO_REST_KEY, JSON.stringify(value));
  };

  const toggleAiConsent = async (value: boolean) => {
    if (!value) {
      // Confirm before revoking — AI chat history is unaffected but AI is disabled
      Alert.alert(
        'Disable AI Coach?',
        'Revoking consent will disable all AI features immediately. Your chat history is kept on this device. You can re-enable at any time.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Revoke',
            style: 'destructive',
            onPress: async () => {
              setAiConsent(false);
              await AsyncStorage.setItem(AI_CONSENT_KEY, 'false');
              await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            },
          },
        ],
      );
    } else {
      setAiConsent(true);
      await AsyncStorage.setItem(AI_CONSENT_KEY, 'true');
      await Haptics.selectionAsync();
    }
  };

  const selectRestDuration = async (seconds: number) => {
    setRestDuration(seconds);
    await Haptics.selectionAsync();
    await AsyncStorage.setItem(REST_DURATION_KEY, String(seconds));
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
      'Delete Account',
      'This will permanently delete your account and all data. This cannot be undone.',
      [
        { text: 'Cancel', onPress: () => resolve(false), style: 'cancel' },
        { text: 'Delete', onPress: () => resolve(true), style: 'destructive' },
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
        'Re-authentication Required',
        'For security, Firebase requires a recent sign-in before deleting your account. Sign out now, sign back in, and then delete your account.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Sign Out Now',
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
        'Error',
        error?.message ?? 'Failed to delete account. Please try again.',
      );
    }
  }
};

const handleLogout = async () => {
  const proceed = Platform.OS === 'web'
    ? window.confirm('Are you sure you want to logout?')
    : await new Promise((resolve) =>
        Alert.alert('Logout', 'Are you sure?', [
          { text: 'Cancel', onPress: () => resolve(false), style: 'cancel' },
          { text: 'Logout', onPress: () => resolve(true), style: 'destructive' },
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
      dialogTitle: 'Export GainTrack Data',
    });
  } catch (error: any) {
    Alert.alert('Export failed', error?.message ?? 'Could not export your data.');
  }
};




  const calculateTDEE = () => {
    const w = parseFloat(tdeeWeight);
    const h = parseFloat(tdeeHeight);
    const a = parseInt(tdeeAge);
    if (!w || !h || !a) { Alert.alert('Missing info', 'Enter weight (kg), height (cm), and age.'); return; }
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
      setShowGoalsModal(false);
      Alert.alert('Success', 'Goals updated successfully!');
    } catch (error) {
      console.error('Error saving goals:', error);
      Alert.alert('Error', 'Failed to save goals');
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
      setShowEquipmentModal(false);
      Alert.alert('Success', 'Equipment updated! Exercise suggestions will be filtered accordingly.');
    } catch (error) {
      console.error('Error saving equipment:', error);
      Alert.alert('Error', 'Failed to save equipment');
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
          <Text style={styles.userName}>{user?.name || 'User'}</Text>
          <Text style={styles.userEmail}>{user?.email || ''}</Text>
        </View>

        {/* ── Subscription Section ── [PRO] ──────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Subscription</Text>
          <View style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <Ionicons
                name={isPro ? 'star' : 'star-outline'}
                size={22}
                color={isPro ? '#FF6200' : '#6B7280'}
              />
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>
                  {isPro ? 'GainTrack Pro' : 'Free Plan'}
                </Text>
                {isPro ? (
                  <Text style={[styles.settingValue, { color: '#FF6200' }]}>
                    Thanks for supporting GainTrack Pro! 🎉
                  </Text>
                ) : (
                  <Text style={styles.settingValue}>Unlock all features</Text>
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
              <Text style={styles.goProText}>Go Pro — $4.99 / year</Text>
            </TouchableOpacity>
          )}
        </View>
        {/* ──────────────────────────────────────────────────────────────── */}

        {/* Body Measurements Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Body Tracking</Text>
          <TouchableOpacity
            style={styles.settingItem}
            onPress={() => router.push('/measurements')}
          >
            <View style={styles.settingLeft}>
              <Ionicons name="body-outline" size={22} color="#8B5CF6" />
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Body Measurements</Text>
                <Text style={styles.settingValue}>Track chest, arms, waist, legs & more</Text>
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
                <Text style={styles.settingLabel}>Body Composition Goal</Text>
                <Text style={styles.settingValue}>Set target weight, body fat & timeline</Text>
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
                <Text style={styles.settingLabel}>Physique Progress Photos</Text>
                <Text style={styles.settingValue}>Track visual changes with progress photos</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#6B7280" />
          </TouchableOpacity>
        </View>

        {/* Units Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Units</Text>
          <View style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <Ionicons name="barbell-outline" size={22} color="#FF6200" />
              <Text style={styles.settingLabel}>Weight</Text>
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
              <Text style={styles.settingLabel}>Height</Text>
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
              <Text style={styles.settingLabel}>Distance</Text>
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
        </View>

        {/* Goals Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Daily Goals</Text>
          <TouchableOpacity
            style={styles.settingItem}
            onPress={() => setShowGoalsModal(true)}
          >
            <View style={styles.settingLeft}>
              <Ionicons name="nutrition-outline" size={22} color="#10B981" />
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Macro Targets</Text>
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
          <Text style={styles.sectionTitle}>Home Gym Equipment</Text>
          <TouchableOpacity
            style={styles.settingItem}
            onPress={() => setShowEquipmentModal(true)}
          >
            <View style={styles.settingLeft}>
              <Ionicons name="barbell-outline" size={22} color="#3B82F6" />
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>My Equipment</Text>
                <Text style={styles.settingValue}>
                  {user?.equipment?.length || 0} items selected
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#6B7280" />
          </TouchableOpacity>
          <Text style={styles.hint}>
            Exercises will be filtered based on your available equipment
          </Text>
        </View>

        {/* Workout Settings Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Workout</Text>
          <View style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <Ionicons name="timer-outline" size={22} color="#FF6200" />
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Auto-start Rest Timer</Text>
                <Text style={styles.settingValue}>Starts automatically on every completed set</Text>
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
                <Text style={styles.settingLabel}>Default Rest Duration</Text>
                <Text style={styles.settingValue}>Currently {restDuration >= 60 ? `${restDuration / 60}m` : `${restDuration}s`} — applies to every workout</Text>
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
          <Text style={styles.sectionTitle}>Tools</Text>
          <TouchableOpacity
            style={styles.settingItem}
            onPress={() => setShowPlateCalc(true)}
          >
            <View style={styles.settingLeft}>
              <Ionicons name="barbell-outline" size={22} color="#FF6200" />
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Plate Calculator</Text>
                <Text style={styles.settingValue}>Visual barbell plate breakdown</Text>
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
                <Text style={styles.settingLabel}>Progression Tracker</Text>
                <Text style={styles.settingValue}>View strength gains over time</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#6B7280" />
          </TouchableOpacity>
        </View>

        {/* Notifications Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Reminders</Text>
          <TouchableOpacity
            style={styles.settingItem}
            onPress={() => router.push('/notifications')}
          >
            <View style={styles.settingLeft}>
              <Ionicons name="notifications-outline" size={22} color="#F59E0B" />
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Push Notifications</Text>
                <Text style={styles.settingValue}>Workout & nutrition reminders</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#6B7280" />
          </TouchableOpacity>
        </View>

        {/* Health Integrations Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Health Integrations</Text>
          <View style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <Ionicons name="heart-outline" size={22} color="#FF6200" />
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Health Data Consent</Text>
                <Text style={styles.settingValue}>
                  {healthSyncSettings?.consentGiven ? 'Enabled for connected providers' : 'Disabled'}
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
                  <Text style={styles.settingLabel}>No provider on this platform</Text>
                  <Text style={styles.settingValue}>Health sync is available on iOS and Android devices.</Text>
                </View>
              </View>
            </View>
          ) : (
            supportedHealthProviders.map((provider) => {
              const providerState = healthSyncSettings?.providers[provider];
              const isBusy = healthSyncProviderLoading === provider;

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
                          {providerState?.connected ? 'Connected' : 'Not connected'}
                          {providerState?.lastSyncAt ? ` • Last sync ${new Date(providerState.lastSyncAt).toLocaleDateString()}` : ''}
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
                      Native bridge not found in this build. Install native health modules to enable direct device reads.
                    </Text>
                  ) : null}

                  <View style={styles.healthProviderActions}>
                    <TouchableOpacity
                      style={[styles.healthActionButton, isBusy && styles.healthActionButtonDisabled]}
                      onPress={() => handleConnectHealthProvider(provider)}
                      disabled={isBusy}
                    >
                      <Text style={styles.healthActionText}>{isBusy ? 'Working...' : 'Connect'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.healthActionButton, isBusy && styles.healthActionButtonDisabled]}
                      onPress={() => handleSyncHealthProviderNow(provider)}
                      disabled={isBusy}
                    >
                      <Text style={styles.healthActionText}>{isBusy ? 'Syncing...' : 'Sync now'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}

          <Text style={styles.hint}>
            Health integrations are Pro-only and require explicit consent. Connection state is stored locally and can be revoked anytime.
          </Text>
        </View>

        {/* Privacy Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Privacy</Text>
          <View style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <Ionicons name="shield-checkmark-outline" size={22} color="#FF6200" />
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>AI Coach Data Sharing</Text>
                <Text style={styles.settingValue}>
                  {aiConsent
                    ? 'Enabled — prompts shared with OpenRouter'
                    : 'Disabled — AI features are off'}
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
            When enabled, your AI prompts and replies are shared with OpenRouter for processing. See the AI tab for the full data &amp; health notice.
          </Text>
          <TouchableOpacity
            style={[styles.settingItem, { marginTop: 8 }]}
            onPress={() => router.push('/privacy-policy')}
          >
            <View style={styles.settingLeft}>
              <Ionicons name="document-text-outline" size={22} color="#FF6200" />
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Privacy Policy</Text>
                <Text style={styles.settingValue}>View data use and rights</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#6B7280" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.settingItem}
            onPress={() => router.push('/terms')}
          >
            <View style={styles.settingLeft}>
              <Ionicons name="document-outline" size={22} color="#FF6200" />
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Terms of Service</Text>
                <Text style={styles.settingValue}>Review app terms</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#6B7280" />
          </TouchableOpacity>
        </View>

        {/* Account Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <TouchableOpacity style={styles.settingItem} onPress={handleExportMyData}>
            <View style={styles.settingLeft}>
              <Ionicons name="download-outline" size={22} color="#FF6200" />
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Export My Data</Text>
                <Text style={styles.settingValue}>Download your account data as JSON</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#6B7280" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.settingItem} onPress={handleLogout}>
            <View style={styles.settingLeft}>
              <Ionicons name="log-out-outline" size={22} color="#EF4444" />
              <Text style={[styles.settingLabel, { color: '#EF4444' }]}>Logout</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={styles.settingItem} onPress={handleDeleteAccount}>
            <View style={styles.settingLeft}>
              <Ionicons name="trash-outline" size={22} color="#EF4444" />
              <View style={styles.settingInfo}>
                <Text style={[styles.settingLabel, { color: '#EF4444' }]}>Delete Account</Text>
                <Text style={styles.settingValue}>Permanently remove your account and data</Text>
              </View>
            </View>
          </TouchableOpacity>
        </View>

        {/* App Info */}
        <View style={styles.appInfo}>
          <Text style={styles.appName}>GainTrack</Text>
          <Text style={styles.appVersion}>Version 1.0.0</Text>
        </View>
      </ScrollView>

      {/* Goals Modal */}
      <Modal visible={showGoalsModal} animationType="slide" transparent onRequestClose={() => setShowGoalsModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Goals</Text>
              <TouchableOpacity onPress={() => setShowGoalsModal(false)}>
                <Ionicons name="close" size={24} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
            {/* TDEE Wizard */}
            <TouchableOpacity style={styles.tdeeToggle} onPress={() => setShowTDEE(v => !v)}>
              <Ionicons name="calculator-outline" size={18} color="#FF6200" />
              <Text style={styles.tdeeToggleText}>Calculate with TDEE</Text>
              <Ionicons name={showTDEE ? 'chevron-up' : 'chevron-down'} size={16} color="#B0B0B0" />
            </TouchableOpacity>
            {showTDEE && (
              <View style={styles.tdeeSection}>
                <View style={styles.tdeeRow}>
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={styles.inputLabel}>Weight (kg)</Text>
                    <TextInput style={styles.input} value={tdeeWeight} onChangeText={setTdeeWeight} keyboardType="decimal-pad" placeholder="75" placeholderTextColor="#6B7280" />
                  </View>
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={styles.inputLabel}>Height (cm)</Text>
                    <TextInput style={styles.input} value={tdeeHeight} onChangeText={setTdeeHeight} keyboardType="decimal-pad" placeholder="175" placeholderTextColor="#6B7280" />
                  </View>
                </View>
                <View style={styles.tdeeRow}>
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={styles.inputLabel}>Age</Text>
                    <TextInput style={styles.input} value={tdeeAge} onChangeText={setTdeeAge} keyboardType="numeric" placeholder="25" placeholderTextColor="#6B7280" />
                  </View>
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={styles.inputLabel}>Sex</Text>
                    <View style={styles.sexRow}>
                      {(['male', 'female'] as const).map(s => (
                        <TouchableOpacity key={s} style={[styles.sexPill, tdeeSex === s && styles.sexPillActive]} onPress={() => setTdeeSex(s)}>
                          <Text style={[styles.sexPillText, tdeeSex === s && styles.sexPillTextActive]}>{s === 'male' ? 'Male' : 'Female'}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                </View>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Activity Level</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {[
                        { label: 'Sedentary', value: 1.2 },
                        { label: 'Light', value: 1.375 },
                        { label: 'Moderate', value: 1.55 },
                        { label: 'Active', value: 1.725 },
                        { label: 'Very Active', value: 1.9 },
                      ].map(opt => (
                        <TouchableOpacity key={opt.value} style={[styles.activityPill, tdeeActivity === opt.value && styles.activityPillActive]} onPress={() => setTdeeActivity(opt.value)}>
                          <Text style={[styles.activityPillText, tdeeActivity === opt.value && styles.activityPillTextActive]}>{opt.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                </View>
                <TouchableOpacity style={styles.tdeeCalcBtn} onPress={calculateTDEE}>
                  <Ionicons name="flash" size={16} color="#FFFFFF" />
                  <Text style={styles.tdeeCalcBtnText}>Apply TDEE Goals</Text>
                </TouchableOpacity>
              </View>
            )}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Daily Calories</Text>
              <TextInput style={styles.input} value={calories} onChangeText={setCalories} keyboardType="numeric" placeholder="2000" placeholderTextColor="#6B7280" />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Protein (g)</Text>
              <TextInput style={styles.input} value={protein} onChangeText={setProtein} keyboardType="numeric" placeholder="150" placeholderTextColor="#6B7280" />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Carbs (g)</Text>
              <TextInput style={styles.input} value={carbs} onChangeText={setCarbs} keyboardType="numeric" placeholder="200" placeholderTextColor="#6B7280" />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Fat (g)</Text>
              <TextInput style={styles.input} value={fat} onChangeText={setFat} keyboardType="numeric" placeholder="65" placeholderTextColor="#6B7280" />
            </View>
            <TouchableOpacity style={[styles.saveButton, isSaving && styles.saveButtonDisabled]} onPress={saveGoals} disabled={isSaving}>
              <Text style={styles.saveButtonText}>{isSaving ? 'Saving...' : 'Save Goals'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.resetButton} onPress={() => {
              setCalories('2000');
              setProtein('150');
              setCarbs('200');
              setFat('65');
            }}>
              <Text style={styles.resetButtonText}>Restore Defaults</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Plate Calculator Modal */}
      <Modal visible={showPlateCalc} animationType="slide" transparent onRequestClose={() => setShowPlateCalc(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: 32 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Plate Calculator</Text>
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
              <Text style={styles.modalTitle}>My Equipment</Text>
              <TouchableOpacity onPress={() => setShowEquipmentModal(false)}>
                <Ionicons name="close" size={24} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>Select the equipment you have at home</Text>
            <View style={styles.equipmentGrid}>
              {EQUIPMENT_OPTIONS.map((eq) => (
                <TouchableOpacity
                  key={eq.id}
                  style={[styles.equipmentItem, selectedEquipment.includes(eq.id) && styles.equipmentItemSelected]}
                  onPress={() => toggleEquipment(eq.id)}
                >
                  <Ionicons name={eq.icon as any} size={28} color={selectedEquipment.includes(eq.id) ? '#10B981' : '#6B7280'} />
                  <Text style={[styles.equipmentLabel, selectedEquipment.includes(eq.id) && styles.equipmentLabelSelected]}>
                    {getEquipmentLabel(eq.id)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={[styles.saveButton, isSaving && styles.saveButtonDisabled]} onPress={saveEquipment} disabled={isSaving}>
              <Text style={styles.saveButtonText}>{isSaving ? 'Saving...' : 'Save Equipment'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.resetButton} onPress={() => setSelectedEquipment(['dumbbells', 'barbell', 'pullup_bar'])}>
              <Text style={styles.resetButtonText}>Restore Defaults</Text>
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
  settingItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#1F2937', padding: 16, borderRadius: 12, marginBottom: 8 },
  settingLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  settingInfo: { marginLeft: 4 },
  settingLabel: { color: '#FFFFFF', fontSize: 16 },
  settingValue: { color: '#6B7280', fontSize: 12, marginTop: 2 },
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
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 8,
  },
  goProText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.6)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#1F2937', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
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
  unitToggleRow: { flexDirection: 'row', gap: 8 },
  unitPill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: '#111827', borderWidth: 1.5, borderColor: '#374151' },
  unitPillActive: { borderColor: '#FF6200', backgroundColor: '#FF620018' },
  unitPillText: { color: '#6B7280', fontSize: 13, fontWeight: '600' },
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
  healthProviderActions: { flexDirection: 'row', gap: 10 },
  healthActionButton: {
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  healthActionButtonDisabled: { opacity: 0.6 },
  healthActionText: { color: '#FF6200', fontSize: 13, fontWeight: '700' },
  healthWarningText: { color: '#F59E0B', fontSize: 12 },
});
