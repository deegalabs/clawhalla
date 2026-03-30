'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { PageLoading } from '@/components/ui/loading';
import { AGENT_EMOJIS } from '@/lib/agents';
import { useSquad } from '@/hooks/use-squad';
import { CostWidget } from './_components/cost-widget';
import { AgentMetrics } from './_components/agent-metrics';
import { SystemStatus } from './_components/system-status';
import { ActivityFeed } from './_components/activity-feed';

interface AgentHealth {
  id: string;
  name: string;
  role: string;
  emoji: string;
  squad: string | null;
  state: 'active' | 'idle' | 'stalled' | 'stuck' | 'offline';
  idleMinutes: number | null;
  model: string | null;
  sessionCount: number;
}

interface BoardData {
  tasks: { status: string }[];
  sprints: { id: string; name: string; status: string }[];
  boardCount?: number;
  cardsByColumn?: Record<string, number>;
  totalCards?: number;
}

interface UsageData {
  today: { totalCostUsd: string; inputTokens: number; outputTokens: number; events: number };
  byAgent?: Record<string, { input: number; output: number; cost: number }>;
}

interface ApprovalData {
  pending: unknown[];
}

const healthDots: Record<string, string> = {
  active: 'bg-green-500', idle: 'bg-gray-500', stalled: 'bg-amber-500 animate-pulse',
  stuck: 'bg-red-500 animate-pulse', offline: 'bg-gray-700',
};

export default function DashboardPage() {
  const { activeSquad } = useSquad();
  const [agents, setAgents] = useState<AgentHealth[]>([]);
  const [board, setBoard] = useState<BoardData | null>(null);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [approvals, setApprovals] = useState<ApprovalData | null>(null);
  const [gatewayOk, setGatewayOk] = useState(false);
  const [totalSessions, setTotalSessions] = useState(0);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setFetchError(null);
      const boardsUrl = activeSquad ? `/api/boards?squad=${activeSquad}` : '/api/boards';
      const [healthRes, boardsRes, usageRes, approvalRes] = await Promise.all([
        fetch('/api/agents/health'),
        fetch(boardsUrl),
        fetch('/api/usage'),
        fetch('/api/approvals'),
      ]);

      const healthData = await healthRes.json();
      const boardsData = await boardsRes.json();
      const usageData = await usageRes.json();
      const approvalData = await approvalRes.json();

      if (healthData.ok) {
        setAgents(healthData.agents);
        setGatewayOk(healthData.gatewayOk);
        setTotalSessions(
          healthData.agents.reduce((sum: number, a: AgentHealth) => sum + a.sessionCount, 0)
        );
      }

      // Aggregate board data from Boards Engine
      if (Array.isArray(boardsData)) {
        const firstBoard = boardsData.find((b: { archivedAt: unknown }) => !b.archivedAt);
        if (firstBoard) {
          try {
            const cardsRes = await fetch(`/api/boards/${firstBoard.id}/cards`);
            const cardsData = await cardsRes.json();
            if (Array.isArray(cardsData)) {
              const columnMap: Record<string, number> = {};
              for (const card of cardsData) {
                columnMap[card.column] = (columnMap[card.column] || 0) + 1;
              }
              const doing = (columnMap['doing'] || 0) + (columnMap['fixing'] || 0) + (columnMap['writing'] || 0) + (columnMap['researching'] || 0);
              const review = (columnMap['review'] || 0) + (columnMap['testing'] || 0) + (columnMap['triaged'] || 0);
              const done = (columnMap['done'] || 0) + (columnMap['deployed'] || 0) + (columnMap['resolved'] || 0) + (columnMap['published'] || 0);
              const backlog = (columnMap['backlog'] || 0) + (columnMap['todo'] || 0) + (columnMap['ideas'] || 0) + (columnMap['reported'] || 0);

              setBoard({
                tasks: [
                  ...Array(doing).fill({ status: 'in_progress' }),
                  ...Array(review).fill({ status: 'review' }),
                  ...Array(done).fill({ status: 'done' }),
                  ...Array(backlog).fill({ status: 'backlog' }),
                ],
                sprints: [{ id: firstBoard.id, name: firstBoard.name, status: 'active' }],
                boardCount: boardsData.length,
                cardsByColumn: columnMap,
                totalCards: cardsData.length,
              });
            }
          } catch { /* board cards fetch failed */ }
        }
      }

      if (usageData.ok) setUsage(usageData);
      setApprovals(approvalData);
    } catch (err) {
      console.error('[dashboard] fetch error:', err);
      setFetchError(String(err));
    }
    setLoading(false);
  }, [activeSquad]);

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
      es.onerror = () => { es?.close(); };
    } catch { /* SSE not available */ }
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

  // Agent list for child components
  const agentList = agents.map(a => ({
    id: a.id,
    name: a.name || a.id,
    emoji: a.emoji || AGENT_EMOJIS[a.id] || '🤖',
    state: a.state,
  }));

  if (loading) {
    return <PageLoading title="Loading dashboard..." />;
  }

  return (
    <div className="space-y-5">
      {fetchError && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2.5 flex items-center justify-between">
          <span className="text-xs text-red-400">Failed to load some data. Retrying automatically...</span>
          <button onClick={fetchData} className="text-[10px] text-red-400 hover:text-red-300 px-2 py-1 bg-red-500/10 rounded">Retry now</button>
        </div>
      )}

      {/* Row 1 — Overview */}
      <div>
        <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-2">Overview</div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
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
              <div className="text-[10px] text-amber-400 mt-0.5">{stalledAgents} stalled</div>
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
      </div>

      {/* Row 2 — Cost & Performance */}
      <div>
        <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-2">Cost & Performance</div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <CostWidget usageData={{ byAgent: usage?.byAgent || {} }} />
          <AgentMetrics agents={agentList} />
        </div>
      </div>

      {/* Row 3 — System */}
      <div>
        <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-2">System</div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SystemStatus
            gatewayOk={gatewayOk}
            agents={agentList}
            totalSessions={totalSessions}
          />

          {/* Sprint Progress */}
          <div className="bg-[#111113] rounded-lg border border-[#1e1e21] overflow-hidden">
            <div className="px-4 py-3 border-b border-[#1e1e21]">
              <span className="text-xs font-medium text-gray-300">Sprint Progress</span>
            </div>
            <div className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[11px] text-gray-400">
                  {activeSprint?.name || 'Current Sprint'}
                </div>
                <span className="text-[11px] text-gray-500">{tasksDone}/{totalTasks}</span>
              </div>
              <div className="h-2 bg-[#1a1a1d] rounded-full overflow-hidden">
                <div className="h-full bg-amber-500 rounded-full transition-all" style={{ width: `${sprintProgress}%` }} />
              </div>
              <div className="flex justify-between mt-2 text-[10px] text-gray-600">
                <span>{tasksBacklog} backlog</span>
                <span>{tasksInProgress} building</span>
                <span>{tasksInReview} review</span>
                <span>{tasksDone} done</span>
              </div>

              {/* Agent Health Strip */}
              <div className="mt-4 pt-3 border-t border-[#1e1e21]">
                <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-2">Agent Health</div>
                <div className="flex flex-wrap gap-1.5">
                  {agents.map(a => (
                    <div
                      key={a.id}
                      className="flex items-center gap-1 px-2 py-1 bg-[#0a0a0b] rounded"
                      title={`${a.name} — ${a.role}${a.idleMinutes != null ? ` (${a.idleMinutes}m)` : ''}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${healthDots[a.state]}`} />
                      <span className="text-[10px]">{a.emoji || AGENT_EMOJIS[a.id] || '🤖'}</span>
                      <span className="text-[10px] text-gray-500">{a.name || a.id}</span>
                    </div>
                  ))}
                  {agents.length === 0 && (
                    <div className="text-[10px] text-gray-600">No agents registered</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Row 4 — Activity */}
      <div>
        <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-2">Activity</div>
        <ActivityFeed agents={agentList} />
      </div>
    </div>
  );
}
