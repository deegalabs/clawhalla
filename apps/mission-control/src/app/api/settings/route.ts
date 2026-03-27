import { NextRequest, NextResponse } from 'next/server';
import { getSetting, setSetting } from '@/lib/settings';

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key');
  if (!key) return NextResponse.json({ error: 'key required' }, { status: 400 });
  const value = getSetting(key);
  // Never expose token values — only presence
  if (key === 'gateway_token') {
    return NextResponse.json({ key, configured: value.length > 0 });
  }
  return NextResponse.json({ key, value });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (typeof body.key !== 'string' || typeof body.value !== 'string') {
      return NextResponse.json({ error: 'key and value required' }, { status: 400 });
    }
    setSetting(body.key, body.value);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
