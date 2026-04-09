/**
 * Single source of truth for all squad definitions in ClawHalla.
 *
 * Imported by: onboarding, squad creation API, layout nav, squads page.
 * If you add/change a squad or agent, do it HERE — nowhere else.
 */

/* ------------------------------------------------------------------ */
/*  Agent definition                                                   */
/* ------------------------------------------------------------------ */

export interface SquadAgent {
  name: string;
  role: string;
  emoji: string;
  tier: number;   // 1 = squad lead, 2 = execution
  model: string;
}

/* ------------------------------------------------------------------ */
/*  Squad definition                                                   */
/* ------------------------------------------------------------------ */

export interface SquadDefinition {
  id: string;
  name: string;
  emoji: string;
  description: string;
  tier: 'free' | 'pro';
  /** Nav modules this squad unlocks (beyond universal set) */
  modules: string[];
  /** First agent is always the squad lead (tier 1) */
  agents: SquadAgent[];
}

/* ------------------------------------------------------------------ */
/*  Squad registry                                                     */
/* ------------------------------------------------------------------ */

export const SQUADS: SquadDefinition[] = [
  {
    id: 'personal',
    name: 'Personal',
    emoji: '🧘',
    description: 'Personal assistant, research, and memory management',
    tier: 'free',
    modules: [],
    agents: [
      { name: 'Frigg', role: 'Personal Assistant', emoji: '👑', tier: 1, model: 'claude-sonnet-4-6' },
      { name: 'Mimir', role: 'Research Agent',     emoji: '🧠', tier: 2, model: 'claude-sonnet-4-6' },
    ],
  },
  {
    id: 'hackathon',
    name: 'Hackathon',
    emoji: '⚡',
    description: 'Full builder squad — product, code, security, QA and pitch',
    tier: 'free',
    modules: ['/projects', '/pipeline'],
    agents: [
      { name: 'Thor',     role: 'Tech Lead',         emoji: '⚡',  tier: 1, model: 'claude-sonnet-4-6' },
      { name: 'Odin',     role: 'Product Lead',      emoji: '👁️', tier: 2, model: 'claude-sonnet-4-6' },
      { name: 'Freya',    role: 'Senior Developer',  emoji: '✨',  tier: 2, model: 'claude-sonnet-4-6' },
      { name: 'Tyr',      role: 'Security Auditor',  emoji: '⚖️', tier: 2, model: 'claude-sonnet-4-6' },
      { name: 'Heimdall', role: 'QA / Observer',     emoji: '👁️', tier: 2, model: 'claude-haiku-4-5' },
      { name: 'Bragi',    role: 'Pitch & Demo',      emoji: '🎭', tier: 2, model: 'claude-sonnet-4-6' },
    ],
  },
  {
    id: 'social',
    name: 'Social',
    emoji: '📣',
    description: 'Content creation, community, and brand presence',
    tier: 'free',
    modules: ['/content'],
    agents: [
      { name: 'Saga',  role: 'Community Manager', emoji: '🔮', tier: 1, model: 'claude-sonnet-4-6' },
      { name: 'Bragi', role: 'Content Creator',   emoji: '🎭', tier: 2, model: 'claude-sonnet-4-6' },
    ],
  },
  {
    id: 'dev',
    name: 'Dev',
    emoji: '🛠️',
    description: 'Full development squad with code, QA, and DevOps',
    tier: 'pro',
    modules: ['/projects', '/pipeline', '/council'],
    agents: [
      { name: 'Vidar', role: 'Architect',         emoji: '⚔️', tier: 1, model: 'claude-sonnet-4-6' },
      { name: 'Thor',  role: 'Tech Lead',          emoji: '⚡', tier: 2, model: 'claude-sonnet-4-6' },
      { name: 'Freya', role: 'Senior Developer',   emoji: '✨', tier: 2, model: 'claude-sonnet-4-6' },
      { name: 'Tyr',   role: 'Security Auditor',   emoji: '⚖️', tier: 2, model: 'claude-sonnet-4-6' },
    ],
  },
  {
    id: 'support',
    name: 'Support',
    emoji: '🛡️',
    description: 'Customer support, monitoring, and issue resolution',
    tier: 'pro',
    modules: [],
    agents: [
      { name: 'Odin',     role: 'Escalation Manager', emoji: '👁️', tier: 1, model: 'claude-sonnet-4-6' },
      { name: 'Heimdall', role: 'QA / Observer',      emoji: '👁️', tier: 2, model: 'claude-haiku-4-5' },
      { name: 'Freya',    role: 'Support Engineer',   emoji: '✨', tier: 2, model: 'claude-sonnet-4-6' },
    ],
  },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Map: squadId → SquadDefinition */
export const SQUADS_BY_ID: Record<string, SquadDefinition> =
  Object.fromEntries(SQUADS.map(s => [s.id, s]));

/** Get squad agents by squadId (used by create route) */
export function getSquadAgents(squadId: string): SquadAgent[] {
  return SQUADS_BY_ID[squadId]?.agents ?? [];
}

/** Get squad lead for a given squadId */
export function getSquadLead(squadId: string): SquadAgent | undefined {
  return SQUADS_BY_ID[squadId]?.agents.find(a => a.tier === 1);
}

/** Get modules unlocked by a squad */
export function getSquadModules(squadId: string): string[] {
  return SQUADS_BY_ID[squadId]?.modules ?? [];
}

/** Nav-safe universal hrefs (always visible regardless of squad) */
export const UNIVERSAL_NAV_HREFS = new Set([
  '/dashboard', '/tasks', '/calendar', '/chat', '/approvals',
  '/memory', '/docs',
  '/squads', '/office', '/logs', '/terminal', '/feedback', '/settings',
  // '/campaigns' — available as squad module for future Sales/Marketing squads
]);
