'use client';

import { useState, useEffect } from 'react';

interface AgentInfo {
  id: string;
  name: string;
  emoji: string;
}

interface AgentMetricsProps {
  agents: AgentInfo[];
}

type MetricPeriod = 'today' | 'week';

interface AgentMetric {
  agentId: string;
  tasksCompleted: number;
  avgResponseTime: number;
  successRate: number;
}

function rateColor(rate: number): string {
  if (rate >= 90) return 'text-green-400';
  if (rate >= 70) return 'text-amber-400';
  return 'text-red-400';
}

function rateBg(rate: number): string {
  if (rate >= 90) return 'bg-green-500/10 border-green-500/20';
  if (rate >= 70) return 'bg-amber-500/10 border-amber-500/20';
  return 'bg-red-500/10 border-red-500/20';
}

function formatTime(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

export function AgentMetrics({ agents }: AgentMetricsProps) {
  const [period, setPeriod] = useState<MetricPeriod>('today');
  const [metrics, setMetrics] = useState<AgentMetric[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/agents/metrics?period=${period}`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setMetrics(data);
        } else if (data.metrics) {
          setMetrics(data.metrics);
        } else {
          setMetrics([]);
        }
      })
      .catch(() => setMetrics([]))
      .finally(() => setLoading(false));
  }, [period]);

  const agentMap = new Map(agents.map(a => [a.id, a]));

  return (
    <div className="bg-[#111113] rounded-lg border border-[#1e1e21] overflow-hidden">
      <div className="px-4 py-3 border-b border-[#1e1e21] flex items-center justify-between">
        <span className="text-xs font-medium text-gray-300">Agent Performance</span>
        <div className="flex gap-1">
          {(['today', 'week'] as const).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`text-[10px] px-2 py-1 rounded transition-colors ${
                period === p
                  ? 'bg-amber-500/20 text-amber-400'
                  : 'text-gray-500 hover:text-gray-400 hover:bg-[#1a1a1d]'
              }`}
            >
              {p === 'today' ? 'Today' : 'This Week'}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4">
        {loading ? (
          <div className="text-center text-gray-600 text-[11px] py-6">Loading...</div>
        ) : metrics.length === 0 ? (
          <div className="text-center text-gray-600 text-[11px] py-6">No activity yet</div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {metrics.map(m => {
              const info = agentMap.get(m.agentId);
              return (
                <div
                  key={m.agentId}
                  className={`rounded-lg border p-3 ${rateBg(m.successRate)}`}
                >
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="text-sm">{info?.emoji || '🤖'}</span>
                    <span className="text-[11px] text-gray-200 font-medium capitalize truncate">
                      {info?.name || m.agentId}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px]">
                      <span className="text-gray-500">Tasks</span>
                      <span className="text-gray-300">{m.tasksCompleted}</span>
                    </div>
                    <div className="flex justify-between text-[10px]">
                      <span className="text-gray-500">Avg Time</span>
                      <span className="text-gray-300">{formatTime(m.avgResponseTime)}</span>
                    </div>
                    <div className="flex justify-between text-[10px]">
                      <span className="text-gray-500">Success</span>
                      <span className={rateColor(m.successRate)}>{m.successRate.toFixed(0)}%</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
