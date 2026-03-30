'use client';

import { useState, useEffect, useCallback } from 'react';

interface AgentInfo {
  id: string;
  name: string;
  emoji: string;
}

interface Activity {
  id: string;
  agentId: string;
  action: string;
  target: string | null;
  details: string | null;
  timestamp: string;
}

interface ActivityFeedProps {
  agents: AgentInfo[];
}

type TimeRange = 'hour' | 'today' | 'week';

const actionIcons: Record<string, string> = {
  task_completed: '✓',
  task_started: '▶',
  task_updated: '✏',
  file_created: '+',
  file_updated: '✏',
  session_started: '●',
  session_ended: '○',
  approval_requested: '⚑',
  approval_resolved: '✓',
  heartbeat_check: '♡',
};

const actionLabels: Record<string, string> = {
  task_started: 'started task',
  task_completed: 'completed task',
  task_updated: 'updated board',
  heartbeat_check: 'heartbeat',
  file_created: 'created file',
  file_updated: 'updated file',
  session_started: 'session started',
  session_ended: 'session ended',
  approval_requested: 'requested approval',
  approval_resolved: 'resolved approval',
};

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function ActivityFeed({ agents }: ActivityFeedProps) {
  const [agentFilter, setAgentFilter] = useState<string>('all');
  const [timeRange, setTimeRange] = useState<TimeRange>('today');
  const [activities, setActivities] = useState<Activity[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const limit = 20;

  const agentMap = new Map(agents.map(a => [a.id, a]));

  const fetchActivities = useCallback(async (reset: boolean) => {
    const offset = reset ? 0 : page * limit;
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
      timeRange,
    });
    if (agentFilter !== 'all') {
      params.set('agentId', agentFilter);
    }
    params.set('excludeHeartbeat', 'true');

    try {
      const res = await fetch(`/api/activities?${params}`);
      const data = await res.json();
      const items = data.activities || (Array.isArray(data) ? data : []);
      const filtered = items.filter((a: Activity) => a.action !== 'heartbeat_check');

      if (reset) {
        setActivities(filtered);
        setPage(0);
      } else {
        setActivities(prev => [...prev, ...filtered]);
      }
      setTotal(data.total ?? filtered.length);
    } catch {
      if (reset) setActivities([]);
    }
    setLoading(false);
  }, [agentFilter, timeRange, page]);

  useEffect(() => {
    setLoading(true);
    setPage(0);
    fetchActivities(true);
  }, [agentFilter, timeRange]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMore = () => {
    const next = page + 1;
    setPage(next);
    const offset = next * limit;
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
      timeRange,
    });
    if (agentFilter !== 'all') params.set('agentId', agentFilter);
    params.set('excludeHeartbeat', 'true');

    fetch(`/api/activities?${params}`)
      .then(res => res.json())
      .then(data => {
        const items = (data.activities || (Array.isArray(data) ? data : []))
          .filter((a: Activity) => a.action !== 'heartbeat_check');
        setActivities(prev => [...prev, ...items]);
      })
      .catch(() => {});
  };

  const hasMore = activities.length < total;

  return (
    <div className="bg-[#111113] rounded-lg border border-[#1e1e21] overflow-hidden">
      <div className="px-4 py-3 border-b border-[#1e1e21] flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
          <span className="text-xs font-medium text-gray-300">Activity Feed</span>
          {total > 0 && (
            <span className="text-[10px] text-gray-600">({total})</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <select
            value={agentFilter}
            onChange={e => setAgentFilter(e.target.value)}
            className="text-[10px] bg-[#0a0a0b] border border-[#1e1e21] text-gray-400 rounded px-2 py-1 outline-none focus:border-amber-500/30"
          >
            <option value="all">All Agents</option>
            {agents.map(a => (
              <option key={a.id} value={a.id}>
                {a.emoji} {a.name || a.id}
              </option>
            ))}
          </select>

          <div className="flex gap-1">
            {([
              { key: 'hour' as const, label: 'Last Hour' },
              { key: 'today' as const, label: 'Today' },
              { key: 'week' as const, label: 'This Week' },
            ]).map(t => (
              <button
                key={t.key}
                onClick={() => setTimeRange(t.key)}
                className={`text-[10px] px-2 py-1 rounded transition-colors ${
                  timeRange === t.key
                    ? 'bg-amber-500/20 text-amber-400'
                    : 'text-gray-500 hover:text-gray-400 hover:bg-[#1a1a1d]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="divide-y divide-[#1e1e21]">
        {loading ? (
          <div className="px-4 py-6 text-center text-gray-600 text-[11px]">Loading...</div>
        ) : activities.length === 0 ? (
          <div className="px-4 py-6 text-center text-gray-600 text-[11px]">No recent activity</div>
        ) : (
          <>
            {activities.map(act => {
              const info = agentMap.get(act.agentId);
              return (
                <div
                  key={act.id}
                  className="px-4 py-2.5 flex items-center gap-3 hover:bg-[#141416] transition-colors"
                >
                  <div className="w-6 h-6 rounded-full bg-[#1a1a1d] flex items-center justify-center text-xs shrink-0">
                    {info?.emoji || '🤖'}
                  </div>
                  <span className="text-[11px] text-amber-500/60 w-4 text-center shrink-0">
                    {actionIcons[act.action] || '·'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className="text-[11px] text-gray-300 font-medium capitalize">
                      {info?.name || act.agentId}
                    </span>
                    <span className="text-[11px] text-gray-600">
                      {' '}{actionLabels[act.action] || act.action}
                    </span>
                    {act.target && (
                      <span className="text-[11px] text-gray-700"> &mdash; {act.target}</span>
                    )}
                  </div>
                  <span className="text-[10px] text-gray-700 shrink-0">{timeAgo(act.timestamp)}</span>
                </div>
              );
            })}
            {hasMore && (
              <div className="px-4 py-2.5 text-center">
                <button
                  onClick={loadMore}
                  className="text-[10px] text-amber-400 hover:text-amber-300 px-3 py-1 bg-amber-500/10 rounded transition-colors"
                >
                  Load More
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
