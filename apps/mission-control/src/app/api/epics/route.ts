import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { epics } from '@/lib/schema';
import { eq } from 'drizzle-orm';

function genId() { return 'epic_' + String(Date.now() % 1000).padStart(3, '0'); }

export async function GET() {
  try {
    const sqlite = (db as unknown as { $client: { exec: (sql: string) => void } }).$client;
    sqlite.exec(`CREATE TABLE IF NOT EXISTS epics (id TEXT PRIMARY KEY, title TEXT NOT NULL, status TEXT DEFAULT 'active', created_by TEXT, approved_by TEXT, priority TEXT DEFAULT 'medium', notes TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, completed_at INTEGER)`);
    const all = await db.select().from(epics);
    return NextResponse.json({ ok: true, epics: all });
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
      title: body.title,
      status: body.status || 'active',
      createdBy: body.createdBy || 'daniel',
      approvedBy: body.approvedBy || null,
      priority: body.priority || 'medium',
      notes: body.notes || null,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    };
    await db.insert(epics).values(entry);
    return NextResponse.json({ ok: true, epic: entry }, { status: 201 });
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
    if (updates.title !== undefined) set.title = updates.title;
    if (updates.status !== undefined) set.status = updates.status;
    if (updates.priority !== undefined) set.priority = updates.priority;
    if (updates.notes !== undefined) set.notes = updates.notes;
    if (updates.status === 'done') set.completed_at = Date.now();

    await db.update(epics).set(set).where(eq(epics.id, id));
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
    await db.delete(epics).where(eq(epics.id, id));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
