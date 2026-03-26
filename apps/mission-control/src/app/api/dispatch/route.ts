import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';
import { db } from '@/lib/db';
import { tasks, activities, costEvents } from '@/lib/schema';
import { eq } from 'drizzle-orm';

// POST /api/dispatch — execute a task by dispatching it to an agent
export async function POST(req: NextRequest) {
  try {
    const { taskId } = await req.json();

    if (!taskId) {
      return NextResponse.json({ ok: false, error: 'taskId required' }, { status: 400 });
    }

    // 1. Get the task
    const task = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
    if (!task) {
      return NextResponse.json({ ok: false, error: 'Task not found' }, { status: 404 });
    }

    const agentId = task.assignedTo || 'main';

    // 2. Update task status to doing
    db.update(tasks)
      .set({ status: 'doing', updatedAt: new Date().toISOString() })
      .where(eq(tasks.id, taskId))
      .run();

    // 3. Log activity: task started
    db.insert(activities).values({
      id: `act_${Date.now().toString(36)}_start`,
      agentId,
      action: 'task_started',
      target: task.title,
      details: `Dispatched to ${agentId}`,
      timestamp: new Date().toISOString(),
    }).run();

    // 4. Build context prompt for the agent
    const prompt = buildPrompt(task);

    // 5. Execute via openclaw agent
    let output = '';
    let success = false;
    const startTime = Date.now();

    try {
      const result = execSync(
        `openclaw agent --agent ${agentId} --json -m "${prompt.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`,
        { encoding: 'utf-8', timeout: 120000 }
      );

      // Parse response
      try {
        const parsed = JSON.parse(result);
        output = parsed.result?.content?.[0]?.text || parsed.response || result;
      } catch {
        output = result;
      }
      success = true;
    } catch (err) {
      output = `Agent error: ${String(err).slice(0, 500)}`;
      success = false;
    }

    const duration = Date.now() - startTime;

    // 6. Update task with result
    db.update(tasks)
      .set({
        status: success ? 'done' : 'blocked',
        notes: `${task.notes || ''}\n\n--- Dispatch Result (${new Date().toISOString()}) ---\nAgent: ${agentId}\nDuration: ${Math.round(duration / 1000)}s\nStatus: ${success ? 'SUCCESS' : 'FAILED'}\n\n${output}`.trim(),
        updatedAt: new Date().toISOString(),
        completedAt: success ? new Date().toISOString() : null,
      })
      .where(eq(tasks.id, taskId))
      .run();

    // 7. Log activity: task completed/blocked
    db.insert(activities).values({
      id: `act_${Date.now().toString(36)}_end`,
      agentId,
      action: success ? 'task_completed' : 'task_blocked',
      target: task.title,
      details: success ? `Completed in ${Math.round(duration / 1000)}s` : output.slice(0, 200),
      timestamp: new Date().toISOString(),
    }).run();

    // 8. Log cost event (estimate)
    const estimatedTokens = Math.round(prompt.length / 4) + Math.round(output.length / 4);
    db.insert(costEvents).values({
      id: `cost_${Date.now().toString(36)}`,
      agentId,
      model: 'claude-sonnet-4-6',
      action: 'dispatch',
      inputTokens: Math.round(prompt.length / 4),
      outputTokens: Math.round(output.length / 4),
      estimatedCost: Math.round(estimatedTokens * 0.003), // rough estimate in cents
      taskId,
      timestamp: new Date().toISOString(),
    }).run();

    return NextResponse.json({
      ok: true,
      taskId,
      agentId,
      success,
      duration,
      output: output.slice(0, 2000),
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}

// Build a rich context prompt for the agent
function buildPrompt(task: {
  title: string | null;
  description: string | null;
  priority: string | null;
  notes: string | null;
  projectId: string | null;
  tags: string | null;
}): string {
  const parts = [
    `TASK: ${task.title}`,
  ];

  if (task.description) parts.push(`DESCRIPTION: ${task.description}`);
  if (task.priority) parts.push(`PRIORITY: ${task.priority}`);
  if (task.projectId) parts.push(`PROJECT: ${task.projectId}`);
  if (task.tags) parts.push(`TAGS: ${task.tags}`);

  parts.push('');
  parts.push('INSTRUCTIONS:');
  parts.push('1. Execute this task completely');
  parts.push('2. Report what you did in detail');
  parts.push('3. List any files created or modified');
  parts.push('4. If you cannot complete it, explain why');

  if (task.notes) {
    parts.push('');
    parts.push(`CONTEXT/NOTES: ${task.notes}`);
  }

  return parts.join('\n');
}
