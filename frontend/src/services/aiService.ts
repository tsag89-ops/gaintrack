// src/services/aiService.ts
//
// ─── SETUP REQUIRED ─────────────────────────────────────────────────────────
//  1. Create frontend/.env and add:
//       EXPO_PUBLIC_AI_API_KEY=your_key_here
//  2. .env is already in .gitignore — do NOT commit it.
//  3. For EAS builds, run:
//       eas env:create --scope project --name EXPO_PUBLIC_AI_API_KEY --value your_key_here
//  4. Replace the placeholder URL below with your real AI provider endpoint:
//       e.g. https://api.openai.com/v1/chat/completions  (OpenAI)
//            https://api.anthropic.com/v1/messages       (Anthropic)
// ─────────────────────────────────────────────────────────────────────────────

import axios from 'axios';

// ── Plug your AI provider endpoint here ──────────────────────────────────────
const AI_ENDPOINT = 'https://api.example.com/ai'; // TODO: replace with real endpoint
const AI_MODEL    = 'gpt-4o-mini';                // TODO: replace with desired model name
const AI_API_KEY  = process.env.EXPO_PUBLIC_AI_API_KEY ?? '';
// ─────────────────────────────────────────────────────────────────────────────

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

// Mocked suggestions returned when no real API is configured.
// TODO: remove once a real AI endpoint is wired up.
const MOCK_SUGGESTIONS: AISuggestion[] = [
  {
    id: '1',
    category: 'exercise',
    title: 'Next Muscle Group: Shoulders',
    description:
      "You've trained chest and triceps the last two sessions. Hit shoulders today to maintain balanced push-pull frequency. Try Overhead Press 4×6 as your primary lift.",
    isProOnly: false,
  },
  {
    id: '2',
    category: 'superset',
    title: 'Superset Idea: Bicep Curl + Hammer Curl',
    description:
      'Pair barbell curls (3×10) with hammer curls (3×12) for maximum bicep volume in half the time. Rest 90 s between supersets.',
    isProOnly: false,
  },
  {
    id: '3',
    category: 'nutrition',
    title: 'Lean Bulk Tip: Hit 160 g Protein Today',
    description:
      "Based on your logged meals, you're ~40 g short of your protein target. Add a 200-cal chicken breast or a whey shake to close the gap without a significant calorie surplus.",
    isProOnly: false,
  },
  {
    id: '4',
    category: 'program',
    title: 'Program Suggestion: GZCLP Linear Progression',
    description:
      'Your strength is advancing steadily. GZCLP is a proven 3-day linear program that will keep your squat, bench, and deadlift climbing for the next 12–16 weeks.',
    isProOnly: true, // [PRO]
  },
];

/**
 * Fetch AI-generated coaching suggestions.
 * Returns mocked data when EXPO_PUBLIC_AI_API_KEY is not set.
 */
export async function getAISuggestions(context: AIContext): Promise<AISuggestion[]> {
  // If no key is configured, return mocks immediately.
  if (!AI_API_KEY) {
    console.warn('[aiService] EXPO_PUBLIC_AI_API_KEY not set — returning mocked suggestions.');
    return MOCK_SUGGESTIONS;
  }

  // TODO: Adapt the request body to match your chosen provider's API contract.
  const prompt = buildPrompt(context);

  const response = await axios.post(
    AI_ENDPOINT,
    {
      model: AI_MODEL,
      // OpenAI-style messages array — adjust for Anthropic or other providers:
      messages: [
        {
          role: 'system',
          content:
            'You are a personal fitness coach. Respond ONLY with a valid JSON array of suggestion objects matching the AISuggestion type.',
        },
        { role: 'user', content: prompt },
      ],
      // TODO: adjust max_tokens / temperature as needed
      max_tokens: 512,
      temperature: 0.7,
    },
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${AI_API_KEY}`,
      },
    },
  );

  // TODO: parse the response based on your provider's response shape.
  // Below assumes OpenAI-style response:
  const raw = response.data?.choices?.[0]?.message?.content ?? '[]';
  return JSON.parse(raw) as AISuggestion[];
}

function buildPrompt(context: AIContext): string {
  return `
User goals: ${context.goals || 'general fitness'}.
Recent workouts: ${JSON.stringify(context.recentWorkouts.slice(0, 3))}.
Today's calorie intake: ${context.calories ?? 'unknown'} kcal.

Return 4 suggestions: one exercise, one superset, one nutrition tip, one program suggestion.
Each object must have: id, category, title, description, isProOnly.
  `.trim();
}
