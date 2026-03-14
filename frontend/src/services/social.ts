import { Platform, Share } from 'react-native';
import { storage } from '../utils/storage';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL?.trim() || '';

export interface FriendProfile {
  user_id: string;
  name: string;
  email?: string;
}

export interface FriendInvite {
  invite_id: string;
  from_user_id: string;
  to_user_id: string;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
}

export interface FriendInviteList {
  incoming: FriendInvite[];
  outgoing: FriendInvite[];
}

export interface InviteReminderDue {
  invite_id: string;
  to_user_id: string;
  created_at: string;
  reminder_count: number;
}

export interface FriendInviteReminderResult {
  dry_run: boolean;
  pending_invites: number;
  due_invites: InviteReminderDue[];
  due_count: number;
  reminders_marked: number;
  evaluated_at: string;
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

export type ShareCardTemplate = 'compact' | 'detailed' | 'milestone';

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

  discoverFriends: async (query: string): Promise<FriendProfile[]> => {
    const normalized = query.trim();
    if (!normalized) return [];

    const response = await authorizedFetch(`/api/social/friends/discover?q=${encodeURIComponent(normalized)}`, {
      method: 'GET',
    });
    if (!response?.ok) return [];

    const payload = await response.json();
    return Array.isArray(payload?.results) ? payload.results : [];
  },

  inviteFriend: async (targetUserId: string): Promise<boolean> => {
    const response = await authorizedFetch('/api/social/friends/invite', {
      method: 'POST',
      body: JSON.stringify({ target_user_id: targetUserId }),
    });
    return Boolean(response?.ok);
  },

  getFriendInvites: async (): Promise<FriendInviteList> => {
    const response = await authorizedFetch('/api/social/friends/invites', { method: 'GET' });
    if (!response?.ok) return { incoming: [], outgoing: [] };

    const payload = await response.json();
    return {
      incoming: Array.isArray(payload?.incoming) ? payload.incoming : [],
      outgoing: Array.isArray(payload?.outgoing) ? payload.outgoing : [],
    };
  },

  respondToInvite: async (inviteId: string, action: 'accept' | 'decline'): Promise<boolean> => {
    const response = await authorizedFetch(`/api/social/friends/invites/${encodeURIComponent(inviteId)}/respond?action=${action}`, {
      method: 'POST',
    });
    return Boolean(response?.ok);
  },

  processInviteReminders: async (dryRun = true, minAgeHours = 24): Promise<FriendInviteReminderResult | null> => {
    const response = await authorizedFetch('/api/social/friends/invites/reminders', {
      method: 'POST',
      body: JSON.stringify({
        dry_run: dryRun,
        min_age_hours: minAgeHours,
      }),
    });
    if (!response?.ok) return null;

    return (await response.json()) as FriendInviteReminderResult;
  },
};

export const shareWorkoutCard = async (payload: {
  workoutName: string;
  date: string;
  totalVolume: string;
  totalSets: number;
  exerciseCount: number;
  topExercises?: string[];
  template?: ShareCardTemplate;
}): Promise<boolean> => {
  try {
    const template = payload.template ?? 'compact';

    const exerciseLine = payload.topExercises?.length
      ? `Top exercises: ${payload.topExercises.slice(0, 3).join(', ')}`
      : null;

    const message =
      template === 'detailed'
        ? [
            'GainTrack Detailed Workout Card',
            `${payload.workoutName} • ${payload.date}`,
            `Volume: ${payload.totalVolume}`,
            `Sets: ${payload.totalSets}`,
            `Exercises: ${payload.exerciseCount}`,
            exerciseLine,
            'Built with consistency. #GainTrack',
          ]
            .filter(Boolean)
            .join('\n')
        : template === 'milestone'
          ? [
              'GainTrack Milestone Card',
              `${payload.workoutName} • ${payload.date}`,
              `Hit: ${payload.totalVolume} volume`,
              `${payload.totalSets} sets across ${payload.exerciseCount} exercises`,
              exerciseLine,
              'Another step forward. #GainTrack',
            ]
              .filter(Boolean)
              .join('\n')
          : [
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
