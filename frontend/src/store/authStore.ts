import { create } from 'zustand';
import { storage } from '../utils/storage';
import { auth, db } from '../config/firebase';
import { doc, setDoc } from 'firebase/firestore';

interface User {
  id: string;
  user_id?: string;
  name: string;
  email: string;
  picture?: string | null;
  created_at?: string;
  goals?: {
    daily_calories: number;
    protein_grams: number;
    carbs_grams: number;
    fat_grams: number;
    workouts_per_week: number;
  };
  equipment?: string[];
  units?: {
    weight: 'kg' | 'lbs';
    height: 'cm' | 'in';
    distance: 'km' | 'mi';
  };
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

// ─── Platform-safe Firestore upsert ──────────────────────────────────────────
async function upsertUserProfile(userId: string, data: object) {
  try {
    // Web SDK modular API — works on web, iOS, and Android
    await setDoc(doc(db, 'users', userId), data, { merge: true });
    console.log('[authStore] Firestore profile upsert success ✅');
  } catch (e) {
    // Fallback: native @react-native-firebase syntax (Android native builds)
    try {
      await (db as any).collection('users').doc(userId).set(data, { merge: true });
      console.log('[authStore] Firestore profile upsert success (native) ✅');
    } catch (e2) {
      console.warn('[authStore] Firestore profile save failed:', e2);
    }
  }
}
// ─────────────────────────────────────────────────────────────────────────────

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  sessionToken: null,
  isAuthenticated: false,
  isLoading: true,

  setUser: (user) => set({ user }),

  setSession: async (user, token) => {
    let finalUser = user;
    try {
      // Preserve equipment + goals from a previous session for the same account
      // so logout → login never resets user-edited preferences to defaults.
      const existing = await storage.getItem('user');
      if (existing) {
        const prev = JSON.parse(existing) as User;
        if (prev.id === user.id) {
          finalUser = {
            ...user,
            equipment: prev.equipment ?? user.equipment,
            goals: prev.goals ?? user.goals,
          };
        }
      }
      await storage.setItem('user', JSON.stringify(finalUser));
      await storage.setItem('sessionToken', token);
    } catch (e) {
      console.warn('setSession storage error:', e);
    }
    set({ user: finalUser, sessionToken: token, isAuthenticated: true, isLoading: false });

    // Upsert user profile — now works on web + iOS + Android
    await upsertUserProfile(finalUser.id, {
      uid: finalUser.id,
      email: finalUser.email,
      displayName: finalUser.name || '',
      createdAt: new Date().toISOString(),
    });
  },

  logout: async () => {
    try {
      // Only remove the session token — keep the user object in storage so
      // equipment + goals survive logout and are restored on next login.
      await storage.removeItem('sessionToken');
      await auth.signOut();
    } catch (e) {
      console.warn('logout error:', e);
    }
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
