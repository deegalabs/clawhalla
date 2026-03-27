import { NextRequest, NextResponse } from 'next/server';

// POST /api/connection/test-llm — test LLM provider connectivity
export async function POST(req: NextRequest) {
  try {
    const { provider, apiKey, ollamaUrl } = await req.json();

    if (provider === 'anthropic') {
      if (!apiKey) {
        return NextResponse.json({ ok: false, error: 'API key required' }, { status: 400 });
      }

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6-20250514',
          max_tokens: 16,
          messages: [{ role: 'user', content: 'Say "ok" in one word.' }],
        }),
      });

      if (res.ok) {
        return NextResponse.json({ ok: true, model: 'claude-sonnet-4-6', status: 'connected' });
      }

      const err = await res.json().catch(() => ({}));
      return NextResponse.json({
        ok: false,
        error: (err as Record<string, unknown>).error?.toString() || `HTTP ${res.status}`,
      });
    }

    if (provider === 'google') {
      if (!apiKey) {
        return NextResponse.json({ ok: false, error: 'API key required' }, { status: 400 });
      }

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'Say "ok"' }] }],
          }),
        },
      );

      if (res.ok) {
        return NextResponse.json({ ok: true, model: 'gemini-2.0-flash', status: 'connected' });
      }

      return NextResponse.json({ ok: false, error: `HTTP ${res.status}` });
    }

    if (provider === 'ollama') {
      const url = ollamaUrl || 'http://localhost:11434';
      const res = await fetch(`${url}/api/tags`);
      if (res.ok) {
        const data = await res.json();
        const models = (data.models || []).map((m: { name: string }) => m.name);
        return NextResponse.json({
          ok: true,
          model: models[0] || 'none',
          status: 'connected',
        });
      }
      return NextResponse.json({ ok: false, error: 'Cannot reach Ollama' });
    }

    return NextResponse.json({ ok: false, error: 'Unknown provider' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
