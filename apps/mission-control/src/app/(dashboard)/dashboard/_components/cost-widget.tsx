'use client';

import { useState, useEffect } from 'react';

interface AgentUsage {
  input: number;
  output: number;
  cost: number;
}

interface CostWidgetProps {
  usageData: {
    byAgent: Record<string, AgentUsage>;
  };
}

type Period = 'today' | '7days' | '30days';

interface HistoryEntry {
  date: string;
  cost: number;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function CostWidget({ usageData }: CostWidgetProps) {
  const [period, setPeriod] = useState<Period>('today');
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    if (period === 'today') return;

    setHistoryLoading(true);
    const apiPeriod = period === '7days' ? 'day' : 'week';
    fetch(`/api/usage/history?period=${apiPeriod}`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setHistory(data);
        } else if (data.entries) {
          setHistory(data.entries);
        } else {
          setHistory([]);
        }
      })
      .catch(() => setHistory([]))
      .finally(() => setHistoryLoading(false));
  }, [period]);

  const tabs: { key: Period; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: '7days', label: '7 Days' },
    { key: '30days', label: '30 Days' },
  ];

  const agents = Object.entries(usageData?.byAgent || {});
  const totalCost = agents.reduce((sum, [, v]) => sum + v.cost, 0);
  const maxHistoryCost = history.length > 0 ? Math.max(...history.map(h => h.cost), 0.001) : 1;

  return (
    <div className="bg-[#111113] rounded-lg border border-[#1e1e21] overflow-hidden">
      <div className="px-4 py-3 border-b border-[#1e1e21] flex items-center justify-between">
        <span className="text-xs font-medium text-gray-300">Cost Breakdown</span>
        <div className="flex gap-1">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setPeriod(t.key)}
              className={`text-[10px] px-2 py-1 rounded transition-colors ${
                period === t.key
                  ? 'bg-amber-500/20 text-amber-400'
                  : 'text-gray-500 hover:text-gray-400 hover:bg-[#1a1a1d]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4">
        {period === 'today' ? (
          agents.length === 0 ? (
            <div className="text-center text-gray-600 text-[11px] py-6">No cost data yet</div>
          ) : (
            <>
              <table className="w-full">
                <thead>
                  <tr className="text-[10px] text-gray-600 uppercase tracking-wider">
                    <th className="text-left pb-2 font-medium">Agent</th>
                    <th className="text-right pb-2 font-medium">Input</th>
                    <th className="text-right pb-2 font-medium">Output</th>
                    <th className="text-right pb-2 font-medium">Cost USD</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1e1e21]">
                  {agents.map(([agentId, data]) => (
                    <tr key={agentId} className="text-[11px]">
                      <td className="py-1.5 text-gray-300 capitalize">{agentId}</td>
                      <td className="py-1.5 text-right text-gray-500">{formatTokens(data.input)}</td>
                      <td className="py-1.5 text-right text-gray-500">{formatTokens(data.output)}</td>
                      <td className="py-1.5 text-right text-gray-300">${data.cost.toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-3 pt-2 border-t border-[#1e1e21] flex justify-between text-[11px]">
                <span className="text-gray-500">Total</span>
                <span className="text-gray-200 font-medium">${totalCost.toFixed(4)}</span>
              </div>
            </>
          )
        ) : historyLoading ? (
          <div className="text-center text-gray-600 text-[11px] py-6">Loading...</div>
        ) : history.length === 0 ? (
          <div className="text-center text-gray-600 text-[11px] py-6">No cost data yet</div>
        ) : (
          <div className="space-y-1.5">
            {history.map(entry => (
              <div key={entry.date} className="flex items-center gap-2">
                <span className="text-[10px] text-gray-500 w-16 shrink-0">{entry.date}</span>
                <div className="flex-1 h-4 bg-[#0a0a0b] rounded overflow-hidden">
                  <div
                    className="h-full bg-amber-500/60 rounded"
                    style={{ width: `${Math.max((entry.cost / maxHistoryCost) * 100, 1)}%` }}
                  />
                </div>
                <span className="text-[10px] text-gray-400 w-14 text-right shrink-0">
                  ${entry.cost.toFixed(3)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
