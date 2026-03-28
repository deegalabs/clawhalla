import { NextRequest, NextResponse } from 'next/server';
import { getSquads } from '@/lib/workspace';
import { authenticateRequest, isAuthError } from '@/lib/auth';

// GET /api/squads — list all squads from workspace
export async function GET(req: NextRequest) {
  const auth = authenticateRequest(req);
  if (isAuthError(auth)) return auth;

  try {
    const squads = await getSquads();
    return NextResponse.json({ data: squads });
  } catch (error) {
    console.error('[squads] Error reading workspace:', error);
    return NextResponse.json({ data: [], error: 'Failed to read workspace' }, { status: 500 });
  }
}
