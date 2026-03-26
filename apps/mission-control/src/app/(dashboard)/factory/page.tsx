'use client';

import { useState, useEffect, useCallback } from 'react';
import { PageLoading } from '@/components/ui/loading';

interface AgentHealth {
  id: string;
  state: 'active' | 'idle' | 'stalled' | 'stuck' | 'offline';
  idleMinutes: number | null;
  model: string | null;
  sessionCount: number;
}

interface Task {
  id: string;
  title: string;
  status: string;
  assignedTo?: string;
  assigned_to?: string;
  priority: string;
  completedAt?: string;
  completed_at?: string;
  createdAt?: string;
  created_at?: string;
}

interface Activity {
  id: string;
  agentId: string;
  action: string;
  target: string | null;
  timestamp: string;
}

interface UsageData {
  today: { totalCostUsd: string; events: number; inputTokens: number; outputTokens: number };
  byAgent: Record<string, { input: number; output: number; cost: number; count: number }>;
}

const EMOJIS: Record<string, string> = {
  main: '🦞', claw: '🦞', odin: '👁️', vidar: '⚔️', saga: '🔮', thor: '⚡',
  frigg: '👑', tyr: '⚖️', freya: '✨', heimdall: '👁️‍🗨️', volund: '🔧',
  sindri: '🔥', skadi: '❄️', mimir: '🧠', bragi: '🎭', loki: '🦊',
};

const healthColors: Record<string, { dot: string; text: string; bg: string }> = {
  active: { dot: 'bg-green-500', text: 'text-green-400', bg: 'bg-green-500/5' },
  idle: { dot: 'bg-gray-500', text: 'text-gray-500', bg: '' },
  stalled: { dot: 'bg-amber-500 animate-pulse', text: 'text-amber-400', bg: 'bg-amber-500/5' },
  stuck: { dot: 'bg-red-500 animate-pulse', text: 'text-red-400', bg: 'bg-red-500/5' },
  offline: { dot: 'bg-gray-700', text: 'text-gray-600', bg: '' },
};

function timeAgo(d?: string): string {
  if (!d) return '';
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d`;
}

function fmtTokens(n: number): string {
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(1)}k`;
}

export default function FactoryPage() {
  const [agents, setAgents] = useState<AgentHealth[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [healthRes, boardRes, actRes, usageRes] = await Promise.all([
        fetch('/api/agents/health'),
        fetch('/api/board/sync?project=clawhalla'),
        fetch('/api/activities?limit=20'),
        fetch('/api/usage'),
      ]);
      const healthData = await healthRes.json();
      const boardData = await boardRes.json();
      const actData = await actRes.json();
      const usageData = await usageRes.json();

      if (healthData.ok) setAgents(healthData.agents);
      if (boardData.tasks) setTasks(boardData.tasks.map((t: Task) => ({ ...t, assignedTo: t.assignedTo || t.assigned_to, completedAt: t.completedAt || t.completed_at, createdAt: t.createdAt || t.created_at })));
      if (Array.isArray(actData)) setActivities(actData);
      if (usageData.ok) setUsage(usageData);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    const i = setInterval(fetchData, 8000); // Faster refresh for monitoring
    return () => clearInterval(i);
  }, [fetchData]);

  useEffect(() => {
    let es: EventSource | null = null;
    try { es = new EventSource('/api/sse'); es.onmessage = () => fetchData(); } catch {}
    return () => { if (es) es.close(); };
  }, [fetchData]);

  // Computed
  const activeAgents = agents.filter(a => a.state === 'active');
  const stalledAgents = agents.filter(a => a.state === 'stalled' || a.state === 'stuck');
  const idleAgents = agents.filter(a => a.state === 'idle' || a.state === 'offline');

  const inProgressTasks = tasks.filter(t => t.status === 'in_progress');
  const queueTasks = tasks.filter(t => t.status === 'backlog' && t.assignedTo);
  const completedToday = tasks.filter(t => t.status === 'done');

  // Avg session time for active agents
  const avgMinutes = activeAgents.length > 0
    ? Math.round(activeAgents.reduce((s, a) => s + (a.idleMinutes || 0), 0) / activeAgents.length)
    : 0;

  // Agent utilization (agents with cost data)
  const agentUsage = usage?.byAgent || {};

  if (loading) {
    return <PageLoading title="Loading factory..." />;
  }

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] gap-4">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 shrink-0">
        <div className="bg-[#111113] rounded-lg p-3 border border-[#1e1e21]">
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${activeAgents.length > 0 ? 'bg-green-500' : 'bg-gray-600'}`} />
            <div>
              <div className="text-[10px] text-gray-500 uppercase">Active</div>
              <div className="text-xl font-bold text-green-400">{activeAgents.length}</div>
            </div>
          </div>
          {stalledAgents.length > 0 && (
            <div className="text-[10px] text-amber-400 mt-1">⚠ {stalledAgents.length} need attention</div>
          )}
        </div>
        <div className="bg-[#111113] rounded-lg p-3 border border-[#1e1e21]">
          <div className="text-[10px] text-gray-500 uppercase">Avg Session</div>
          <div className="text-xl font-bold text-gray-300">{avgMinutes > 0 ? `${avgMinutes}m` : '—'}</div>
        </div>
        <div className="bg-[#111113] rounded-lg p-3 border border-[#1e1e21]">
          <div className="text-[10px] text-gray-500 uppercase">Completed</div>
          <div className="text-xl font-bold text-blue-400">{completedToday.length}</div>
        </div>
        <div className="bg-[#111113] rounded-lg p-3 border border-[#1e1e21]">
          <div className="text-[10px] text-gray-500 uppercase">Cost Today</div>
          <div className="text-xl font-bold text-amber-400">${usage?.today.totalCostUsd || '0.00'}</div>
          {usage && usage.today.events > 0 && (
            <div className="text-[10px] text-gray-600 mt-0.5">{fmtTokens(usage.today.inputTokens)} in / {fmtTokens(usage.today.outputTokens)} out</div>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex gap-4 flex-1 min-h-0">
        {/* Left: Sessions + Queue + Completed */}
        <div className="flex-1 flex flex-col gap-3 min-h-0">
          {/* Active Sessions */}
          <div className="bg-[#111113] rounded-lg border border-[#1e1e21] overflow-hidden shrink-0">
            <div className="px-4 py-2 border-b border-[#1e1e21] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                <span className="text-[10px] text-gray-400 uppercase tracking-wider">Active Now</span>
              </div>
              <span className="text-[10px] text-gray-600">8s refresh</span>
            </div>
            {activeAgents.length === 0 && stalledAgents.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-gray-700">No agents running</div>
            ) : (
              <div className="divide-y divide-[#1e1e21]">
                {[...activeAgents, ...stalledAgents].map(agent => {
                  const task = inProgressTasks.find(t => t.assignedTo === agent.id);
                  const h = healthColors[agent.state];
                  const cost = agentUsage[agent.id];
                  return (
                    <div key={agent.id} className={`px-4 py-3 flex items-center gap-3 ${h.bg}`}>
                      <span className="text-xl">{EMOJIS[agent.id] || '🤖'}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-200 capitalize">{agent.id}</span>
                          <span className={`w-2 h-2 rounded-full ${h.dot}`} />
                          <span className={`text-[10px] ${h.text} capitalize`}>{agent.state}</span>
                          {agent.idleMinutes !== null && agent.state !== 'idle' && (
                            <span className="text-[10px] text-gray-600">{agent.idleMinutes}m</span>
                          )}
                        </div>
                        {task && (
                          <div className="text-[11px] text-gray-400 truncate mt-0.5">{task.title}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {agent.model && <span className="text-[9px] text-gray-600">{agent.model.replace('claude-', '')}</span>}
                        {cost && <span className="text-[10px] text-amber-400/60">${(cost.cost / 100).toFixed(2)}</span>}
                        <span className="text-[10px] text-gray-600">{agent.sessionCount} sess</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Queue */}
          {queueTasks.length > 0 && (
            <div className="bg-[#111113] rounded-lg border border-[#1e1e21] overflow-hidden shrink-0">
              <div className="px-4 py-2 border-b border-[#1e1e21]">
                <span className="text-[10px] text-gray-400 uppercase tracking-wider">Queue</span>
                <span className="text-[10px] text-gray-600 ml-2">{queueTasks.length} waiting</span>
              </div>
              <div className="divide-y divide-[#1e1e21]">
                {queueTasks.slice(0, 5).map(task => (
                  <div key={task.id} className="px-4 py-2 flex items-center gap-3">
                    <span className="text-sm">{task.assignedTo ? EMOJIS[task.assignedTo] || '🤖' : '📋'}</span>
                    <span className="text-xs text-gray-300 flex-1 truncate">{task.title}</span>
                    <span className="text-[9px] text-gray-600">@{task.assignedTo}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded ${task.priority === 'critical' ? 'bg-red-500/20 text-red-400' : task.priority === 'high' ? 'bg-amber-500/20 text-amber-400' : 'bg-gray-500/20 text-gray-400'}`}>{task.priority}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Completed */}
          <div className="bg-[#111113] rounded-lg border border-[#1e1e21] overflow-hidden flex-1 min-h-0 flex flex-col">
            <div className="px-4 py-2 border-b border-[#1e1e21] shrink-0">
              <span className="text-[10px] text-gray-400 uppercase tracking-wider">Completed</span>
              <span className="text-[10px] text-gray-600 ml-2">{completedToday.length}</span>
            </div>
            <div className="divide-y divide-[#1e1e21] flex-1 overflow-y-auto">
              {completedToday.slice(0, 15).map(task => {
                const cost = task.assignedTo ? agentUsage[task.assignedTo] : null;
                return (
                  <div key={task.id} className="px-4 py-2 flex items-center gap-2">
                    <span className="text-green-500 text-xs">✓</span>
                    <span className="text-sm">{task.assignedTo ? EMOJIS[task.assignedTo] || '🤖' : ''}</span>
                    <span className="text-xs text-gray-400 flex-1 truncate">{task.title}</span>
                    {task.completedAt && <span className="text-[10px] text-gray-600">{timeAgo(task.completedAt)}</span>}
                    {cost && <span className="text-[10px] text-gray-700">${(cost.cost / 100).toFixed(2)}</span>}
                  </div>
                );
              })}
              {completedToday.length === 0 && (
                <div className="px-4 py-6 text-center text-xs text-gray-700">Nothing completed yet</div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Agent Utilization + Activity */}
        <div className="w-72 flex flex-col gap-3 shrink-0 min-h-0">
          {/* Agent Utilization */}
          <div className="bg-[#111113] rounded-lg border border-[#1e1e21] p-4 shrink-0">
            <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-3">Utilization</div>
            <div className="space-y-2">
              {agents.filter(a => a.state !== 'offline').map(agent => {
                const cost = agentUsage[agent.id];
                const utilPct = agent.state === 'active' ? 100 : agent.state === 'stalled' ? 75 : cost ? Math.min(50, cost.count * 10) : 0;
                const h = healthColors[agent.state];
                return (
                  <div key={agent.id} className="flex items-center gap-2">
                    <span className="text-xs w-5">{EMOJIS[agent.id] || '🤖'}</span>
                    <span className="text-[10px] text-gray-400 w-14 truncate capitalize">{agent.id}</span>
                    <div className="flex-1 h-1.5 bg-[#1a1a1d] rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${h.dot.replace('animate-pulse', '')}`} style={{ width: `${utilPct}%` }} />
                    </div>
                    <span className={`text-[9px] w-6 text-right ${h.text}`}>{utilPct > 0 ? `${utilPct}%` : '—'}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Live Activity */}
          <div className="bg-[#111113] rounded-lg border border-[#1e1e21] overflow-hidden flex-1 min-h-0 flex flex-col">
            <div className="px-4 py-2 border-b border-[#1e1e21] flex items-center gap-2 shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
              <span className="text-[10px] text-gray-400 uppercase tracking-wider">Activity</span>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-[#1e1e21]">
              {activities.map(act => (
                <div key={act.id} className="px-3 py-2 flex gap-2">
                  <span className="text-xs mt-0.5">{EMOJIS[act.agentId] || '🤖'}</span>
                  <div className="min-w-0">
                    <div className="text-[11px]">
                      <span className="text-gray-300 capitalize">{act.agentId}</span>
                      <span className="text-gray-600"> • {act.action.replace(/_/g, ' ')}</span>
                    </div>
                    {act.target && <div className="text-[10px] text-gray-700 truncate">{act.target}</div>}
                    <div className="text-[9px] text-gray-700">{timeAgo(act.timestamp)}</div>
                  </div>
                </div>
              ))}
              {activities.length === 0 && (
                <div className="px-4 py-6 text-center text-xs text-gray-700">No recent activity</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
