// frontend/app/config/firebase.ts
import { initializeApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  Firestore,
} from 'firebase/firestore';

// TODO: Replace these with your real values from Firebase console
// (we'll grab them together in the next step)
const firebaseConfig = {
  apiKey: 'YOUR_API_KEY_HERE',
  authDomain: 'YOUR_PROJECT_ID.firebaseapp.com',
  projectId: 'YOUR_PROJECT_ID',
  storageBucket: 'YOUR_PROJECT_ID.appspot.com',
  messagingSenderId: 'YOUR_MESSAGING_SENDER_ID',
  appId: 'YOUR_APP_ID',
};

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;

if (!firebaseConfig.apiKey || firebaseConfig.apiKey === 'YOUR_API_KEY_HERE') {
  console.warn(
    '[Firebase] Missing config – add your keys in src/config/firebase.ts',
  );
} else {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  // Persistent local cache enables offline reads/writes — queued until network
  // re-connect. Uses IndexedDB on web, SQLite-backed on native via the SDK. [PRO]
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  });
}

export { app, auth, db };
