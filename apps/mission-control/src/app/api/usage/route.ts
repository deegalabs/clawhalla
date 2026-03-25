import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { costEvents } from '@/lib/schema';
import { desc, sql } from 'drizzle-orm';

const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-opus-4-6': { input: 15, output: 75 },
  'claude-opus-4-5': { input: 15, output: 75 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-sonnet-4-5': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 0.25, output: 1.25 },
};

// GET /api/usage — cost summary + session status
export async function GET() {
  try {
    // Ensure table exists
    const sqlite = (db as unknown as { $client: { exec: (sql: string) => void } }).$client;
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

    // Today's costs
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const allEvents = await db.select().from(costEvents).orderBy(desc(costEvents.timestamp));

    const todayEvents = allEvents.filter(e =>
      new Date(e.timestamp).getTime() >= todayStart.getTime()
    );

    const totalInputTokens = todayEvents.reduce((s, e) => s + e.inputTokens, 0);
    const totalOutputTokens = todayEvents.reduce((s, e) => s + e.outputTokens, 0);
    const totalCostCents = todayEvents.reduce((s, e) => s + e.estimatedCost, 0);

    // Per agent breakdown
    const byAgent: Record<string, { input: number; output: number; cost: number; count: number }> = {};
    for (const e of todayEvents) {
      if (!byAgent[e.agentId]) byAgent[e.agentId] = { input: 0, output: 0, cost: 0, count: 0 };
      byAgent[e.agentId].input += e.inputTokens;
      byAgent[e.agentId].output += e.outputTokens;
      byAgent[e.agentId].cost += e.estimatedCost;
      byAgent[e.agentId].count++;
    }

    // Per model breakdown
    const byModel: Record<string, { input: number; output: number; cost: number }> = {};
    for (const e of todayEvents) {
      if (!byModel[e.model]) byModel[e.model] = { input: 0, output: 0, cost: 0 };
      byModel[e.model].input += e.inputTokens;
      byModel[e.model].output += e.outputTokens;
      byModel[e.model].cost += e.estimatedCost;
    }

    return NextResponse.json({
      ok: true,
      today: {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        totalCostCents,
        totalCostUsd: (totalCostCents / 100).toFixed(2),
        events: todayEvents.length,
      },
      byAgent,
      byModel,
      pricing: MODEL_PRICING,
      recentEvents: allEvents.slice(0, 20),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Usage query failed';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

// POST /api/usage — log a cost event
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { agentId, model, action, inputTokens, outputTokens, taskId } = body;

    if (!agentId || !model || !action) {
      return NextResponse.json({ ok: false, error: 'agentId, model, action required' }, { status: 400 });
    }

    const pricing = MODEL_PRICING[model] || { input: 3, output: 15 }; // default to sonnet
    const costCents = Math.round(
      ((inputTokens || 0) * pricing.input / 1_000_000 +
       (outputTokens || 0) * pricing.output / 1_000_000) * 100
    );

    // Ensure table
    const sqlite = (db as unknown as { $client: { exec: (sql: string) => void } }).$client;
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS cost_events (
        id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, model TEXT NOT NULL,
        action TEXT NOT NULL, input_tokens INTEGER DEFAULT 0,
        output_tokens INTEGER DEFAULT 0, estimated_cost_cents INTEGER DEFAULT 0,
        task_id TEXT, timestamp INTEGER NOT NULL
      );
    `);

    const id = `cost_${Date.now().toString(36)}`;
    await db.insert(costEvents).values({
      id,
      agentId,
      model,
      action,
      inputTokens: inputTokens || 0,
      outputTokens: outputTokens || 0,
      estimatedCost: costCents,
      taskId: taskId || null,
      timestamp: new Date(),
    });

    return NextResponse.json({ ok: true, id, estimatedCostCents: costCents });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to log cost';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
