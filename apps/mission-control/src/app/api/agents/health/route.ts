import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { agents as agentsTable } from '@/lib/schema';
import { getSetting } from '@/lib/settings';

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
  name: string;
  role: string;
  emoji: string;
  squad: string | null;
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
  return { state: 'idle', idleMinutes: mins };
}

// GET /api/agents/health — health status of all agents (DB + gateway sessions)
export async function GET() {
  try {
    let gatewayOk = false;
    let sessions: SessionInfo[] = [];

    // 1. Query gateway for active sessions
    const gatewayUrl = getSetting('gateway_url', process.env.GATEWAY_URL || 'http://127.0.0.1:18789');
    const gatewayToken = getSetting('gateway_token', process.env.GATEWAY_TOKEN || '');
    try {
      const res = await fetch(`${gatewayUrl}/tools/invoke`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${gatewayToken}`,
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

    // 2. Get all registered agents from DB
    const dbAgents = await db.select().from(agentsTable);

    // 3. Build session map (latest session per agent)
    const sessionMap = new Map<string, { lastActivityMs: number; model: string; count: number }>();

    for (const s of sessions) {
      const rawId = s.agentId || s.key || s.id || '';
      const id = rawId.replace(/^agent:/, '').split(':')[0];
      if (!id) continue;

      const lastMs = s.lastActivityMs || s.lastActivity || 0;
      const existing = sessionMap.get(id);

      if (!existing || lastMs > existing.lastActivityMs) {
        sessionMap.set(id, {
          lastActivityMs: lastMs,
          model: s.model || existing?.model || 'unknown',
          count: (existing?.count || 0) + 1,
        });
      } else {
        existing.count++;
      }
    }

    // 4. Merge DB agents with session data
    const agents: AgentHealth[] = [];
    const stateCount: Record<HealthState, number> = { active: 0, idle: 0, stalled: 0, stuck: 0, offline: 0 };
    const seenIds = new Set<string>();

    // First: all DB-registered agents
    for (const dbAgent of dbAgents) {
      const session = sessionMap.get(dbAgent.id);
      const { state, idleMinutes } = session
        ? getHealthState(session.lastActivityMs, gatewayOk)
        : { state: (gatewayOk ? 'idle' : 'offline') as HealthState, idleMinutes: null };

      stateCount[state]++;
      seenIds.add(dbAgent.id);

      agents.push({
        id: dbAgent.id,
        name: dbAgent.name,
        role: dbAgent.role,
        emoji: dbAgent.emoji || '🤖',
        squad: dbAgent.squad,
        state,
        lastActivityMs: session?.lastActivityMs || null,
        idleMinutes,
        model: session?.model || dbAgent.model,
        sessionCount: session?.count || 0,
      });
    }

    // Second: any gateway sessions for agents not in DB (legacy/unknown)
    for (const [id, data] of sessionMap) {
      if (seenIds.has(id)) continue;
      const { state, idleMinutes } = getHealthState(data.lastActivityMs, gatewayOk);
      stateCount[state]++;

      agents.push({
        id,
        name: id.charAt(0).toUpperCase() + id.slice(1),
        role: 'Unknown',
        emoji: '🤖',
        squad: null,
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
