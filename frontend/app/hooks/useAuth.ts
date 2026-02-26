// frontend/app/hooks/useAuth.ts
// app/hooks/useAuth.ts
import { getAuth, signOut as firebaseSignOut } from 'firebase/auth';

export function useAuth() {
  const signOut = async () => {
    try {
      const auth = getAuth();
      await firebaseSignOut(auth);
    } catch (e) {
      // ignore — logout still proceeds via authStore
      console.warn('Firebase signOut skipped:', e);
    }
  };

  return { signOut };
}
