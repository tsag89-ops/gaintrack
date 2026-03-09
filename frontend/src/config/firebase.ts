// frontend/src/config/firebase.ts
// Uses @react-native-firebase (native modules) — auto-initialised from
// google-services.json (Android) / GoogleService-Info.plist (iOS).
// No manual initializeApp() needed for native modules.

import rnFirebaseAuth, { FirebaseAuthTypes } from '@react-native-firebase/auth';
import rnFirestore from '@react-native-firebase/firestore';

if (__DEV__) console.log('[Firebase] init start');

let auth: ReturnType<typeof rnFirebaseAuth>;
let db: any;
try {
  auth = rnFirebaseAuth();
  db = rnFirestore() as any;
  if (__DEV__) console.log('[Firebase] init complete');
} catch (e) {
  console.error('[Firebase] init error', e);
  throw e;
}

export { auth, db };
export type { FirebaseAuthTypes };
