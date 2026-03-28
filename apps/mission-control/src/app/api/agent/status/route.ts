import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { agents, activities } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { authenticateRequest, isAuthError } from '@/lib/auth';
import { broadcastBoardEvent } from '@/lib/events';

// POST /api/agent/status — agent reports its current status
// Headers: Authorization: Bearer <token>, X-Agent-Id: <agentId>
// Body: { status: "working" | "idle" | "blocked" | "waiting", details?: string }
export async function POST(req: NextRequest) {
  const auth = authenticateRequest(req);
  if (isAuthError(auth)) return auth;

  if (!auth.agentId) {
    return NextResponse.json({ ok: false, error: 'X-Agent-Id header required' }, { status: 400 });
  }

  const body = await req.json();
  const { status, details } = body;

  if (!status) {
    return NextResponse.json({ ok: false, error: 'status is required' }, { status: 400 });
  }

  const now = new Date();

  // Update agent status
  db.update(agents)
    .set({ status, updatedAt: now })
    .where(eq(agents.id, auth.agentId))
    .run();

  // Log activity
  db.insert(activities).values({
    id: `act_${crypto.randomUUID()}`,
    agentId: auth.agentId,
    action: `status_${status}`,
    target: null,
    details: details || null,
    timestamp: now,
  }).run();

  broadcastBoardEvent({
    type: `agent.${status}`,
    by: auth.agentId,
    data: { status, details },
  });

  return NextResponse.json({ ok: true, agentId: auth.agentId, status });
}

// GET /api/agent/status — get agent's own status and assignments
export async function GET(req: NextRequest) {
  const auth = authenticateRequest(req);
  if (isAuthError(auth)) return auth;

  if (!auth.agentId) {
    return NextResponse.json({ ok: false, error: 'X-Agent-Id header required' }, { status: 400 });
  }

  const agent = db.select().from(agents).where(eq(agents.id, auth.agentId)).get();
  if (!agent) {
    return NextResponse.json({ ok: false, error: 'Agent not found' }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    agent: {
      id: agent.id,
      name: agent.name,
      role: agent.role,
      tier: agent.tier,
      squad: agent.squad,
      status: agent.status,
      model: agent.model,
    },
  });
}
