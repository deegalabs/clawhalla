import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { db } from '@/lib/db';
import { tasks, cards, cardHistory, activities, costEvents } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { requireAuth, isAuthError } from '@/lib/auth';
import { broadcastBoardEvent } from '@/lib/events';
import { checkRateLimit, releaseRateLimit } from '@/lib/rate-limit';

// POST /api/dispatch — execute a task by dispatching it to an agent (auth required)
// Supports both old taskId (tasks table) and new cardId (cards/boards engine)
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (isAuthError(auth)) return auth;

  const rateLimitError = checkRateLimit('dispatch', { maxConcurrent: 3, maxPerMinute: 10 });
  if (rateLimitError) {
    return NextResponse.json({ ok: false, error: rateLimitError }, { status: 429 });
  }

  try {
    const body = await req.json();
    const { taskId, cardId } = body;

    if (!taskId && !cardId) {
      return NextResponse.json({ ok: false, error: 'taskId or cardId required' }, { status: 400 });
    }

    // Resolve the work item — card (new) or task (legacy)
    let title: string;
    let description: string | null;
    let priority: string | null;
    let agentId: string;
    let tags: string | null = null;
    let notes: string | null = null;
    let labels: string[] = [];
    let resolvedCardId: string | null = null;
    let resolvedTaskId: string | null = null;
    let boardId: string | null = null;

    if (cardId) {
      const card = db.select().from(cards).where(eq(cards.id, cardId)).get();
      if (!card) {
        return NextResponse.json({ ok: false, error: 'Card not found' }, { status: 404 });
      }
      title = card.title;
      description = card.description;
      priority = card.priority;
      agentId = card.assignee || 'main';
      labels = card.labels ? JSON.parse(card.labels) : [];
      boardId = card.boardId;
      resolvedCardId = cardId;
    } else {
      const task = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
      if (!task) {
        return NextResponse.json({ ok: false, error: 'Task not found' }, { status: 404 });
      }
      title = task.title || '';
      description = task.description;
      priority = task.priority;
      agentId = task.assignedTo || 'main';
      tags = task.tags;
      notes = task.notes;
      resolvedTaskId = taskId;
    }

    // Mark as in-progress
    if (resolvedCardId) {
      db.update(cards).set({ column: 'doing', updatedAt: new Date() }).where(eq(cards.id, resolvedCardId)).run();
      await db.insert(cardHistory).values({
        id: `hist_${crypto.randomUUID()}_disp`,
        cardId: resolvedCardId,
        action: 'dispatched',
        by: 'user',
        fromValue: null,
        toValue: agentId,
        timestamp: new Date(),
      });
    } else if (resolvedTaskId) {
      db.update(tasks).set({ status: 'doing', updatedAt: new Date() }).where(eq(tasks.id, resolvedTaskId)).run();
    }

    // Log activity: task started
    db.insert(activities).values({
      id: `act_${crypto.randomUUID()}_start`,
      agentId,
      action: 'task_started',
      target: title,
      details: `Dispatched to ${agentId}`,
      timestamp: new Date(),
    }).run();

    // Build context prompt
    const prompt = buildPrompt({ title, description, priority, tags, notes, labels });

    // Execute via openclaw agent (async spawn)
    const startTime = Date.now();
    const { output, success } = await new Promise<{ output: string; success: boolean }>((resolve) => {
      const proc = spawn('openclaw', [
        'agent', '--agent', agentId, '--json', '-m', prompt,
      ], { timeout: 120000 });

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
      proc.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

      proc.on('close', (code) => {
        let parsed = stdout;
        try {
          const json = JSON.parse(stdout);
          parsed = json.result?.content?.[0]?.text || json.response || stdout;
        } catch { /* raw text */ }

        resolve({
          output: parsed || stderr || `Process exited with code ${code}`,
          success: code === 0 && !!parsed,
        });
      });

      proc.on('error', (err) => {
        resolve({
          output: `Agent error: ${String(err).slice(0, 500)}`,
          success: false,
        });
      });
    });

    const duration = Date.now() - startTime;

    // Update work item with result
    if (resolvedCardId) {
      const doneColumn = success ? 'done' : 'blocked';
      db.update(cards).set({
        column: doneColumn,
        description: `${description || ''}\n\n--- Dispatch Result (${new Date().toISOString()}) ---\nAgent: ${agentId}\nDuration: ${Math.round(duration / 1000)}s\nStatus: ${success ? 'SUCCESS' : 'FAILED'}\n\n${output}`.trim(),
        updatedAt: new Date(),
        completedAt: success ? new Date() : null,
      }).where(eq(cards.id, resolvedCardId)).run();

      await db.insert(cardHistory).values({
        id: `hist_${crypto.randomUUID()}_res`,
        cardId: resolvedCardId,
        action: success ? 'completed' : 'blocked',
        by: agentId,
        fromValue: 'doing',
        toValue: doneColumn,
        timestamp: new Date(),
      });

      if (boardId) {
        broadcastBoardEvent({
          type: 'card.moved',
          boardId,
          cardId: resolvedCardId,
          by: agentId,
          data: { from: 'doing', to: doneColumn, title },
        });
      }
    } else if (resolvedTaskId) {
      db.update(tasks).set({
        status: success ? 'done' : 'blocked',
        notes: `${notes || ''}\n\n--- Dispatch Result (${new Date().toISOString()}) ---\nAgent: ${agentId}\nDuration: ${Math.round(duration / 1000)}s\nStatus: ${success ? 'SUCCESS' : 'FAILED'}\n\n${output}`.trim(),
        updatedAt: new Date(),
        completedAt: success ? new Date() : null,
      }).where(eq(tasks.id, resolvedTaskId)).run();
    }

    // Log activity: task completed/blocked
    db.insert(activities).values({
      id: `act_${crypto.randomUUID()}_end`,
      agentId,
      action: success ? 'task_completed' : 'task_blocked',
      target: title,
      details: success ? `Completed in ${Math.round(duration / 1000)}s` : output.slice(0, 200),
      timestamp: new Date(),
    }).run();

    // Log cost event (estimate)
    const estimatedTokens = Math.round(prompt.length / 4) + Math.round(output.length / 4);
    db.insert(costEvents).values({
      id: `cost_${crypto.randomUUID()}`,
      agentId,
      model: 'claude-sonnet-4-6',
      action: 'dispatch',
      inputTokens: Math.round(prompt.length / 4),
      outputTokens: Math.round(output.length / 4),
      estimatedCost: Math.round(estimatedTokens * 0.003),
      taskId: resolvedTaskId || resolvedCardId,
      timestamp: new Date(),
    }).run();

    releaseRateLimit('dispatch');
    return NextResponse.json({
      ok: true,
      taskId: resolvedTaskId,
      cardId: resolvedCardId,
      agentId,
      success,
      duration,
      output: output.slice(0, 2000),
    });
  } catch (error) {
    releaseRateLimit('dispatch');
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}

// Build a rich context prompt for the agent
function buildPrompt(item: {
  title: string;
  description: string | null;
  priority: string | null;
  tags: string | null;
  notes: string | null;
  labels: string[];
}): string {
  const parts = [`TASK: ${item.title}`];

  if (item.description) parts.push(`DESCRIPTION: ${item.description}`);
  if (item.priority) parts.push(`PRIORITY: ${item.priority}`);
  if (item.tags) parts.push(`TAGS: ${item.tags}`);
  if (item.labels.length > 0) parts.push(`LABELS: ${item.labels.join(', ')}`);

  parts.push('');
  parts.push('INSTRUCTIONS:');
  parts.push('1. Execute this task completely');
  parts.push('2. Report what you did in detail');
  parts.push('3. List any files created or modified');
  parts.push('4. If you cannot complete it, explain why');

  if (item.notes) {
    parts.push('');
    parts.push(`CONTEXT/NOTES: ${item.notes}`);
  }

  return parts.join('\n');
}
