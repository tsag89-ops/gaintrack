// app/api/ai-chat+api.ts
// Server-side only — OPENROUTER_API_KEY is never exposed to the client

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const AI_ROUTE_TIMEOUT_MS = 12000;
const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 30;
const MAX_PROMPT_CHARS = 4000;
const MAX_SYSTEM_CHARS = 1500;

type RateBucket = {
  count: number;
  resetAt: number;
};

const rateBuckets = new Map<string, RateBucket>();

function getClientId(request: Request): string {
  const forwardedFor = request.headers.get('x-forwarded-for') ?? '';
  const realIp = request.headers.get('x-real-ip') ?? '';
  const candidate = forwardedFor.split(',')[0]?.trim() || realIp.trim() || 'unknown';
  return candidate || 'unknown';
}

function checkRateLimit(clientId: string): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(clientId);

  if (!bucket || now >= bucket.resetAt) {
    rateBuckets.set(clientId, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }

  if (bucket.count >= MAX_REQUESTS_PER_WINDOW) {
    return false;
  }

  bucket.count += 1;
  rateBuckets.set(clientId, bucket);
  return true;
}

async function fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AI_ROUTE_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const clientId = getClientId(request);
    if (!checkRateLimit(clientId)) {
      return json({ error: 'Too many requests. Try again in a few minutes.' }, 429);
    }

    let body: { prompt?: unknown; system?: unknown };
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid JSON body' }, 400);
    }

    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    const system = typeof body.system === 'string' ? body.system.trim() : '';

    if (!prompt) return json({ error: 'Missing prompt' }, 400);
    if (prompt.length > MAX_PROMPT_CHARS) {
      return json({ error: `Prompt too long. Max ${MAX_PROMPT_CHARS} characters.` }, 413);
    }
    if (system.length > MAX_SYSTEM_CHARS) {
      return json({ error: `System prompt too long. Max ${MAX_SYSTEM_CHARS} characters.` }, 413);
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) return json({ error: 'API key not configured' }, 500);

    const res = await fetchWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://gaintrack.app',
        'X-Title': 'GainTrack',
      },
      body: JSON.stringify({
        model: process.env.AI_MODEL ?? 'openai/gpt-oss-120b:free',
        messages: [
          ...(system ? [{ role: 'system', content: system }] : []),
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 800,
        provider: { data_collection: 'deny', allow_fallbacks: false },
      }),
    });

    const text = await res.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return json({ error: `OpenRouter returned non-JSON: ${text.slice(0, 200)}` }, 502);
    }

    // Surface a helpful error for OpenRouter data-policy rejection (free model opt-in required)
    if (!res.ok) {
      const errMsg = (data as any)?.error?.message ?? '';
      if (errMsg.includes('data policy')) {
        console.error('[ai-chat] OpenRouter data policy error — visit https://openrouter.ai/settings/privacy to enable free model usage.');
      }
    }

    return json(data, res.status);
  } catch (e: any) {
    return json({ error: 'Internal error' }, 500);
  }
}

export async function GET(): Promise<Response> {
  return json({ error: 'POST only' }, 405);
}
