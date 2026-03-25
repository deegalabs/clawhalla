'use client';

import { useState, useEffect, useCallback } from 'react';

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  assignedTo?: string;
  assigned_to?: string;
}

interface AgentHealth {
  id: string;
  state: 'active' | 'idle' | 'stalled' | 'stuck' | 'offline';
  idleMinutes: number | null;
  model: string | null;
  sessionCount: number;
}

const stageConfig = [
  { id: 'backlog', label: 'BACKLOG', color: 'border-gray-600', bg: 'bg-gray-800/30' },
  { id: 'in_progress', label: 'BUILDING', color: 'border-blue-500', bg: 'bg-blue-500/5' },
  { id: 'review', label: 'REVIEW', color: 'border-amber-500', bg: 'bg-amber-500/5' },
  { id: 'done', label: 'SHIPPED', color: 'border-green-500', bg: 'bg-green-500/5' },
];

const healthColors: Record<string, string> = {
  active: 'bg-green-500',
  idle: 'bg-gray-500',
  stalled: 'bg-amber-500',
  stuck: 'bg-red-500',
  offline: 'bg-gray-700',
};

const healthLabels: Record<string, string> = {
  active: 'Working',
  idle: 'Idle',
  stalled: 'Stalled',
  stuck: 'Stuck',
  offline: 'Offline',
};

function timeLabel(mins: number | null): string {
  if (mins === null) return '';
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export default function PipelinePage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [agents, setAgents] = useState<AgentHealth[]>([]);
  const [summary, setSummary] = useState({ active: 0, idle: 0, stalled: 0, stuck: 0, offline: 0 });

  const fetchData = useCallback(async () => {
    try {
      const [boardRes, healthRes] = await Promise.all([
        fetch('/api/board/sync?project=clawhalla'),
        fetch('/api/agents/health'),
      ]);
      const boardData = await boardRes.json();
      const healthData = await healthRes.json();

      if (boardData.ok || boardData.tasks) {
        setTasks((boardData.tasks || []).map((t: Task) => ({
          ...t,
          assignedTo: t.assignedTo || t.assigned_to,
        })));
      }
      if (healthData.ok) {
        setAgents(healthData.agents);
        setSummary(healthData.summary);
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // SSE
  useEffect(() => {
    let es: EventSource | null = null;
    try {
      es = new EventSource('/api/sse');
      es.onmessage = () => fetchData();
    } catch { /* silent */ }
    return () => { if (es) es.close(); };
  }, [fetchData]);

  const shippedToday = tasks.filter(t => t.status === 'done').length;
  const inProgress = tasks.filter(t => t.status === 'in_progress').length;
  const blocked = tasks.filter(t => t.status === 'blocked').length;

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-[#111113] rounded-lg p-3 border border-[#1e1e21]">
          <div className="flex items-center gap-2">
            <span className="text-green-500 text-lg">✓</span>
            <div>
              <div className="text-[10px] text-gray-500 uppercase">Shipped</div>
              <div className="text-xl font-bold text-green-400">{shippedToday}</div>
            </div>
          </div>
        </div>
        <div className="bg-[#111113] rounded-lg p-3 border border-[#1e1e21]">
          <div className="flex items-center gap-2">
            <span className="text-blue-500 text-lg">⚡</span>
            <div>
              <div className="text-[10px] text-gray-500 uppercase">In Progress</div>
              <div className="text-xl font-bold text-blue-400">{inProgress}</div>
            </div>
          </div>
        </div>
        <div className="bg-[#111113] rounded-lg p-3 border border-[#1e1e21]">
          <div className="text-[10px] text-gray-500 uppercase">Backlog</div>
          <div className="text-xl font-bold text-gray-400">{tasks.filter(t => t.status === 'backlog').length}</div>
        </div>
        <div className="bg-[#111113] rounded-lg p-3 border border-[#1e1e21]">
          <div className="text-[10px] text-gray-500 uppercase">Blocked</div>
          <div className="text-xl font-bold text-red-400">{blocked}</div>
        </div>
        <div className="bg-[#111113] rounded-lg p-3 border border-[#1e1e21]">
          <div className="text-[10px] text-gray-500 uppercase">Agents Active</div>
          <div className="text-xl font-bold text-amber-400">{summary.active}</div>
        </div>
      </div>

      {/* Pipeline header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-100">Software Pipeline</h2>
          <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block"></span>
            Live sync enabled
          </div>
        </div>
      </div>

      {/* Pipeline stages */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {stageConfig.map(stage => {
          const stageTasks = tasks.filter(t => t.status === stage.id);
          return (
            <div key={stage.id} className={`rounded-lg border-t-2 ${stage.color} ${stage.bg} border border-[#1e1e21] min-h-[200px]`}>
              <div className="px-3 py-2 flex items-center justify-between border-b border-[#1e1e21]">
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{stage.label}</span>
                <span className="text-[10px] text-gray-600">{stageTasks.length}</span>
              </div>
              <div className="p-2 space-y-2">
                {stageTasks.map(task => {
                  const agentHealth = agents.find(a => a.id === task.assignedTo);
                  return (
                    <div key={task.id} className="bg-[#0a0a0b] rounded-lg p-3 border border-[#1e1e21]">
                      <div className="text-xs text-gray-200 font-medium leading-tight">{task.title}</div>
                      {task.assignedTo && (
                        <div className="flex items-center gap-2 mt-2">
                          {agentHealth && (
                            <span className={`w-2 h-2 rounded-full ${healthColors[agentHealth.state]}`}
                              title={healthLabels[agentHealth.state]} />
                          )}
                          <span className="text-[10px] text-amber-500">@{task.assignedTo}</span>
                          {agentHealth && agentHealth.state !== 'idle' && (
                            <span className={`text-[9px] ${agentHealth.state === 'active' ? 'text-green-500' : agentHealth.state === 'stalled' ? 'text-amber-500' : 'text-red-400'}`}>
                              {healthLabels[agentHealth.state]} {timeLabel(agentHealth.idleMinutes)}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Agent Health Grid */}
      <div>
        <h3 className="text-sm font-semibold text-gray-300 mb-3">Agent Health</h3>
        <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-8 gap-2">
          {agents.map(agent => (
            <div key={agent.id} className="bg-[#111113] rounded-lg p-3 border border-[#1e1e21] text-center">
              <div className={`w-3 h-3 rounded-full ${healthColors[agent.state]} mx-auto mb-1.5`} />
              <div className="text-xs text-gray-200 font-medium capitalize">{agent.id}</div>
              <div className="text-[9px] text-gray-600">{healthLabels[agent.state]}</div>
              {agent.idleMinutes !== null && agent.state !== 'idle' && (
                <div className="text-[9px] text-gray-500 mt-0.5">{timeLabel(agent.idleMinutes)}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
