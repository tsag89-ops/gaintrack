import { Platform, Share } from 'react-native';
import { storage } from '../utils/storage';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL?.trim() || '';

export interface FriendProfile {
  user_id: string;
  name: string;
  email?: string;
}

export interface LeaderboardEntry {
  user_id: string;
  name: string;
  is_you: boolean;
  total_workouts: number;
  total_sets: number;
  total_volume: number;
  rank: number;
}

export interface PrivateLeaderboardResponse {
  days: number;
  participants: number;
  leaderboard: LeaderboardEntry[];
}

const authorizedFetch = async (path: string, init?: RequestInit): Promise<Response | null> => {
  if (!BACKEND_URL) return null;

  try {
    const sessionToken = await storage.getItem('sessionToken');
    if (!sessionToken) return null;

    return await fetch(`${BACKEND_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    return null;
  }
};

export const socialApi = {
  connectFriend: async (friendUserId: string): Promise<boolean> => {
    const response = await authorizedFetch('/api/social/friends/connect', {
      method: 'POST',
      body: JSON.stringify({ friend_user_id: friendUserId }),
    });

    return Boolean(response?.ok);
  },

  getFriends: async (): Promise<FriendProfile[]> => {
    const response = await authorizedFetch('/api/social/friends', { method: 'GET' });
    if (!response?.ok) return [];

    const payload = await response.json();
    return Array.isArray(payload?.friends) ? payload.friends : [];
  },

  getPrivateLeaderboard: async (days = 30): Promise<PrivateLeaderboardResponse | null> => {
    const response = await authorizedFetch(`/api/social/leaderboard/private?days=${days}`, { method: 'GET' });
    if (!response?.ok) return null;

    return (await response.json()) as PrivateLeaderboardResponse;
  },
};

export const shareWorkoutCard = async (payload: {
  workoutName: string;
  date: string;
  totalVolume: string;
  totalSets: number;
  exerciseCount: number;
}): Promise<boolean> => {
  try {
    const message = [
      'GainTrack Workout Card',
      `${payload.workoutName} • ${payload.date}`,
      `Volume: ${payload.totalVolume}`,
      `Sets: ${payload.totalSets}`,
      `Exercises: ${payload.exerciseCount}`,
      '#GainTrack',
    ].join('\n');

    if (Platform.OS === 'web') {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(message);
      }
      return true;
    }

    await Share.share({ message, title: 'Share Workout Card' });
    return true;
  } catch {
    return false;
  }
};
