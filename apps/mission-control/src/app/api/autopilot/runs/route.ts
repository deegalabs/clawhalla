import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { autopilotRuns } from '@/lib/schema';
import { eq, desc } from 'drizzle-orm';

function ensureTable() {
  const sqlite = (db as unknown as { $client: { exec: (s: string) => void } }).$client;
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS autopilot_runs (
      id TEXT PRIMARY KEY, goal_id TEXT, agent_id TEXT NOT NULL,
      task_title TEXT NOT NULL DEFAULT '', task_description TEXT,
      status TEXT NOT NULL DEFAULT 'pending', result TEXT,
      feedback TEXT, feedback_note TEXT,
      created_at INTEGER NOT NULL
    );
  `);
}

// GET /api/autopilot/runs — list runs (newest first, max 50)
export async function GET(req: NextRequest) {
  try {
    ensureTable();
    const limit = parseInt(req.nextUrl.searchParams.get('limit') || '50');
    const runs = await db.select().from(autopilotRuns)
      .orderBy(desc(autopilotRuns.createdAt))
      .limit(limit);
    return NextResponse.json({ ok: true, runs });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}

// POST /api/autopilot/runs — create or update a run
export async function POST(req: NextRequest) {
  try {
    ensureTable();
    const body = await req.json();
    const { id, goalId, agentId, taskTitle, taskDescription, status, result, feedback, feedbackNote } = body;

    if (!agentId) {
      return NextResponse.json({ ok: false, error: 'agentId required' }, { status: 400 });
    }

    const now = new Date();
    const runId = id || `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

    const existing = id ? db.select().from(autopilotRuns).where(eq(autopilotRuns.id, id)).get() : null;

    if (existing) {
      db.update(autopilotRuns).set({
        goalId: goalId ?? existing.goalId,
        taskTitle: taskTitle || existing.taskTitle,
        taskDescription: taskDescription ?? existing.taskDescription,
        status: status || existing.status,
        result: result ?? existing.result,
        feedback: feedback ?? existing.feedback,
        feedbackNote: feedbackNote ?? existing.feedbackNote,
      }).where(eq(autopilotRuns.id, id)).run();
    } else {
      await db.insert(autopilotRuns).values({
        id: runId,
        goalId: goalId || null,
        agentId,
        taskTitle: taskTitle || '',
        taskDescription: taskDescription || null,
        status: status || 'pending',
        result: result || null,
        feedback: feedback || null,
        feedbackNote: feedbackNote || null,
        createdAt: now,
      });
    }

    return NextResponse.json({ ok: true, id: runId });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}

// DELETE /api/autopilot/runs?id=xxx
export async function DELETE(req: NextRequest) {
  try {
    ensureTable();
    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 });

    db.delete(autopilotRuns).where(eq(autopilotRuns.id, id)).run();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
