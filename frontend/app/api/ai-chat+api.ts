// app/api/ai-chat+api.ts
// Server-side only — OPENROUTER_API_KEY is never exposed to the client

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export async function POST(request: Request): Promise<Response> {
  try {
    let body: { prompt?: string; system?: string };
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid JSON body' }, 400);
    }

    const { prompt, system } = body;
    if (!prompt) return json({ error: 'Missing prompt' }, 400);

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) return json({ error: 'API key not configured' }, 500);

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-Title': 'GainTrack',
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-120b:free',
        messages: [
          ...(system ? [{ role: 'system', content: system }] : []),
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 800,
      }),
    });

    const text = await res.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return json({ error: `OpenRouter returned non-JSON: ${text.slice(0, 200)}` }, 502);
    }

    return json(data, res.status);
  } catch (e: any) {
    return json({ error: e.message ?? 'Internal error' }, 500);
  }
}

export async function GET(): Promise<Response> {
  return json({ error: 'POST only' }, 405);
}
