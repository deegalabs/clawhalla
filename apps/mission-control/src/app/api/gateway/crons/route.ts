import { NextResponse } from 'next/server';
import { getSetting } from '@/lib/settings';

export async function GET() {
  const gatewayUrl = getSetting('gateway_url', process.env.GATEWAY_URL || 'http://127.0.0.1:18789');
  const gatewayToken = getSetting('gateway_token', process.env.GATEWAY_TOKEN || '');
  try {
    // Try direct cron endpoint first
    const res = await fetch(`${gatewayUrl}/cron`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${gatewayToken}`,
      },
      cache: 'no-store',
    });

    if (res.ok) {
      const data = await res.json();
      return NextResponse.json({ ok: true, crons: data.jobs || data || [] });
    }

    // Fallback: return empty array (cron tool not available via gateway)
    return NextResponse.json({ ok: true, crons: [], source: 'unavailable' });
  } catch (e: any) {
    // ALWAYS return JSON, never let it fall through to HTML
    return NextResponse.json({ ok: true, crons: [], error: e.message, source: 'fallback' }, { status: 200 });
  }
}
