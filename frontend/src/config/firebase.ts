// frontend/src/config/firebase.ts
// Uses @react-native-firebase (native modules) — auto-initialised from
// google-services.json (Android) / GoogleService-Info.plist (iOS).
// No manual initializeApp() needed for native modules.

import rnFirebaseAuth, { FirebaseAuthTypes } from '@react-native-firebase/auth';
import rnFirestore from '@react-native-firebase/firestore';

console.log('[Firebase] init start');

// auth — native Firebase Auth instance
// db — native Firestore instance [PRO] cloud sync
// cast as any so files using the modular JS SDK API typecheck correctly;
// the .web.ts override does the same with getFirestore(app) as any.
let auth: ReturnType<typeof rnFirebaseAuth>;
let db: any;
try {
  auth = rnFirebaseAuth();
  db = rnFirestore() as any;
  console.log('[Firebase] init complete');
} catch (e) {
  console.error('[Firebase] init error', e);
  throw e;
}

export { auth, db };
export type { FirebaseAuthTypes };
