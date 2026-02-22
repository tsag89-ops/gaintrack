import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User } from '../types';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  sessionToken: string | null;
  setUser: (user: User | null) => void;
  setSessionToken: (token: string | null) => void;
  setLoading: (loading: boolean) => void;
  logout: () => void;
  loadStoredAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  sessionToken: null,

  setUser: (user) => {
    set({ user, isAuthenticated: !!user });
    if (user) {
      AsyncStorage.setItem('user', JSON.stringify(user));
    } else {
      AsyncStorage.removeItem('user');
    }
  },

  setSessionToken: (token) => {
    set({ sessionToken: token });
    if (token) {
      AsyncStorage.setItem('sessionToken', token);
    } else {
      AsyncStorage.removeItem('sessionToken');
    }
  },

  setLoading: (loading) => set({ isLoading: loading }),

  logout: async () => {
    await AsyncStorage.removeItem('user');
    await AsyncStorage.removeItem('sessionToken');
    set({ user: null, isAuthenticated: false, sessionToken: null });
  },

  loadStoredAuth: async () => {
    try {
      const [userStr, token] = await Promise.all([
        AsyncStorage.getItem('user'),
        AsyncStorage.getItem('sessionToken'),
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
