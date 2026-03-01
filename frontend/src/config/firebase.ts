// frontend/src/config/firebase.ts
// Uses @react-native-firebase (native modules) — auto-initialised from
// google-services.json (Android) / GoogleService-Info.plist (iOS).
// No manual initializeApp() needed for native modules.

import rnFirebaseAuth, { FirebaseAuthTypes } from '@react-native-firebase/auth';
import rnFirestore from '@react-native-firebase/firestore';

// auth — native Firebase Auth instance
const auth = rnFirebaseAuth();

// db — native Firestore instance [PRO] cloud sync
const db = rnFirestore();

export { auth, db };
export type { FirebaseAuthTypes };
