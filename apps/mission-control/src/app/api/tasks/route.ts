import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { tasks } from '@/lib/schema';
import { desc } from 'drizzle-orm';

function nanoid() {
  return `task_${crypto.randomUUID()}`;
}

export async function GET() {
  try {
    const allTasks = await db.select().from(tasks).orderBy(desc(tasks.updatedAt));
    return NextResponse.json(allTasks);
  } catch (error) {
    console.error('Failed to fetch tasks:', error);
    return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const newTask = {
      id: body.id || nanoid(),
      title: body.title,
      description: body.description || null,
      status: body.status || 'backlog',
      priority: body.priority || 'medium',
      assignedTo: body.assignedTo || body.assigned_to || null,
      projectId: body.projectId || body.project_id || 'clawhalla',
      storyId: body.storyId || body.story_id || null,
      sprintId: body.sprintId || body.sprint_id || null,
      estimatedHours: body.estimatedHours || null,
      actualHours: null,
      tags: body.tags || null,
      notes: body.notes || null,
      createdAt: new Date(),
      updatedAt: new Date(),
      completedAt: null,
    };

    await db.insert(tasks).values(newTask);
    return NextResponse.json(newTask, { status: 201 });
  } catch (error) {
    console.error('Failed to create task:', error);
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 });
  }
}
