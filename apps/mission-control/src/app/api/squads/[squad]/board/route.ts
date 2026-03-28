import { NextRequest, NextResponse } from 'next/server';
import { getSquadBoard } from '@/lib/workspace';
import { authenticateRequest, isAuthError } from '@/lib/auth';

type RouteContext = { params: Promise<{ squad: string }> };

// GET /api/squads/:squad/board — get parsed board for a squad
export async function GET(req: NextRequest, ctx: RouteContext) {
  const auth = authenticateRequest(req);
  if (isAuthError(auth)) return auth;

  const { squad: squadId } = await ctx.params;

  if (squadId.includes('..') || squadId.includes('/')) {
    return NextResponse.json({ error: 'Invalid squad ID' }, { status: 400 });
  }

  try {
    const board = await getSquadBoard(squadId);
    if (!board) {
      return NextResponse.json({ error: 'Board not found for this squad' }, { status: 404 });
    }
    return NextResponse.json({ data: board });
  } catch (error) {
    console.error(`[squads/${squadId}/board] Error:`, error);
    return NextResponse.json({ error: 'Failed to read board' }, { status: 500 });
  }
}
