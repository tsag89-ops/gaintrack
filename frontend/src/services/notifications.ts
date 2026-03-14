import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { storage } from '../utils/storage';

const NOTIFICATION_SETTINGS_KEY = 'notification_settings';
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL?.trim() || '';

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

// Check if we're in Expo Go (notifications won't work there in SDK 53+)
let Notifications: any = null;
let Device: any = null;
let isNotificationsAvailable = false;

async function upsertPushTokenToBackend(token: string): Promise<void> {
  if (!BACKEND_URL) {
    return;
  }

  try {
    const sessionToken = await storage.getItem('sessionToken');
    if (!sessionToken) {
      return;
    }

    const response = await fetch(`${BACKEND_URL}/api/notifications/push-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({
        expo_push_token: token,
        platform: Platform.OS,
      }),
    });

    if (!response.ok) {
      console.log('Failed to upsert push token to backend:', response.status);
    }
  } catch (error) {
    console.log('Failed to upsert push token to backend:', error);
  }
}

export async function sendFirstWorkoutCompletedTelemetry(payload: {
  workoutId?: string;
  completedAt?: string;
}): Promise<void> {
  if (!BACKEND_URL) {
    return;
  }

  try {
    const sessionToken = await storage.getItem('sessionToken');
    if (!sessionToken) {
      return;
    }

    const response = await fetch(`${BACKEND_URL}/api/notifications/lifecycle/first-workout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({
        workout_id: payload.workoutId,
        completed_at: payload.completedAt,
      }),
    });

    if (!response.ok) {
      console.log('Failed to send first-workout telemetry:', response.status);
    }
  } catch (error) {
    console.log('Failed to send first-workout telemetry:', error);
  }
}

export async function sendSupersetTelemetry(payload: {
  eventType:
    | 'superset_attempt'
    | 'superset_attempt_blocked'
    | 'superset_paywall_view'
    | 'superset_completed_workout'
    | 'superset_first_completion_prompt_shown';
  success?: boolean;
  isPro?: boolean;
  workoutId?: string;
  groupsCount?: number;
  exercisesCount?: number;
  context?: string;
}): Promise<void> {
  if (!BACKEND_URL) {
    return;
  }

  try {
    const sessionToken = await storage.getItem('sessionToken');
    if (!sessionToken) {
      return;
    }

    const response = await fetch(`${BACKEND_URL}/api/workouts/superset/telemetry`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({
        event_type: payload.eventType,
        success: payload.success ?? true,
        is_pro: payload.isPro ?? false,
        workout_id: payload.workoutId,
        groups_count: payload.groupsCount ?? 0,
        exercises_count: payload.exercisesCount ?? 0,
        context: payload.context,
      }),
    });

    if (!response.ok) {
      console.log('Failed to send superset telemetry:', response.status);
    }
  } catch (error) {
    console.log('Failed to send superset telemetry:', error);
  }
}

async function initNotifications() {
  try {
    // Dynamically import to avoid crashes in Expo Go
    const notificationsModule = await import('expo-notifications');
    const deviceModule = await import('expo-device');
    
    Notifications = notificationsModule;
    Device = deviceModule;
    
    // Configure notification handler
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
    
    isNotificationsAvailable = true;
    return true;
  } catch (error) {
    console.log('Notifications not available (likely running in Expo Go):', error);
    isNotificationsAvailable = false;
    return false;
  }
}

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  const available = await initNotifications();
  if (!available || !Notifications || !Device) {
    console.log('Push notifications not available in Expo Go');
    return null;
  }

  let token: string | null = null;

  if (Platform.OS === 'android') {
    try {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#10B981',
      });
    } catch (e) {
      console.log('Error setting notification channel:', e);
    }
  }

  if (Device.isDevice) {
    try {
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

      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId:
          Constants.expoConfig?.extra?.eas?.projectId ??
          Constants.expoConfig?.extra?.projectId,
      });
      token = tokenData.data;
      if (token) {
        await upsertPushTokenToBackend(token);
      }
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
    const settings = await storage.getItem(NOTIFICATION_SETTINGS_KEY);
    return settings ? JSON.parse(settings) : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveNotificationSettings(settings: NotificationSettings): Promise<void> {
  await storage.setItem(NOTIFICATION_SETTINGS_KEY, JSON.stringify(settings));
  await scheduleNotifications(settings);
}

export async function scheduleNotifications(settings: NotificationSettings): Promise<void> {
  const available = await initNotifications();
  if (!available || !Notifications) {
    console.log('Cannot schedule notifications - not available in Expo Go');
    return;
  }

  try {
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
  } catch (e) {
    console.log('Error scheduling notifications:', e);
  }
}

export async function sendImmediateNotification(title: string, body: string): Promise<boolean> {
  const available = await initNotifications();
  if (!available || !Notifications) {
    console.log('Cannot send notification - not available in Expo Go');
    return false;
  }

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: true,
      },
      trigger: null, // Immediate
    });
    return true;
  } catch (e) {
    console.log('Error sending notification:', e);
    return false;
  }
}

export function addNotificationListener(
  handler: (notification: any) => void
): { remove: () => void } | null {
  if (!isNotificationsAvailable || !Notifications) {
    return null;
  }
  return Notifications.addNotificationReceivedListener(handler);
}

export function addNotificationResponseListener(
  handler: (response: any) => void
): { remove: () => void } | null {
  if (!isNotificationsAvailable || !Notifications) {
    return null;
  }
  return Notifications.addNotificationResponseReceivedListener(handler);
}

export function isNotificationsSupported(): boolean {
  return isNotificationsAvailable;
}
