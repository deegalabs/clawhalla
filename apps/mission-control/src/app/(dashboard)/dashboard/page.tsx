'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { PageLoading } from '@/components/ui/loading';

interface AgentHealth {
  id: string;
  state: 'active' | 'idle' | 'stalled' | 'stuck' | 'offline';
  idleMinutes: number | null;
}

interface Activity {
  id: string;
  agentId: string;
  action: string;
  target: string | null;
  details: string | null;
  timestamp: string;
}

interface BoardData {
  tasks: { status: string }[];
  sprints: { id: string; name: string; status: string }[];
}

interface UsageData {
  today: { totalCostUsd: string; inputTokens: number; outputTokens: number; events: number };
}

interface ApprovalData {
  pending: unknown[];
}

const AGENT_EMOJIS: Record<string, string> = {
  main: '🦞', claw: '🦞', odin: '👁️', vidar: '⚔️', saga: '🔮',
  thor: '⚡', frigg: '👑', tyr: '⚖️', freya: '✨', heimdall: '👁️‍🗨️',
  volund: '🔧', sindri: '🔥', skadi: '❄️', mimir: '🧠', bragi: '🎭', loki: '🦊',
};

const actionLabels: Record<string, string> = {
  task_started: 'started task', task_completed: 'completed task',
  task_updated: 'updated board', heartbeat_check: 'heartbeat',
  file_created: 'created file', file_updated: 'updated file',
  session_started: 'session started', session_ended: 'session ended',
  approval_requested: 'requested approval', approval_resolved: 'resolved approval',
};

const healthDots: Record<string, string> = {
  active: 'bg-green-500', idle: 'bg-gray-500', stalled: 'bg-amber-500 animate-pulse',
  stuck: 'bg-red-500 animate-pulse', offline: 'bg-gray-700',
};

function timeAgo(ms: number | string): string {
  const diff = Date.now() - (typeof ms === 'string' ? new Date(ms).getTime() : ms);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const quickNav = [
  { href: '/tasks', label: 'Tasks', icon: '✓', desc: 'Kanban board' },
  { href: '/pipeline', label: 'Pipeline', icon: '⚡', desc: 'Build status' },
  { href: '/team', label: 'Team', icon: '👥', desc: 'Agent hierarchy' },
  { href: '/office', label: 'Office', icon: '🏢', desc: 'Live agents' },
  { href: '/memory', label: 'Memory', icon: '🧠', desc: 'Knowledge base' },
  { href: '/content', label: 'Content', icon: '✍️', desc: 'Create posts' },
  { href: '/council', label: 'Council', icon: '🔬', desc: 'R&D insights' },
  { href: '/settings', label: 'Settings', icon: '🔒', desc: 'Vault & config' },
];

export default function DashboardPage() {
  const [agents, setAgents] = useState<AgentHealth[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [board, setBoard] = useState<BoardData | null>(null);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [approvals, setApprovals] = useState<ApprovalData | null>(null);
  const [gatewayOk, setGatewayOk] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [healthRes, actRes, boardRes, usageRes, approvalRes] = await Promise.all([
        fetch('/api/agents/health'),
        fetch('/api/activities?limit=12'),
        fetch('/api/board/sync?project=clawhalla'),
        fetch('/api/usage'),
        fetch('/api/approvals'),
      ]);

      const healthData = await healthRes.json();
      const actData = await actRes.json();
      const boardData = await boardRes.json();
      const usageData = await usageRes.json();
      const approvalData = await approvalRes.json();

      if (healthData.ok) {
        setAgents(healthData.agents);
        setGatewayOk(healthData.gatewayOk);
      }
      if (Array.isArray(actData)) setActivities(actData);
      if (boardData.tasks) setBoard(boardData);
      if (usageData.ok) setUsage(usageData);
      setApprovals(approvalData);
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 20000);
    return () => clearInterval(interval);
  }, [fetchData]);

  useEffect(() => {
    let es: EventSource | null = null;
    try {
      es = new EventSource('/api/sse');
      es.onmessage = () => fetchData();
    } catch { /* */ }
    return () => { if (es) es.close(); };
  }, [fetchData]);

  // Computed
  const activeAgents = agents.filter(a => a.state === 'active').length;
  const stalledAgents = agents.filter(a => a.state === 'stalled' || a.state === 'stuck').length;
  const tasksInProgress = board?.tasks.filter(t => t.status === 'in_progress').length || 0;
  const tasksInReview = board?.tasks.filter(t => t.status === 'review').length || 0;
  const tasksDone = board?.tasks.filter(t => t.status === 'done').length || 0;
  const tasksBacklog = board?.tasks.filter(t => t.status === 'backlog').length || 0;
  const totalTasks = board?.tasks.length || 0;
  const pendingApprovals = approvals?.pending?.length || 0;
  const activeSprint = board?.sprints?.find(s => s.status === 'active' || s.status === 'done');
  const sprintProgress = totalTasks > 0 ? Math.round((tasksDone / totalTasks) * 100) : 0;

  if (loading) {
    return <PageLoading title="Loading dashboard..." />;
  }

  return (
    <div className="space-y-5">
      {/* Row 1: System Health */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {/* Gateway */}
        <div className="bg-[#111113] rounded-lg p-4 border border-[#1e1e21]">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider">Gateway</div>
          <div className={`text-lg font-bold mt-1 ${gatewayOk ? 'text-green-400' : 'text-red-400'}`}>
            {gatewayOk ? 'Online' : 'Offline'}
          </div>
        </div>

        {/* Active Agents */}
        <div className="bg-[#111113] rounded-lg p-4 border border-[#1e1e21]">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider">Agents</div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-lg font-bold text-green-400">{activeAgents}</span>
            <span className="text-xs text-gray-600">active</span>
          </div>
          {stalledAgents > 0 && (
            <div className="text-[10px] text-amber-400 mt-0.5">⚠ {stalledAgents} stalled</div>
          )}
        </div>

        {/* Pipeline */}
        <div className="bg-[#111113] rounded-lg p-4 border border-[#1e1e21]">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider">Building</div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-lg font-bold text-blue-400">{tasksInProgress}</span>
            <span className="text-xs text-gray-600">in progress</span>
          </div>
          {tasksInReview > 0 && (
            <div className="text-[10px] text-amber-400 mt-0.5">{tasksInReview} in review</div>
          )}
        </div>

        {/* Shipped */}
        <div className="bg-[#111113] rounded-lg p-4 border border-[#1e1e21]">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider">Shipped</div>
          <div className="text-lg font-bold text-green-400 mt-1">{tasksDone}</div>
        </div>

        {/* Approvals */}
        <div className={`bg-[#111113] rounded-lg p-4 border ${pendingApprovals > 0 ? 'border-amber-500/40' : 'border-[#1e1e21]'}`}>
          <div className="text-[10px] text-gray-500 uppercase tracking-wider">Approvals</div>
          <div className={`text-lg font-bold mt-1 ${pendingApprovals > 0 ? 'text-amber-400' : 'text-gray-500'}`}>
            {pendingApprovals}
          </div>
          {pendingApprovals > 0 && (
            <Link href="/approvals" className="text-[10px] text-amber-400 hover:text-amber-300">Review →</Link>
          )}
        </div>

        {/* Cost Today */}
        <div className="bg-[#111113] rounded-lg p-4 border border-[#1e1e21]">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider">Cost Today</div>
          <div className="text-lg font-bold text-gray-300 mt-1">
            ${usage?.today.totalCostUsd || '0.00'}
          </div>
          {usage && usage.today.events > 0 && (
            <div className="text-[10px] text-gray-600 mt-0.5">{usage.today.events} events</div>
          )}
        </div>
      </div>

      {/* Row 2: Sprint Progress + Agent Health Strip */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Sprint */}
        <div className="bg-[#111113] rounded-lg p-4 border border-[#1e1e21]">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-medium text-gray-300">
              {activeSprint?.name || 'Current Sprint'}
            </div>
            <span className="text-xs text-gray-500">{tasksDone}/{totalTasks}</span>
          </div>
          <div className="h-2 bg-[#1a1a1d] rounded-full overflow-hidden">
            <div className="h-full bg-amber-500 rounded-full" style={{ width: `${sprintProgress}%` }} />
          </div>
          <div className="flex justify-between mt-2 text-[10px] text-gray-600">
            <span>{tasksBacklog} backlog</span>
            <span>{tasksInProgress} building</span>
            <span>{tasksDone} done</span>
          </div>
        </div>

        {/* Agent Health Strip */}
        <div className="lg:col-span-2 bg-[#111113] rounded-lg p-4 border border-[#1e1e21]">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Agent Health</div>
          <div className="flex flex-wrap gap-2">
            {agents.map(a => (
              <div key={a.id} className="flex items-center gap-1.5 px-2 py-1 bg-[#0a0a0b] rounded">
                <span className={`w-2 h-2 rounded-full ${healthDots[a.state]}`} />
                <span className="text-xs">{AGENT_EMOJIS[a.id] || '🤖'}</span>
                <span className="text-[10px] text-gray-400 capitalize">{a.id === 'main' ? 'claw' : a.id}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row 3: Activity Feed + Quick Nav */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Activity Feed */}
        <div className="lg:col-span-3 bg-[#111113] rounded-lg border border-[#1e1e21] overflow-hidden">
          <div className="px-4 py-3 border-b border-[#1e1e21] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
              <span className="text-xs font-medium text-gray-300">Live Activity</span>
            </div>
            <span className="text-[10px] text-gray-600">SSE connected</span>
          </div>
          <div className="divide-y divide-[#1e1e21]">
            {activities.length === 0 ? (
              <div className="px-4 py-6 text-center text-gray-600 text-xs">No recent activity</div>
            ) : (
              activities.map(act => (
                <div key={act.id} className="px-4 py-2.5 flex items-center gap-3 hover:bg-[#141416]">
                  <span className="text-base">{AGENT_EMOJIS[act.agentId] || '🤖'}</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs text-gray-300 font-medium capitalize">{act.agentId}</span>
                    <span className="text-xs text-gray-600"> {actionLabels[act.action] || act.action}</span>
                    {act.target && <span className="text-xs text-gray-700"> — {act.target}</span>}
                  </div>
                  <span className="text-[10px] text-gray-700 shrink-0">{timeAgo(act.timestamp)}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Quick Nav */}
        <div className="lg:col-span-2 bg-[#111113] rounded-lg border border-[#1e1e21] p-4">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-3">Quick Navigation</div>
          <div className="grid grid-cols-2 gap-2">
            {quickNav.map(nav => (
              <Link
                key={nav.href}
                href={nav.href}
                className="flex items-center gap-2.5 px-3 py-2.5 bg-[#0a0a0b] rounded-lg border border-[#1e1e21] hover:border-amber-500/30 hover:bg-[#141416]"
              >
                <span className="text-base">{nav.icon}</span>
                <div>
                  <div className="text-xs font-medium text-gray-200">{nav.label}</div>
                  <div className="text-[10px] text-gray-600">{nav.desc}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
