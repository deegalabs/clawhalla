import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { url, token } = await req.json();
    if (!url) return NextResponse.json({ ok: false, error: 'URL required' }, { status: 400 });

    const healthUrl = url.replace('ws://', 'http://').replace('wss://', 'https://');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${healthUrl}/health`, { signal: controller.signal, headers });
      clearTimeout(timeout);

      if (!res.ok) {
        return NextResponse.json({
          ok: false,
          error: res.status === 401 ? 'Invalid token — check your Gateway Token' : `Gateway returned ${res.status}`,
        });
      }

      const data = await res.json().catch(() => ({}));
      return NextResponse.json({ ok: true, status: data.status, latency: Date.now() });
    } catch (err) {
      clearTimeout(timeout);
      const msg = err instanceof Error && err.name === 'AbortError'
        ? 'Connection timed out (5s)'
        : 'Cannot reach gateway';
      return NextResponse.json({ ok: false, error: msg });
    }
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
