import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { tasks } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { requireAuth, isAuthError } from '@/lib/auth';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const rows = await db.select().from(tasks).where(eq(tasks.id, id));
  if (rows.length === 0) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
  return NextResponse.json(rows[0]);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const updates: Record<string, unknown> = { updated_at: Date.now() };

    const fields = ['status', 'priority', 'title', 'description', 'tags', 'notes',
      'story_id', 'sprint_id', 'project_id', 'estimated_hours', 'actual_hours'];

    for (const field of fields) {
      const camelCase = field.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      if (body[camelCase] !== undefined) updates[field] = body[camelCase];
      if (body[field] !== undefined) updates[field] = body[field];
    }

    if (body.assignedTo !== undefined) updates.assigned_to = body.assignedTo;
    if (body.assigned_to !== undefined) updates.assigned_to = body.assigned_to;
    if (updates.status === 'done') updates.completed_at = Date.now();

    await db.update(tasks).set(updates).where(eq(tasks.id, id));

    const updated = await db.select().from(tasks).where(eq(tasks.id, id));
    return NextResponse.json({ ok: true, task: updated[0] });
  } catch (error) {
    console.error('Failed to update task:', error);
    return NextResponse.json({ ok: false, error: 'Failed to update task' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(_request);
  if (isAuthError(auth)) return auth;
  try {
    const { id } = await params;
    await db.delete(tasks).where(eq(tasks.id, id));
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Failed to delete task:', error);
    return NextResponse.json({ ok: false, error: 'Failed to delete task' }, { status: 500 });
  }
}
