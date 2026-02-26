// src/utils/storage.ts
// Web-safe storage wrapper: localStorage on web, AsyncStorage on native
import { Platform } from "react-native";

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
};

export const storage = {
  getItem: (key: string) => Platform.OS === "web" ? webStore.getItem(key) : require("@react-native-async-storage/async-storage").default.getItem(key),
  setItem: (key: string, value: string) => Platform.OS === "web" ? webStore.setItem(key, value) : require("@react-native-async-storage/async-storage").default.setItem(key, value),
  removeItem: (key: string) => Platform.OS === "web" ? webStore.removeItem(key) : require("@react-native-async-storage/async-storage").default.removeItem(key),
  clear: () => Platform.OS === "web" ? webStore.clear() : require("@react-native-async-storage/async-storage").default.clear(),
};
