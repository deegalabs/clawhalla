import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { tasks } from '@/lib/schema';

function nanoid() {
  return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

export async function GET() {
  try {
    const allTasks = await db.select().from(tasks);
    return NextResponse.json(allTasks);
  } catch (error) {
    console.error('Failed to fetch tasks:', error);
    return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, description, priority, assignedTo } = body;

    const newTask = {
      id: nanoid(),
      title,
      description: description || null,
      status: 'backlog',
      priority: priority || 'medium',
      assignedTo: assignedTo || null,
      projectId: null,
      estimatedHours: null,
      actualHours: null,
      tags: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      completedAt: null
    };

    await db.insert(tasks).values(newTask);
    return NextResponse.json(newTask, { status: 201 });
  } catch (error) {
    console.error('Failed to create task:', error);
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 });
  }
}
