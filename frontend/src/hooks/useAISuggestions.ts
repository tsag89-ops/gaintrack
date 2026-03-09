// src/hooks/useAISuggestions.ts

import { useState, useEffect, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAISuggestions, AISuggestion, AIContext } from '../services/aiService';

const CACHE_KEY     = 'aiSuggestions';
const TIMESTAMP_KEY = 'aiSuggestionsTimestamp';
const TTL_MS        = 24 * 60 * 60 * 1000; // 24 hours

export interface AISuggestionsState {
  suggestions: AISuggestion[];
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  /** Manually trigger a fresh fetch, bypassing the cache. */
  refresh: () => Promise<void>;
}

// Default context — swap in real workout/goal data from your stores as needed.
const DEFAULT_CONTEXT: AIContext = {
  recentWorkouts: [],
  goals: 'general fitness',
  calories: undefined,
};

export function useAISuggestions(context: AIContext = DEFAULT_CONTEXT): AISuggestionsState {
  const [suggestions, setSuggestions]   = useState<AISuggestion[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [lastUpdated, setLastUpdated]   = useState<Date | null>(null);

  const fetchAndCache = useCallback(async () => {
    try {
      setError(null);
      const fresh = await getAISuggestions(context);
      const now   = new Date();
      setSuggestions(fresh);
      setLastUpdated(now);
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(fresh));
      await AsyncStorage.setItem(TIMESTAMP_KEY, now.toISOString());
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load AI suggestions.');
    }
  }, [context]);

  const loadFromCacheOrFetch = useCallback(async () => {
    setLoading(true);
    try {
      const [cached, timestamp] = await Promise.all([
        AsyncStorage.getItem(CACHE_KEY),
        AsyncStorage.getItem(TIMESTAMP_KEY),
      ]);

      if (cached && timestamp) {
        const age  = Date.now() - new Date(timestamp).getTime();
        const data = JSON.parse(cached) as AISuggestion[];
        setSuggestions(data);
        setLastUpdated(new Date(timestamp));

        // Use cache if it's fresh enough; refresh in background if stale.
        if (age >= TTL_MS) {
          await fetchAndCache();
        }
      } else {
        // No cache — fetch immediately.
        await fetchAndCache();
      }
    } catch {
      await fetchAndCache();
    } finally {
      setLoading(false);
    }
  }, [fetchAndCache]);

  // Explicit manual refresh — always hits the network.
  const refresh = useCallback(async () => {
    setLoading(true);
    await fetchAndCache();
    setLoading(false);
  }, [fetchAndCache]);

  // Stable string key — avoids reference-equality thrashing on every render
  // while still re-fetching when context content actually changes.
  const contextKey = useMemo(() => JSON.stringify(context), [context]);

  useEffect(() => {
    loadFromCacheOrFetch();
  }, [contextKey]); // re-fetch when workout/goal context changes

  return { suggestions, loading, error, lastUpdated, refresh };
}
