// src/config/firebase.web.ts
// Web Firebase using the JS SDK (modular v9+).
// Metro automatically picks this file instead of firebase.ts for web builds.
// @react-native-firebase uses native modules unavailable on web — never import it here.

import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword as fbCreateUser,
  signInWithEmailAndPassword as fbSignIn,
  signInWithCredential as fbSignInWithCredential,
  onAuthStateChanged as fbOnAuthStateChanged,
  signOut as fbSignOut,
  updateProfile as fbUpdateProfile,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey:            process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const _auth = getAuth(app);

// ── Compat-style wrapper matching @react-native-firebase API used in the codebase ──
function wrapUser(user: import('firebase/auth').User) {
  return {
    uid:         user.uid,
    email:       user.email,
    displayName: user.displayName,
    photoURL:    user.photoURL,
    getIdToken:  () => user.getIdToken(),
    updateProfile: (profile: { displayName?: string | null; photoURL?: string | null }) =>
      fbUpdateProfile(user, profile),
  };
}

export const auth = {
  createUserWithEmailAndPassword: async (email: string, password: string) => {
    const cred = await fbCreateUser(_auth, email, password);
    return { user: wrapUser(cred.user) };
  },

  signInWithEmailAndPassword: async (email: string, password: string) => {
    const cred = await fbSignIn(_auth, email, password);
    return { user: wrapUser(cred.user) };
  },

  signInWithCredential: async (credential: import('firebase/auth').AuthCredential) => {
    const cred = await fbSignInWithCredential(_auth, credential);
    return { user: wrapUser(cred.user) };
  },

  signInWithGoogle: async () => {
    const provider = new GoogleAuthProvider();
    console.log('[Firebase] signInWithGoogle: attempting popup, auth domain:', _auth.app.options.authDomain);
    // Try popup first; fall back to redirect if popup is blocked
    try {
      const cred = await signInWithPopup(_auth, provider);
      console.log('[Firebase] popup success, uid:', cred.user.uid);
      return { user: wrapUser(cred.user) };
    } catch (e: any) {
      console.warn('[Firebase] popup failed:', e?.code, e?.message);
      if (
        e?.code === 'auth/popup-blocked' ||
        e?.code === 'auth/popup-closed-by-user' ||
        e?.code === 'auth/cancelled-popup-request'
      ) {
        console.log('[Firebase] falling back to redirect...');
        // Redirect — result handled by getGoogleRedirectResult on next load
        await signInWithRedirect(_auth, provider);
        return null; // page will reload
      }
      throw e;
    }
  },

  getGoogleRedirectResult: async () => {
    const result = await getRedirectResult(_auth);
    if (!result) return null;
    return { user: wrapUser(result.user) };
  },

  onAuthStateChanged: (callback: (user: ReturnType<typeof wrapUser> | null) => void) => {
    return fbOnAuthStateChanged(_auth, (user) => {
      callback(user ? wrapUser(user) : null);
    });
  },

  signOut: () => fbSignOut(_auth),

  get currentUser() {
    const u = _auth.currentUser;
    return u ? wrapUser(u) : null;
  },
} as const;

// [PRO] Firestore web instance
export const db = getFirestore(app) as any;

export type { FirebaseAuthTypes } from '@react-native-firebase/auth';

