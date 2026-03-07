// src/services/crashReporter.ts
// Logs unhandled JS errors to Firestore + a local AsyncStorage queue so
// crashes that happen before auth are flushed once the user signs in.
//
// Usage:
//   logCrash(error, { screen: 'WorkoutActive', userId })
//   flushCrashQueue(userId)   ← call after successful auth

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { db } from '../config/firebase';

const CRASH_QUEUE_KEY = 'gaintrack_crash_queue';
const MAX_QUEUE = 20; // cap local queue to avoid unbounded storage

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CrashReport {
  timestamp: string;
  userId: string | null;
  message: string;
  stack: string;
  platform: string;
  osVersion: string | undefined;
  appVersion: string | undefined;
  screen?: string;
  extras?: Record<string, unknown>;
}

interface LogCrashOptions {
  userId?: string | null;
  screen?: string;
  extras?: Record<string, unknown>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildReport(error: unknown, opts: LogCrashOptions = {}): CrashReport {
  const err = error instanceof Error ? error : new Error(String(error));
  return {
    timestamp: new Date().toISOString(),
    userId: opts.userId ?? null,
    message: err.message,
    stack: err.stack ?? '',
    platform: Platform.OS,
    osVersion: String(Platform.Version),
    appVersion: Constants.expoConfig?.version ?? undefined,
    screen: opts.screen,
    extras: opts.extras,
  };
}

async function writeToFirestore(report: CrashReport): Promise<void> {
  // Use compat API so it works on both native (rnFirebase) and web (firebase JS)
  try {
    await (db as any).collection('crashLogs').add(report);
  } catch {
    // compat API failed — try web modular (web platform)
    const { addDoc, collection } = await import('firebase/firestore');
    await addDoc(collection(db as any, 'crashLogs'), report);
  }
}

async function enqueueLocally(report: CrashReport): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(CRASH_QUEUE_KEY);
    const queue: CrashReport[] = raw ? JSON.parse(raw) : [];
    queue.push(report);
    // Keep newest MAX_QUEUE entries
    const trimmed = queue.slice(-MAX_QUEUE);
    await AsyncStorage.setItem(CRASH_QUEUE_KEY, JSON.stringify(trimmed));
  } catch {
    // Storage failure — silently ignore; crash log is best-effort
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Call from ErrorBoundary.componentDidCatch and ErrorUtils.setGlobalHandler.
 * Always queues locally; attempts immediate Firestore write if userId known.
 */
export async function logCrash(error: unknown, opts: LogCrashOptions = {}): Promise<void> {
  try {
    const report = buildReport(error, opts);
    // Fire-and-forget local queue (survives if Firestore is unavailable)
    enqueueLocally(report).catch(() => {});

    if (opts.userId) {
      writeToFirestore(report).catch((e) =>
        console.warn('[crashReporter] Firestore write failed:', e),
      );
    }
  } catch {
    // Never let crash reporter itself crash the app
  }
}

/**
 * Call once after the user successfully authenticates.
 * Uploads any locally-queued crash reports that had no userId at the time.
 */
export async function flushCrashQueue(userId: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(CRASH_QUEUE_KEY);
    if (!raw) return;
    const queue: CrashReport[] = JSON.parse(raw);
    if (queue.length === 0) return;

    await AsyncStorage.removeItem(CRASH_QUEUE_KEY);

    for (const report of queue) {
      writeToFirestore({ ...report, userId }).catch(() => {});
    }
  } catch {
    // Best-effort — do not block auth flow
  }
}
