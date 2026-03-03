import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  NotificationSettings,
  getNotificationSettings,
  saveNotificationSettings,
  registerForPushNotificationsAsync,
  sendImmediateNotification,
} from '../src/services/notifications';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const TIME_OPTIONS = [
  '06:00', '07:00', '08:00', '09:00', '10:00', '11:00',
  '12:00', '13:00', '14:00', '15:00', '16:00', '17:00',
  '18:00', '19:00', '20:00', '21:00', '22:00',
];

export default function NotificationsScreen() {
  const router = useRouter();
  const [settings, setSettings] = useState<NotificationSettings>({
    workoutReminder: true,
    workoutReminderTime: '09:00',
    nutritionReminder: true,
    nutritionReminderTime: '19:00',
    progressReminder: true,
    progressReminderDay: 0,
  });
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isExpoGo, setIsExpoGo] = useState(false);

  useEffect(() => {
    loadSettings();
    checkPermissions();
  }, []);

  const loadSettings = async () => {
    const savedSettings = await getNotificationSettings();
    setSettings(savedSettings);
  };

  const checkPermissions = async () => {
    const token = await registerForPushNotificationsAsync();
    if (token === null) {
      // Check if running in Expo Go
      setIsExpoGo(true);
    }
    setHasPermission(token !== null);
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      await saveNotificationSettings(settings);
      if (isExpoGo) {
        Alert.alert('Settings Saved', 'Notification preferences saved! Note: Push notifications require a development build to work on mobile.');
      } else {
        Alert.alert('Success', 'Notification settings saved!');
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      Alert.alert('Error', 'Failed to save notification settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestNotification = async () => {
    if (isExpoGo) {
      Alert.alert(
        'Not Available in Expo Go',
        'Push notifications require a development build. Your settings will be saved and work when you build the app.'
      );
      return;
    }
    
    try {
      const sent = await sendImmediateNotification(
        '🔔 Test Notification',
        'Your notifications are working! Keep crushing those goals!'
      );
      if (sent) {
        Alert.alert('Sent!', 'Check your notification panel.');
      } else {
        Alert.alert('Not Available', 'Push notifications are not available in this environment.');
      }
    } catch (error) {
      console.error('Error sending test notification:', error);
      Alert.alert('Error', 'Failed to send test notification');
    }
  };

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
  };

  const cycleTime = (currentTime: string, direction: 'next' | 'prev') => {
    const index = TIME_OPTIONS.indexOf(currentTime);
    if (direction === 'next') {
      return TIME_OPTIONS[(index + 1) % TIME_OPTIONS.length];
    } else {
      return TIME_OPTIONS[(index - 1 + TIME_OPTIONS.length) % TIME_OPTIONS.length];
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Notifications</Text>
          <Text style={styles.headerSubtitle}>Stay on track with reminders</Text>
        </View>
      </View>

      {isExpoGo && (
        <View style={styles.expoGoBanner}>
          <Ionicons name="information-circle" size={24} color="#2196F3" />
          <Text style={styles.expoGoText}>
            Running in Expo Go - Push notifications require a development build. Your settings will still be saved.
          </Text>
        </View>
      )}

      {!isExpoGo && hasPermission === false && (
        <View style={styles.permissionBanner}>
          <Ionicons name="warning" size={24} color="#FFC107" />
          <Text style={styles.permissionText}>
            Notifications are disabled. Please enable them in your device settings.
          </Text>
        </View>
      )}

      <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
        {/* Workout Reminder */}
        <View style={styles.reminderCard}>
          <View style={styles.reminderHeader}>
            <View style={styles.reminderIcon}>
              <Ionicons name="barbell" size={24} color="#4CAF50" />
            </View>
            <View style={styles.reminderInfo}>
              <Text style={styles.reminderTitle}>Workout Reminder</Text>
              <Text style={styles.reminderDesc}>Daily reminder to hit the gym</Text>
            </View>
            <Switch
              value={settings.workoutReminder}
              onValueChange={(value) => setSettings({ ...settings, workoutReminder: value })}
              trackColor={{ false: '#303030', true: '#4CAF5050' }}
              thumbColor={settings.workoutReminder ? '#4CAF50' : '#B0B0B0'}
            />
          </View>

          {settings.workoutReminder && (
            <View style={styles.timeSelector}>
              <Text style={styles.timeSelectorLabel}>Reminder Time</Text>
              <View style={styles.timeControls}>
                <TouchableOpacity
                  onPress={() =>
                    setSettings({
                      ...settings,
                      workoutReminderTime: cycleTime(settings.workoutReminderTime, 'prev'),
                    })
                  }
                  style={styles.timeButton}
                >
                  <Ionicons name="chevron-back" size={20} color="#FFFFFF" />
                </TouchableOpacity>
                <Text style={styles.timeValue}>{formatTime(settings.workoutReminderTime)}</Text>
                <TouchableOpacity
                  onPress={() =>
                    setSettings({
                      ...settings,
                      workoutReminderTime: cycleTime(settings.workoutReminderTime, 'next'),
                    })
                  }
                  style={styles.timeButton}
                >
                  <Ionicons name="chevron-forward" size={20} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* Nutrition Reminder */}
        <View style={styles.reminderCard}>
          <View style={styles.reminderHeader}>
            <View style={[styles.reminderIcon, { backgroundColor: '#2196F320' }]}>
              <Ionicons name="restaurant" size={24} color="#2196F3" />
            </View>
            <View style={styles.reminderInfo}>
              <Text style={styles.reminderTitle}>Nutrition Check-In</Text>
              <Text style={styles.reminderDesc}>Reminder to log your meals</Text>
            </View>
            <Switch
              value={settings.nutritionReminder}
              onValueChange={(value) => setSettings({ ...settings, nutritionReminder: value })}
              trackColor={{ false: '#303030', true: '#2196F350' }}
              thumbColor={settings.nutritionReminder ? '#2196F3' : '#B0B0B0'}
            />
          </View>

          {settings.nutritionReminder && (
            <View style={styles.timeSelector}>
              <Text style={styles.timeSelectorLabel}>Reminder Time</Text>
              <View style={styles.timeControls}>
                <TouchableOpacity
                  onPress={() =>
                    setSettings({
                      ...settings,
                      nutritionReminderTime: cycleTime(settings.nutritionReminderTime, 'prev'),
                    })
                  }
                  style={styles.timeButton}
                >
                  <Ionicons name="chevron-back" size={20} color="#FFFFFF" />
                </TouchableOpacity>
                <Text style={styles.timeValue}>{formatTime(settings.nutritionReminderTime)}</Text>
                <TouchableOpacity
                  onPress={() =>
                    setSettings({
                      ...settings,
                      nutritionReminderTime: cycleTime(settings.nutritionReminderTime, 'next'),
                    })
                  }
                  style={styles.timeButton}
                >
                  <Ionicons name="chevron-forward" size={20} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* Progress Reminder */}
        <View style={styles.reminderCard}>
          <View style={styles.reminderHeader}>
            <View style={[styles.reminderIcon, { backgroundColor: '#FF620020' }]}>
              <Ionicons name="analytics" size={24} color="#FF6200" />
            </View>
            <View style={styles.reminderInfo}>
              <Text style={styles.reminderTitle}>Weekly Progress</Text>
              <Text style={styles.reminderDesc}>Reminder to update measurements</Text>
            </View>
            <Switch
              value={settings.progressReminder}
              onValueChange={(value) => setSettings({ ...settings, progressReminder: value })}
              trackColor={{ false: '#303030', true: '#FF620050' }}
              thumbColor={settings.progressReminder ? '#FF6200' : '#B0B0B0'}
            />
          </View>

          {settings.progressReminder && (
            <View style={styles.daySelector}>
              <Text style={styles.timeSelectorLabel}>Reminder Day</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.daysContainer}
              >
                {DAYS.map((day, index) => (
                  <TouchableOpacity
                    key={day}
                    style={[
                      styles.dayChip,
                      settings.progressReminderDay === index && styles.dayChipActive,
                    ]}
                    onPress={() => setSettings({ ...settings, progressReminderDay: index })}
                  >
                    <Text
                      style={[
                        styles.dayChipText,
                        settings.progressReminderDay === index && styles.dayChipTextActive,
                      ]}
                    >
                      {day.slice(0, 3)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
        </View>

        {/* Test Notification */}
        <TouchableOpacity style={styles.testButton} onPress={handleTestNotification}>
          <Ionicons name="notifications-outline" size={20} color="#FFFFFF" />
          <Text style={styles.testButtonText}>Send Test Notification</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Save Button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={isSaving}
        >
          <Text style={styles.saveButtonText}>{isSaving ? 'Saving...' : 'Save Settings'}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1A1A1A',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  backButton: {
    padding: 4,
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#B0B0B0',
    marginTop: 2,
  },
  expoGoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2196F320',
    marginHorizontal: 20,
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
    gap: 10,
  },
  expoGoText: {
    flex: 1,
    color: '#2196F3',
    fontSize: 13,
  },
  permissionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFC10720',
    marginHorizontal: 20,
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
    gap: 10,
  },
  permissionText: {
    flex: 1,
    color: '#FFC107',
    fontSize: 13,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  reminderCard: {
    backgroundColor: '#252525',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  reminderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  reminderIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#4CAF5020',
    justifyContent: 'center',
    alignItems: 'center',
  },
  reminderInfo: {
    flex: 1,
    marginLeft: 12,
  },
  reminderTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  reminderDesc: {
    color: '#B0B0B0',
    fontSize: 12,
    marginTop: 2,
  },
  timeSelector: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#303030',
  },
  timeSelectorLabel: {
    color: '#B0B0B0',
    fontSize: 12,
    marginBottom: 10,
  },
  timeControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  timeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#303030',
    justifyContent: 'center',
    alignItems: 'center',
  },
  timeValue: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    minWidth: 100,
    textAlign: 'center',
  },
  daySelector: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#303030',
  },
  daysContainer: {
    gap: 8,
  },
  dayChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#303030',
    borderRadius: 20,
  },
  dayChipActive: {
    backgroundColor: '#FF6200',
  },
  dayChipText: {
    color: '#B0B0B0',
    fontSize: 13,
    fontWeight: '600',
  },
  dayChipTextActive: {
    color: '#FFFFFF',
  },
  testButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#303030',
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 8,
    gap: 8,
  },
  testButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingBottom: 34,
  },
  saveButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
