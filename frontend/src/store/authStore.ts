import { create } from 'zustand';
import { storage } from '../utils/storage';
import { auth, db } from '../config/firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { identifyUser, resetRevenueCatUser, getCustomerInfo, hasProEntitlement } from '../services/revenueCat';
import { UserPrefs } from '../types';
import {
  getExercisesFromFirestore,
  getProgramsFromFirestore,
  getUserPrefsFromFirestore,
  getWorkouts,
} from '../services/firestore';

interface User {
  id: string;
  user_id?: string;
  name: string;
  email: string;
  picture?: string | null;
  created_at?: string;
  isPro?: boolean;
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
  authReady: boolean;
  setUser: (user: User) => void;
  setSession: (user: User, token: string) => Promise<void>;
  logout: () => Promise<void>;
  loadStoredAuth: () => Promise<void>;
}

const USER_PREFS_PREFIX = 'user_prefs_';
const WORKOUT_KEYS = ['workouts', 'gaintrack_workouts'];
const EXERCISE_KEYS = ['exercises', 'gaintrack_exercises'];
const PROGRAM_KEYS = ['programs_v1'];

const uniqueBy = <T,>(items: T[], getKey: (item: T) => string): T[] => {
  const map = new Map<string, T>();
  for (const item of items) {
    const key = getKey(item);
    if (!key) continue;
    map.set(key, item);
  }
  return Array.from(map.values());
};

async function applyPrefsToStorage(prefs: UserPrefs): Promise<void> {
  const writes: Array<Promise<void>> = [];

  if (typeof prefs.autoRestTimer === 'boolean') {
    writes.push(storage.setItem('gaintrack_auto_rest_timer', JSON.stringify(prefs.autoRestTimer)));
  }
  if (typeof prefs.restDuration === 'number') {
    writes.push(storage.setItem('gaintrack_rest_duration', String(prefs.restDuration)));
  }
  if (typeof prefs.aiConsent === 'boolean') {
    writes.push(storage.setItem('gaintrack_ai_consent', String(prefs.aiConsent)));
  }
  if (prefs.notificationSettings) {
    writes.push(storage.setItem('notification_settings', JSON.stringify(prefs.notificationSettings)));
  }
  if (prefs.healthSyncSettings) {
    writes.push(storage.setItem('gaintrack_health_sync_settings', JSON.stringify(prefs.healthSyncSettings)));
  }
  if (prefs.units) {
    writes.push(storage.setItem('gaintrack_weight_unit', prefs.units.weight));
    writes.push(storage.setItem('gaintrack_height_unit', prefs.units.height));
    writes.push(storage.setItem('gaintrack_distance_unit', prefs.units.distance));
  }

  await Promise.all(writes);
}

async function bootstrapCloudDataToLocal(userId: string): Promise<void> {
  const [cloudWorkouts, cloudExercises, cloudPrograms] = await Promise.all([
    getWorkouts(userId),
    getExercisesFromFirestore(userId),
    getProgramsFromFirestore(userId),
  ]);

  if (cloudWorkouts.length > 0) {
    const existingRaw = await storage.getItem('workouts');
    const existing = existingRaw ? JSON.parse(existingRaw) : [];
    const merged = uniqueBy([...existing, ...cloudWorkouts], (w: any) => w.workout_id ?? '');
    await Promise.all(WORKOUT_KEYS.map((key) => storage.setItem(key, JSON.stringify(merged))));
  }

  if (cloudExercises.length > 0) {
    const existingRaw = await storage.getItem('exercises');
    const existing = existingRaw ? JSON.parse(existingRaw) : [];
    const merged = uniqueBy([...existing, ...cloudExercises], (e: any) => e.exercise_id ?? e.id ?? '');
    await Promise.all(EXERCISE_KEYS.map((key) => storage.setItem(key, JSON.stringify(merged))));
  }

  if (cloudPrograms.length > 0) {
    const existingRaw = await storage.getItem('programs_v1');
    const existing = existingRaw ? JSON.parse(existingRaw) : [];
    const merged = uniqueBy([...existing, ...cloudPrograms], (p: any) => p.id ?? '');
    await Promise.all(PROGRAM_KEYS.map((key) => storage.setItem(key, JSON.stringify(merged))));
  }
}

async function upsertUserProfile(userId: string, data: object) {
  try {
    await setDoc(doc(db, 'users', userId), data, { merge: true });
    if (__DEV__) console.log('[authStore] Firestore profile upsert success ✅');
  } catch (e) {
    try {
      await (db as any).collection('users').doc(userId).set(data, { merge: true });
      if (__DEV__) console.log('[authStore] Firestore profile upsert success (native) ✅');
    } catch (e2) {
      console.warn('[authStore] Firestore profile save failed:', e2);
    }
  }
}

async function fetchIsPro(userId: string): Promise<boolean> {
  // Attempt 1: web SDK (works on web platform)
  try {
    const snap = await getDoc(doc(db, 'users', userId));
    if (snap.exists()) {
      const isPro = snap.data().isPro ?? false;
        if (__DEV__) console.log('[authStore] isPro from Firestore:', isPro);
        return isPro;
      }
    } catch (e) {
    // Web SDK throws on native Android/iOS — fall back to rnFirebase compat API
    try {
      const snap2 = await (db as any).collection('users').doc(userId).get();
      if (snap2.exists) {
        const isPro = snap2.data()?.isPro ?? false;
        if (__DEV__) console.log('[authStore] isPro from Firestore (native):', isPro);
        return isPro;
      }
    } catch (e2) {
      console.warn('[authStore] Firestore isPro read failed (both attempts):', e2);
    }
  }
  return false;
}

// Prevent concurrent setSession calls for the same UID (e.g., race between
// login.tsx's explicit call and useAuth.web.ts's onAuthStateChanged handler).
const _sessionInProgress = new Set<string>();

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  sessionToken: null,
  isAuthenticated: false,
  isLoading: true,
  authReady: false,

  setUser: (user) => set({ user }),

  setSession: async (user, token) => {
    if (_sessionInProgress.has(user.id)) return;
    _sessionInProgress.add(user.id);
    try {
      let finalUser = user;
      try {
        const existing = await storage.getItem('user');
        if (existing) {
          const prev = JSON.parse(existing) as User;
          if (prev.id === user.id) {
            finalUser = {
              ...user,
              equipment: prev.equipment ?? user.equipment,
              goals: prev.goals ?? user.goals,
              units: prev.units ?? user.units,
              isPro: user.isPro ?? false,
            };
          }
        }
      } catch (e) {
        console.warn('setSession storage error:', e);
      }

      const uid = finalUser.id ?? (finalUser as any).user_id;
      if (uid) {
        try {
          const [localPrefsStr, cloudPrefs] = await Promise.all([
            storage.getItem(`${USER_PREFS_PREFIX}${uid}`),
            getUserPrefsFromFirestore(uid),
          ]);
          const localPrefs = localPrefsStr ? (JSON.parse(localPrefsStr) as UserPrefs) : null;
          const mergedPrefs: UserPrefs = {
            ...(localPrefs ?? {}),
            ...(cloudPrefs ?? {}),
            updatedAt: new Date().toISOString(),
          };

          if (Object.keys(mergedPrefs).length > 0) {
            finalUser = {
              ...finalUser,
              goals: mergedPrefs.goals ?? finalUser.goals,
              equipment: mergedPrefs.equipment ?? finalUser.equipment,
              units: mergedPrefs.units ?? finalUser.units,
            };
            await storage.setItem(`${USER_PREFS_PREFIX}${uid}`, JSON.stringify(mergedPrefs));
            await applyPrefsToStorage(mergedPrefs);
          }
        } catch (e) {
          console.warn('setSession user_prefs restore error:', e);
        }
      }

      // Write profile — NO isPro here (blocked by Security Rules)
      await upsertUserProfile(finalUser.id, {
        uid: finalUser.id,
        email: finalUser.email,
        displayName: finalUser.name || '',
        createdAt: new Date().toISOString(),
      });

      // Read isPro from Firestore
      let isPro = await fetchIsPro(finalUser.id);

      // Link RevenueCat identity and check entitlements.
      // RC is a secondary source of truth: if the webhook hasn't written to
      // Firestore yet (common on Android first-login), RC wins here.
      try {
        await identifyUser(finalUser.id);
        const customerInfo = await getCustomerInfo();
        const rcIsPro = hasProEntitlement(customerInfo);
        if (rcIsPro) {
          if (__DEV__) console.log('[authStore] isPro from RevenueCat entitlements: true');
          isPro = true;
        }
      } catch (e) {
        console.warn('[authStore] RevenueCat identifyUser/check failed:', e);
      }

      finalUser = { ...finalUser, isPro };

      if (isPro && finalUser.id) {
        await bootstrapCloudDataToLocal(finalUser.id).catch((e) => {
          console.warn('[authStore] cloud bootstrap failed:', e);
        });
      }

      // Save full user (with isPro) to AsyncStorage
      try {
        await storage.setItem('user', JSON.stringify(finalUser));
        await storage.setItem('sessionToken', token);
      } catch (e) {
        console.warn('setSession storage save error:', e);
      }

      set({ user: finalUser, sessionToken: token, isAuthenticated: true, isLoading: false });
    } finally {
      _sessionInProgress.delete(user.id);
    }
  },

  logout: async () => {
    try {
      await Promise.all([
        storage.removeItem('sessionToken'),
        storage.removeItem('user'),
      ]);
      await resetRevenueCatUser(); // Reset to anonymous RC identity on logout
      await auth.signOut();
    } catch (e) {
      console.warn('logout error:', e);
    }
    _sessionInProgress.clear();
    set({ user: null, sessionToken: null, isAuthenticated: false, isLoading: false });
  },

  loadStoredAuth: async () => {
    try {
      const [userStr, token] = await Promise.all([
        storage.getItem('user'),
        storage.getItem('sessionToken'),
      ]);
      if (userStr && token) {
        const user = JSON.parse(userStr) as User;
        await useAuthStore.getState().setSession(user, token);
        set({ authReady: true });
      } else {
        set({ isLoading: false, authReady: true });
      }
    } catch (error) {
      console.error('Error loading stored auth:', error);
      set({ isLoading: false, authReady: true });
    }
  },
}));
