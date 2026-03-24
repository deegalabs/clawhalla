'use client';

import { useState, useEffect } from 'react';

interface AgentMeta {
  emoji: string;
  role: string;
  model: string;
  tier: number;
  squad: string | null;
  reportsTo: string;
}

const AGENT_METADATA: Record<string, AgentMeta> = {
  main: { emoji: '🦞', role: 'System Controller', model: 'claude-opus-4-5', tier: 0, squad: null, reportsTo: 'Daniel (CEO)' },
  odin: { emoji: '👁️', role: 'CTO', model: 'claude-sonnet-4-6', tier: 1, squad: 'dev_squad', reportsTo: 'Claw' },
  vidar: { emoji: '⛓️', role: 'Blockchain Architect', model: 'claude-sonnet-4-6', tier: 1, squad: 'blockchain_squad', reportsTo: 'Claw' },
  saga: { emoji: '📜', role: 'Research Lead (CPO)', model: 'claude-sonnet-4-6', tier: 1, squad: 'product_squad', reportsTo: 'Claw' },
  thor: { emoji: '⚡', role: 'Tech Lead', model: 'claude-sonnet-4-5', tier: 2, squad: 'dev_squad', reportsTo: 'Odin' },
  frigg: { emoji: '👑', role: 'Coordinator / PA', model: 'claude-haiku-4-5', tier: 2, squad: 'clop_cabinet', reportsTo: 'Odin' },
  tyr: { emoji: '⚖️', role: 'Security Auditor', model: 'claude-opus-4-5', tier: 2, squad: 'blockchain_squad', reportsTo: 'Vidar' },
  freya: { emoji: '✨', role: 'Senior Developer', model: 'claude-sonnet-4-5', tier: 3, squad: 'dev_squad', reportsTo: 'Thor' },
  heimdall: { emoji: '👁️‍🗨️', role: 'QA / Observability', model: 'claude-haiku-4-5', tier: 3, squad: 'dev_squad', reportsTo: 'Thor' },
  volund: { emoji: '🔨', role: 'Developer / GitHub', model: 'claude-sonnet-4-5', tier: 3, squad: 'dev_squad', reportsTo: 'Thor' },
  sindri: { emoji: '🔥', role: 'Solidity Developer', model: 'claude-sonnet-4-5', tier: 3, squad: 'blockchain_squad', reportsTo: 'Vidar' },
  skadi: { emoji: '❄️', role: 'Cairo Developer', model: 'claude-sonnet-4-5', tier: 3, squad: 'blockchain_squad', reportsTo: 'Vidar' },
  mimir: { emoji: '🧠', role: 'Knowledge Curator', model: 'claude-sonnet-4-5', tier: 3, squad: 'clop_cabinet', reportsTo: 'Frigg' },
  bragi: { emoji: '🎭', role: 'Content Creator', model: 'claude-sonnet-4-5', tier: 3, squad: 'clop_cabinet', reportsTo: 'Frigg' },
  loki: { emoji: '🎲', role: 'Monitor / Analytics', model: 'claude-sonnet-4-5', tier: 3, squad: 'clop_cabinet', reportsTo: 'Frigg' },
};

const squads = [
  { id: 'dev_squad', name: 'Dev Squad', chief: 'Odin', domain: 'Software development, infrastructure, and DevOps', color: 'blue' },
  { id: 'blockchain_squad', name: 'Blockchain Squad', chief: 'Vidar', domain: 'Smart contracts, Solidity, Cairo, and Web3', color: 'purple' },
  { id: 'clop_cabinet', name: 'Clop Cabinet', chief: 'Frigg', domain: 'Personal assistance, content, research, and analytics', color: 'green' },
  { id: 'product_squad', name: 'Product Squad', chief: 'Saga', domain: 'Product strategy, research, and market analysis', color: 'amber' },
];

interface Agent extends AgentMeta {
  id: string;
  name: string;
  status: 'active' | 'idle' | 'offline';
  lastActivity?: number;
  liveModel?: string;
}

const modelColors: Record<string, string> = {
  'claude-opus-4-5': 'bg-red-500/20 text-red-400 border-red-500/50',
  'claude-opus-4-6': 'bg-red-500/20 text-red-400 border-red-500/50',
  'claude-sonnet-4-6': 'bg-amber-500/20 text-amber-400 border-amber-500/50',
  'claude-sonnet-4-5': 'bg-blue-500/20 text-blue-400 border-blue-500/50',
  'claude-haiku-4-5': 'bg-green-500/20 text-green-400 border-green-500/50',
};

const squadBorderColors: Record<string, string> = {
  dev_squad: 'border-l-blue-500',
  blockchain_squad: 'border-l-purple-500',
  clop_cabinet: 'border-l-green-500',
  product_squad: 'border-l-amber-500',
};

const statusColors = {
  active: { bg: 'bg-green-500/10', text: 'text-green-500', dot: 'bg-green-500' },
  idle: { bg: 'bg-amber-500/10', text: 'text-amber-500', dot: 'bg-amber-500' },
  offline: { bg: 'bg-gray-500/10', text: 'text-gray-500', dot: 'bg-gray-500' },
};

function getStatus(lastActivity?: number): 'active' | 'idle' | 'offline' {
  if (!lastActivity) return 'offline';
  const diff = Date.now() - lastActivity;
  if (diff < 2 * 60 * 1000) return 'active';
  if (diff < 30 * 60 * 1000) return 'idle';
  return 'offline';
}

function timeAgo(ms?: number): string {
  if (!ms) return '';
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const tierLabels = ['PLATFORM', 'EXECUTIVE', 'MANAGEMENT', 'EXECUTION'];

function AgentCard({ agent }: { agent: Agent }) {
  const displayModel = agent.liveModel || agent.model;
  const modelColor = modelColors[displayModel] || 'bg-gray-500/20 text-gray-400';
  const squadBorder = agent.squad ? squadBorderColors[agent.squad] : 'border-l-gray-500';
  const statusStyle = statusColors[agent.status];
  
  return (
    <div className={`bg-gray-800 rounded-lg p-4 border border-gray-700 border-l-4 ${squadBorder} hover:border-gray-600 transition-colors`}>
      <div className="text-3xl mb-2">{agent.emoji}</div>
      <div className="font-semibold text-gray-100">{agent.name}</div>
      <div className="text-sm text-gray-400 mt-1">{agent.role}</div>
      <div className={`inline-block px-2 py-0.5 text-xs rounded border mt-2 ${modelColor}`}>
        {displayModel.replace('claude-', '')}
      </div>
      <div className="flex items-center gap-2 mt-3">
        <span className={`w-2 h-2 rounded-full ${statusStyle.dot}`}></span>
        <span className={`text-xs ${statusStyle.text}`}>{agent.status}</span>
        {agent.lastActivity && (
          <span className="text-xs text-gray-600">{timeAgo(agent.lastActivity)}</span>
        )}
      </div>
      <div className="text-xs text-gray-500 mt-2">reports to: {agent.reportsTo}</div>
    </div>
  );
}

export default function TeamPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchSessions() {
      try {
        const res = await fetch('/api/gateway/sessions');
        const data = await res.json();
        
        const sessionMap = new Map<string, { lastActivity?: number; model?: string }>();
        
        if (data.ok && data.sessions) {
          const sessionList = Array.isArray(data.sessions) 
            ? data.sessions 
            : data.sessions.sessions || [];
          
          for (const s of sessionList) {
            const rawId = s.agentId || s.key || s.id || '';
            const id = rawId.replace(/^agent:/, '').split(':')[0];
            if (id && AGENT_METADATA[id]) {
              sessionMap.set(id, {
                lastActivity: s.lastActivityMs || s.lastActivity,
                model: s.model,
              });
            }
          }
        }
        
        // Build agents list
        const agentList: Agent[] = Object.entries(AGENT_METADATA).map(([id, meta]) => {
          const session = sessionMap.get(id);
          return {
            id,
            name: id.charAt(0).toUpperCase() + id.slice(1),
            ...meta,
            status: getStatus(session?.lastActivity),
            lastActivity: session?.lastActivity,
            liveModel: session?.model,
          };
        });
        
        setAgents(agentList);
      } catch {
        // Fallback to static data
        setAgents(Object.entries(AGENT_METADATA).map(([id, meta]) => ({
          id,
          name: id.charAt(0).toUpperCase() + id.slice(1),
          ...meta,
          status: 'offline' as const,
        })));
      }
      setLoading(false);
    }
    
    fetchSessions();
    const interval = setInterval(fetchSessions, 30000);
    return () => clearInterval(interval);
  }, []);

  const tier0 = agents.filter(a => a.tier === 0);
  const tier1 = agents.filter(a => a.tier === 1);
  const tier2 = agents.filter(a => a.tier === 2);
  const tier3 = agents.filter(a => a.tier === 3);
  
  const activeCount = agents.filter(a => a.status === 'active').length;
  const idleCount = agents.filter(a => a.status === 'idle').length;

  if (loading) {
    return <div className="text-center py-8 text-gray-500">Loading team...</div>;
  }

  return (
    <div className="space-y-8">
      {/* Mission Statement */}
      <div className="bg-amber-900/20 border border-amber-700 rounded-lg p-6 text-center">
        <p className="text-lg italic text-amber-200">
          "Enterprise Autonomous AI Operating System — Monte seu time de desenvolvimento AI"
        </p>
      </div>

      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-100">Meet the Team</h2>
          <p className="text-gray-400 mt-1">{agents.length} AI agents across 4 squads</p>
        </div>
        <div className="flex gap-4 text-sm">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500"></span>
            <span className="text-gray-400">{activeCount} active</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
            <span className="text-gray-400">{idleCount} idle</span>
          </div>
        </div>
      </div>

      {/* Tier 0 - Platform */}
      <div>
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">
          Tier 0 — {tierLabels[0]}
        </div>
        <div className="flex justify-center">
          <div className="w-80">
            {tier0[0] && <AgentCard agent={tier0[0]} />}
          </div>
        </div>
        <div className="flex justify-center my-4">
          <div className="w-px h-8 bg-gray-700"></div>
        </div>
      </div>

      {/* Tier 1 - Executive */}
      <div>
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">
          Tier 1 — {tierLabels[1]}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto">
          {tier1.map(agent => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
        <div className="flex justify-center my-4">
          <div className="w-px h-8 bg-gray-700"></div>
        </div>
      </div>

      {/* Tier 2 - Management */}
      <div>
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">
          Tier 2 — {tierLabels[2]}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto">
          {tier2.map(agent => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
        <div className="flex justify-center my-4">
          <div className="w-px h-8 bg-gray-700"></div>
        </div>
      </div>

      {/* Tier 3 - Execution */}
      <div>
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">
          Tier 3 — {tierLabels[3]}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {tier3.map(agent => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      </div>

      {/* Squad Summary */}
      <div className="mt-12">
        <h3 className="text-xl font-semibold text-gray-100 mb-4">Squads</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {squads.map(squad => {
            const members = agents.filter(a => a.squad === squad.id);
            const activeMembers = members.filter(m => m.status === 'active').length;
            const borderColor = {
              blue: 'border-l-blue-500',
              purple: 'border-l-purple-500',
              green: 'border-l-green-500',
              amber: 'border-l-amber-500',
            }[squad.color];
            
            return (
              <div key={squad.id} className={`bg-gray-900 rounded-lg p-4 border border-gray-800 border-l-4 ${borderColor}`}>
                <div className="flex justify-between items-start">
                  <h4 className="font-semibold text-gray-100">{squad.name}</h4>
                  {activeMembers > 0 && (
                    <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded">
                      {activeMembers} active
                    </span>
                  )}
                </div>
                <div className="text-sm text-gray-400 mt-1">Chief: {squad.chief}</div>
                <p className="text-xs text-gray-500 mt-2">{squad.domain}</p>
                <div className="mt-3 flex flex-wrap gap-1">
                  {members.map(m => (
                    <span 
                      key={m.id} 
                      className={`text-xs px-2 py-0.5 rounded ${
                        m.status === 'active' ? 'bg-green-500/10 text-green-400' :
                        m.status === 'idle' ? 'bg-amber-500/10 text-amber-400' :
                        'bg-gray-800 text-gray-400'
                      }`}
                    >
                      {m.emoji} {m.name}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
