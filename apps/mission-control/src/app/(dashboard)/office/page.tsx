'use client';

import { useState, useEffect, useCallback } from 'react';

interface AgentHealth {
  id: string;
  state: 'active' | 'idle' | 'stalled' | 'stuck' | 'offline';
  idleMinutes: number | null;
  model: string | null;
  sessionCount: number;
}

interface Activity {
  id: string;
  agentId: string;
  action: string;
  target: string | null;
  details: string | null;
  timestamp: string;
}

interface OrgAgent {
  id: string;
  name: string;
  emoji: string;
  role: string;
  squad: string | null;
}

const AGENT_EMOJIS: Record<string, string> = {
  main: '🦞', claw: '🦞', odin: '👁️', vidar: '⚔️', saga: '🔮',
  thor: '⚡', frigg: '👑', tyr: '⚖️', freya: '✨', heimdall: '👁️‍🗨️',
  volund: '🔧', sindri: '🔥', skadi: '❄️', mimir: '🧠', bragi: '🎭', loki: '🦊',
};

const stateColors: Record<string, string> = {
  active: 'border-green-500 shadow-green-500/20',
  idle: 'border-gray-600',
  stalled: 'border-amber-500 shadow-amber-500/20',
  stuck: 'border-red-500 shadow-red-500/20',
  offline: 'border-gray-800 opacity-40',
};

const stateDots: Record<string, string> = {
  active: 'bg-green-500',
  idle: 'bg-gray-500',
  stalled: 'bg-amber-500 animate-pulse',
  stuck: 'bg-red-500 animate-pulse',
  offline: 'bg-gray-700',
};

const rooms: Record<string, { label: string; states: string[]; gridArea: string }> = {
  workspace: { label: '💻 Workspace', states: ['active'], gridArea: '1 / 2 / 2 / 4' },
  lounge: { label: '☕ Break Room', states: ['idle', 'offline'], gridArea: '1 / 1 / 2 / 2' },
  review: { label: '📋 Review Room', states: ['stalled'], gridArea: '2 / 1 / 3 / 2' },
  alert: { label: '🚨 Alert Zone', states: ['stuck'], gridArea: '2 / 2 / 3 / 3' },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h`;
}

const actionLabels: Record<string, string> = {
  task_started: 'started task',
  task_completed: 'completed task',
  task_updated: 'updated',
  heartbeat_check: 'heartbeat',
  file_created: 'created file',
  file_updated: 'updated file',
  session_started: 'session started',
  session_ended: 'session ended',
};

export default function OfficePage() {
  const [agents, setAgents] = useState<AgentHealth[]>([]);
  const [orgAgents, setOrgAgents] = useState<OrgAgent[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);

  const fetchData = useCallback(async () => {
    try {
      const [healthRes, orgRes, actRes] = await Promise.all([
        fetch('/api/agents/health'),
        fetch('/api/org-structure'),
        fetch('/api/activities?limit=15'),
      ]);
      const healthData = await healthRes.json();
      const orgData = await orgRes.json();
      const actData = await actRes.json();

      if (healthData.ok) setAgents(healthData.agents);
      if (orgData.ok) setOrgAgents(orgData.org.agents);
      if (Array.isArray(actData)) setActivities(actData);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
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

  const getAgentsInRoom = (states: string[]) =>
    agents.filter(a => states.includes(a.state));

  const getOrgInfo = (id: string) =>
    orgAgents.find(a => a.id === id || a.id === (id === 'main' ? 'claw' : id));

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-100">Office</h2>
          <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block"></span>
            Live • {agents.filter(a => a.state === 'active').length} working
          </div>
        </div>
      </div>

      <div className="flex gap-5">
        {/* Office floor */}
        <div className="flex-1">
          <div className="grid grid-cols-3 grid-rows-2 gap-3 min-h-[400px]">
            {Object.entries(rooms).map(([roomId, room]) => {
              const roomAgents = getAgentsInRoom(room.states);
              return (
                <div
                  key={roomId}
                  className="bg-[#0d0d0f] rounded-xl border border-[#1e1e21] p-4 relative"
                  style={{ gridArea: room.gridArea }}
                >
                  <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-3">{room.label}</div>
                  <div className="flex flex-wrap gap-3">
                    {roomAgents.map(agent => {
                      const org = getOrgInfo(agent.id);
                      return (
                        <div
                          key={agent.id}
                          className={`flex flex-col items-center gap-1 p-2 rounded-lg border-2 ${stateColors[agent.state]} bg-[#111113] min-w-[70px] shadow-lg`}
                        >
                          <div className="text-2xl">{AGENT_EMOJIS[agent.id] || '🤖'}</div>
                          <div className="text-[11px] text-gray-200 font-medium capitalize">{org?.name || agent.id}</div>
                          <div className="flex items-center gap-1">
                            <span className={`w-1.5 h-1.5 rounded-full ${stateDots[agent.state]}`} />
                            <span className="text-[9px] text-gray-500 capitalize">{agent.state}</span>
                          </div>
                        </div>
                      );
                    })}
                    {roomAgents.length === 0 && (
                      <div className="text-[10px] text-gray-700">Empty</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Agent bar */}
          <div className="mt-4 grid grid-cols-4 md:grid-cols-8 gap-2">
            {agents.map(agent => {
              const org = getOrgInfo(agent.id);
              return (
                <div key={agent.id} className="bg-[#111113] rounded-lg p-2 border border-[#1e1e21] text-center">
                  <div className="text-lg">{AGENT_EMOJIS[agent.id] || '🤖'}</div>
                  <div className="text-[10px] text-gray-300 font-medium capitalize truncate">{org?.name || agent.id}</div>
                  <div className="flex items-center justify-center gap-1 mt-0.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${stateDots[agent.state]}`} />
                    <span className="text-[9px] text-gray-600 capitalize">{agent.state}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Live Activity */}
        <div className="w-72 bg-[#111113] rounded-lg border border-[#1e1e21] flex flex-col overflow-hidden shrink-0">
          <div className="px-4 py-3 border-b border-[#1e1e21] flex items-center gap-2">
            <span className="text-xs">⚡</span>
            <span className="text-xs font-medium text-gray-300">Live Activity</span>
            <span className="text-[10px] text-gray-600 ml-auto">Last hour</span>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {activities.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-gray-700 text-xs">No recent activity</div>
                <div className="text-gray-800 text-[10px] mt-1">Events will appear here</div>
              </div>
            ) : (
              activities.map(act => (
                <div key={act.id} className="flex gap-2">
                  <span className="text-sm mt-0.5">{AGENT_EMOJIS[act.agentId] || '🤖'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px]">
                      <span className="text-gray-300 font-medium capitalize">{act.agentId}</span>
                      <span className="text-gray-500"> • </span>
                      <span className="text-gray-400">{actionLabels[act.action] || act.action}</span>
                    </div>
                    {act.target && (
                      <div className="text-[10px] text-gray-600 truncate">{act.target}</div>
                    )}
                    <div className="text-[9px] text-gray-700">{timeAgo(act.timestamp)}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
