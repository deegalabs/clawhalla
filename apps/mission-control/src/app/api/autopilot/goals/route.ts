import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { autopilotGoals } from '@/lib/schema';
import { eq, desc } from 'drizzle-orm';

function ensureTable() {
  const sqlite = (db as unknown as { $client: { exec: (s: string) => void } }).$client;
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS autopilot_goals (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
      priority TEXT NOT NULL DEFAULT 'high', status TEXT NOT NULL DEFAULT 'active',
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
  `);
}

// GET /api/autopilot/goals — list all goals
export async function GET() {
  try {
    ensureTable();
    const goals = await db.select().from(autopilotGoals).orderBy(desc(autopilotGoals.createdAt));
    return NextResponse.json({ ok: true, goals });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}

// POST /api/autopilot/goals — create or update a goal
export async function POST(req: NextRequest) {
  try {
    ensureTable();
    const body = await req.json();
    const { id, title, description, priority, status } = body;

    if (!title) {
      return NextResponse.json({ ok: false, error: 'title required' }, { status: 400 });
    }

    const now = new Date();
    const goalId = id || `goal_${crypto.randomUUID()}`;

    const existing = id ? db.select().from(autopilotGoals).where(eq(autopilotGoals.id, id)).get() : null;

    if (existing) {
      db.update(autopilotGoals).set({
        title: title || existing.title,
        description: description ?? existing.description,
        priority: priority || existing.priority,
        status: status || existing.status,
        updatedAt: now,
      }).where(eq(autopilotGoals.id, id)).run();
    } else {
      await db.insert(autopilotGoals).values({
        id: goalId,
        title,
        description: description || '',
        priority: priority || 'high',
        status: status || 'active',
        createdAt: now,
        updatedAt: now,
      });
    }

    return NextResponse.json({ ok: true, id: goalId });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}

// DELETE /api/autopilot/goals?id=xxx
export async function DELETE(req: NextRequest) {
  try {
    ensureTable();
    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 });

    db.delete(autopilotGoals).where(eq(autopilotGoals.id, id)).run();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
