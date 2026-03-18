import React, { createContext, useContext, useEffect, useState } from 'react';
import { storage } from '../utils/storage';
import {
  getDeviceLocale,
  LANGUAGE_STORAGE_KEY,
  resolveSupportedLocale,
  SupportedLocale,
  translate,
  translateList,
} from '../i18n/translations';

type LanguageContextValue = {
  locale: SupportedLocale;
  setLocale: (locale: SupportedLocale) => Promise<void>;
  t: (key: string, params?: Record<string, string | number>) => string;
  list: (key: string) => string[];
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<SupportedLocale>(getDeviceLocale());

  useEffect(() => {
    let cancelled = false;

    const loadStoredLocale = async () => {
      const stored = await storage.getItem(LANGUAGE_STORAGE_KEY);
      if (!cancelled && stored) {
        setLocaleState(resolveSupportedLocale(stored));
      }
    };

    loadStoredLocale().catch(() => null);

    return () => {
      cancelled = true;
    };
  }, []);

  const setLocale = async (nextLocale: SupportedLocale) => {
    setLocaleState(nextLocale);
    await storage.setItem(LANGUAGE_STORAGE_KEY, nextLocale);
  };

  const value: LanguageContextValue = {
    locale,
    setLocale,
    t: (key, params) => translate(locale, key, params),
    list: (key) => translateList(locale, key),
  };

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}