import { NextResponse } from 'next/server';
import { vault } from '@/lib/vault';

// POST /api/vault/reveal — decrypt and return a secret value
// Separate endpoint to make it explicit that this is a sensitive operation
export async function POST(req: Request) {
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

    // Return masked value by default, full value only with explicit flag
    const masked = secret.value.slice(0, 4) + '...' + secret.value.slice(-4);

    return NextResponse.json({
      ok: true,
      name: secret.name,
      value: body.full ? secret.value : masked,
      masked: !body.full,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to reveal secret';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
