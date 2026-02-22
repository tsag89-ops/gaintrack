import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const NOTIFICATION_SETTINGS_KEY = 'notification_settings';

export interface NotificationSettings {
  workoutReminder: boolean;
  workoutReminderTime: string; // HH:MM format
  nutritionReminder: boolean;
  nutritionReminderTime: string; // HH:MM format
  progressReminder: boolean;
  progressReminderDay: number; // 0-6 (Sunday-Saturday)
}

const DEFAULT_SETTINGS: NotificationSettings = {
  workoutReminder: true,
  workoutReminderTime: '09:00',
  nutritionReminder: true,
  nutritionReminderTime: '19:00',
  progressReminder: true,
  progressReminderDay: 0, // Sunday
};

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  let token: string | null = null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#10B981',
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Failed to get push token for push notification!');
      return null;
    }

    try {
      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId: process.env.EXPO_PROJECT_ID,
      });
      token = tokenData.data;
    } catch (e) {
      console.log('Error getting push token:', e);
    }
  } else {
    console.log('Must use physical device for Push Notifications');
  }

  return token;
}

export async function getNotificationSettings(): Promise<NotificationSettings> {
  try {
    const settings = await AsyncStorage.getItem(NOTIFICATION_SETTINGS_KEY);
    return settings ? JSON.parse(settings) : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveNotificationSettings(settings: NotificationSettings): Promise<void> {
  await AsyncStorage.setItem(NOTIFICATION_SETTINGS_KEY, JSON.stringify(settings));
  await scheduleNotifications(settings);
}

export async function scheduleNotifications(settings: NotificationSettings): Promise<void> {
  // Cancel all existing notifications
  await Notifications.cancelAllScheduledNotificationsAsync();

  // Schedule workout reminder
  if (settings.workoutReminder) {
    const [hours, minutes] = settings.workoutReminderTime.split(':').map(Number);
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '💪 Time to Work Out!',
        body: 'Ready to crush your workout? Your gains are waiting!',
        sound: true,
      },
      trigger: {
        hour: hours,
        minute: minutes,
        repeats: true,
      },
    });
  }

  // Schedule nutrition reminder
  if (settings.nutritionReminder) {
    const [hours, minutes] = settings.nutritionReminderTime.split(':').map(Number);
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '🍽️ Nutrition Check-In',
        body: 'Have you logged your meals today? Keep tracking those macros!',
        sound: true,
      },
      trigger: {
        hour: hours,
        minute: minutes,
        repeats: true,
      },
    });
  }

  // Schedule weekly progress reminder
  if (settings.progressReminder) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '📊 Weekly Progress Update',
        body: 'Time to check your progress! Update your body measurements.',
        sound: true,
      },
      trigger: {
        weekday: settings.progressReminderDay + 1, // Expo uses 1-7 for Sun-Sat
        hour: 10,
        minute: 0,
        repeats: true,
      },
    });
  }
}

export async function sendImmediateNotification(title: string, body: string): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: true,
    },
    trigger: null, // Immediate
  });
}

export function addNotificationListener(
  handler: (notification: Notifications.Notification) => void
): Notifications.Subscription {
  return Notifications.addNotificationReceivedListener(handler);
}

export function addNotificationResponseListener(
  handler: (response: Notifications.NotificationResponse) => void
): Notifications.Subscription {
  return Notifications.addNotificationResponseReceivedListener(handler);
}
