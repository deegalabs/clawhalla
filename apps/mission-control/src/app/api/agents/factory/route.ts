import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { parse, stringify } from 'yaml';
import { db } from '@/lib/db';
import { agents as agentsTable, activities } from '@/lib/schema';
import { eq } from 'drizzle-orm';

const OPENCLAW_CONFIG = join(process.env.HOME || '/home/clawdbot', '.openclaw/openclaw.json');
const AGENTS_DIR = join(process.env.HOME || '/home/clawdbot', '.openclaw/agents');
const WORKSPACE = process.env.WORKSPACE_PATH || join(process.env.HOME || '/home/clawdbot', '.openclaw/workspace');
const ORG_FILE = join(WORKSPACE, 'company/org_structure.yaml');
const PERSONAS_DIR = join(WORKSPACE, 'personas');

// GET /api/agents/factory — list available persona templates
export async function GET() {
  try {
    const { readdir } = await import('fs/promises');
    const templates: { id: string; name: string; tier: string; path: string }[] = [];

    for (const tier of ['executive', 'management', 'execution']) {
      const dir = join(PERSONAS_DIR, tier);
      try {
        const files = await readdir(dir);
        for (const f of files) {
          if (f.endsWith('.md')) {
            templates.push({
              id: f.replace('.md', ''),
              name: f.replace('.md', '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
              tier,
              path: join(tier, f),
            });
          }
        }
      } catch {
        continue;
      }
    }

    return NextResponse.json({ ok: true, templates });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list templates';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

interface CreateAgentRequest {
  id: string;
  name: string;
  role: string;
  model: string;
  tier: number;
  squad: string | null;
  reportsTo: string;
  emoji: string;
  skills: string[];
  persona?: string; // persona template id
  description?: string;
}

// POST /api/agents/factory — create a new agent
export async function POST(req: Request) {
  try {
    const body: CreateAgentRequest = await req.json();
    const { id, name, role, model, tier, squad, reportsTo, emoji, skills, persona, description } = body;

    // Validate required fields
    if (!id || !name || !role || !model) {
      return NextResponse.json({ ok: false, error: 'id, name, role, and model are required' }, { status: 400 });
    }

    // Validate id format
    if (!/^[a-z][a-z0-9_-]*$/.test(id)) {
      return NextResponse.json({ ok: false, error: 'id must be lowercase alphanumeric (a-z, 0-9, _, -)' }, { status: 400 });
    }

    // 1. Create agent directory
    const agentDir = join(AGENTS_DIR, id, 'agent');
    await mkdir(agentDir, { recursive: true });

    // 2. Create AGENTS.md
    const agentsContent = generateAgentsMd({ id, name, role, model, tier, squad, reportsTo, emoji, skills, description });
    await writeFile(join(agentDir, 'AGENTS.md'), agentsContent);

    // 3. Copy auth profiles from main agent
    try {
      const mainAuth = await readFile(join(AGENTS_DIR, 'main/agent/auth-profiles.json'), 'utf-8');
      await writeFile(join(agentDir, 'auth-profiles.json'), mainAuth);
    } catch {
      // No auth profiles to copy
    }

    // 4. Add to openclaw.json
    const configRaw = await readFile(OPENCLAW_CONFIG, 'utf-8');
    const config = JSON.parse(configRaw);

    // Check if agent already exists
    const existing = config.agents.list.findIndex((a: { id: string }) => a.id === id);
    if (existing >= 0) {
      return NextResponse.json({ ok: false, error: `Agent "${id}" already exists in config` }, { status: 409 });
    }

    config.agents.list.push({
      id,
      name,
      workspace: WORKSPACE,
      agentDir,
      model: `anthropic/${model}`,
      skills: skills.length > 0 ? skills : ['clawban'],
    });

    await writeFile(OPENCLAW_CONFIG, JSON.stringify(config, null, 2));

    // 5. Register in database
    const now = new Date();
    await db.insert(agentsTable).values({
      id,
      name,
      role,
      tier,
      squad: squad || null,
      model,
      status: 'idle',
      emoji,
      reportsTo: reportsTo || null,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: agentsTable.id,
      set: { name, role, tier, squad: squad || null, model, emoji, reportsTo: reportsTo || null, updatedAt: now },
    });

    // Log activity
    db.insert(activities).values({
      id: `act_${Date.now().toString(36)}_fac`,
      agentId: id,
      action: 'agent_created',
      target: name,
      details: `Role: ${role}, Model: ${model}, Squad: ${squad || 'none'}`,
      timestamp: now,
    }).run();

    // 6. Add to org_structure.yaml
    try {
      const orgRaw = await readFile(ORG_FILE, 'utf-8');
      const orgData = parse(orgRaw);

      orgData.org.agents[id] = {
        id,
        tier,
        role: role.toLowerCase().replace(/\s+/g, '_'),
        model,
        manages: [],
        reports_to: reportsTo,
        squad: squad || null,
        skills: skills,
      };

      // Add to squad members if squad specified
      if (squad && orgData.org.squads[squad]) {
        if (!orgData.org.squads[squad].members.includes(id)) {
          orgData.org.squads[squad].members.push(id);
        }
      }

      await writeFile(ORG_FILE, stringify(orgData, { lineWidth: 120 }));
    } catch {
      // Org structure update failed — non-fatal
    }

    return NextResponse.json({
      ok: true,
      agent: { id, name, role, model, tier, squad, reportsTo, emoji, skills },
      files: [
        `${agentDir}/AGENTS.md`,
        `${agentDir}/auth-profiles.json`,
        OPENCLAW_CONFIG,
        ORG_FILE,
      ],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create agent';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

// PATCH /api/agents/factory — update an existing agent
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ ok: false, error: 'id is required' }, { status: 400 });
    }

    const now = new Date();

    // 1. Update in database
    const dbUpdates: Record<string, unknown> = { updatedAt: now };
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.role !== undefined) dbUpdates.role = updates.role;
    if (updates.model !== undefined) dbUpdates.model = updates.model;
    if (updates.tier !== undefined) dbUpdates.tier = updates.tier;
    if (updates.squad !== undefined) dbUpdates.squad = updates.squad || null;
    if (updates.emoji !== undefined) dbUpdates.emoji = updates.emoji;
    if (updates.reportsTo !== undefined) dbUpdates.reportsTo = updates.reportsTo || null;

    db.update(agentsTable).set(dbUpdates).where(eq(agentsTable.id, id)).run();

    // 2. Update openclaw.json
    try {
      const configRaw = await readFile(OPENCLAW_CONFIG, 'utf-8');
      const config = JSON.parse(configRaw);
      const agentIdx = config.agents.list.findIndex((a: { id: string }) => a.id === id);
      if (agentIdx >= 0) {
        if (updates.name) config.agents.list[agentIdx].name = updates.name;
        if (updates.model) config.agents.list[agentIdx].model = `anthropic/${updates.model}`;
        if (updates.skills) config.agents.list[agentIdx].skills = updates.skills;
        await writeFile(OPENCLAW_CONFIG, JSON.stringify(config, null, 2));
      }
    } catch { /* config update non-fatal */ }

    // 3. Update org_structure.yaml
    try {
      const orgRaw = await readFile(ORG_FILE, 'utf-8');
      const orgData = parse(orgRaw);
      if (orgData.org.agents[id]) {
        if (updates.role) orgData.org.agents[id].role = updates.role.toLowerCase().replace(/\s+/g, '_');
        if (updates.model) orgData.org.agents[id].model = updates.model;
        if (updates.tier !== undefined) orgData.org.agents[id].tier = updates.tier;
        if (updates.squad !== undefined) orgData.org.agents[id].squad = updates.squad || null;
        if (updates.reportsTo !== undefined) orgData.org.agents[id].reports_to = updates.reportsTo;
        if (updates.skills) orgData.org.agents[id].skills = updates.skills;
        await writeFile(ORG_FILE, stringify(orgData, { lineWidth: 120 }));
      }
    } catch { /* org update non-fatal */ }

    // 4. Regenerate AGENTS.md if role/name changed
    if (updates.name || updates.role || updates.model) {
      try {
        const existing = db.select().from(agentsTable).where(eq(agentsTable.id, id)).get();
        if (existing) {
          const agentDir = join(AGENTS_DIR, id, 'agent');
          const agentsMd = generateAgentsMd({
            id,
            name: updates.name || existing.name,
            role: updates.role || existing.role,
            model: updates.model || existing.model,
            tier: updates.tier ?? existing.tier,
            squad: updates.squad !== undefined ? updates.squad : existing.squad,
            reportsTo: updates.reportsTo || existing.reportsTo || '',
            emoji: updates.emoji || existing.emoji || '🤖',
            skills: updates.skills || [],
          });
          await writeFile(join(agentDir, 'AGENTS.md'), agentsMd);
        }
      } catch { /* file update non-fatal */ }
    }

    // Log activity
    db.insert(activities).values({
      id: `act_${Date.now().toString(36)}_upd`,
      agentId: id,
      action: 'agent_updated',
      target: updates.name || id,
      details: `Updated: ${Object.keys(updates).join(', ')}`,
      timestamp: now,
    }).run();

    return NextResponse.json({ ok: true, id, updated: Object.keys(updates) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}

// DELETE /api/agents/factory — remove an agent
export async function DELETE(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get('id');

    if (!id) {
      return NextResponse.json({ ok: false, error: 'id query param required' }, { status: 400 });
    }

    // Don't allow deleting the chief (claw/main)
    if (id === 'claw' || id === 'main') {
      return NextResponse.json({ ok: false, error: 'Cannot delete the Chief Orchestrator' }, { status: 400 });
    }

    // 1. Remove from database
    db.delete(agentsTable).where(eq(agentsTable.id, id)).run();

    // 2. Remove from openclaw.json
    try {
      const configRaw = await readFile(OPENCLAW_CONFIG, 'utf-8');
      const config = JSON.parse(configRaw);
      config.agents.list = config.agents.list.filter((a: { id: string }) => a.id !== id);
      await writeFile(OPENCLAW_CONFIG, JSON.stringify(config, null, 2));
    } catch { /* config update non-fatal */ }

    // 3. Remove from org_structure.yaml
    try {
      const orgRaw = await readFile(ORG_FILE, 'utf-8');
      const orgData = parse(orgRaw);
      delete orgData.org.agents[id];
      // Remove from squad members
      for (const squad of Object.values(orgData.org.squads) as { members?: string[] }[]) {
        if (squad.members) {
          squad.members = squad.members.filter((m: string) => m !== id);
        }
      }
      await writeFile(ORG_FILE, stringify(orgData, { lineWidth: 120 }));
    } catch { /* org update non-fatal */ }

    // 4. Remove agent directory
    try {
      await rm(join(AGENTS_DIR, id), { recursive: true, force: true });
    } catch { /* dir removal non-fatal */ }

    // Log activity
    db.insert(activities).values({
      id: `act_${Date.now().toString(36)}_del`,
      agentId: 'main',
      action: 'agent_deleted',
      target: id,
      details: `Agent ${id} removed from system`,
      timestamp: new Date(),
    }).run();

    return NextResponse.json({ ok: true, id, action: 'deleted' });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}

function generateAgentsMd(agent: CreateAgentRequest): string {
  const tierLabel = ['Platform', 'Executive', 'Management', 'Execution'][agent.tier] || 'Execution';
  const manages = agent.tier <= 1 ? '\n- Manages: (to be assigned)' : '';

  return `# ${agent.name} — ${agent.role}

## Identity
- Name: ${agent.name}
- Emoji: ${agent.emoji}
- Tier: ${agent.tier} — ${tierLabel}
- Model: ${agent.model}
- Reports to: ${agent.reportsTo}${manages}
- Squad: ${agent.squad || 'none'}
- Skills: ${agent.skills.join(', ') || 'clawban'}

## Role
${agent.description || `You are ${agent.name}, the ${agent.role} of the ClawHalla organization.`}

## You DO:
- Execute tasks assigned by your manager
- Report progress and blockers promptly
- Update task status when starting and finishing
- Follow the organizational hierarchy

## You NEVER:
- Act outside your role without authorization
- Make decisions above your tier level
- Post or publish anything without Daniel's approval

## Communication
- Receive tasks from ${agent.reportsTo} via sessions_send
- Report back to ${agent.reportsTo} when done
- If blocked: report immediately with details

## Context Limits
- Alert at 40% — Hard stop at 75% — Max 3 retries

---

_Created: ${new Date().toISOString().split('T')[0]}. ${agent.name} awakens._
`;
}
