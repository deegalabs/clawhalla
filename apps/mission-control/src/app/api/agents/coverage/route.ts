import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { parse } from 'yaml';

const WORKSPACE = process.env.WORKSPACE_PATH || join(process.env.HOME || '/home/clawdbot', '.openclaw/workspace');
const ORG_FILE = join(WORKSPACE, 'company/org_structure.yaml');

interface OrgAgent {
  id: string;
  tier: number;
  role: string;
  model: string;
  manages?: string[];
  reports_to?: string;
  squad: string | null;
  skills?: string[];
}

// GET /api/agents/coverage?agent=freya — find agents that can cover for a given agent
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const targetId = url.searchParams.get('agent');

    if (!targetId) {
      return NextResponse.json({ ok: false, error: 'agent parameter required' }, { status: 400 });
    }

    const raw = await readFile(ORG_FILE, 'utf-8');
    const data = parse(raw);
    const agents: Record<string, OrgAgent> = data.org.agents;

    const target = agents[targetId];
    if (!target) {
      return NextResponse.json({ ok: false, error: `Agent "${targetId}" not found` }, { status: 404 });
    }

    const targetSkills = new Set(target.skills || []);
    const candidates: {
      id: string;
      role: string;
      squad: string | null;
      tier: number;
      sharedSkills: string[];
      coverageScore: number;
      sameSquad: boolean;
      sameTier: boolean;
    }[] = [];

    for (const [name, agent] of Object.entries(agents)) {
      if (name === targetId) continue;
      if (!agent.skills?.length) continue;

      const agentSkills = new Set(agent.skills);
      const shared = [...targetSkills].filter(s => agentSkills.has(s));

      if (shared.length === 0) continue;

      const coverageScore = targetSkills.size > 0
        ? Math.round((shared.length / targetSkills.size) * 100)
        : 0;

      candidates.push({
        id: name,
        role: agent.role,
        squad: agent.squad,
        tier: agent.tier,
        sharedSkills: shared,
        coverageScore,
        sameSquad: agent.squad === target.squad,
        sameTier: agent.tier === target.tier,
      });
    }

    // Sort by coverage score desc, same squad first
    candidates.sort((a, b) => {
      if (a.sameSquad !== b.sameSquad) return a.sameSquad ? -1 : 1;
      return b.coverageScore - a.coverageScore;
    });

    return NextResponse.json({
      ok: true,
      target: {
        id: targetId,
        role: target.role,
        squad: target.squad,
        skills: target.skills || [],
      },
      candidates,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Coverage check failed';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
