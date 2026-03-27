import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { agents, activities, boards } from '@/lib/schema';
import { getSetting } from '@/lib/settings';

// Squad agent definitions
const SQUAD_AGENTS: Record<string, { name: string; role: string; emoji: string; tier: number; model: string }[]> = {
  personal: [
    { name: 'Claw', role: 'Chief Orchestrator', emoji: '🦞', tier: 0, model: 'claude-opus-4-6' },
    { name: 'Frigg', role: 'Personal Assistant', emoji: '👑', tier: 2, model: 'claude-haiku-4-5' },
    { name: 'Mimir', role: 'Research Agent', emoji: '🧠', tier: 3, model: 'claude-sonnet-4-6' },
  ],
  hackathon: [
    { name: 'Claw', role: 'Chief Orchestrator', emoji: '🦞', tier: 0, model: 'claude-opus-4-6' },
    { name: 'Thor', role: 'Tech Lead', emoji: '⚡', tier: 2, model: 'claude-sonnet-4-6' },
    { name: 'Tyr', role: 'Security Auditor', emoji: '⚖️', tier: 2, model: 'claude-sonnet-4-6' },
  ],
  social: [
    { name: 'Claw', role: 'Chief Orchestrator', emoji: '🦞', tier: 0, model: 'claude-opus-4-6' },
    { name: 'Bragi', role: 'Content Creator', emoji: '🎭', tier: 3, model: 'claude-sonnet-4-6' },
    { name: 'Saga', role: 'Community Manager', emoji: '🔮', tier: 1, model: 'claude-sonnet-4-6' },
  ],
  dev: [
    { name: 'Claw', role: 'Chief Orchestrator', emoji: '🦞', tier: 0, model: 'claude-opus-4-6' },
    { name: 'Vidar', role: 'Architect', emoji: '⚔️', tier: 1, model: 'claude-sonnet-4-6' },
    { name: 'Thor', role: 'Tech Lead', emoji: '⚡', tier: 2, model: 'claude-sonnet-4-6' },
    { name: 'Freya', role: 'Senior Developer', emoji: '✨', tier: 3, model: 'claude-sonnet-4-6' },
    { name: 'Tyr', role: 'Security Auditor', emoji: '⚖️', tier: 2, model: 'claude-sonnet-4-6' },
  ],
  support: [
    { name: 'Claw', role: 'Chief Orchestrator', emoji: '🦞', tier: 0, model: 'claude-opus-4-6' },
    { name: 'Heimdall', role: 'QA / Observer', emoji: '👁️', tier: 3, model: 'claude-haiku-4-5' },
    { name: 'Freya', role: 'Support Engineer', emoji: '✨', tier: 3, model: 'claude-sonnet-4-6' },
    { name: 'Odin', role: 'Escalation Manager', emoji: '👁️', tier: 1, model: 'claude-sonnet-4-6' },
  ],
};

// Default board columns for each squad type
const SQUAD_BOARDS: Record<string, { name: string; columns: { id: string; name: string; color: string }[] }> = {
  personal: {
    name: 'Personal Tasks',
    columns: [
      { id: 'todo', name: 'To Do', color: '#3b82f6' },
      { id: 'doing', name: 'Doing', color: '#f59e0b' },
      { id: 'done', name: 'Done', color: '#22c55e' },
    ],
  },
  hackathon: {
    name: 'Hackathon Sprint',
    columns: [
      { id: 'backlog', name: 'Backlog', color: '#6b7280' },
      { id: 'doing', name: 'Doing', color: '#3b82f6' },
      { id: 'testing', name: 'Testing', color: '#f59e0b' },
      { id: 'done', name: 'Done', color: '#22c55e' },
    ],
  },
  social: {
    name: 'Content Pipeline',
    columns: [
      { id: 'ideas', name: 'Ideas', color: '#6b7280' },
      { id: 'researching', name: 'Researching', color: '#3b82f6' },
      { id: 'writing', name: 'Writing', color: '#f59e0b' },
      { id: 'review', name: 'Review', color: '#a855f7' },
      { id: 'published', name: 'Published', color: '#22c55e' },
    ],
  },
  dev: {
    name: 'Dev Sprint',
    columns: [
      { id: 'backlog', name: 'Sprint Backlog', color: '#6b7280' },
      { id: 'doing', name: 'Doing', color: '#3b82f6' },
      { id: 'review', name: 'Code Review', color: '#a855f7' },
      { id: 'testing', name: 'Testing', color: '#f59e0b' },
      { id: 'deployed', name: 'Deployed', color: '#22c55e' },
    ],
  },
  support: {
    name: 'Support Queue',
    columns: [
      { id: 'reported', name: 'Reported', color: '#ef4444' },
      { id: 'triaged', name: 'Triaged', color: '#f59e0b' },
      { id: 'fixing', name: 'Fixing', color: '#3b82f6' },
      { id: 'resolved', name: 'Resolved', color: '#22c55e' },
    ],
  },
};

function nanoid(prefix = 'agent') {
  return `${prefix}_${Math.random().toString(36).substring(2, 8)}${Date.now().toString(36)}`;
}

// POST /api/squads/create — create agents + default board for a squad
export async function POST(req: NextRequest) {
  try {
    const { squadId, customizations = {} } = await req.json();

    if (!squadId || !SQUAD_AGENTS[squadId]) {
      return NextResponse.json({ ok: false, error: 'Invalid squad ID' }, { status: 400 });
    }

    const squadAgents = SQUAD_AGENTS[squadId];
    const now = new Date();
    const createdAgents: { name: string; role: string; emoji: string }[] = [];

    // 1. Register agents in DB
    for (const agent of squadAgents) {
      const agentId = agent.name.toLowerCase();
      const custom = customizations[agent.name] || {};

      await db.insert(agents).values({
        id: agentId,
        name: agent.name,
        role: agent.role,
        tier: agent.tier,
        squad: squadId,
        model: agent.model,
        status: 'idle',
        emoji: agent.emoji,
        reportsTo: agent.tier === 0 ? null : 'claw',
        createdAt: now,
        updatedAt: now,
      }).onConflictDoUpdate({
        target: agents.id,
        set: {
          squad: squadId,
          status: 'idle',
          updatedAt: now,
        },
      });

      createdAgents.push({ name: agent.name, role: agent.role, emoji: agent.emoji });

      // Log activity
      await db.insert(activities).values({
        id: nanoid('act'),
        agentId: agentId,
        action: 'agent_created',
        target: agent.name,
        details: `Squad: ${squadId}, Role: ${agent.role}${custom.language ? `, Lang: ${custom.language}` : ''}`,
        timestamp: now,
      });
    }

    // 2. Create default board for the squad
    const boardDef = SQUAD_BOARDS[squadId];
    if (boardDef) {
      await db.insert(boards).values({
        id: `board_${squadId}`,
        name: boardDef.name,
        description: `Default board for ${squadId} squad`,
        type: squadId === 'dev' || squadId === 'hackathon' ? 'sprint' : 'kanban',
        columns: JSON.stringify(boardDef.columns),
        owner: 'claw',
        squad: squadId,
        settings: null,
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
      }).onConflictDoUpdate({
        target: boards.id,
        set: { updatedAt: now },
      });
    }

    return NextResponse.json({
      ok: true,
      squadId,
      agents: createdAgents,
      boardId: `board_${squadId}`,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
