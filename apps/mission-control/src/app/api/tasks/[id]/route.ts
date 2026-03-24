import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { tasks } from '@/lib/schema';
import { eq } from 'drizzle-orm';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { status, priority, assignedTo, description, title } = body;

    const updates: Record<string, unknown> = {};
    if (status !== undefined) updates.status = status;
    if (priority !== undefined) updates.priority = priority;
    if (assignedTo !== undefined) updates.assigned_to = assignedTo;
    if (description !== undefined) updates.description = description;
    if (title !== undefined) updates.title = title;
    if (status === 'done') updates.completed_at = Date.now();

    await db.update(tasks).set(updates).where(eq(tasks.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to update task:', error);
    return NextResponse.json({ error: 'Failed to update task' }, { status: 500 });
  }
}
