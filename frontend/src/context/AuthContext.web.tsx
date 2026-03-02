// src/context/AuthContext.web.tsx
// Web stub — @react-native-firebase/auth unavailable in server/web bundle.

import React, { createContext, useContext, ReactNode } from 'react';

type AuthContextValue = {
  user: null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  googleLoading: boolean;
  googleError: string | null;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => (
  <AuthContext.Provider
    value={{
      user: null,
      loading: false,
      signInWithGoogle: async () => {},
      googleLoading: false,
      googleError: null,
      signOut: async () => {},
    }}
  >
    {children}
  </AuthContext.Provider>
);

export const useAuthContext = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthContext must be used inside AuthProvider');
  return ctx;
};
