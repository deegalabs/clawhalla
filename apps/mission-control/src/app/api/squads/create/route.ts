import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { agents, activities, boards, cards } from '@/lib/schema';
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

// Sample cards for each squad type — helps users understand the board on first run
const SAMPLE_CARDS: Record<string, { title: string; description: string; column: string; assignee?: string; priority?: string; labels?: string[] }[]> = {
  personal: [
    { title: 'Welcome to ClawHalla!', description: 'This is your personal task board. Drag cards between columns to track progress. Click a card to edit details, add checklists, or assign to an agent.', column: 'todo', labels: ['getting-started'] },
    { title: 'Configure your agents', description: 'Go to the Agents page to customize your squad. Each agent can be assigned tasks and will report results back here.', column: 'todo', priority: 'high', labels: ['setup'] },
    { title: 'Explore Mission Control', description: 'Check out the Dashboard, Chat, and Settings pages. Everything you need to manage your AI squad is here.', column: 'doing', assignee: 'claw', labels: ['getting-started'] },
  ],
  hackathon: [
    { title: 'Define project scope', description: 'Outline what you want to build. Break it down into stories and tasks for your agents.', column: 'backlog', priority: 'high', labels: ['planning'] },
    { title: 'Set up dev environment', description: 'Configure your local environment, repos, and CI/CD pipeline.', column: 'backlog', labels: ['setup'] },
    { title: 'Build MVP prototype', description: 'Focus on core functionality first. Ship fast, iterate later.', column: 'backlog', priority: 'high', labels: ['dev'] },
  ],
  social: [
    { title: 'Write launch announcement', description: 'Draft a post announcing your ClawHalla setup. Share what you are building with AI agents.', column: 'ideas', labels: ['content'] },
    { title: 'Create content calendar', description: 'Plan your content pipeline. Use this board to track ideas from brainstorm to publication.', column: 'ideas', priority: 'medium', labels: ['planning'] },
    { title: 'Research trending topics', description: 'Use Mimir or your research agent to find trending topics in your niche.', column: 'researching', assignee: 'bragi', labels: ['research'] },
  ],
  dev: [
    { title: 'Set up project architecture', description: 'Define the tech stack, folder structure, and coding standards for the project.', column: 'backlog', priority: 'high', labels: ['architecture'] },
    { title: 'Create CI/CD pipeline', description: 'Set up automated testing and deployment. Thor can help with infrastructure.', column: 'backlog', assignee: 'thor', labels: ['devops'] },
    { title: 'Security audit checklist', description: 'Review OWASP top 10, dependency vulnerabilities, and access controls.', column: 'backlog', assignee: 'tyr', labels: ['security'] },
  ],
  support: [
    { title: 'Set up monitoring alerts', description: 'Configure Heimdall to watch for errors and performance issues.', column: 'reported', assignee: 'heimdall', priority: 'high', labels: ['monitoring'] },
    { title: 'Create support runbook', description: 'Document common issues and their resolutions for the support queue.', column: 'reported', labels: ['docs'] },
    { title: 'Define escalation workflow', description: 'Set up rules for when issues should be escalated from L1 to L2 support.', column: 'triaged', assignee: 'odin', labels: ['process'] },
  ],
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

    // 3. Add sample cards to help users get started
    const boardId = `board_${squadId}`;
    const sampleCards = SAMPLE_CARDS[squadId] || SAMPLE_CARDS.personal;
    for (let i = 0; i < sampleCards.length; i++) {
      const card = sampleCards[i];
      await db.insert(cards).values({
        id: nanoid('card'),
        boardId,
        title: card.title,
        description: card.description,
        column: card.column,
        position: i,
        assignee: card.assignee || null,
        labels: card.labels ? JSON.stringify(card.labels) : null,
        priority: card.priority || 'medium',
        dueDate: null,
        checklist: null,
        attachments: null,
        parentCardId: null,
        storyId: null,
        epicId: null,
        sprintId: null,
        progress: 0,
        createdBy: 'claw',
        createdAt: now,
        updatedAt: now,
        completedAt: null,
        archivedAt: null,
      }).onConflictDoNothing();
    }

    return NextResponse.json({
      ok: true,
      squadId,
      agents: createdAgents,
      boardId,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
