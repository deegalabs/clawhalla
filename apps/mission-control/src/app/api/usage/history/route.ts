import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

type Period = 'day' | 'week' | 'month';

const PERIOD_CONFIG: Record<Period, { strftime: string; offsetDays: number }> = {
  day:   { strftime: '%Y-%m-%d', offsetDays: 7 },
  week:  { strftime: '%Y-%W',   offsetDays: 28 },
  month: { strftime: '%Y-%m',   offsetDays: 180 },
};

// GET /api/usage/history?period=day|week|month
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const period = (searchParams.get('period') || 'day') as Period;

    if (!PERIOD_CONFIG[period]) {
      return NextResponse.json(
        { ok: false, error: 'Invalid period. Use day, week, or month.' },
        { status: 400 },
      );
    }

    const { strftime, offsetDays } = PERIOD_CONFIG[period];

    // timestamp column is stored as Unix seconds (integer, mode: 'timestamp')
    const cutoff = Math.floor((Date.now() - offsetDays * 86_400_000) / 1000);

    const sqlite = (db as unknown as { $client: import('better-sqlite3').Database }).$client;

    // Ensure table exists (matches usage/route.ts pattern)
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS cost_events (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        model TEXT NOT NULL,
        action TEXT NOT NULL,
        input_tokens INTEGER DEFAULT 0,
        output_tokens INTEGER DEFAULT 0,
        estimated_cost_cents INTEGER DEFAULT 0,
        task_id TEXT,
        timestamp INTEGER NOT NULL
      );
    `);

    const rows = sqlite.prepare(`
      SELECT
        strftime(?, timestamp, 'unixepoch') AS date,
        agent_id                            AS agentId,
        COALESCE(SUM(estimated_cost_cents), 0) AS totalCostCents,
        COALESCE(SUM(input_tokens), 0)         AS inputTokens,
        COALESCE(SUM(output_tokens), 0)        AS outputTokens,
        COUNT(*)                               AS count
      FROM cost_events
      WHERE timestamp >= ?
      GROUP BY date, agent_id
      ORDER BY date ASC, agent_id ASC
    `).all(strftime, cutoff) as Array<{
      date: string;
      agentId: string;
      totalCostCents: number;
      inputTokens: number;
      outputTokens: number;
      count: number;
    }>;

    return NextResponse.json({
      ok: true,
      period,
      data: rows,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Usage history query failed';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
