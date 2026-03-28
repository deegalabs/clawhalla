import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { costEvents } from '@/lib/schema';
import { desc } from 'drizzle-orm';

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://127.0.0.1:18789';
const GATEWAY_TOKEN = process.env.GATEWAY_TOKEN || '';

// Per-MTok pricing (USD) — Anthropic public pricing as of 2025
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-opus-4-6': { input: 15, output: 75 },
  'claude-opus-4-5': { input: 15, output: 75 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-sonnet-4-5': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 0.25, output: 1.25 },
};

// Normalize model name to match pricing keys
function normalizeModel(model: string): string {
  if (!model) return 'claude-sonnet-4-6';
  // Strip provider prefix (e.g. "anthropic/claude-opus-4-6" → "claude-opus-4-6")
  const name = model.includes('/') ? model.split('/').pop()! : model;
  return name;
}

function getPricing(model: string): { input: number; output: number } {
  const normalized = normalizeModel(model);
  return MODEL_PRICING[normalized] || MODEL_PRICING['claude-sonnet-4-6'];
}

// Fetch live session data from OpenClaw gateway
async function fetchGatewaySessions(): Promise<GatewaySession[] | null> {
  try {
    const res = await fetch(`${GATEWAY_URL}/tools/invoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GATEWAY_TOKEN}`,
      },
      body: JSON.stringify({ tool: 'sessions_list', args: { messageLimit: 0 } }),
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json();
    if (!data.ok) return null;
    const text = data.result?.content?.[0]?.text;
    if (!text) return null;
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : parsed.sessions || null;
  } catch {
    return null;
  }
}

interface GatewaySession {
  sessionId?: string;
  agentId?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  messageCount?: number;
  createdAt?: string;
  updatedAt?: string;
  // Some gateways use different field names
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  agent_id?: string;
}

// GET /api/usage — cost summary from DB + gateway sessions
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

    // Fetch DB events and gateway sessions in parallel
    const [allEvents, gatewaySessions] = await Promise.all([
      db.select().from(costEvents).orderBy(desc(costEvents.timestamp)),
      fetchGatewaySessions(),
    ]);

    // Today's costs from DB
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

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
      const model = normalizeModel(e.model);
      if (!byModel[model]) byModel[model] = { input: 0, output: 0, cost: 0 };
      byModel[model].input += e.inputTokens;
      byModel[model].output += e.outputTokens;
      byModel[model].cost += e.estimatedCost;
    }

    // Enrich with gateway session data (live token counts)
    let gatewayUsage: {
      totalSessions: number;
      totalInputTokens: number;
      totalOutputTokens: number;
      estimatedCostUsd: string;
      byModel: Record<string, { input: number; output: number; cost: number; sessions: number }>;
      byAgent: Record<string, { input: number; output: number; cost: number; sessions: number }>;
    } | null = null;

    if (gatewaySessions && Array.isArray(gatewaySessions)) {
      const gwByModel: Record<string, { input: number; output: number; cost: number; sessions: number }> = {};
      const gwByAgent: Record<string, { input: number; output: number; cost: number; sessions: number }> = {};
      let gwInputTotal = 0;
      let gwOutputTotal = 0;

      for (const s of gatewaySessions) {
        const input = s.inputTokens || s.input_tokens || 0;
        const output = s.outputTokens || s.output_tokens || 0;
        const model = normalizeModel(s.model || '');
        const agent = s.agentId || s.agent_id || 'unknown';
        const pricing = getPricing(model);

        gwInputTotal += input;
        gwOutputTotal += output;

        const costUsd = (input * pricing.input + output * pricing.output) / 1_000_000;

        if (!gwByModel[model]) gwByModel[model] = { input: 0, output: 0, cost: 0, sessions: 0 };
        gwByModel[model].input += input;
        gwByModel[model].output += output;
        gwByModel[model].cost += costUsd;
        gwByModel[model].sessions++;

        if (!gwByAgent[agent]) gwByAgent[agent] = { input: 0, output: 0, cost: 0, sessions: 0 };
        gwByAgent[agent].input += input;
        gwByAgent[agent].output += output;
        gwByAgent[agent].cost += costUsd;
        gwByAgent[agent].sessions++;
      }

      const totalCostUsd = Object.values(gwByModel).reduce((s, m) => s + m.cost, 0);

      gatewayUsage = {
        totalSessions: gatewaySessions.length,
        totalInputTokens: gwInputTotal,
        totalOutputTokens: gwOutputTotal,
        estimatedCostUsd: totalCostUsd.toFixed(4),
        byModel: gwByModel,
        byAgent: gwByAgent,
      };
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
      gateway: gatewayUsage,
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

    const pricing = getPricing(model);
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
      model: normalizeModel(model),
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
