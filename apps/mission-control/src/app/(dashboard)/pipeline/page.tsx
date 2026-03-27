'use client';

import { useState, useEffect, useCallback } from 'react';
import { AGENT_EMOJIS } from '@/lib/agents';

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  assignedTo?: string;
  assigned_to?: string;
  completedAt?: string;
  completed_at?: string;
  createdAt?: string;
  created_at?: string;
}

interface AgentHealth {
  id: string;
  state: 'active' | 'idle' | 'stalled' | 'stuck' | 'offline';
  idleMinutes: number | null;
  model: string | null;
}

interface Activity {
  id: string;
  agentId: string;
  action: string;
  target: string | null;
  timestamp: string;
}


const healthDots: Record<string, string> = {
  active: 'bg-green-500', idle: 'bg-gray-500', stalled: 'bg-amber-500 animate-pulse',
  stuck: 'bg-red-500 animate-pulse', offline: 'bg-gray-700',
};

const priorityBars: Record<string, string> = {
  critical: 'bg-red-500', high: 'bg-amber-500', medium: 'bg-blue-500', low: 'bg-gray-500',
};

function timeAgo(dateStr?: string): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function PipelinePage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [agents, setAgents] = useState<AgentHealth[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);

  const fetchData = useCallback(async () => {
    try {
      const [boardRes, healthRes, actRes] = await Promise.all([
        fetch('/api/board/sync?project=clawhalla'),
        fetch('/api/agents/health'),
        fetch('/api/activities?limit=10'),
      ]);
      const boardData = await boardRes.json();
      const healthData = await healthRes.json();
      const actData = await actRes.json();

      if (boardData.tasks) {
        setTasks(boardData.tasks.map((t: Task) => ({
          ...t, assignedTo: t.assignedTo || t.assigned_to,
          completedAt: t.completedAt || t.completed_at,
          createdAt: t.createdAt || t.created_at,
        })));
      }
      if (healthData.ok) setAgents(healthData.agents);
      if (Array.isArray(actData)) setActivities(actData);
    } catch (err) { console.error('[pipeline] fetch error:', err); }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
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

  const getAgentHealth = (id?: string) => agents.find(a => a.id === id);

  // Pipeline-specific data
  const building = tasks.filter(t => t.status === 'in_progress');
  const inReview = tasks.filter(t => t.status === 'review');
  const shipped = tasks.filter(t => t.status === 'done');
  const blocked = tasks.filter(t => t.status === 'blocked');
  const backlogCount = tasks.filter(t => t.status === 'backlog').length;

  // Calculate avg pipeline time for completed tasks
  const completedWithDates = shipped.filter(t => t.createdAt && t.completedAt);
  const avgPipelineMs = completedWithDates.length > 0
    ? completedWithDates.reduce((sum, t) => {
        const created = new Date(t.createdAt!).getTime();
        const completed = new Date(t.completedAt!).getTime();
        return sum + (completed - created);
      }, 0) / completedWithDates.length
    : 0;
  const avgHours = Math.floor(avgPipelineMs / 3600000);
  const avgMins = Math.floor((avgPipelineMs % 3600000) / 60000);

  // Active agents (agents currently assigned to in_progress tasks)
  const activeAgentIds = new Set(building.map(t => t.assignedTo).filter(Boolean));

  return (
    <div className="space-y-5">
      {/* Delivery Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-[#111113] rounded-lg p-4 border border-[#1e1e21]">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center text-green-400">✓</span>
            <div>
              <div className="text-[10px] text-gray-500 uppercase">Shipped</div>
              <div className="text-2xl font-bold text-green-400">{shipped.length}</div>
            </div>
          </div>
        </div>
        <div className="bg-[#111113] rounded-lg p-4 border border-[#1e1e21]">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400">⚡</span>
            <div>
              <div className="text-[10px] text-gray-500 uppercase">Building</div>
              <div className="text-2xl font-bold text-blue-400">{building.length}</div>
            </div>
          </div>
        </div>
        <div className="bg-[#111113] rounded-lg p-4 border border-[#1e1e21]">
          <div className="text-[10px] text-gray-500 uppercase">In Review</div>
          <div className="text-2xl font-bold text-amber-400">{inReview.length}</div>
        </div>
        <div className="bg-[#111113] rounded-lg p-4 border border-[#1e1e21]">
          <div className="text-[10px] text-gray-500 uppercase">Blocked</div>
          <div className="text-2xl font-bold text-red-400">{blocked.length}</div>
        </div>
        <div className="bg-[#111113] rounded-lg p-4 border border-[#1e1e21]">
          <div className="text-[10px] text-gray-500 uppercase">Avg. Pipeline</div>
          <div className="text-2xl font-bold text-gray-300">
            {avgPipelineMs > 0 ? `${avgHours}h ${avgMins}m` : '—'}
          </div>
        </div>
      </div>

      {/* Pipeline header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-200 uppercase tracking-wider">Software Pipeline</h2>
          <div className="text-[10px] text-gray-600 mt-0.5">
            {activeAgentIds.size} agents building • {backlogCount} in backlog
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-green-500">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
          Live sync
        </div>
      </div>

      {/* Pipeline stages — only active work */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* BUILDING */}
        <div className="bg-[#0d0d0f] rounded-xl border border-blue-500/20 min-h-[250px]">
          <div className="px-4 py-3 border-b border-[#1e1e21] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-500"></span>
              <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider">Building</span>
            </div>
            <span className="text-[10px] bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded">{building.length}</span>
          </div>
          <div className="p-3 space-y-3">
            {building.map(task => {
              const health = getAgentHealth(task.assignedTo);
              return (
                <div key={task.id} className="bg-[#111113] rounded-lg p-3 border border-[#1e1e21]">
                  <div className="text-sm text-gray-200 font-medium">{task.title}</div>
                  {task.assignedTo && (
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-lg">{AGENT_EMOJIS[task.assignedTo] || '🤖'}</span>
                      <span className="text-xs text-gray-300 capitalize">{task.assignedTo}</span>
                      {health && (
                        <span className={`w-2 h-2 rounded-full ${healthDots[health.state]}`} />
                      )}
                      {health?.state === 'active' && (
                        <span className="text-[9px] text-green-500">Working</span>
                      )}
                      {health?.state === 'stalled' && (
                        <span className="text-[9px] text-amber-500">Stalled {health.idleMinutes}m</span>
                      )}
                    </div>
                  )}
                  <div className="mt-2 h-1 bg-[#1a1a1d] rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${priorityBars[task.priority] || 'bg-blue-500'} ${avgPipelineMs === 0 ? 'animate-pulse' : ''}`} style={{ width: `${avgPipelineMs > 0 && task.createdAt ? Math.min(95, Math.round(((Date.now() - new Date(task.createdAt).getTime()) / avgPipelineMs) * 100)) : 50}%` }} />
                  </div>
                  <div className="text-[9px] text-gray-600 mt-1">{timeAgo(task.createdAt)}</div>
                </div>
              );
            })}
            {building.length === 0 && (
              <div className="text-xs text-gray-700 text-center py-6">No active builds</div>
            )}
          </div>
        </div>

        {/* QA / REVIEW */}
        <div className="bg-[#0d0d0f] rounded-xl border border-amber-500/20 min-h-[250px]">
          <div className="px-4 py-3 border-b border-[#1e1e21] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
              <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Review</span>
            </div>
            <span className="text-[10px] bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded">{inReview.length}</span>
          </div>
          <div className="p-3 space-y-3">
            {inReview.map(task => (
              <div key={task.id} className="bg-[#111113] rounded-lg p-3 border border-[#1e1e21]">
                <div className="text-sm text-gray-200 font-medium">{task.title}</div>
                {task.assignedTo && (
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-lg">{AGENT_EMOJIS[task.assignedTo] || '🤖'}</span>
                    <span className="text-xs text-gray-400 capitalize">{task.assignedTo}</span>
                  </div>
                )}
                <div className="text-[9px] text-gray-600 mt-1">Awaiting review</div>
              </div>
            ))}
            {inReview.length === 0 && (
              <div className="text-xs text-gray-700 text-center py-6">Nothing in review</div>
            )}
          </div>
        </div>

        {/* SHIPPED (recent) */}
        <div className="bg-[#0d0d0f] rounded-xl border border-green-500/20 min-h-[250px]">
          <div className="px-4 py-3 border-b border-[#1e1e21] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500"></span>
              <span className="text-xs font-semibold text-green-400 uppercase tracking-wider">Shipped</span>
            </div>
            <span className="text-[10px] bg-green-500/10 text-green-400 px-2 py-0.5 rounded">{shipped.length}</span>
          </div>
          <div className="p-3 space-y-2">
            {shipped.slice(0, 6).map(task => (
              <div key={task.id} className="flex items-center gap-2 px-3 py-2 bg-[#111113] rounded-lg border border-[#1e1e21]">
                <span className="text-green-500 text-xs">✓</span>
                <span className="text-xs text-gray-300 flex-1 truncate">{task.title}</span>
                <span className="text-[9px] text-gray-600 shrink-0">{timeAgo(task.completedAt)}</span>
              </div>
            ))}
            {shipped.length > 6 && (
              <div className="text-[10px] text-gray-600 text-center">+{shipped.length - 6} more</div>
            )}
          </div>
        </div>
      </div>

      {/* Live Activity Feed */}
      <div className="bg-[#111113] rounded-lg border border-[#1e1e21] p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs">⚡</span>
          <span className="text-xs font-medium text-gray-300">Build Activity</span>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1.5">
          {activities.slice(0, 8).map(act => (
            <div key={act.id} className="flex items-center gap-1.5 text-[11px]">
              <span>{AGENT_EMOJIS[act.agentId] || '🤖'}</span>
              <span className="text-gray-400 capitalize">{act.agentId}</span>
              <span className="text-gray-600">•</span>
              <span className="text-gray-500">{act.target || act.action}</span>
              <span className="text-gray-700">{timeAgo(act.timestamp)}</span>
            </div>
          ))}
          {activities.length === 0 && (
            <div className="text-xs text-gray-700">No recent activity</div>
          )}
        </div>
      </div>
    </div>
  );
}
