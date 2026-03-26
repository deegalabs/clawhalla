import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url) return NextResponse.json({ ok: false, error: 'URL required' }, { status: 400 });

    // Try to connect to the gateway health endpoint
    const healthUrl = url.replace('ws://', 'http://').replace('wss://', 'https://');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const res = await fetch(`${healthUrl}/health`, { signal: controller.signal });
      clearTimeout(timeout);
      const data = await res.json();
      return NextResponse.json({ ok: true, status: data.status, latency: Date.now() });
    } catch {
      clearTimeout(timeout);
      return NextResponse.json({ ok: false, error: 'Cannot reach gateway' });
    }
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
