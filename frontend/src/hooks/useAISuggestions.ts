// src/hooks/useAISuggestions.ts

import { useState, useEffect, useCallback, useMemo } from 'react';
import { getAISuggestions, AISuggestion, AIContext } from '../services/aiService';
import { storage } from '../utils/storage';

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

export interface AISuggestionsOptions {
  fallbackSuggestions?: AISuggestion[];
  errorMessage?: string;
  cacheScopeKey?: string;
}

// Default context — swap in real workout/goal data from your stores as needed.
const DEFAULT_CONTEXT: AIContext = {
  recentWorkouts: [],
  goals: 'general fitness',
  calories: undefined,
};

export function useAISuggestions(
  context: AIContext = DEFAULT_CONTEXT,
  options?: AISuggestionsOptions,
): AISuggestionsState {
  const [suggestions, setSuggestions]   = useState<AISuggestion[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [lastUpdated, setLastUpdated]   = useState<Date | null>(null);
  const cacheKey = useMemo(
    () => (options?.cacheScopeKey ? `${CACHE_KEY}:${options.cacheScopeKey}` : CACHE_KEY),
    [options?.cacheScopeKey],
  );
  const timestampKey = useMemo(
    () => (options?.cacheScopeKey ? `${TIMESTAMP_KEY}:${options.cacheScopeKey}` : TIMESTAMP_KEY),
    [options?.cacheScopeKey],
  );

  const fetchAndCache = useCallback(async () => {
    try {
      setError(null);
      const fresh = await getAISuggestions(context, {
        fallbackSuggestions: options?.fallbackSuggestions,
      });
      const now   = new Date();
      setSuggestions(fresh);
      setLastUpdated(now);
      await storage.setItem(cacheKey, JSON.stringify(fresh));
      await storage.setItem(timestampKey, now.toISOString());
    } catch (err: any) {
      setError(err?.message ?? options?.errorMessage ?? 'Failed to load AI suggestions.');
    }
  }, [cacheKey, context, options?.errorMessage, options?.fallbackSuggestions, timestampKey]);

  const loadFromCacheOrFetch = useCallback(async () => {
    setLoading(true);
    try {
      const [cached, timestamp] = await Promise.all([
        storage.getItem(cacheKey),
        storage.getItem(timestampKey),
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
  }, [contextKey, loadFromCacheOrFetch]); // re-fetch when context or cache scope changes

  return { suggestions, loading, error, lastUpdated, refresh };
}
