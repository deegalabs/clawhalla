import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { activities } from '@/lib/schema';
import { authenticateRequest, isAuthError } from '@/lib/auth';
import { broadcastBoardEvent } from '@/lib/events';

// POST /api/agent/report — agent reports an event or action
// Body: { action, target?, details? }
// Used for: task_started, task_completed, task_blocked, thinking, error, etc.
export async function POST(req: NextRequest) {
  const auth = authenticateRequest(req);
  if (isAuthError(auth)) return auth;

  if (!auth.agentId) {
    return NextResponse.json({ error: 'X-Agent-Id header required' }, { status: 400 });
  }

  const body = await req.json();
  if (!body.action) {
    return NextResponse.json({ error: 'action is required' }, { status: 400 });
  }

  const now = new Date();

  db.insert(activities).values({
    id: `act_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
    agentId: auth.agentId,
    action: body.action,
    target: body.target || null,
    details: body.details || null,
    timestamp: now,
  }).run();

  broadcastBoardEvent({
    type: `agent.${body.action}`,
    by: auth.agentId,
    data: { target: body.target, details: body.details },
  });

  return NextResponse.json({ ok: true });
}
