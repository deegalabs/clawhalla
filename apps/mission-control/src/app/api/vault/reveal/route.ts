import { NextRequest, NextResponse } from 'next/server';
import { vault } from '@/lib/vault';
import { authenticateRequest, isAuthError } from '@/lib/auth';

// POST /api/vault/reveal — decrypt and return a secret value
// Requires authentication for agent/gateway requests
export async function POST(req: NextRequest) {
  const auth = authenticateRequest(req);
  if (isAuthError(auth)) return auth;

  try {
    const body = await req.json();
    const { name } = body;

    if (!name) {
      return NextResponse.json({ ok: false, error: 'name is required' }, { status: 400 });
    }

    const secret = await vault.get(name);
    if (!secret) {
      return NextResponse.json({ ok: false, error: 'Secret not found' }, { status: 404 });
    }

    // Agents ALWAYS get masked values — only gateway/internal can see full (ADR-004)
    const isAgent = auth.type === 'agent' || !!auth.agentId;
    const showFull = !isAgent && (body.full === true || auth.type === 'gateway');
    const masked = secret.value.slice(0, 4) + '...' + secret.value.slice(-4);

    console.log(`[vault-reveal] ${auth.type}${auth.agentId ? `:${auth.agentId}` : ''} revealed: ${name} (${showFull ? 'full' : 'masked'})`);

    return NextResponse.json({
      ok: true,
      name: secret.name,
      value: showFull ? secret.value : masked,
      masked: !showFull,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to reveal secret';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
