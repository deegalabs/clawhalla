'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSquad } from '@/hooks/use-squad';
import { AGENT_EMOJIS } from '@/lib/agents';

// ─── Types ──────────────────────────────────────────────────────

interface LogEntry {
  id: string;
  type: 'activity' | 'task' | 'cost';
  agentId: string;
  action: string;
  title: string;
  details: string | null;
  status?: string;
  tokens?: { input: number; output: number };
  costCents?: number;
  durationMs?: number;
  timestamp: string;
}

interface Stats {
  totalCostCents: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTaskRuns: number;
  totalActivities: number;
}

type FilterType = 'all' | 'activity' | 'task' | 'cost';

// ─── Helpers ────────────────────────────────────────────────────

function timeAgo(ts: string): string {
  const ms = Date.now() - new Date(ts).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatCost(cents: number): string {
  if (cents >= 100) return `$${(cents / 100).toFixed(2)}`;
  return `${cents}c`;
}

const ACTION_ICONS: Record<string, string> = {
  chat_response: '💬',
  chat_error: '⚠️',
  task_completed: '✅',
  task_done: '✅',
  task_failed: '❌',
  task_timeout: '⏰',
  task_running: '⚙️',
  file_created: '📄',
  file_updated: '📝',
  agent_created: '🤖',
  session_started: '🔗',
  session_ended: '🔚',
  heartbeat_check: '💓',
  approval_requested: '📋',
  approval_resolved: '✅',
  chat: '💬',
  task: '🔧',
  cost: '💰',
};

const TYPE_COLORS: Record<string, string> = {
  activity: 'border-blue-500/30 bg-blue-500/5',
  task: 'border-amber-500/30 bg-amber-500/5',
  cost: 'border-green-500/30 bg-green-500/5',
};

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  activity: { label: 'Activity', color: 'text-blue-400 bg-blue-500/10' },
  task: { label: 'Task Run', color: 'text-amber-400 bg-amber-500/10' },
  cost: { label: 'Cost', color: 'text-green-400 bg-green-500/10' },
};

const STATUS_COLORS: Record<string, string> = {
  done: 'text-green-400',
  failed: 'text-red-400',
  timeout: 'text-yellow-400',
  running: 'text-blue-400',
};

// ─── Stat Card ──────────────────────────────────────────────────

function StatCard({ label, value, sub, icon }: { label: string; value: string; sub?: string; icon: string }) {
  return (
    <div className="bg-[#111113] border border-[#1e1e21] rounded-lg p-3">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm">{icon}</span>
        <span className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-lg font-semibold text-gray-100">{value}</div>
      {sub && <div className="text-[10px] text-gray-500 mt-0.5">{sub}</div>}
    </div>
  );
}

// ─── Log Entry Row ──────────────────────────────────────────────

function LogRow({ entry, expanded, onToggle }: { entry: LogEntry; expanded: boolean; onToggle: () => void }) {
  const emoji = AGENT_EMOJIS[entry.agentId] || '🤖';
  const icon = ACTION_ICONS[entry.action] || ACTION_ICONS[entry.type] || '📌';
  const typeInfo = TYPE_LABELS[entry.type];

  return (
    <div className={`border-l-2 ${TYPE_COLORS[entry.type]} rounded-r-lg transition-colors`}>
      <button
        onClick={onToggle}
        className="w-full text-left px-3 py-2.5 hover:bg-[#1a1a1d]/50 transition-colors"
      >
        <div className="flex items-start gap-2.5">
          {/* Icon */}
          <span className="text-sm mt-0.5 shrink-0">{icon}</span>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-gray-200 truncate max-w-[400px]">
                {entry.title}
              </span>
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${typeInfo.color}`}>
                {typeInfo.label}
              </span>
              {entry.status && (
                <span className={`text-[9px] font-medium ${STATUS_COLORS[entry.status] || 'text-gray-400'}`}>
                  {entry.status}
                </span>
              )}
            </div>

            <div className="flex items-center gap-3 mt-1">
              <span className="text-[10px] text-gray-500">
                {emoji} @{entry.agentId}
              </span>
              {entry.tokens && (
                <span className="text-[10px] text-gray-600">
                  {formatTokens(entry.tokens.input)} in / {formatTokens(entry.tokens.output)} out
                </span>
              )}
              {entry.costCents != null && entry.costCents > 0 && (
                <span className="text-[10px] text-green-500/70">
                  {formatCost(entry.costCents)}
                </span>
              )}
              {entry.durationMs != null && (
                <span className="text-[10px] text-gray-600">
                  {entry.durationMs >= 1000 ? `${(entry.durationMs / 1000).toFixed(1)}s` : `${entry.durationMs}ms`}
                </span>
              )}
            </div>
          </div>

          {/* Timestamp */}
          <span className="text-[10px] text-gray-600 shrink-0 mt-0.5">
            {timeAgo(entry.timestamp)}
          </span>
        </div>
      </button>

      {/* Expanded details */}
      {expanded && entry.details && (
        <div className="px-3 pb-3 pl-9">
          <pre className="text-[11px] text-gray-400 bg-[#0a0a0b] border border-[#1e1e21] rounded p-2 whitespace-pre-wrap max-h-40 overflow-y-auto font-mono">
            {entry.details}
          </pre>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────

export default function LogsPage() {
  const { activeSquad } = useSquad();
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [filterAgent, setFilterAgent] = useState<string>('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [agents, setAgents] = useState<string[]>([]);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchLogs = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterType !== 'all') params.set('type', filterType);
      if (filterAgent) params.set('agent', filterAgent);
      params.set('limit', '100');

      const res = await fetch(`/api/logs?${params}`);
      const data = await res.json();
      if (data.ok) {
        setEntries(data.entries);
        setStats(data.stats);
        // Collect unique agents
        const uniqueAgents = [...new Set(data.entries.map((e: LogEntry) => e.agentId))] as string[];
        setAgents(prev => {
          const merged = [...new Set([...prev, ...uniqueAgents])];
          return merged.sort();
        });
      }
    } catch (err) {
      console.error('[logs] fetch error:', err);
    }
    setLoading(false);
  }, [filterType, filterAgent]);

  useEffect(() => {
    setLoading(true);
    fetchLogs();
  }, [fetchLogs]);

  // Auto-refresh every 10s
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchLogs, 10_000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchLogs]);

  const filterButtons: { id: FilterType; label: string; icon: string }[] = [
    { id: 'all', label: 'All', icon: '📋' },
    { id: 'activity', label: 'Activity', icon: '⚡' },
    { id: 'task', label: 'Tasks', icon: '🔧' },
    { id: 'cost', label: 'Cost', icon: '💰' },
  ];

  return (
    <div className="space-y-4 max-w-5xl">
      {/* Stats row */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            icon="⚡"
            label="Activities"
            value={String(stats.totalActivities)}
            sub="total events"
          />
          <StatCard
            icon="🔧"
            label="Task Runs"
            value={String(stats.totalTaskRuns)}
            sub="autonomous"
          />
          <StatCard
            icon="🔤"
            label="Tokens Used"
            value={formatTokens(stats.totalInputTokens + stats.totalOutputTokens)}
            sub={`${formatTokens(stats.totalInputTokens)} in / ${formatTokens(stats.totalOutputTokens)} out`}
          />
          <StatCard
            icon="💰"
            label="Total Cost"
            value={formatCost(stats.totalCostCents)}
            sub="estimated"
          />
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Type filter */}
        <div className="flex items-center bg-[#111113] border border-[#1e1e21] rounded-lg overflow-hidden">
          {filterButtons.map(f => (
            <button
              key={f.id}
              onClick={() => setFilterType(f.id)}
              className={`px-3 py-1.5 text-[11px] font-medium transition-colors ${
                filterType === f.id
                  ? 'bg-amber-500/10 text-amber-400'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-[#1a1a1d]'
              }`}
            >
              <span className="mr-1">{f.icon}</span>
              {f.label}
            </button>
          ))}
        </div>

        {/* Agent filter */}
        <select
          value={filterAgent}
          onChange={e => setFilterAgent(e.target.value)}
          className="bg-[#111113] border border-[#1e1e21] rounded-lg px-3 py-1.5 text-[11px] text-gray-300 focus:outline-none focus:border-amber-500/50"
        >
          <option value="">All agents</option>
          {agents.map(a => (
            <option key={a} value={a}>{AGENT_EMOJIS[a] || '🤖'} {a}</option>
          ))}
        </select>

        {/* Auto-refresh toggle */}
        <button
          onClick={() => setAutoRefresh(!autoRefresh)}
          className={`px-3 py-1.5 rounded-lg border text-[11px] font-medium transition-colors ${
            autoRefresh
              ? 'border-green-500/30 text-green-400 bg-green-500/5'
              : 'border-[#1e1e21] text-gray-500 bg-[#111113]'
          }`}
        >
          {autoRefresh ? '● Live' : '○ Paused'}
        </button>

        {/* Refresh button */}
        <button
          onClick={() => { setLoading(true); fetchLogs(); }}
          className="px-3 py-1.5 rounded-lg border border-[#1e1e21] bg-[#111113] text-[11px] text-gray-400 hover:text-gray-200 hover:border-[#333] transition-colors"
        >
          Refresh
        </button>

        <span className="text-[10px] text-gray-600 ml-auto">
          {entries.length} entries
        </span>
      </div>

      {/* Log entries */}
      <div className="space-y-1">
        {loading && entries.length === 0 ? (
          <div className="text-center py-12 text-gray-600 text-sm">Loading...</div>
        ) : entries.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-gray-600 text-sm">No log entries yet</div>
            <div className="text-gray-700 text-xs mt-1">Activity will appear here as agents work</div>
          </div>
        ) : (
          entries.map(entry => (
            <LogRow
              key={entry.id}
              entry={entry}
              expanded={expandedId === entry.id}
              onToggle={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
