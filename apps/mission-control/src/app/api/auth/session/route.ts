import { NextResponse } from 'next/server';
import { getMCSessionToken } from '@/lib/auth';

// GET /api/auth/session — returns the MC session token for frontend use.
// Only accessible from same-origin browser requests (no auth header needed).
// The token is crypto-random, generated per process, and used for X-MC-Internal header.
export async function GET() {
  return NextResponse.json({ ok: true, token: getMCSessionToken() });
}
