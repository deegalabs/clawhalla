import { NextResponse } from 'next/server';

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://127.0.0.1:18789';
const GATEWAY_TOKEN = process.env.GATEWAY_TOKEN || '';

interface SessionInfo {
  agentId?: string;
  key?: string;
  id?: string;
  lastActivityMs?: number;
  lastActivity?: number;
  model?: string;
}

type HealthState = 'active' | 'idle' | 'stalled' | 'stuck' | 'offline';

interface AgentHealth {
  id: string;
  state: HealthState;
  lastActivityMs: number | null;
  idleMinutes: number | null;
  model: string | null;
  sessionCount: number;
}

function getHealthState(lastActivityMs: number | null, gatewayOk: boolean): { state: HealthState; idleMinutes: number | null } {
  if (!gatewayOk) return { state: 'offline', idleMinutes: null };
  if (!lastActivityMs) return { state: 'idle', idleMinutes: null };

  const diffMs = Date.now() - lastActivityMs;
  const mins = Math.floor(diffMs / 60000);

  if (mins < 2) return { state: 'active', idleMinutes: mins };
  if (mins < 5) return { state: 'idle', idleMinutes: mins };
  if (mins < 15) return { state: 'stalled', idleMinutes: mins };
  if (mins < 30) return { state: 'stuck', idleMinutes: mins };
  return { state: 'idle', idleMinutes: mins }; // >30min = just idle, not zombie in our context
}

// GET /api/agents/health — health status of all agents
export async function GET() {
  try {
    let gatewayOk = false;
    let sessions: SessionInfo[] = [];

    try {
      const res = await fetch(`${GATEWAY_URL}/tools/invoke`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GATEWAY_TOKEN}`,
        },
        body: JSON.stringify({ tool: 'sessions_list', args: { messageLimit: 0 } }),
        cache: 'no-store',
      });
      const data = await res.json();
      if (data.ok) {
        gatewayOk = true;
        const parsed = JSON.parse(data.result.content[0].text);
        sessions = parsed.sessions || parsed || [];
      }
    } catch {
      // Gateway down
    }

    // Aggregate by agent (latest session wins)
    const agentMap = new Map<string, { lastActivityMs: number; model: string; count: number }>();

    for (const s of sessions) {
      const rawId = s.agentId || s.key || s.id || '';
      const id = rawId.replace(/^agent:/, '').split(':')[0];
      if (!id) continue;

      const lastMs = s.lastActivityMs || s.lastActivity || 0;
      const existing = agentMap.get(id);

      if (!existing || lastMs > existing.lastActivityMs) {
        agentMap.set(id, {
          lastActivityMs: lastMs,
          model: s.model || existing?.model || 'unknown',
          count: (existing?.count || 0) + 1,
        });
      } else {
        existing.count++;
      }
    }

    const agents: AgentHealth[] = [];
    const stateCount: Record<HealthState, number> = { active: 0, idle: 0, stalled: 0, stuck: 0, offline: 0 };

    for (const [id, data] of agentMap) {
      const { state, idleMinutes } = getHealthState(data.lastActivityMs, gatewayOk);
      stateCount[state]++;
      agents.push({
        id,
        state,
        lastActivityMs: data.lastActivityMs || null,
        idleMinutes,
        model: data.model,
        sessionCount: data.count,
      });
    }

    agents.sort((a, b) => {
      const order: Record<HealthState, number> = { active: 0, stalled: 1, stuck: 2, idle: 3, offline: 4 };
      return order[a.state] - order[b.state];
    });

    return NextResponse.json({
      ok: true,
      gatewayOk,
      agents,
      summary: stateCount,
      totalSessions: sessions.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Health check failed';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
