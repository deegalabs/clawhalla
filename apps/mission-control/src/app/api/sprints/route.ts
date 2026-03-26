import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sprints } from '@/lib/schema';
import { eq } from 'drizzle-orm';

function genId() { return 'sprint_' + (Date.now() % 100000); }

export async function GET() {
  try {
    const sqlite = (db as unknown as { $client: { exec: (sql: string) => void } }).$client;
    sqlite.exec(`CREATE TABLE IF NOT EXISTS sprints (id TEXT PRIMARY KEY, name TEXT NOT NULL, status TEXT DEFAULT 'planning', start_date TEXT, end_date TEXT, story_ids TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`);
    const all = await db.select().from(sprints);
    return NextResponse.json({ ok: true, sprints: all });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const now = new Date();
    const entry = {
      id: body.id || genId(),
      name: body.name,
      status: body.status || 'planning',
      startDate: body.startDate || body.start_date || null,
      endDate: body.endDate || body.end_date || null,
      storyIds: body.storyIds ? (typeof body.storyIds === 'string' ? body.storyIds : JSON.stringify(body.storyIds)) : null,
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(sprints).values(entry);
    return NextResponse.json({ ok: true, sprint: entry }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, ...updates } = body;
    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 });

    const set: Record<string, unknown> = { updated_at: Date.now() };
    if (updates.name !== undefined) set.name = updates.name;
    if (updates.status !== undefined) set.status = updates.status;
    if (updates.startDate !== undefined) set.start_date = updates.startDate;
    if (updates.endDate !== undefined) set.end_date = updates.endDate;
    if (updates.storyIds !== undefined) set.story_ids = typeof updates.storyIds === 'string' ? updates.storyIds : JSON.stringify(updates.storyIds);

    await db.update(sprints).set(set).where(eq(sprints.id, id));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 });
    await db.delete(sprints).where(eq(sprints.id, id));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
