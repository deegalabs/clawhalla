// Agent data — fetched from DB via /api/agents/health, with static fallbacks

export interface AgentInfo {
  id: string;
  name: string;
  emoji: string;
  role: string;
  model: string;
  tier: number;
  squad: string | null;
  status: string;
  color: string;
}

// Color assignment based on agent index (deterministic)
const AGENT_COLORS = [
  'bg-red-500/10', 'bg-blue-500/10', 'bg-green-500/10', 'bg-purple-500/10',
  'bg-amber-500/10', 'bg-pink-500/10', 'bg-orange-500/10', 'bg-cyan-500/10',
  'bg-indigo-500/10', 'bg-teal-500/10', 'bg-fuchsia-500/10', 'bg-yellow-500/10',
  'bg-slate-500/10', 'bg-rose-500/10', 'bg-sky-500/10', 'bg-emerald-500/10',
];

// Fallback static data — used only before first API fetch
const FALLBACK_EMOJIS: Record<string, string> = {
  main: '🦞', claw: '🦞', odin: '👁️', vidar: '⚔️', saga: '🔮',
  thor: '⚡', frigg: '👑', tyr: '⚖️', freya: '✨', heimdall: '👁️‍🗨️',
  volund: '🔧', sindri: '🔥', skadi: '❄️', mimir: '🧠', bragi: '🎭', loki: '🦊',
};

// --- Singleton cache (shared across components in same page load) ---
let _agentsCache: AgentInfo[] | null = null;
let _emojisCache: Record<string, string> = { ...FALLBACK_EMOJIS };
let _fetchPromise: Promise<AgentInfo[]> | null = null;

export async function fetchAgents(): Promise<AgentInfo[]> {
  if (_agentsCache) return _agentsCache;
  if (_fetchPromise) return _fetchPromise;

  _fetchPromise = fetch('/api/agents/health')
    .then(r => r.json())
    .then(data => {
      if (data.ok && data.agents) {
        const agents: AgentInfo[] = data.agents.map((a: Record<string, unknown>, i: number) => ({
          id: a.id as string,
          name: a.name as string || (a.id as string).charAt(0).toUpperCase() + (a.id as string).slice(1),
          emoji: a.emoji as string || '🤖',
          role: a.role as string || 'Agent',
          model: a.model as string || 'unknown',
          tier: typeof a.tier === 'number' ? a.tier : 3,
          squad: a.squad as string | null,
          status: a.state as string || 'idle',
          color: AGENT_COLORS[i % AGENT_COLORS.length],
        }));
        _agentsCache = agents;
        _emojisCache = { ...FALLBACK_EMOJIS };
        for (const a of agents) _emojisCache[a.id] = a.emoji;
        return agents;
      }
      return [];
    })
    .catch(() => [])
    .finally(() => { _fetchPromise = null; });

  return _fetchPromise;
}

// Force refresh (after creating/deleting agents)
export function invalidateAgentsCache() {
  _agentsCache = null;
  _emojisCache = { ...FALLBACK_EMOJIS };
}

// Sync accessors (use cached data, fallback to static)
export function agentEmoji(id: string): string {
  return _emojisCache[id] || '🤖';
}

export function getAgentInfo(id: string): AgentInfo | undefined {
  return _agentsCache?.find(a => a.id === id);
}

// Legacy exports for backward compatibility (sync, use cache)
export const AGENT_EMOJIS: Record<string, string> = new Proxy(FALLBACK_EMOJIS, {
  get(target, prop: string) {
    return _emojisCache[prop] || target[prop] || '🤖';
  },
});

// Derive AGENT_ROSTER dynamically from cache
export const AGENT_ROSTER: readonly AgentInfo[] = new Proxy([] as AgentInfo[], {
  get(target, prop) {
    const roster = _agentsCache || [];
    if (prop === 'length') return roster.length || 15; // fallback length
    if (prop === Symbol.iterator) return roster[Symbol.iterator].bind(roster);
    if (typeof prop === 'string' && !isNaN(Number(prop))) return roster[Number(prop)];
    if (prop === 'find') return roster.find.bind(roster);
    if (prop === 'filter') return roster.filter.bind(roster);
    if (prop === 'map') return roster.map.bind(roster);
    if (prop === 'some') return roster.some.bind(roster);
    if (prop === 'forEach') return roster.forEach.bind(roster);
    if (prop === 'slice') return roster.slice.bind(roster);
    return Reflect.get(target, prop);
  },
}) as unknown as readonly AgentInfo[];

export const HEALTH_DOTS: Record<string, string> = {
  active: 'bg-green-500',
  idle: 'bg-gray-500',
  stalled: 'bg-amber-500 animate-pulse',
  stuck: 'bg-red-500',
  offline: 'bg-gray-700',
};

export const PRIORITY_COLORS: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-400 border-red-500/20',
  high: 'bg-amber-500/20 text-amber-400 border-amber-500/20',
  medium: 'bg-blue-500/20 text-blue-400 border-blue-500/20',
  low: 'bg-gray-500/20 text-gray-400 border-gray-500/20',
};
