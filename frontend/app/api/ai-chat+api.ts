// app/api/ai-chat+api.ts
// Server-side only — OPENROUTER_API_KEY is never exposed to the client

import { ExpoRequest, ExpoResponse } from 'expo-router/server';

export async function POST(request: ExpoRequest): Promise<ExpoResponse> {
  const { prompt, system } = await request.json();

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'X-Title': 'GainTrack'
    },
    body: JSON.stringify({
      model: 'openai/gpt-oss-120b:free',
      messages: [
        ...(system ? [{ role: 'system', content: system }] : []),
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 800
    })
  });

  const data = await res.json();
  return ExpoResponse.json(data);
}

export async function GET(): Promise<ExpoResponse> {
  return ExpoResponse.json({ error: 'POST only' }, { status: 405 });
}
