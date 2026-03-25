'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

interface OrgAgent {
  id: string;
  name: string;
  emoji: string;
  role: string;
  model: string;
  tier: number;
}

interface Agent extends OrgAgent {
  status: 'active' | 'idle' | 'offline';
  lastActivity?: number;
}

interface Activity {
  id: string;
  agentId: string;
  action: string;
  target: string | null;
  details: string | null;
  timestamp: string;
}

function getStatus(lastActivity: number | undefined, gatewayConnected: boolean): 'active' | 'idle' | 'offline' {
  if (!gatewayConnected) return 'offline';
  if (!lastActivity) return 'idle';
  const diff = Date.now() - lastActivity;
  if (diff < 2 * 60 * 1000) return 'active';
  if (diff < 30 * 60 * 1000) return 'idle';
  return 'idle';
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

const actionLabels: Record<string, string> = {
  task_started: 'started task',
  task_completed: 'completed task',
  task_updated: 'updated task',
  heartbeat_check: 'heartbeat check',
  approval_requested: 'requested approval',
  approval_resolved: 'resolved approval',
  file_created: 'created file',
  file_updated: 'updated file',
  session_started: 'session started',
  session_ended: 'session ended',
};

export default function DashboardPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [gatewayOk, setGatewayOk] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(Date.now());

  const fetchData = useCallback(async () => {
    try {
      // Fetch org structure, gateway sessions, and activities in parallel
      const [orgRes, sessRes, actRes] = await Promise.all([
        fetch('/api/org-structure'),
        fetch('/api/gateway/sessions'),
        fetch('/api/activities?limit=10'),
      ]);

      const orgData = await orgRes.json();
      const sessData = await sessRes.json();
      const actData = await actRes.json();

      const gwOk = sessData.ok === true;
      setGatewayOk(gwOk);

      // Build session map
      const sessionMap = new Map<string, { lastActivity?: number; model?: string }>();
      if (gwOk && sessData.sessions) {
        const sessionList = Array.isArray(sessData.sessions)
          ? sessData.sessions
          : sessData.sessions.sessions || [];
        for (const s of sessionList) {
          const rawId = s.agentId || s.key || s.id || '';
          const id = rawId.replace(/^agent:/, '').split(':')[0];
          if (id) {
            sessionMap.set(id, {
              lastActivity: s.lastActivityMs || s.lastActivity,
              model: s.model,
            });
          }
        }
      }

      if (orgData.ok && orgData.org) {
        const mapped: Agent[] = orgData.org.agents.map((a: OrgAgent) => {
          const session = sessionMap.get(a.id);
          return {
            ...a,
            status: getStatus(session?.lastActivity, gwOk),
            lastActivity: session?.lastActivity,
          };
        });
        mapped.sort((a, b) => {
          if (a.tier !== b.tier) return a.tier - b.tier;
          return a.name.localeCompare(b.name);
        });
        setAgents(mapped);
      }

      if (Array.isArray(actData)) {
        setActivities(actData);
      }
    } catch {
      setGatewayOk(false);
    }
    setLoading(false);
    setLastRefresh(Date.now());
  }, []);

  // Initial fetch + polling
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // SSE: auto-refresh on workspace file changes
  useEffect(() => {
    let es: EventSource | null = null;
    try {
      es = new EventSource('/api/sse');
      es.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'file_change') {
          // Refresh data when workspace files change
          fetchData();
        }
      };
      es.onerror = () => {
        // Reconnect handled automatically by EventSource
      };
    } catch {
      // SSE not available — fall back to polling only
    }
    return () => { if (es) es.close(); };
  }, [fetchData]);

  const activeCount = agents.filter(a => a.status === 'active').length;
  const idleCount = agents.filter(a => a.status === 'idle').length;

  // Find agent emoji by id
  const agentEmoji = (id: string) => {
    const agent = agents.find(a => a.id === id);
    return agent?.emoji || '🤖';
  };

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

      {/* Activity Feed + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
          <h3 className="text-xl font-semibold text-gray-100 mb-4">Recent Activity</h3>
          <div className="space-y-3">
            {activities.length === 0 ? (
              <p className="text-gray-500 text-sm">No recent activity</p>
            ) : (
              activities.map(act => (
                <div key={act.id} className="flex items-start gap-3 py-2 border-b border-gray-800 last:border-0">
                  <span className="text-lg">{agentEmoji(act.agentId)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-200">
                      <span className="font-medium capitalize">{act.agentId}</span>
                      {' '}
                      <span className="text-gray-400">
                        {actionLabels[act.action] || act.action}
                      </span>
                      {act.target && (
                        <span className="text-gray-500"> — {act.target}</span>
                      )}
                    </div>
                    {act.details && (
                      <p className="text-xs text-gray-500 mt-0.5 truncate">{act.details}</p>
                    )}
                    <div className="text-xs text-gray-600 mt-0.5">
                      {timeAgo(new Date(act.timestamp).getTime())}
                    </div>
                  </div>
                </div>
              ))
            )}
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
