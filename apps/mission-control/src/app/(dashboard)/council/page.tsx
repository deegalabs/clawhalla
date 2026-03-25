'use client';

import { useState, useEffect } from 'react';

interface SearchResult {
  path: string;
  title: string;
  category: string;
  snippet: string;
  rank: number;
  word_count: number;
  last_modified: number;
}

interface UsageData {
  today: {
    inputTokens: number;
    outputTokens: number;
    totalCostUsd: string;
    events: number;
  };
  byAgent: Record<string, { input: number; output: number; cost: number; count: number }>;
  byModel: Record<string, { input: number; output: number; cost: number }>;
}

type Tab = 'research' | 'opportunities' | 'usage';

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return 'less than 1h ago';
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function CouncilPage() {
  const [tab, setTab] = useState<Tab>('research');
  const [reports, setReports] = useState<SearchResult[]>([]);
  const [insights, setInsights] = useState<SearchResult[]>([]);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null);
  const [docContent, setDocContent] = useState<string>('');

  useEffect(() => {
    // Fetch research reports
    fetch('/api/search?q=research+report+analysis&category=report&limit=20')
      .then(r => r.json())
      .then(data => { if (data.ok) setReports(data.results); });

    // Fetch insights
    fetch('/api/search?q=insight+actionable&category=insight&limit=20')
      .then(r => r.json())
      .then(data => { if (data.ok) setInsights(data.results); });

    // Fetch usage
    fetch('/api/usage')
      .then(r => r.json())
      .then(data => { if (data.ok) setUsage(data); });
  }, []);

  const loadDoc = async (path: string) => {
    setSelectedDoc(path);
    try {
      const res = await fetch('/api/docs');
      const docs = await res.json();
      const doc = docs.find((d: { path: string; content: string }) => d.path === path);
      setDocContent(doc?.content || 'Content not found');
    } catch {
      setDocContent('Failed to load');
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-gray-100">R&D Council</h2>
        <p className="text-xs text-gray-500 mt-1">Research, insights, opportunities, and usage analytics</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[#111113] rounded-lg p-0.5 border border-[#1e1e21] w-fit">
        {([
          { id: 'research', label: 'Research', count: reports.length },
          { id: 'opportunities', label: 'Insights', count: insights.length },
          { id: 'usage', label: 'Usage', count: null },
        ] as { id: Tab; label: string; count: number | null }[]).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 text-xs rounded-md ${
              tab === t.id ? 'bg-[#1e1e21] text-gray-100' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {t.label}
            {t.count !== null && <span className="ml-1.5 text-gray-600">{t.count}</span>}
          </button>
        ))}
      </div>

      <div className="flex gap-5">
        {/* Left: list */}
        <div className="w-96 space-y-2 shrink-0">
          {tab === 'research' && reports.map(r => (
            <button
              key={r.path}
              onClick={() => loadDoc(r.path)}
              className={`w-full text-left p-3 rounded-lg border ${
                selectedDoc === r.path ? 'bg-amber-500/5 border-amber-500/30' : 'bg-[#111113] border-[#1e1e21] hover:border-[#333]'
              }`}
            >
              <div className="text-sm font-medium text-gray-200">{r.title}</div>
              <div className="text-[10px] text-gray-600 mt-1">{r.word_count} words • {timeAgo(r.last_modified)}</div>
              <div
                className="text-xs text-gray-400 mt-1.5 line-clamp-2 [&_mark]:bg-amber-500/30 [&_mark]:text-amber-200"
                dangerouslySetInnerHTML={{ __html: r.snippet }}
              />
            </button>
          ))}

          {tab === 'opportunities' && insights.map(r => (
            <button
              key={r.path}
              onClick={() => loadDoc(r.path)}
              className={`w-full text-left p-3 rounded-lg border ${
                selectedDoc === r.path ? 'bg-amber-500/5 border-amber-500/30' : 'bg-[#111113] border-[#1e1e21] hover:border-[#333]'
              }`}
            >
              <div className="text-sm font-medium text-gray-200">{r.title}</div>
              <div className="text-[10px] text-gray-600 mt-1">{r.word_count} words • {timeAgo(r.last_modified)}</div>
              <div
                className="text-xs text-gray-400 mt-1.5 line-clamp-2 [&_mark]:bg-amber-500/30 [&_mark]:text-amber-200"
                dangerouslySetInnerHTML={{ __html: r.snippet }}
              />
            </button>
          ))}

          {tab === 'usage' && usage && (
            <div className="space-y-4">
              {/* Today summary */}
              <div className="bg-[#111113] rounded-lg border border-[#1e1e21] p-4">
                <div className="text-xs text-gray-500 uppercase tracking-wider mb-3">Today</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-2xl font-bold text-amber-400">${usage.today.totalCostUsd}</div>
                    <div className="text-[10px] text-gray-600">estimated cost</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-gray-300">{usage.today.events}</div>
                    <div className="text-[10px] text-gray-600">events</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-400">{(usage.today.inputTokens / 1000).toFixed(1)}k</div>
                    <div className="text-[10px] text-gray-600">input tokens</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-400">{(usage.today.outputTokens / 1000).toFixed(1)}k</div>
                    <div className="text-[10px] text-gray-600">output tokens</div>
                  </div>
                </div>
              </div>

              {/* By agent */}
              <div className="bg-[#111113] rounded-lg border border-[#1e1e21] p-4">
                <div className="text-xs text-gray-500 uppercase tracking-wider mb-3">By Agent</div>
                {Object.entries(usage.byAgent).length === 0 ? (
                  <div className="text-xs text-gray-600">No data yet</div>
                ) : (
                  <div className="space-y-2">
                    {Object.entries(usage.byAgent)
                      .sort(([, a], [, b]) => b.cost - a.cost)
                      .map(([agent, data]) => (
                        <div key={agent} className="flex items-center justify-between px-2 py-1.5 bg-[#0a0a0b] rounded">
                          <span className="text-xs text-amber-500">@{agent}</span>
                          <div className="text-[10px] text-gray-500">
                            {data.count} calls • ${(data.cost / 100).toFixed(2)}
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>

              {/* By model */}
              <div className="bg-[#111113] rounded-lg border border-[#1e1e21] p-4">
                <div className="text-xs text-gray-500 uppercase tracking-wider mb-3">By Model</div>
                {Object.entries(usage.byModel).length === 0 ? (
                  <div className="text-xs text-gray-600">No data yet</div>
                ) : (
                  <div className="space-y-2">
                    {Object.entries(usage.byModel).map(([model, data]) => (
                      <div key={model} className="flex items-center justify-between px-2 py-1.5 bg-[#0a0a0b] rounded">
                        <span className="text-xs text-gray-300">{model.replace('claude-', '')}</span>
                        <span className="text-[10px] text-gray-500">${(data.cost / 100).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {(tab === 'research' && reports.length === 0) && (
            <div className="bg-[#111113] rounded-lg border border-[#1e1e21] p-8 text-center text-gray-600 text-xs">
              No research reports yet. Mimir will generate them via daily monitoring.
            </div>
          )}
        </div>

        {/* Right: content viewer */}
        {(tab === 'research' || tab === 'opportunities') && (
          <div className="flex-1 bg-[#0a0a0b] rounded-lg border border-[#1e1e21] overflow-hidden">
            {selectedDoc ? (
              <div className="p-6 overflow-y-auto max-h-[70vh]">
                <pre className="whitespace-pre-wrap text-sm text-gray-300 font-mono leading-relaxed">
                  {docContent}
                </pre>
              </div>
            ) : (
              <div className="flex items-center justify-center h-64 text-gray-600 text-xs">
                Select a document to view
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
