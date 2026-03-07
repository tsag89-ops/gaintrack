import { create } from 'zustand';
import { storage } from '../utils/storage';
import { auth, db } from '../config/firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { identifyUser, resetRevenueCatUser, getCustomerInfo, hasProEntitlement } from '../services/revenueCat';

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
  setUser: (user: User) => void;
  setSession: (user: User, token: string) => Promise<void>;
  logout: () => Promise<void>;
  loadStoredAuth: () => Promise<void>;
}

async function upsertUserProfile(userId: string, data: object) {
  try {
    await setDoc(doc(db, 'users', userId), data, { merge: true });
    console.log('[authStore] Firestore profile upsert success ✅');
  } catch (e) {
    try {
      await (db as any).collection('users').doc(userId).set(data, { merge: true });
      console.log('[authStore] Firestore profile upsert success (native) ✅');
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
      console.log('[authStore] isPro from Firestore:', isPro);
      return isPro;
    }
  } catch (e) {
    // Web SDK throws on native Android/iOS — fall back to rnFirebase compat API
    try {
      const snap2 = await (db as any).collection('users').doc(userId).get();
      if (snap2.exists) {
        const isPro = snap2.data()?.isPro ?? false;
        console.log('[authStore] isPro from Firestore (native):', isPro);
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

  setUser: (user) => set({ user }),

  setSession: async (user, token) => {
    if (_sessionInProgress.has(user.id)) return;
    _sessionInProgress.add(user.id);
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
            isPro: prev.isPro ?? user.isPro, // preserve cached Pro status as fallback
          };
        }
      }
    } catch (e) {
      console.warn('setSession storage error:', e);
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
        console.log('[authStore] isPro from RevenueCat entitlements: true');
        isPro = true;
      }
    } catch (e) {
      console.warn('[authStore] RevenueCat identifyUser/check failed:', e);
    }

    finalUser = { ...finalUser, isPro };

    // Save full user (with isPro) to AsyncStorage
    try {
      await storage.setItem('user', JSON.stringify(finalUser));
      await storage.setItem('sessionToken', token);
      // Keep gaintrack_pro_status in sync so usePro() native fallback is correct
      await storage.setItem('gaintrack_pro_status', String(isPro));
    } catch (e) {
      console.warn('setSession storage save error:', e);
    }

    set({ user: finalUser, sessionToken: token, isAuthenticated: true, isLoading: false });

    _sessionInProgress.delete(user.id);
  },

  logout: async () => {
    try {
      await Promise.all([
        storage.removeItem('sessionToken'),
        storage.removeItem('user'),
        storage.removeItem('gaintrack_pro_status'),
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
        // Restore immediately from cache so the UI is not blocked
        set({ user, sessionToken: token, isAuthenticated: true, isLoading: false });
        // Then refresh isPro from Firestore in the background
        fetchIsPro(user.id).then((isPro) => {
          set((state) => ({
            user: state.user ? { ...state.user, isPro } : state.user,
          }));
          // Persist refreshed isPro back to AsyncStorage
          storage.setItem('user', JSON.stringify({ ...user, isPro })).catch(() => {});
        });
      } else {
        set({ isLoading: false });
      }
    } catch (error) {
      console.error('Error loading stored auth:', error);
      set({ isLoading: false });
    }
  },
}));
