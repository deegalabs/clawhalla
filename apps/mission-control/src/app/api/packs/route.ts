import { NextResponse } from 'next/server';
import { readFile, writeFile, mkdir, readdir } from 'fs/promises';
import { join } from 'path';
import { parse, stringify } from 'yaml';

const OPENCLAW_CONFIG = join(process.env.HOME || '/home/clawdbot', '.openclaw/openclaw.json');
const AGENTS_DIR = join(process.env.HOME || '/home/clawdbot', '.openclaw/agents');
const WORKSPACE = process.env.WORKSPACE_PATH || join(process.env.HOME || '/home/clawdbot', '.openclaw/workspace');
const ORG_FILE = join(WORKSPACE, 'company/org_structure.yaml');
const PACKS_DIR = join(WORKSPACE, 'packs');

interface PackAgent {
  id: string;
  name: string;
  emoji: string;
  role: string;
  model: string;
  tier: number;
  reportsTo: string;
  skills: string[];
  description: string;
}

interface PackDefinition {
  name: string;
  version: string;
  description: string;
  author: string;
  squad: {
    id: string;
    name: string;
    domain: string;
    chief: string;
  };
  agents: PackAgent[];
}

// GET /api/packs — list available packs
export async function GET() {
  try {
    await mkdir(PACKS_DIR, { recursive: true });
    const files = await readdir(PACKS_DIR);
    const packs: (PackDefinition & { file: string })[] = [];

    for (const f of files) {
      if (f.endsWith('.json')) {
        try {
          const raw = await readFile(join(PACKS_DIR, f), 'utf-8');
          const pack = JSON.parse(raw) as PackDefinition;
          packs.push({ ...pack, file: f });
        } catch {
          continue;
        }
      }
    }

    return NextResponse.json({ ok: true, packs });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list packs';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

// POST /api/packs — install a pack (creates all agents + squad)
export async function POST(req: Request) {
  try {
    const pack: PackDefinition = await req.json();

    if (!pack.name || !pack.squad || !pack.agents?.length) {
      return NextResponse.json({ ok: false, error: 'Pack must have name, squad, and agents' }, { status: 400 });
    }

    const results: { agent: string; status: 'created' | 'skipped' | 'error'; error?: string }[] = [];

    // Read configs
    const configRaw = await readFile(OPENCLAW_CONFIG, 'utf-8');
    const config = JSON.parse(configRaw);
    const existingIds = new Set(config.agents.list.map((a: { id: string }) => a.id));

    const orgRaw = await readFile(ORG_FILE, 'utf-8');
    const orgData = parse(orgRaw);

    for (const agent of pack.agents) {
      try {
        // Skip if exists
        if (existingIds.has(agent.id)) {
          results.push({ agent: agent.id, status: 'skipped' });
          continue;
        }

        // Create agent directory
        const agentDir = join(AGENTS_DIR, agent.id, 'agent');
        await mkdir(agentDir, { recursive: true });

        // Create AGENTS.md
        const tierLabel = ['Platform', 'Executive', 'Management', 'Execution'][agent.tier] || 'Execution';
        const agentsMd = `# ${agent.name} — ${agent.role}

## Identity
- Name: ${agent.name}
- Emoji: ${agent.emoji}
- Tier: ${agent.tier} — ${tierLabel}
- Model: ${agent.model}
- Reports to: ${agent.reportsTo}
- Squad: ${pack.squad.id}
- Skills: ${agent.skills.join(', ')}

## Role
${agent.description}

## You DO:
- Execute tasks assigned by your manager
- Report progress and blockers promptly
- Update task status when starting and finishing

## You NEVER:
- Act outside your role without authorization
- Post or publish anything without Daniel's approval

## Communication
- Receive tasks from ${agent.reportsTo} via sessions_send
- Report back when done
- If blocked: report immediately

## Context Limits
- Alert at 40% — Hard stop at 75% — Max 3 retries

---

_Installed from pack: ${pack.name} v${pack.version}_
`;
        await writeFile(join(agentDir, 'AGENTS.md'), agentsMd);

        // Copy auth profiles
        try {
          const mainAuth = await readFile(join(AGENTS_DIR, 'main/agent/auth-profiles.json'), 'utf-8');
          await writeFile(join(agentDir, 'auth-profiles.json'), mainAuth);
        } catch { /* no auth to copy */ }

        // Add to openclaw.json
        config.agents.list.push({
          id: agent.id,
          name: agent.name,
          workspace: WORKSPACE,
          agentDir,
          model: `anthropic/${agent.model}`,
          skills: agent.skills.length > 0 ? agent.skills : ['clawban'],
        });
        existingIds.add(agent.id);

        // Add to org_structure
        orgData.org.agents[agent.id] = {
          id: agent.id,
          tier: agent.tier,
          role: agent.role.toLowerCase().replace(/\s+/g, '_'),
          model: agent.model,
          manages: [],
          reports_to: agent.reportsTo,
          squad: pack.squad.id,
          skills: agent.skills,
        };

        results.push({ agent: agent.id, status: 'created' });
      } catch (e) {
        results.push({ agent: agent.id, status: 'error', error: e instanceof Error ? e.message : 'Unknown' });
      }
    }

    // Add squad if not exists
    if (!orgData.org.squads[pack.squad.id]) {
      orgData.org.squads[pack.squad.id] = {
        chief: pack.squad.chief,
        lead: null,
        members: pack.agents.filter(a => a.id !== pack.squad.chief).map(a => a.id),
        domain: pack.squad.domain,
      };
    }

    // Save configs
    await writeFile(OPENCLAW_CONFIG, JSON.stringify(config, null, 2));
    await writeFile(ORG_FILE, stringify(orgData, { lineWidth: 120 }));

    // Save pack definition for reference
    await mkdir(PACKS_DIR, { recursive: true });
    await writeFile(
      join(PACKS_DIR, `${pack.squad.id}.json`),
      JSON.stringify(pack, null, 2)
    );

    const created = results.filter(r => r.status === 'created').length;
    const skipped = results.filter(r => r.status === 'skipped').length;

    return NextResponse.json({
      ok: true,
      pack: pack.name,
      created,
      skipped,
      results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Pack installation failed';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
