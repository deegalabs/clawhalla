import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { parse } from 'yaml';
import { join } from 'path';

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
  note?: string;
}

interface OrgSquad {
  chief: string;
  lead: string | null;
  members: string[];
  domain: string;
}

interface OrgStructure {
  org: {
    name: string;
    owner: string;
    owner_role: string;
    tiers: Record<number, string>;
    agents: Record<string, OrgAgent>;
    squads: Record<string, OrgSquad>;
    escalation_chain: Record<string, unknown>;
  };
}

const AGENT_EMOJIS: Record<string, string> = {
  claw: '🦞', main: '🦞',
  odin: '👁️', vidar: '⚔️', saga: '🔮',
  thor: '⚡', frigg: '👑', tyr: '⚖️',
  freya: '✨', heimdall: '👁️‍🗨️', volund: '🔧',
  sindri: '🔥', skadi: '❄️',
  mimir: '🧠', bragi: '🎭', loki: '🦊',
};

const ROLE_LABELS: Record<string, string> = {
  system_controller: 'System Controller',
  cto: 'CTO',
  blockchain_architect: 'Blockchain Architect',
  tech_lead: 'Tech Lead',
  coordinator: 'Coordinator / PA',
  research_lead: 'Research Lead (CPO)',
  security_auditor: 'Security Auditor',
  senior_dev: 'Senior Developer',
  qa_observer: 'QA / Observability',
  dev_github: 'Developer / GitHub',
  solidity_dev: 'Solidity Developer',
  cairo_dev: 'Cairo Developer',
  knowledge_curator: 'Knowledge Curator',
  content_creator: 'Content Creator',
  monitor: 'Monitor / Analytics',
};

export async function GET() {
  try {
    const raw = await readFile(ORG_FILE, 'utf-8');
    const data = parse(raw) as OrgStructure;
    const { org } = data;

    const agents = Object.entries(org.agents).map(([name, agent]) => ({
      id: agent.id || name,
      name: name.charAt(0).toUpperCase() + name.slice(1),
      emoji: AGENT_EMOJIS[name] || AGENT_EMOJIS[agent.id] || '🤖',
      role: ROLE_LABELS[agent.role] || agent.role.replace(/_/g, ' '),
      model: agent.model,
      tier: agent.tier,
      squad: agent.squad,
      manages: agent.manages || [],
      reportsTo: agent.reports_to
        ? (agent.reports_to.charAt(0).toUpperCase() + agent.reports_to.slice(1))
        : 'Daniel (CEO)',
      skills: agent.skills || [],
      note: agent.note || null,
    }));

    const squads = Object.entries(org.squads).map(([id, squad]) => ({
      id,
      name: id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      chief: squad.chief.charAt(0).toUpperCase() + squad.chief.slice(1),
      lead: squad.lead,
      members: squad.members,
      domain: squad.domain,
    }));

    return NextResponse.json({
      ok: true,
      org: {
        name: org.name,
        owner: org.owner,
        tiers: org.tiers,
        agents,
        squads,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to read org structure';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
