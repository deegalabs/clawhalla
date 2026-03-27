// Shared agent constants — single source of truth for emojis, colors, and metadata

export const AGENT_EMOJIS: Record<string, string> = {
  main: '🦞', claw: '🦞', odin: '👁️', vidar: '⚔️', saga: '🔮',
  thor: '⚡', frigg: '👑', tyr: '⚖️', freya: '✨', heimdall: '👁️‍🗨️',
  volund: '🔧', sindri: '🔥', skadi: '❄️', mimir: '🧠', bragi: '🎭', loki: '🦊',
};

export function agentEmoji(id: string): string {
  return AGENT_EMOJIS[id] || '🤖';
}

export const AGENT_ROSTER = [
  { id: 'main', name: 'Claw', emoji: '🦞', role: 'System Controller', color: 'bg-red-500/10' },
  { id: 'odin', name: 'Odin', emoji: '👁️', role: 'CTO', color: 'bg-blue-500/10' },
  { id: 'vidar', name: 'Vidar', emoji: '⚔️', role: 'Backend Lead', color: 'bg-green-500/10' },
  { id: 'saga', name: 'Saga', emoji: '🔮', role: 'Community Manager', color: 'bg-purple-500/10' },
  { id: 'thor', name: 'Thor', emoji: '⚡', role: 'Tech Lead', color: 'bg-amber-500/10' },
  { id: 'frigg', name: 'Frigg', emoji: '👑', role: 'Personal Assistant', color: 'bg-pink-500/10' },
  { id: 'tyr', name: 'Tyr', emoji: '⚖️', role: 'Security Auditor', color: 'bg-orange-500/10' },
  { id: 'freya', name: 'Freya', emoji: '✨', role: 'Frontend Lead', color: 'bg-cyan-500/10' },
  { id: 'heimdall', name: 'Heimdall', emoji: '👁️‍🗨️', role: 'DevOps', color: 'bg-indigo-500/10' },
  { id: 'mimir', name: 'Mimir', emoji: '🧠', role: 'Research', color: 'bg-teal-500/10' },
  { id: 'bragi', name: 'Bragi', emoji: '🎭', role: 'Content Creator', color: 'bg-fuchsia-500/10' },
  { id: 'loki', name: 'Loki', emoji: '🦊', role: 'Analytics', color: 'bg-yellow-500/10' },
  { id: 'volund', name: 'Volund', emoji: '🔧', role: 'Toolsmith', color: 'bg-slate-500/10' },
  { id: 'sindri', name: 'Sindri', emoji: '🔥', role: 'Builder', color: 'bg-rose-500/10' },
  { id: 'skadi', name: 'Skadi', emoji: '❄️', role: 'QA', color: 'bg-sky-500/10' },
] as const;

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
