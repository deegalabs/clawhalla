import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

type Period = 'today' | 'week';

function getPeriodCutoff(period: Period): number {
  const now = new Date();
  if (period === 'week') {
    return Math.floor((now.getTime() - 7 * 86_400_000) / 1000);
  }
  // today: start of current day
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  return Math.floor(todayStart.getTime() / 1000);
}

interface AgentMetrics {
  tasksCompleted: number;
  totalRuns: number;
  avgDurationMs: number;
  successRate: number;
  totalActions: number;
}

// GET /api/agents/metrics?period=today|week
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const period = (searchParams.get('period') || 'today') as Period;

    if (period !== 'today' && period !== 'week') {
      return NextResponse.json(
        { ok: false, error: 'Invalid period. Use today or week.' },
        { status: 400 },
      );
    }

    const cutoff = getPeriodCutoff(period);
    const sqlite = (db as unknown as { $client: import('better-sqlite3').Database }).$client;

    // Ensure tables exist
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS activities (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        action TEXT NOT NULL,
        target TEXT,
        details TEXT,
        timestamp INTEGER NOT NULL
      );
    `);
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS task_runs (
        id TEXT PRIMARY KEY,
        card_id TEXT NOT NULL,
        board_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'running',
        prompt TEXT,
        result TEXT,
        error TEXT,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        estimated_cost_cents INTEGER NOT NULL DEFAULT 0,
        model TEXT,
        duration_ms INTEGER,
        triggered_by TEXT NOT NULL DEFAULT 'manual',
        started_at INTEGER NOT NULL,
        completed_at INTEGER
      );
    `);

    // 1. Tasks completed per agent (activities where action = 'task_completed')
    const completedRows = sqlite.prepare(`
      SELECT agent_id AS agentId, COUNT(*) AS tasksCompleted
      FROM activities
      WHERE action = 'task_completed' AND timestamp >= ?
      GROUP BY agent_id
    `).all(cutoff) as Array<{ agentId: string; tasksCompleted: number }>;

    // 2. Task runs: count, avg duration, success rate per agent
    const runRows = sqlite.prepare(`
      SELECT
        agent_id                              AS agentId,
        COUNT(*)                              AS totalRuns,
        COALESCE(AVG(duration_ms), 0)         AS avgDurationMs,
        COALESCE(
          ROUND(
            100.0 * SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) / COUNT(*),
            0
          ), 0
        )                                     AS successRate
      FROM task_runs
      WHERE started_at >= ?
      GROUP BY agent_id
    `).all(cutoff) as Array<{
      agentId: string;
      totalRuns: number;
      avgDurationMs: number;
      successRate: number;
    }>;

    // 3. Total actions per agent (all activities, not just task_completed)
    const actionRows = sqlite.prepare(`
      SELECT agent_id AS agentId, COUNT(*) AS totalActions
      FROM activities
      WHERE timestamp >= ?
      GROUP BY agent_id
    `).all(cutoff) as Array<{ agentId: string; totalActions: number }>;

    // Merge all data by agentId
    const agents: Record<string, AgentMetrics> = {};

    const ensure = (id: string) => {
      if (!agents[id]) {
        agents[id] = {
          tasksCompleted: 0,
          totalRuns: 0,
          avgDurationMs: 0,
          successRate: 0,
          totalActions: 0,
        };
      }
    };

    for (const r of completedRows) {
      ensure(r.agentId);
      agents[r.agentId].tasksCompleted = r.tasksCompleted;
    }

    for (const r of runRows) {
      ensure(r.agentId);
      agents[r.agentId].totalRuns = r.totalRuns;
      agents[r.agentId].avgDurationMs = Math.round(r.avgDurationMs);
      agents[r.agentId].successRate = Math.round(r.successRate);
    }

    for (const r of actionRows) {
      ensure(r.agentId);
      agents[r.agentId].totalActions = r.totalActions;
    }

    return NextResponse.json({
      ok: true,
      period,
      agents,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Agent metrics query failed';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
