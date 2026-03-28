import { NextRequest, NextResponse } from 'next/server';
import { getSquad } from '@/lib/workspace';
import { authenticateRequest, isAuthError } from '@/lib/auth';

type RouteContext = { params: Promise<{ squad: string }> };

// GET /api/squads/:squad — get one squad with full agent details
export async function GET(req: NextRequest, ctx: RouteContext) {
  const auth = authenticateRequest(req);
  if (isAuthError(auth)) return auth;

  const { squad: squadId } = await ctx.params;

  // Basic path traversal prevention
  if (squadId.includes('..') || squadId.includes('/')) {
    return NextResponse.json({ error: 'Invalid squad ID' }, { status: 400 });
  }

  try {
    const squad = await getSquad(squadId);
    if (!squad) {
      return NextResponse.json({ error: 'Squad not found' }, { status: 404 });
    }
    return NextResponse.json({ data: squad });
  } catch (error) {
    console.error(`[squads/${squadId}] Error:`, error);
    return NextResponse.json({ error: 'Failed to read squad' }, { status: 500 });
  }
}
