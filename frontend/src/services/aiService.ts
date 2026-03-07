// src/services/aiService.ts
//
// --- SETUP REQUIRED ---------------------------------------------------------
//  OPENROUTER_API_KEY is a server-side secret � set it in frontend/.env.
//  It is read only by the server-side route (app/api/ai-chat+api.ts).
//  On web, client code calls /api/ai-chat and NEVER reads the key directly.
//
//  On native production (no Expo dev server), the route is unreachable.
//  Set EXPO_PUBLIC_AI_API_KEY in .env to enable direct OpenRouter calls.
//
//  For EAS builds, create the secrets:
//    eas env:create --scope project --name OPENROUTER_API_KEY --value sk-or-v1-...
//    eas env:create --scope project --name EXPO_PUBLIC_AI_API_KEY --value sk-or-v1-...
// -----------------------------------------------------------------------------

import { Platform } from 'react-native';
import Constants from 'expo-constants';

const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const AI_MODEL = 'openai/gpt-oss-120b:free';

// -- Resolve the internal API route URL ---------------------------------------
// Returns null in native production builds where no Expo server is reachable.
function getServerRouteUrl(): string | null {
  if (Platform.OS === 'web') return '/api/ai-chat';
  const host =
    Constants.expoConfig?.hostUri ??
    (Constants as any).manifest2?.extra?.expoClient?.hostUri;
  if (host) return `http://${host.split(':')[0]}:8081/api/ai-chat`;
  return null; // production APK/IPA � Expo server route not available
}

// -- Direct OpenRouter fetch (native production fallback) ---------------------
async function fetchFromOpenRouterDirect(
  system: string,
  prompt: string,
): Promise<Response> {
  const apiKey = process.env.EXPO_PUBLIC_AI_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ error: 'no_key' }), { status: 503 });
  return fetch(OPENROUTER_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://gaintrack.app',
      'X-Title': 'GainTrack',
    },
    body: JSON.stringify({
      model: AI_MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user',   content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 800,
      provider: { data_collection: 'allow', allow_fallbacks: true },
    }),
  });
}

// --- Types --------------------------------------------------------------------

export interface AISuggestion {
  id: string;
  category: 'exercise' | 'superset' | 'nutrition' | 'program';
  title: string;
  description: string;
  isProOnly: boolean;
}

export interface AIContext {
  recentWorkouts: any[];
  goals: string;
  calories?: number;
}

// --- Mocked fallback ----------------------------------------------------------

const MOCK_SUGGESTIONS: AISuggestion[] = [
  {
    id: '1',
    category: 'exercise',
    title: 'Next Muscle Group: Shoulders',
    description:
      "You've trained chest and triceps the last two sessions. Hit shoulders today to maintain balanced push-pull frequency. Try Overhead Press 4x6 as your primary lift.",
    isProOnly: false,
  },
  {
    id: '2',
    category: 'superset',
    title: 'Superset Idea: Bicep Curl + Hammer Curl',
    description:
      'Pair barbell curls (3x10) with hammer curls (3x12) for maximum bicep volume in half the time. Rest 90 s between supersets.',
    isProOnly: false,
  },
  {
    id: '3',
    category: 'nutrition',
    title: 'Lean Bulk Tip: Hit 160 g Protein Today',
    description:
      "Based on your logged meals, you're ~40 g short of your protein target. Add a 200-cal chicken breast or a whey shake to close the gap.",
    isProOnly: false,
  },
  {
    id: '4',
    category: 'program',
    title: 'Program Suggestion: GZCLP Linear Progression',
    description:
      'Your strength is advancing steadily. GZCLP is a proven 3-day linear program that will keep your squat, bench, and deadlift climbing for the next 12-16 weeks.',
    isProOnly: true, // [PRO]
  },
];

// --- Main export --------------------------------------------------------------

/**
 * Fetch AI-generated coaching suggestions.
 * Strategy:
 *   1. Try the Expo server route /api/ai-chat (works on web + native dev server).
 *   2. If unreachable (production APK/IPA), fall back to direct OpenRouter
 *      using EXPO_PUBLIC_AI_API_KEY.
 *   3. If both fail, return static mocks so the UI is never broken.
 */
export async function getAISuggestions(context: AIContext): Promise<AISuggestion[]> {
  const system =
    'You are a personal fitness coach. Respond ONLY with a valid JSON array of suggestion objects. ' +
    'Each object must have: id (string), category ("exercise"|"superset"|"nutrition"|"program"), ' +
    'title (string), description (string), isProOnly (boolean).';
  const prompt = buildPrompt(context);

  const serverUrl = getServerRouteUrl();
  let res: Response | undefined;

  // Attempt 1: Expo server route
  if (serverUrl) {
    try {
      res = await fetch(serverUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ system, prompt }),
      });
    } catch {
      res = undefined;
    }
  }

  // Attempt 2: direct OpenRouter (native production fallback)
  if (!res || !res.ok) {
    try {
      res = await fetchFromOpenRouterDirect(system, prompt);
    } catch (e: any) {
      console.warn('[aiService] Direct OpenRouter failed:', e?.message);
      return MOCK_SUGGESTIONS;
    }
  }

  if (!res || !res.ok) {
    console.warn(`[aiService] All AI attempts failed (${res?.status}) � using mocked suggestions.`);
    return MOCK_SUGGESTIONS;
  }

  try {
    const data = await res.json();
    const raw: string = data?.choices?.[0]?.message?.content ?? '';
    if (!raw) return MOCK_SUGGESTIONS;
    const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    return JSON.parse(jsonStr) as AISuggestion[];
  } catch (e: any) {
    console.warn('[aiService] Failed to parse AI response:', e?.message);
    return MOCK_SUGGESTIONS;
  }
}

function buildPrompt(context: AIContext): string {
  return (
    `User goals: ${context.goals || 'general fitness'}. ` +
    `Recent workouts: ${JSON.stringify(context.recentWorkouts.slice(0, 3))}. ` +
    `Today calorie intake: ${context.calories ?? 'unknown'} kcal. ` +
    'Return 4 suggestions: one exercise, one superset, one nutrition tip, one program suggestion. ' +
    'Each object must have: id, category, title, description, isProOnly.'
  );
}
