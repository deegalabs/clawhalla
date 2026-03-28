import { db } from '@/lib/db';
import { tasks, activities, agents } from '@/lib/schema';
import { eq, and, asc } from 'drizzle-orm';
import { NextResponse } from 'next/server';

const priorityOrder: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const agentId = url.searchParams.get('agent_id');

  if (!agentId) {
    return NextResponse.json({ ok: false, error: 'agent_id required' }, { status: 400 });
  }

  try {
    // Update agent last_seen (would need to add this field to schema)
    // For MVP, we just log the heartbeat
    
    // Find highest priority backlog task assigned to this agent
    const backlogTasks = await db.select()
      .from(tasks)
      .where(and(
        eq(tasks.status, 'backlog'),
        eq(tasks.assignedTo, agentId)
      ))
      .orderBy(asc(tasks.createdAt));

    // Sort by priority (in JS since SQLite doesn't support custom order)
    backlogTasks.sort((a, b) => {
      const aPrio = priorityOrder[a.priority] ?? 2;
      const bPrio = priorityOrder[b.priority] ?? 2;
      return aPrio - bPrio;
    });

    const foundTask = backlogTasks[0] || null;

    // Log heartbeat activity
    await db.insert(activities).values({
      id: `act_${Date.now().toString(36)}`,
      agentId,
      action: 'heartbeat_check',
      target: foundTask?.id || null,
      details: foundTask ? `Task available: ${foundTask.title}` : 'No tasks in backlog',
      timestamp: new Date(),
    });

    return NextResponse.json({
      agent_id: agentId,
      timestamp: Date.now(),
      task: foundTask ? {
        id: foundTask.id,
        title: foundTask.title,
        description: foundTask.description,
        priority: foundTask.priority,
      } : null,
      message: foundTask ? 'Task available' : 'No tasks in backlog',
    });
  } catch (error) {
    console.error('Heartbeat error:', error);
    return NextResponse.json({
      ok: false,
      agent_id: agentId,
      timestamp: Date.now(),
      task: null,
      message: 'Error checking tasks',
      error: String(error),
    });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { agent_id, task_id, status, details } = body;

    if (!agent_id || !task_id || !status) {
      return NextResponse.json(
        { ok: false, error: 'agent_id, task_id, and status required' },
        { status: 400 }
      );
    }

    // Update task status
    const newStatus = status === 'done' ? 'done' : 
                      status === 'in_progress' ? 'in_progress' :
                      status === 'blocked' ? 'blocked' : 'backlog';

    await db.update(tasks)
      .set({
        status: newStatus,
        updatedAt: new Date(),
        completedAt: status === 'done' ? new Date() : undefined,
      })
      .where(eq(tasks.id, task_id));

    // Log activity
    const action = status === 'done' ? 'task_completed' :
                   status === 'in_progress' ? 'task_started' :
                   'task_updated';

    await db.insert(activities).values({
      id: `act_${Date.now().toString(36)}`,
      agentId: agent_id,
      action,
      target: task_id,
      details: details || `Task ${status}`,
      timestamp: new Date(),
    });

    return NextResponse.json({ ok: true, status: newStatus });
  } catch (error) {
    console.error('Heartbeat POST error:', error);
    return NextResponse.json({ ok: false, error: 'Failed to update task' }, { status: 500 });
  }
}
