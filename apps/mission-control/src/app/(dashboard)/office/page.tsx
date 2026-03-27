'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { AGENT_EMOJIS } from '@/lib/agents';

interface AgentHealth {
  id: string; state: 'active' | 'idle' | 'stalled' | 'stuck' | 'offline';
  idleMinutes: number | null; model: string | null; sessionCount: number;
}
interface Activity {
  id: string; agentId: string; action: string; target: string | null;
  details: string | null; timestamp: string;
}
interface OrgAgent {
  id: string; name: string; emoji: string; role: string; squad: string | null;
}

const stateStyles: Record<string, { border: string; dot: string; label: string; glow: string }> = {
  active: { border: 'border-green-500/50', dot: 'bg-green-500', label: 'Working', glow: 'shadow-green-500/20 shadow-lg' },
  idle: { border: 'border-[#2a2a2d]', dot: 'bg-gray-500', label: 'Idle', glow: '' },
  stalled: { border: 'border-amber-500/50', dot: 'bg-amber-500 animate-pulse', label: 'Stalled', glow: 'shadow-amber-500/20 shadow-lg' },
  stuck: { border: 'border-red-500/50', dot: 'bg-red-500 animate-pulse', label: 'Stuck', glow: 'shadow-red-500/20 shadow-lg' },
  offline: { border: 'border-[#1a1a1d]', dot: 'bg-gray-700', label: 'Offline', glow: '' },
};

interface Room {
  id: string; label: string; icon: string; states: string[];
  col: string; row: string; color: string; desc: string;
}

const ROOMS: Room[] = [
  { id: 'workspace', label: 'Workspace', icon: '💻', states: ['active'], col: 'col-span-3', row: 'row-span-2', color: 'border-green-500/20', desc: 'Agents actively working' },
  { id: 'lounge', label: 'Break Room', icon: '☕', states: ['idle'], col: 'col-span-2', row: 'row-span-1', color: 'border-[#1e1e21]', desc: 'On standby' },
  { id: 'offline', label: 'Off-site', icon: '🌙', states: ['offline'], col: 'col-span-1', row: 'row-span-1', color: 'border-[#1e1e21]', desc: 'Not connected' },
  { id: 'review', label: 'Review Room', icon: '📋', states: ['stalled'], col: 'col-span-1', row: 'row-span-1', color: 'border-amber-500/20', desc: 'Needs attention' },
  { id: 'alert', label: 'Alert Zone', icon: '🚨', states: ['stuck'], col: 'col-span-1', row: 'row-span-1', color: 'border-red-500/20', desc: 'Blocked / errored' },
];

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h`;
}

function OfficePageInner() {
  const [agents, setAgents] = useState<AgentHealth[]>([]);
  const [orgAgents, setOrgAgents] = useState<OrgAgent[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [popPos, setPopPos] = useState({ x: 0, y: 0 });

  const fetchData = useCallback(async () => {
    try {
      const [healthRes, orgRes, actRes] = await Promise.all([
        fetch('/api/agents/health'), fetch('/api/org-structure'), fetch('/api/activities?limit=20'),
      ]);
      const [healthData, orgData, actData] = await Promise.all([healthRes.json(), orgRes.json(), actRes.json()]);
      if (healthData.ok) setAgents(healthData.agents);
      if (orgData.ok) setOrgAgents(orgData.org.agents);
      if (Array.isArray(actData)) setActivities(actData);
    } catch (err) { console.error('[office] fetch error:', err); }
  }, []);

  useEffect(() => { fetchData(); const i = setInterval(fetchData, 10000); return () => clearInterval(i); }, [fetchData]);
  useEffect(() => {
    let es: EventSource | null = null;
    try { es = new EventSource('/api/sse'); es.onmessage = () => fetchData(); } catch { /* */ }
    return () => { if (es) es.close(); };
  }, [fetchData]);

  const getOrg = (id: string) => orgAgents.find(a => a.id === id || (id === 'main' && a.id === 'claw'));
  const getAgentsInRoom = (states: string[]) => agents.filter(a => states.includes(a.state));

  const activeCount = agents.filter(a => a.state === 'active').length;
  const idleCount = agents.filter(a => a.state === 'idle').length;
  const stalledCount = agents.filter(a => a.state === 'stalled').length;
  const stuckCount = agents.filter(a => a.state === 'stuck').length;

  const handleClickAgent = (id: string, e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setPopPos({ x: rect.right + 8, y: rect.top });
    setSelectedAgent(selectedAgent === id ? null : id);
  };

  const selAgent = selectedAgent ? agents.find(a => a.id === selectedAgent) : null;
  const selOrg = selectedAgent ? getOrg(selectedAgent) : null;

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] gap-3">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-gray-200">Office</h2>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            <span className="text-[10px] text-gray-500">Live</span>
          </div>
        </div>
        <div className="flex items-center gap-3 text-[10px]">
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-500" /><span className="text-gray-500">{activeCount} working</span></span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-gray-500" /><span className="text-gray-500">{idleCount} idle</span></span>
          {stalledCount > 0 && <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" /><span className="text-amber-400">{stalledCount} stalled</span></span>}
          {stuckCount > 0 && <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-500" /><span className="text-red-400">{stuckCount} stuck</span></span>}
        </div>
      </div>

      {/* Main content */}
      <div className="flex gap-3 flex-1 min-h-0 relative">
        {/* Office floor */}
        <div className="flex-1 flex flex-col gap-3 min-h-0">
          {/* Top row: Workspace (big) */}
          <div className={`flex-1 bg-[#0d0d0f] rounded-xl border ${ROOMS[0].color} p-4 min-h-0 overflow-hidden`}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm">{ROOMS[0].icon}</span>
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{ROOMS[0].label}</span>
              <span className="text-[9px] text-gray-700">{ROOMS[0].desc}</span>
              <span className="text-[9px] text-green-400 ml-auto">{getAgentsInRoom(ROOMS[0].states).length}</span>
            </div>
            <div className="flex flex-wrap gap-3">
              {getAgentsInRoom(ROOMS[0].states).map(agent => {
                const org = getOrg(agent.id);
                const style = stateStyles[agent.state];
                return (
                  <button key={agent.id} onClick={e => handleClickAgent(agent.id, e)}
                    className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 ${style.border} ${style.glow} bg-[#111113] min-w-[80px] transition-transform hover:scale-105 ${selectedAgent === agent.id ? 'ring-1 ring-amber-500/50' : ''}`}>
                    <div className="text-2xl">{AGENT_EMOJIS[agent.id] || org?.emoji || '🤖'}</div>
                    <div className="text-[10px] text-gray-200 font-medium">{org?.name || agent.id}</div>
                    <div className="flex items-center gap-1">
                      <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                      <span className="text-[8px] text-gray-500">{style.label}</span>
                    </div>
                    {agent.model && <div className="text-[7px] text-gray-600">{agent.model.replace('claude-', '')}</div>}
                  </button>
                );
              })}
              {getAgentsInRoom(ROOMS[0].states).length === 0 && (
                <div className="text-[10px] text-gray-700 py-4">No agents working right now</div>
              )}
            </div>
          </div>

          {/* Bottom row: other rooms */}
          <div className="grid grid-cols-4 gap-3 shrink-0">
            {ROOMS.slice(1).map(room => {
              const roomAgents = getAgentsInRoom(room.states);
              return (
                <div key={room.id} className={`bg-[#0d0d0f] rounded-xl border ${room.color} p-3`}>
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="text-xs">{room.icon}</span>
                    <span className="text-[9px] font-semibold text-gray-500 uppercase tracking-wider">{room.label}</span>
                    {roomAgents.length > 0 && <span className="text-[9px] text-gray-600 ml-auto">{roomAgents.length}</span>}
                  </div>
                  <div className="flex flex-wrap gap-2 min-h-[50px]">
                    {roomAgents.map(agent => {
                      const org = getOrg(agent.id);
                      const style = stateStyles[agent.state];
                      return (
                        <button key={agent.id} onClick={e => handleClickAgent(agent.id, e)}
                          className={`flex flex-col items-center gap-0.5 p-2 rounded-lg border ${style.border} bg-[#111113] transition-transform hover:scale-105 ${selectedAgent === agent.id ? 'ring-1 ring-amber-500/50' : ''}`}>
                          <div className="text-lg">{AGENT_EMOJIS[agent.id] || org?.emoji || '🤖'}</div>
                          <div className="text-[9px] text-gray-300">{org?.name || agent.id}</div>
                          <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                        </button>
                      );
                    })}
                    {roomAgents.length === 0 && (
                      <div className="text-[9px] text-gray-700 flex items-center">Empty</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Live Activity sidebar */}
        <div className="w-64 bg-[#111113] rounded-lg border border-[#1e1e21] flex flex-col overflow-hidden shrink-0">
          <div className="px-3 py-2.5 border-b border-[#1e1e21] flex items-center gap-2">
            <span className="text-[10px]">⚡</span>
            <span className="text-[10px] font-medium text-gray-300">Live Activity</span>
          </div>
          <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
            {activities.length === 0 ? (
              <div className="text-center py-6 text-[10px] text-gray-700">No recent activity</div>
            ) : (
              activities.map(act => {
                const org = getOrg(act.agentId);
                return (
                  <div key={act.id} className="flex gap-2">
                    <span className="text-sm mt-0.5 shrink-0">{AGENT_EMOJIS[act.agentId] || '🤖'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px]">
                        <span className="text-gray-300 font-medium">{org?.name || act.agentId}</span>
                        <span className="text-gray-600"> {act.action.replace(/_/g, ' ')}</span>
                      </div>
                      {act.target && <div className="text-[9px] text-gray-600 truncate">{act.target}</div>}
                      <div className="text-[8px] text-gray-700">{timeAgo(act.timestamp)}</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Floating agent detail popover */}
        {selectedAgent && selAgent && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setSelectedAgent(null)} />
            <div className="fixed z-50 w-72 shadow-2xl shadow-black/50"
              style={{
                top: Math.min(popPos.y, (typeof window !== 'undefined' ? window.innerHeight : 800) - 320),
                left: Math.min(popPos.x, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 300),
              }}>
              <div className="bg-[#111113] rounded-xl border border-[#1e1e21] overflow-hidden">
                <div className="p-3 border-b border-[#1e1e21] flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#1a1a1d] flex items-center justify-center text-xl">
                    {AGENT_EMOJIS[selAgent.id] || selOrg?.emoji || '🤖'}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-gray-100">{selOrg?.name || selAgent.id}</span>
                      <span className={`w-2 h-2 rounded-full ${stateStyles[selAgent.state].dot}`} />
                    </div>
                    <div className="text-[9px] text-gray-500">{selOrg?.role}</div>
                    {selAgent.model && <div className="text-[9px] text-amber-400/70">{selAgent.model.replace('claude-', '')}</div>}
                  </div>
                  <button onClick={() => setSelectedAgent(null)} className="text-gray-600 hover:text-gray-300 text-xs">✕</button>
                </div>
                <div className="p-3 space-y-2.5">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-[#0a0a0b] rounded-lg p-2 border border-[#1e1e21]">
                      <div className="text-[8px] text-gray-600">Status</div>
                      <div className="text-[10px] text-gray-300 capitalize">{stateStyles[selAgent.state].label}</div>
                    </div>
                    <div className="bg-[#0a0a0b] rounded-lg p-2 border border-[#1e1e21]">
                      <div className="text-[8px] text-gray-600">Sessions</div>
                      <div className="text-[10px] text-gray-300">{selAgent.sessionCount}</div>
                    </div>
                    <div className="bg-[#0a0a0b] rounded-lg p-2 border border-[#1e1e21]">
                      <div className="text-[8px] text-gray-600">Idle</div>
                      <div className="text-[10px] text-gray-300">{selAgent.idleMinutes != null ? `${selAgent.idleMinutes}m` : '—'}</div>
                    </div>
                    <div className="bg-[#0a0a0b] rounded-lg p-2 border border-[#1e1e21]">
                      <div className="text-[8px] text-gray-600">Squad</div>
                      <div className="text-[10px] text-gray-300">{selOrg?.squad?.replace('_', ' ') || '—'}</div>
                    </div>
                  </div>
                  {/* Recent activity for this agent */}
                  <div>
                    <div className="text-[8px] text-gray-600 uppercase tracking-wider mb-1">Recent Activity</div>
                    {activities.filter(a => a.agentId === selAgent.id).slice(0, 3).map(act => (
                      <div key={act.id} className="text-[9px] text-gray-500 py-0.5">
                        {act.action.replace(/_/g, ' ')} {act.target ? `• ${act.target}` : ''} <span className="text-gray-700">{timeAgo(act.timestamp)}</span>
                      </div>
                    ))}
                    {activities.filter(a => a.agentId === selAgent.id).length === 0 && (
                      <div className="text-[9px] text-gray-700">No recent activity</div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <a href="/chat" className="px-3 py-1.5 text-[9px] font-medium bg-amber-500/20 text-amber-400 rounded hover:bg-amber-500/30 border border-amber-500/20">
                      💬 Chat
                    </a>
                    <a href="/tasks" className="px-3 py-1.5 text-[9px] font-medium bg-[#1a1a1d] text-gray-400 rounded hover:text-gray-200 border border-[#1e1e21]">
                      📋 Tasks
                    </a>
                    <a href="/factory" className="px-3 py-1.5 text-[9px] font-medium bg-[#1a1a1d] text-gray-400 rounded hover:text-gray-200 border border-[#1e1e21]">
                      ⚙️ Factory
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default dynamic(() => Promise.resolve(OfficePageInner), { ssr: false });
