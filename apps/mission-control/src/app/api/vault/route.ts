import { NextRequest, NextResponse } from 'next/server';
import { vault } from '@/lib/vault';
import { requireAuth, isAuthError } from '@/lib/auth';

// GET /api/vault — list all secrets (values never exposed)
export async function GET() {
  try {
    const items = await vault.list();
    return NextResponse.json({ ok: true, secrets: items });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list secrets';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

// POST /api/vault — create or update a secret (auth required)
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (isAuthError(auth)) return auth;

  try {
    const body = await req.json();
    const { name, value, description, category } = body;

    if (!name || !value) {
      return NextResponse.json({ ok: false, error: 'name and value are required' }, { status: 400 });
    }

    if (name.length > 100) {
      return NextResponse.json({ ok: false, error: 'name must be 100 chars or less' }, { status: 400 });
    }

    const entry = await vault.set(name, value, { description, category });
    console.log(`[vault] Secret ${name} saved by ${auth.type}${auth.agentId ? `:${auth.agentId}` : ''}`);
    return NextResponse.json({ ok: true, secret: entry });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save secret';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

// DELETE /api/vault — delete a secret by name (auth required)
export async function DELETE(req: NextRequest) {
  const auth = requireAuth(req);
  if (isAuthError(auth)) return auth;

  try {
    const url = new URL(req.url);
    const name = url.searchParams.get('name');

    if (!name) {
      return NextResponse.json({ ok: false, error: 'name parameter required' }, { status: 400 });
    }

    const deleted = await vault.delete(name);
    if (!deleted) {
      return NextResponse.json({ ok: false, error: 'Secret not found' }, { status: 404 });
    }

    console.log(`[vault] Secret ${name} deleted by ${auth.type}${auth.agentId ? `:${auth.agentId}` : ''}`);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete secret';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
