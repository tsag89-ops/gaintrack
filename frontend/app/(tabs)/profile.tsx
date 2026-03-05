import React, { useState } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../src/store/authStore';
import { userApi } from '../../src/services/api';
import { getEquipmentLabel } from '../../src/utils/helpers';
import { useAuth } from '../../src/hooks/useAuth';
import { deleteAccount, signOut as nativeSignOut, REQUIRES_RECENT_LOGIN } from '../../src/services/authBridge';
import { usePro } from '../../src/hooks/usePro'; // [PRO]

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
  const [isSaving, setIsSaving] = useState(false);

  // Goals state
  const [calories, setCalories] = useState(String(user?.goals?.daily_calories || 2000));
  const [protein, setProtein] = useState(String(user?.goals?.protein_grams || 150));
  const [carbs, setCarbs] = useState(String(user?.goals?.carbs_grams || 200));
  const [fat, setFat] = useState(String(user?.goals?.fat_grams || 65));

  // Equipment state
  const [selectedEquipment, setSelectedEquipment] = useState<string[]>(user?.equipment || []);

  // Units state
  const [weightUnit, setWeightUnit] = useState<'kg' | 'lbs'>(user?.units?.weight || 'kg');
  const [heightUnit, setHeightUnit] = useState<'cm' | 'in'>(user?.units?.height || 'cm');
  const [distanceUnit, setDistanceUnit] = useState<'km' | 'mi'>(user?.units?.distance || 'km');

  const saveUnits = async (w: 'kg' | 'lbs', h: 'cm' | 'in', d: 'km' | 'mi') => {
    try {
      const units = { weight: w, height: h, distance: d };
      await userApi.updateUnits(units);
      if (user) setUser({ ...user, units });
    } catch (error) {
      console.error('Error saving units:', error);
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

  try {
    await deleteAccount();
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
    router.replace('/login');
  } catch (error) {
    console.error('Logout error:', error);
  }
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

        {/* Account Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
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
});
