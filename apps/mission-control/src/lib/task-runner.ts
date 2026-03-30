/**
 * Task Runner — AI-AGIL autonomous task execution engine.
 *
 * Scans kanban boards for cards in "doing" columns, dispatches them
 * to assigned agents, and moves completed work to "review".
 */
import { spawn } from 'child_process';
import { db } from '@/lib/db';
import { cards, cardHistory, cardComments, taskRuns, costEvents, activities, agents as agentsTable } from '@/lib/schema';
import { eq, and, isNull, inArray } from 'drizzle-orm';
import { broadcastBoardEvent } from '@/lib/events';
import { notify } from '@/lib/notify';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TaskRunnerConfig {
  maxConcurrentPerAgent: number;
  timeoutMs: number;
  triggeredBy: 'manual' | 'cron';
  cardId?: string; // target a specific card
}

export interface TaskRunResult {
  scanned: number;
  skipped: number;
  dispatched: number;
  results: Array<{
    cardId: string;
    agentId: string;
    status: 'done' | 'failed' | 'timeout';
    durationMs: number;
    summary?: string;
  }>;
}

const DOING_COLUMNS = ['doing', 'in_progress', 'in-progress', 'writing', 'researching', 'building'];
const DEFAULTS: TaskRunnerConfig = {
  maxConcurrentPerAgent: 1,
  timeoutMs: 180_000,
  triggeredBy: 'manual',
};

// ---------------------------------------------------------------------------
// Text extraction (shared with chat route)
// ---------------------------------------------------------------------------

function extractText(raw: string): { text: string; meta?: { inputTokens?: number; outputTokens?: number; model?: string; durationMs?: number } } | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed.status === 'error' || parsed.error) {
      return { text: `Error: ${parsed.error?.message || parsed.error || 'Unknown error'}` };
    }

    let text = '';
    const meta: Record<string, unknown> = {};

    // OpenClaw agent format: result.meta.agentMeta.usage
    const agentMeta = parsed.result?.meta?.agentMeta;
    if (agentMeta?.usage) {
      meta.inputTokens = (agentMeta.usage.input || 0) + (agentMeta.usage.cacheRead || 0);
      meta.outputTokens = agentMeta.usage.output || 0;
      meta.model = agentMeta.model;
      meta.durationMs = parsed.result?.meta?.durationMs;
    }

    if (parsed.result?.payloads) {
      text = parsed.result.payloads.map((p: { text?: string }) => p.text || '').filter(Boolean).join('\n\n');
    } else if (parsed.result?.content?.[0]?.text) {
      text = parsed.result.content[0].text;
    } else if (parsed.result?.text) {
      text = parsed.result.text;
    } else if (typeof parsed.result === 'string') {
      text = parsed.result;
    } else if (parsed.response) {
      text = typeof parsed.response === 'string' ? parsed.response : JSON.stringify(parsed.response);
    }

    if (text) return { text, meta: Object.keys(meta).length > 0 ? meta as { inputTokens?: number; outputTokens?: number; model?: string; durationMs?: number } : undefined };
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Agent execution
// ---------------------------------------------------------------------------

function runAgent(agentId: string, prompt: string, timeoutMs: number): Promise<{ output: string; ok: boolean; duration: number; meta?: { inputTokens?: number; outputTokens?: number; model?: string } }> {
  const resolvedId = agentId === 'claw' ? 'main' : agentId;
  const start = Date.now();

  return new Promise((resolve) => {
    const proc = spawn('openclaw', [
      'agent', '--agent', resolvedId, '--json', '-m', prompt,
    ], { timeout: timeoutMs });

    let output = '';
    let errOutput = '';

    proc.stdout?.on('data', (chunk: Buffer) => { output += chunk.toString(); });
    proc.stderr?.on('data', (chunk: Buffer) => { errOutput += chunk.toString(); });

    proc.on('close', (code) => {
      const extracted = extractText(output);
      const response = extracted?.text || output.trim() || '';
      resolve({
        output: response || errOutput || `Process exited with code ${code}`,
        ok: code === 0 && !!response && !response.startsWith('Error:'),
        duration: Date.now() - start,
        meta: extracted?.meta,
      });
    });

    proc.on('error', (err) => {
      resolve({ output: `Agent error: ${String(err).slice(0, 500)}`, ok: false, duration: Date.now() - start });
    });
  });
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

function buildTaskPrompt(card: typeof cards.$inferSelect, agentRow: typeof agentsTable.$inferSelect | undefined): string {
  const parts: string[] = [];

  if (agentRow) {
    parts.push(`You are ${agentRow.name} (${agentRow.role}).`);
    if (agentRow.squad) parts.push(`Squad: ${agentRow.squad}`);
  }

  parts.push(`\n## Task: ${card.title}`);
  if (card.priority) parts.push(`Priority: ${card.priority}`);
  if (card.description) parts.push(`\nDescription:\n${card.description}`);

  if (card.checklist) {
    try {
      const items = JSON.parse(card.checklist) as { text: string; done: boolean }[];
      if (items.length > 0) {
        parts.push('\nChecklist:');
        items.forEach(item => parts.push(`- [${item.done ? 'x' : ' '}] ${item.text}`));
      }
    } catch { /* invalid JSON */ }
  }

  if (card.labels) {
    try {
      const labels = JSON.parse(card.labels) as string[];
      if (labels.length > 0) parts.push(`Labels: ${labels.join(', ')}`);
    } catch { /* invalid JSON */ }
  }

  // Load recent comments for context
  const comments = db.select().from(cardComments)
    .where(eq(cardComments.cardId, card.id))
    .limit(5).all();
  if (comments.length > 0) {
    parts.push('\n## Previous Activity:');
    comments.forEach(c => parts.push(`[${c.author}]: ${c.content.slice(0, 300)}`));
  }

  parts.push('\n## Instructions:');
  parts.push('Execute this task based on the description and checklist above.');
  parts.push('Report what you accomplished in detail.');
  parts.push('If you cannot complete it fully, explain what was done and what remains.');
  parts.push('Your response will be posted as a comment and the card moved to review.');

  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// Core scanner
// ---------------------------------------------------------------------------

export async function runTaskScanner(opts: Partial<TaskRunnerConfig> = {}): Promise<TaskRunResult> {
  const config = { ...DEFAULTS, ...opts };
  const now = new Date();
  const result: TaskRunResult = { scanned: 0, skipped: 0, dispatched: 0, results: [] };

  // 1. Clean up stale locks (running for > 2x timeout)
  const staleThreshold = new Date(now.getTime() - config.timeoutMs * 2);
  const staleRuns = db.select().from(taskRuns)
    .where(and(eq(taskRuns.status, 'running'), isNull(taskRuns.completedAt)))
    .all()
    .filter(r => r.startedAt < staleThreshold);

  for (const stale of staleRuns) {
    db.update(taskRuns).set({
      status: 'timeout',
      error: 'Stale lock cleaned up — exceeded 2x timeout',
      completedAt: now,
    }).where(eq(taskRuns.id, stale.id)).run();
  }

  // 2. Find eligible cards
  let eligibleCards;
  if (config.cardId) {
    const card = db.select().from(cards).where(eq(cards.id, config.cardId)).get();
    eligibleCards = card && card.assignee && !card.archivedAt ? [card] : [];
  } else {
    eligibleCards = db.select().from(cards)
      .where(and(
        isNull(cards.archivedAt),
        // Cards must have an assignee
      ))
      .all()
      .filter(c => c.assignee && DOING_COLUMNS.includes(c.column));
  }

  result.scanned = eligibleCards.length;

  // 3. Filter out cards with active runs
  const activeRunCardIds = new Set(
    db.select({ cardId: taskRuns.cardId }).from(taskRuns)
      .where(eq(taskRuns.status, 'running'))
      .all()
      .map(r => r.cardId)
  );

  // 4. Filter by agent capacity
  const activeRunsByAgent = new Map<string, number>();
  db.select({ agentId: taskRuns.agentId }).from(taskRuns)
    .where(eq(taskRuns.status, 'running'))
    .all()
    .forEach(r => activeRunsByAgent.set(r.agentId, (activeRunsByAgent.get(r.agentId) || 0) + 1));

  // 5. Sort by priority
  const priorityOrder: Record<string, number> = { critical: 0, urgent: 1, high: 2, medium: 3, low: 4 };
  const sorted = eligibleCards
    .filter(c => !activeRunCardIds.has(c.id))
    .filter(c => (activeRunsByAgent.get(c.assignee!) || 0) < config.maxConcurrentPerAgent)
    .sort((a, b) => (priorityOrder[a.priority || 'medium'] || 3) - (priorityOrder[b.priority || 'medium'] || 3));

  result.skipped = result.scanned - sorted.length;

  // 6. Execute (max 5 per sweep to avoid long runs)
  const toProcess = sorted.slice(0, 5);

  for (const card of toProcess) {
    const agentId = card.assignee!;
    const runId = `run_${crypto.randomUUID()}`;

    // Get agent info
    const agentRow = db.select().from(agentsTable).where(eq(agentsTable.id, agentId)).get();

    // Build prompt
    const prompt = buildTaskPrompt(card, agentRow);

    // Insert run record (the lock)
    db.insert(taskRuns).values({
      id: runId,
      cardId: card.id,
      boardId: card.boardId,
      agentId,
      status: 'running',
      prompt: prompt.slice(0, 5000),
      triggeredBy: config.triggeredBy,
      startedAt: now,
    }).run();

    result.dispatched++;

    // Execute agent
    const agentResult = await runAgent(agentId, prompt, config.timeoutMs);
    const completedAt = new Date();

    const inputTokens = agentResult.meta?.inputTokens || 0;
    const outputTokens = agentResult.meta?.outputTokens || 0;
    const model = agentResult.meta?.model || 'claude-sonnet-4-6';
    const isOpus = model.includes('opus');
    const costCents = Math.round(
      (inputTokens / 1_000_000 * (isOpus ? 1500 : 300)) +
      (outputTokens / 1_000_000 * (isOpus ? 7500 : 1500))
    );

    if (agentResult.ok) {
      // Success — update run, move card to review, add comment
      db.update(taskRuns).set({
        status: 'done',
        result: agentResult.output.slice(0, 10000),
        inputTokens,
        outputTokens,
        estimatedCostCents: costCents,
        model,
        durationMs: agentResult.duration,
        completedAt,
      }).where(eq(taskRuns.id, runId)).run();

      // Move card to review
      db.update(cards).set({
        column: 'review',
        updatedAt: completedAt,
      }).where(eq(cards.id, card.id)).run();

      // Add history
      db.insert(cardHistory).values({
        id: `hist_${crypto.randomUUID()}`,
        cardId: card.id,
        action: 'moved',
        by: agentId,
        fromValue: card.column,
        toValue: 'review',
        timestamp: completedAt,
      }).run();

      // Add comment with result
      db.insert(cardComments).values({
        id: `cmt_${crypto.randomUUID()}`,
        cardId: card.id,
        author: agentId,
        content: `**Task completed by ${agentRow?.name || agentId}** (${Math.round(agentResult.duration / 1000)}s)\n\n${agentResult.output.slice(0, 5000)}`,
        createdAt: completedAt,
      }).run();

      // Log activity
      db.insert(activities).values({
        id: `act_${Date.now().toString(36)}_task`,
        agentId,
        action: 'task_completed',
        target: card.title.slice(0, 80),
        details: `${agentResult.output.length} chars, ${agentResult.duration}ms`,
        timestamp: completedAt,
      }).run();

      // Log cost
      if (inputTokens || outputTokens) {
        db.insert(costEvents).values({
          id: `cost_${Date.now().toString(36)}_${agentId}`,
          agentId,
          model,
          action: 'task',
          inputTokens,
          outputTokens,
          estimatedCost: costCents,
          timestamp: completedAt,
        }).run();
      }

      // Broadcast + notify
      broadcastBoardEvent({
        type: 'card.moved',
        boardId: card.boardId,
        cardId: card.id,
        by: agentId,
        data: { from: card.column, to: 'review', title: card.title },
      });

      notify({
        type: 'task',
        title: 'Task Completed',
        body: `${agentRow?.emoji || ''} ${agentRow?.name || agentId} completed "${card.title}"`,
        icon: '✅',
        href: '/tasks',
        agentId,
        priority: 'normal',
      });

      result.results.push({
        cardId: card.id,
        agentId,
        status: 'done',
        durationMs: agentResult.duration,
        summary: agentResult.output.slice(0, 200),
      });
    } else {
      // Failure — update run, leave card in doing, add comment
      db.update(taskRuns).set({
        status: 'failed',
        error: agentResult.output.slice(0, 5000),
        inputTokens,
        outputTokens,
        estimatedCostCents: costCents,
        model,
        durationMs: agentResult.duration,
        completedAt,
      }).where(eq(taskRuns.id, runId)).run();

      // Add failure comment
      db.insert(cardComments).values({
        id: `cmt_${crypto.randomUUID()}`,
        cardId: card.id,
        author: agentId,
        content: `**Task failed** (${Math.round(agentResult.duration / 1000)}s)\n\n${agentResult.output.slice(0, 2000)}`,
        createdAt: completedAt,
      }).run();

      // Notify
      notify({
        type: 'task',
        title: 'Task Failed',
        body: `${agentRow?.emoji || ''} ${agentRow?.name || agentId} failed on "${card.title}"`,
        icon: '⚠️',
        href: '/tasks',
        agentId,
        priority: 'high',
        sound: true,
      });

      result.results.push({
        cardId: card.id,
        agentId,
        status: 'failed',
        durationMs: agentResult.duration,
        summary: agentResult.output.slice(0, 200),
      });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

export function getActiveRuns() {
  return db.select().from(taskRuns)
    .where(eq(taskRuns.status, 'running'))
    .all();
}

export function getRecentRuns(limit = 20) {
  return db.select().from(taskRuns)
    .orderBy(taskRuns.startedAt)
    .limit(limit)
    .all();
}
