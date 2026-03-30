import { NextResponse } from 'next/server';
import { getSetting } from '@/lib/settings';

async function invokeGateway(tool: string, args: Record<string, unknown> = {}) {
  const gatewayUrl = getSetting('gateway_url', process.env.GATEWAY_URL || 'http://127.0.0.1:18789');
  const gatewayToken = getSetting('gateway_token', process.env.GATEWAY_TOKEN || '');
  const res = await fetch(`${gatewayUrl}/tools/invoke`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${gatewayToken}`,
    },
    body: JSON.stringify({ tool, args }),
    cache: 'no-store',
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error?.message || 'Gateway error');
  const text = data.result?.content?.[0]?.text;
  return text ? JSON.parse(text) : null;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const sessionKey = url.searchParams.get('key');
    const messageLimit = parseInt(url.searchParams.get('messages') || '0');

    const sessions = await invokeGateway('sessions_list', { messageLimit: sessionKey ? 20 : messageLimit });

    if (sessionKey && sessions?.sessions) {
      const session = sessions.sessions.find((s: { key: string }) => s.key === sessionKey);
      if (!session) {
        return NextResponse.json({ ok: false, error: 'Session not found' }, { status: 404 });
      }
      return NextResponse.json({ ok: true, session });
    }

    return NextResponse.json({ ok: true, sessions });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
