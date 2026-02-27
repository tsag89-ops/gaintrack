import { create } from 'zustand';
import { storage } from '../utils/storage';

interface User {
  id: string;
  name: string;
  email: string;
  goals?: {
    daily_calories: number;
    protein_grams: number;
    carbs_grams: number;
    fat_grams: number;
    workouts_per_week: number;
  };
  equipment?: string[];
}

interface AuthState {
  user: User | null;
  sessionToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setUser: (user: User) => void;
  setSession: (user: User, token: string) => Promise<void>;
  logout: () => Promise<void>;
  loadStoredAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  sessionToken: null,
  isAuthenticated: false,
  isLoading: true,

  setUser: (user) => set({ user }),

  setSession: async (user, token) => {
    try {
      await storage.setItem('user', JSON.stringify(user));
      await storage.setItem('sessionToken', token);
    } catch (e) {
      console.warn('setSession storage error:', e);
    }
    set({ user, sessionToken: token, isAuthenticated: true, isLoading: false });
  },

  logout: async () => {
    try {
      await storage.removeItem('user');
      await storage.removeItem('sessionToken');
    } catch (e) {
      console.warn('logout storage error:', e);
    }
    // Force state update synchronously after storage clear
    set(() => ({ user: null, sessionToken: null, isAuthenticated: false, isLoading: false }));
  },

  loadStoredAuth: async () => {
    try {
      const [userStr, token] = await Promise.all([
        storage.getItem('user'),
        storage.getItem('sessionToken'),
      ]);
      if (userStr && token) {
        const user = JSON.parse(userStr);
        set({ user, sessionToken: token, isAuthenticated: true, isLoading: false });
      } else {
        set({ isLoading: false });
      }
    } catch (error) {
      console.error('Error loading stored auth:', error);
      set({ isLoading: false });
    }
  },
}));
