// src/utils/storage.ts
// Web-safe storage wrapper: localStorage on web, AsyncStorage on native
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_TIMEOUT_MS = 8000;

const withTimeout = async <T,>(operation: Promise<T>, label: string): Promise<T> => {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(`${label} timed out after ${STORAGE_TIMEOUT_MS}ms`));
        }, STORAGE_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
};

const webStore = {
  getItem: async (key: string): Promise<string | null> => {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try { localStorage.setItem(key, value); } catch {}
  },
  removeItem: async (key: string): Promise<void> => {
    try { localStorage.removeItem(key); } catch {}
  },
  clear: async (): Promise<void> => {
    try { localStorage.clear(); } catch {}
  },
  multiGet: async (keys: string[]): Promise<[string, string | null][]> => {
    try {
      return keys.map((key) => [key, localStorage.getItem(key)]);
    } catch {
      return keys.map((key) => [key, null]);
    }
  },
  multiSet: async (entries: [string, string][]): Promise<void> => {
    try {
      entries.forEach(([key, value]) => {
        localStorage.setItem(key, value);
      });
    } catch {}
  },
  multiRemove: async (keys: string[]): Promise<void> => {
    try {
      keys.forEach((key) => {
        localStorage.removeItem(key);
      });
    } catch {}
  },
};

export const storage = {
  getItem: (key: string) =>
    Platform.OS === "web"
      ? withTimeout(webStore.getItem(key), `storage.getItem(${key})`)
      : withTimeout(AsyncStorage.getItem(key), `storage.getItem(${key})`),
  setItem: (key: string, value: string) =>
    Platform.OS === "web"
      ? withTimeout(webStore.setItem(key, value), `storage.setItem(${key})`)
      : withTimeout(AsyncStorage.setItem(key, value), `storage.setItem(${key})`),
  removeItem: (key: string) =>
    Platform.OS === "web"
      ? withTimeout(webStore.removeItem(key), `storage.removeItem(${key})`)
      : withTimeout(AsyncStorage.removeItem(key), `storage.removeItem(${key})`),
  clear: () =>
    Platform.OS === "web"
      ? withTimeout(webStore.clear(), "storage.clear")
      : withTimeout(AsyncStorage.clear(), "storage.clear"),
  multiGet: (keys: string[]) =>
    Platform.OS === "web"
      ? withTimeout(webStore.multiGet(keys), `storage.multiGet(${keys.join(',')})`)
      : withTimeout(AsyncStorage.multiGet(keys), `storage.multiGet(${keys.join(',')})`),
  multiSet: (entries: [string, string][]) =>
    Platform.OS === "web"
      ? withTimeout(webStore.multiSet(entries), `storage.multiSet(${entries.length})`)
      : withTimeout(AsyncStorage.multiSet(entries), `storage.multiSet(${entries.length})`),
  multiRemove: (keys: string[]) =>
    Platform.OS === "web"
      ? withTimeout(webStore.multiRemove(keys), `storage.multiRemove(${keys.join(',')})`)
      : withTimeout(AsyncStorage.multiRemove(keys), `storage.multiRemove(${keys.join(',')})`),
};
