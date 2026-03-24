'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

// Fallback metadata for agents we know about
const AGENT_METADATA: Record<string, { emoji: string; role: string; tier: number }> = {
  main: { emoji: '🦞', role: 'System Controller', tier: 0 },
  odin: { emoji: '👁️', role: 'CTO', tier: 1 },
  vidar: { emoji: '⛓️', role: 'Blockchain Architect', tier: 1 },
  saga: { emoji: '📜', role: 'Research Lead (CPO)', tier: 1 },
  thor: { emoji: '⚡', role: 'Tech Lead', tier: 2 },
  frigg: { emoji: '👑', role: 'Coordinator / PA', tier: 2 },
  tyr: { emoji: '⚖️', role: 'Security Auditor', tier: 2 },
  freya: { emoji: '✨', role: 'Senior Developer', tier: 3 },
  heimdall: { emoji: '👁️‍🗨️', role: 'QA / Observability', tier: 3 },
  volund: { emoji: '🔨', role: 'Developer / GitHub', tier: 3 },
  sindri: { emoji: '🔥', role: 'Solidity Developer', tier: 3 },
  skadi: { emoji: '❄️', role: 'Cairo Developer', tier: 3 },
  mimir: { emoji: '🧠', role: 'Knowledge Curator', tier: 3 },
  bragi: { emoji: '🎭', role: 'Content Creator', tier: 3 },
  loki: { emoji: '🎲', role: 'Monitor / Analytics', tier: 3 },
};

interface Agent {
  id: string;
  name: string;
  emoji: string;
  role: string;
  model: string;
  status: 'active' | 'idle' | 'offline';
  lastActivity?: number;
}

function getDisplayName(id: string): string {
  const clean = id.replace(/^:subagent:/, '').replace(/:$/, '').replace(/^agent:/, '');
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

function getStatus(lastActivity?: number): 'active' | 'idle' | 'offline' {
  if (!lastActivity) return 'offline';
  const now = Date.now();
  const diff = now - lastActivity;
  if (diff < 2 * 60 * 1000) return 'active';
  if (diff < 30 * 60 * 1000) return 'idle';
  return 'offline';
}

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const statusColors = {
  active: { bg: 'bg-green-500/10', text: 'text-green-500', dot: 'bg-green-500' },
  idle: { bg: 'bg-amber-500/10', text: 'text-amber-500', dot: 'bg-amber-500' },
  offline: { bg: 'bg-gray-500/10', text: 'text-gray-500', dot: 'bg-gray-500' },
};

export default function DashboardPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [gatewayOk, setGatewayOk] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(Date.now());

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch('/api/gateway/sessions');
        const data = await res.json();
        
        if (data.ok && data.sessions) {
          setGatewayOk(true);
          const sessionList = Array.isArray(data.sessions) 
            ? data.sessions 
            : data.sessions.sessions || [];
          
          // Build agent list from sessions + metadata
          const seenIds = new Set<string>();
          const mapped: Agent[] = [];
          
          for (const s of sessionList) {
            const rawId = s.agentId || s.key || s.id || 'unknown';
            const id = rawId.replace(/^agent:/, '').split(':')[0];
            if (seenIds.has(id)) continue;
            seenIds.add(id);
            
            const meta = AGENT_METADATA[id] || { emoji: '🤖', role: 'Agent', tier: 3 };
            mapped.push({
              id,
              name: getDisplayName(id),
              emoji: meta.emoji,
              role: meta.role,
              model: s.model || 'unknown',
              status: getStatus(s.lastActivityMs || s.lastActivity),
              lastActivity: s.lastActivityMs || s.lastActivity,
            });
          }
          
          // Add missing agents from metadata
          for (const [id, meta] of Object.entries(AGENT_METADATA)) {
            if (!seenIds.has(id)) {
              mapped.push({
                id,
                name: getDisplayName(id),
                emoji: meta.emoji,
                role: meta.role,
                model: 'unknown',
                status: 'offline',
              });
            }
          }
          
          // Sort by tier then name
          mapped.sort((a, b) => {
            const tierA = AGENT_METADATA[a.id]?.tier ?? 3;
            const tierB = AGENT_METADATA[b.id]?.tier ?? 3;
            if (tierA !== tierB) return tierA - tierB;
            return a.name.localeCompare(b.name);
          });
          
          setAgents(mapped);
        } else {
          setGatewayOk(false);
          setAgents(Object.entries(AGENT_METADATA).map(([id, meta]) => ({
            id,
            name: getDisplayName(id),
            emoji: meta.emoji,
            role: meta.role,
            model: 'unknown',
            status: 'offline' as const,
          })));
        }
      } catch {
        setGatewayOk(false);
        setAgents(Object.entries(AGENT_METADATA).map(([id, meta]) => ({
          id,
          name: getDisplayName(id),
          emoji: meta.emoji,
          role: meta.role,
          model: 'unknown',
          status: 'offline' as const,
        })));
      }
      setLoading(false);
      setLastRefresh(Date.now());
    }
    
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const activeCount = agents.filter(a => a.status === 'active').length;
  const idleCount = agents.filter(a => a.status === 'idle').length;

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
          <div className="text-sm text-gray-400 mb-2">Active Agents</div>
          <div className="text-3xl font-bold text-green-500">{activeCount}</div>
          <div className="text-xs text-gray-500 mt-1">{idleCount} idle</div>
        </div>
        <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
          <div className="text-sm text-gray-400 mb-2">Total Agents</div>
          <div className="text-3xl font-bold text-amber-500">{agents.length}</div>
        </div>
        <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
          <div className="text-sm text-gray-400 mb-2">Gateway Status</div>
          <div className={`text-3xl font-bold ${gatewayOk ? 'text-green-500' : 'text-red-500'}`}>
            {gatewayOk ? 'Online' : 'Offline'}
          </div>
        </div>
        <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
          <div className="text-sm text-gray-400 mb-2">Last Refresh</div>
          <div className="text-3xl font-bold text-blue-500">
            {loading ? '...' : timeAgo(lastRefresh)}
          </div>
        </div>
      </div>

      {/* Organization Grid */}
      <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-semibold text-gray-100">Organization</h3>
          <span className="text-xs text-gray-500">
            Refreshed {timeAgo(lastRefresh)}
          </span>
        </div>
        
        {loading ? (
          <div className="text-center py-8 text-gray-500">Loading agents...</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {agents.map(agent => {
              const colors = statusColors[agent.status];
              return (
                <div
                  key={agent.id}
                  className="bg-gray-800 rounded-lg p-4 border border-gray-700 hover:border-amber-500 transition-colors"
                >
                  <div className="text-3xl mb-2">{agent.emoji}</div>
                  <div className="text-sm font-semibold text-gray-100">{agent.name}</div>
                  <div className="text-xs text-gray-400 mt-1">{agent.role}</div>
                  <div className="mt-2 flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${colors.dot}`}></span>
                    <span className={`text-xs ${colors.text}`}>{agent.status}</span>
                  </div>
                  {agent.lastActivity && (
                    <div className="text-xs text-gray-600 mt-1">
                      {timeAgo(agent.lastActivity)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
          <h3 className="text-xl font-semibold text-gray-100 mb-4">Recent Activity</h3>
          <div className="space-y-3">
            <p className="text-gray-500 text-sm">Activity feed coming soon...</p>
          </div>
        </div>
        <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
          <h3 className="text-xl font-semibold text-gray-100 mb-4">Quick Actions</h3>
          <div className="space-y-3">
            <Link
              href="/tasks"
              className="block p-4 bg-gray-800 hover:bg-gray-750 rounded-lg border border-gray-700 hover:border-amber-500 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">✓</span>
                <div>
                  <div className="font-semibold text-gray-100">View Tasks</div>
                  <div className="text-sm text-gray-400">Kanban board and assignments</div>
                </div>
              </div>
            </Link>
            <Link
              href="/approvals"
              className="block p-4 bg-gray-800 hover:bg-gray-750 rounded-lg border border-gray-700 hover:border-amber-500 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">✋</span>
                <div>
                  <div className="font-semibold text-gray-100">Pending Approvals</div>
                  <div className="text-sm text-gray-400">Review and approve requests</div>
                </div>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
