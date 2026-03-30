import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { activities, taskRuns, costEvents } from '@/lib/schema';
import { desc, eq, and, gte, lte, sql } from 'drizzle-orm';

/**
 * GET /api/logs — unified activity feed
 *
 * Query params:
 *   type:    activity | task | cost | all (default: all)
 *   agent:   filter by agent_id
 *   squad:   filter by squad (cross-references agents table)
 *   from:    ISO date (start of range)
 *   to:      ISO date (end of range)
 *   limit:   max results (default 50, max 200)
 *   offset:  pagination offset
 */
export async function GET(req: NextRequest) {
  try {
    const p = req.nextUrl.searchParams;
    const type = p.get('type') || 'all';
    const agent = p.get('agent');
    const from = p.get('from');
    const to = p.get('to');
    const limit = Math.min(parseInt(p.get('limit') || '50'), 200);
    const offset = parseInt(p.get('offset') || '0');

    const entries: Array<{
      id: string;
      type: 'activity' | 'task' | 'cost';
      agentId: string;
      action: string;
      title: string;
      details: string | null;
      status?: string;
      tokens?: { input: number; output: number };
      costCents?: number;
      durationMs?: number;
      timestamp: string;
    }> = [];

    // Activities
    if (type === 'all' || type === 'activity') {
      let actRows = db.select().from(activities)
        .orderBy(desc(activities.timestamp))
        .limit(limit)
        .offset(offset)
        .all();

      if (agent) actRows = actRows.filter(r => r.agentId === agent);
      if (from) actRows = actRows.filter(r => r.timestamp >= new Date(from));
      if (to) actRows = actRows.filter(r => r.timestamp <= new Date(to));

      for (const r of actRows) {
        // Clean up enriched prompts — show just the user message part
        let title = r.target || r.action;
        const userMsgIdx = title.indexOf('User message:');
        if (userMsgIdx >= 0) title = title.slice(userMsgIdx + 14).trim();
        entries.push({
          id: r.id,
          type: 'activity',
          agentId: r.agentId,
          action: r.action,
          title,
          details: r.details,
          timestamp: r.timestamp instanceof Date ? r.timestamp.toISOString() : new Date(r.timestamp as unknown as number).toISOString(),
        });
      }
    }

    // Task runs
    if (type === 'all' || type === 'task') {
      let taskRows = db.select().from(taskRuns)
        .orderBy(desc(taskRuns.startedAt))
        .limit(limit)
        .offset(offset)
        .all();

      if (agent) taskRows = taskRows.filter(r => r.agentId === agent);
      if (from) taskRows = taskRows.filter(r => r.startedAt >= new Date(from));
      if (to) taskRows = taskRows.filter(r => r.startedAt <= new Date(to));

      for (const r of taskRows) {
        entries.push({
          id: r.id,
          type: 'task',
          agentId: r.agentId,
          action: `task_${r.status}`,
          title: r.result?.slice(0, 120) || r.prompt?.slice(0, 120) || 'Task run',
          details: r.error || null,
          status: r.status,
          tokens: { input: r.inputTokens, output: r.outputTokens },
          costCents: r.estimatedCostCents,
          durationMs: r.durationMs ?? undefined,
          timestamp: r.startedAt instanceof Date ? r.startedAt.toISOString() : new Date(r.startedAt as unknown as number).toISOString(),
        });
      }
    }

    // Cost events
    if (type === 'all' || type === 'cost') {
      let costRows = db.select().from(costEvents)
        .orderBy(desc(costEvents.timestamp))
        .limit(limit)
        .offset(offset)
        .all();

      if (agent) costRows = costRows.filter(r => r.agentId === agent);
      if (from) costRows = costRows.filter(r => r.timestamp >= new Date(from));
      if (to) costRows = costRows.filter(r => r.timestamp <= new Date(to));

      for (const r of costRows) {
        entries.push({
          id: r.id,
          type: 'cost',
          agentId: r.agentId,
          action: r.action,
          title: `${r.model}: ${r.inputTokens} in / ${r.outputTokens} out`,
          details: null,
          tokens: { input: r.inputTokens, output: r.outputTokens },
          costCents: r.estimatedCost,
          timestamp: r.timestamp instanceof Date ? r.timestamp.toISOString() : new Date(r.timestamp as unknown as number).toISOString(),
        });
      }
    }

    // Sort combined by timestamp desc
    entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Aggregate stats
    const allCosts = db.select().from(costEvents).all();
    const stats = {
      totalCostCents: allCosts.reduce((sum, c) => sum + c.estimatedCost, 0),
      totalInputTokens: allCosts.reduce((sum, c) => sum + c.inputTokens, 0),
      totalOutputTokens: allCosts.reduce((sum, c) => sum + c.outputTokens, 0),
      totalTaskRuns: db.select({ count: sql<number>`count(*)` }).from(taskRuns).get()?.count || 0,
      totalActivities: db.select({ count: sql<number>`count(*)` }).from(activities).get()?.count || 0,
    };

    return NextResponse.json({
      ok: true,
      entries: entries.slice(0, limit),
      stats,
      hasMore: entries.length > limit,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
