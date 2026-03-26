'use client';

import { useState, useEffect, useCallback } from 'react';
import { PageLoading } from '@/components/ui/loading';
import { MarkdownView } from '@/components/ui/markdown-view';
import { autoTask } from '@/lib/tasks';

interface SearchResult { path: string; title: string; category: string; snippet: string; word_count: number; last_modified: number; }
interface UsageData { today: { totalCostUsd: string; inputTokens: number; outputTokens: number; events: number }; byAgent: Record<string, { input: number; output: number; cost: number; count: number }>; byModel: Record<string, { input: number; output: number; cost: number }>; }
interface FeedbackEntry { id: string; agentId: string; type: string; content: string; createdAt: string; }

type Tab = 'radar' | 'memos' | 'opportunities' | 'decisions' | 'usage';

const EMOJIS: Record<string, string> = {
  main: '🦞', claw: '🦞', odin: '👁️', vidar: '⚔️', saga: '🔮', thor: '⚡',
  frigg: '👑', tyr: '⚖️', freya: '✨', mimir: '🧠', bragi: '🎭', loki: '🦊',
};

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const h = Math.floor(diff / 3600000);
  if (h < 1) return '< 1h ago'; if (h < 24) return `${h}h ago`; return `${Math.floor(h / 24)}d ago`;
}

export default function CouncilPage() {
  const [tab, setTab] = useState<Tab>('radar');
  const [reports, setReports] = useState<SearchResult[]>([]);
  const [insights, setInsights] = useState<SearchResult[]>([]);
  const [adrs, setAdrs] = useState<SearchResult[]>([]);
  const [transcriptions, setTranscriptions] = useState<SearchResult[]>([]);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [learnings, setLearnings] = useState<FeedbackEntry[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null);
  const [docContent, setDocContent] = useState<string>('');
  const [councilMemos, setCouncilMemos] = useState<{ name: string; preview: string; size: number }[]>([]);
  const [startingSession, setStartingSession] = useState(false);
  const [sessionResult, setSessionResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/search?q=research+report+analysis&limit=20').then(r => r.json()).then(d => { if (d.ok) setReports(d.results); }),
      fetch('/api/search?q=insight+actionable+opportunity&limit=20').then(r => r.json()).then(d => { if (d.ok) setInsights(d.results); }),
      fetch('/api/search?q=ADR+decision+architecture&category=adr&limit=20').then(r => r.json()).then(d => { if (d.ok) setAdrs(d.results); }),
      fetch('/api/search?q=transcription+video+podcast&limit=20').then(r => r.json()).then(d => { if (d.ok) setTranscriptions(d.results); }),
      fetch('/api/usage').then(r => r.json()).then(d => { if (d.ok) setUsage(d); }),
      fetch('/api/feedback').then(r => r.json()).then(d => { if (d.ok) setLearnings(d.entries?.slice(0, 10) || []); }),
      fetch('/api/council/session').then(r => r.json()).then(d => { if (d.ok) setCouncilMemos(d.memos); }),
    ]).finally(() => setLoading(false));
  }, []);

  const loadDoc = useCallback(async (path: string) => {
    setSelectedDoc(path);
    try {
      const res = await fetch('/api/docs');
      const docs = await res.json();
      const doc = docs.find((d: { path: string; content: string }) => d.path === path);
      setDocContent(doc?.content || 'Content not found');
    } catch { setDocContent('Failed to load'); }
  }, []);

  const totalMemos = reports.length + insights.length + adrs.length;

  if (loading) {
    return <PageLoading title="Loading council..." />;
  }

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] gap-4">
      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-3 shrink-0">
        <div className="bg-[#111113] rounded-lg p-3 border border-[#1e1e21]">
          <div className="text-[10px] text-gray-500 uppercase">Memos</div>
          <div className="text-2xl font-bold text-gray-300">{totalMemos}</div>
        </div>
        <div className="bg-[#111113] rounded-lg p-3 border border-[#1e1e21]">
          <div className="text-[10px] text-gray-500 uppercase">Transcriptions</div>
          <div className="text-2xl font-bold text-teal-400">{transcriptions.length}</div>
        </div>
        <div className="bg-[#111113] rounded-lg p-3 border border-[#1e1e21]">
          <div className="text-[10px] text-gray-500 uppercase">Decisions (ADR)</div>
          <div className="text-2xl font-bold text-red-400">{adrs.length}</div>
        </div>
        <div className="bg-[#111113] rounded-lg p-3 border border-[#1e1e21]">
          <div className="text-[10px] text-gray-500 uppercase">Cost Today</div>
          <div className="text-2xl font-bold text-amber-400">${usage?.today.totalCostUsd || '0.00'}</div>
        </div>
      </div>

      {/* Header + tabs */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-gray-200">R&D Council</h2>
          <div className="flex gap-0.5 bg-[#111113] rounded-lg p-0.5 border border-[#1e1e21]">
            {([
              { id: 'radar' as Tab, label: 'Trend Radar', count: transcriptions.length },
              { id: 'memos' as Tab, label: 'Research', count: reports.length },
              { id: 'opportunities' as Tab, label: 'Opportunities', count: insights.length },
              { id: 'decisions' as Tab, label: 'Decisions', count: adrs.length },
              { id: 'usage' as Tab, label: 'Usage', count: null },
            ]).map(t => (
              <button key={t.id} onClick={() => { setTab(t.id); setSelectedDoc(null); }}
                className={`px-2.5 py-1 text-[11px] rounded ${tab === t.id ? 'bg-[#1e1e21] text-gray-100' : 'text-gray-500 hover:text-gray-300'}`}>
                {t.label}{t.count !== null ? ` (${t.count})` : ''}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {sessionResult && <span className="text-[10px] text-green-400">{sessionResult}</span>}
          <button onClick={async () => {
            setStartingSession(true); setSessionResult(null);
            try {
              const res = await fetch('/api/council/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
              const data = await res.json();
              setSessionResult(data.ok ? '🔬 Session started' : data.error);
              if (data.ok) {
                autoTask.councilSession('R&D Council Session');
                setTimeout(() => fetch('/api/council/session').then(r => r.json()).then(d => { if (d.ok) setCouncilMemos(d.memos); }), 60000);
              }
            } catch { setSessionResult('Failed'); }
            setStartingSession(false);
          }} disabled={startingSession}
            className="px-3 py-1.5 text-[11px] font-medium bg-amber-500 text-gray-900 rounded hover:bg-amber-400 disabled:opacity-50">
            {startingSession ? '🔬 Starting...' : '🔬 Start Session'}
          </button>
        </div>
      </div>

      {/* Council Memos */}
      {councilMemos.length > 0 && (
        <div className="bg-[#111113] rounded-lg border border-purple-500/20 p-3 shrink-0">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] text-purple-400 uppercase tracking-wider">Council Sessions</div>
            <span className="text-[10px] text-gray-600">{councilMemos.length} memos</span>
          </div>
          <div className="flex gap-2 overflow-x-auto">
            {councilMemos.slice(0, 5).map(memo => (
              <button key={memo.name} onClick={() => loadDoc(`company/knowledge_base/council/${memo.name}`)}
                className="shrink-0 px-3 py-2 bg-[#0a0a0b] rounded border border-[#1e1e21] hover:border-purple-500/30 text-left min-w-[200px]">
                <div className="text-[11px] text-gray-200 font-medium">{memo.name.replace('.md', '')}</div>
                <div className="text-[9px] text-gray-500 mt-0.5 line-clamp-2">{memo.preview.slice(0, 80)}...</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex gap-4 flex-1 min-h-0">
        {/* Left panel */}
        <div className="w-96 flex flex-col min-h-0 shrink-0">
          {/* RADAR */}
          {tab === 'radar' && (
            <div className="flex-1 overflow-y-auto space-y-2">
              <div className="text-[10px] text-gray-500 px-1 mb-1">Videos, podcasts, and articles transcribed by Mimir</div>
              {transcriptions.length === 0 ? (
                <div className="bg-[#111113] rounded-lg border border-[#1e1e21] p-6 text-center text-xs text-gray-600">
                  <div className="text-2xl mb-2">📡</div>
                  No trend data yet. Mimir monitors daily.
                </div>
              ) : transcriptions.map(r => (
                <button key={r.path} onClick={() => loadDoc(r.path)}
                  className={`w-full text-left p-3 rounded-lg border ${selectedDoc === r.path ? 'bg-amber-500/5 border-amber-500/30' : 'bg-[#111113] border-[#1e1e21] hover:border-[#333]'}`}>
                  <div className="text-xs font-medium text-gray-200">{r.title}</div>
                  <div className="text-[10px] text-gray-600 mt-0.5">{r.word_count} words • {timeAgo(r.last_modified)}</div>
                  <div className="text-[10px] text-gray-400 mt-1 line-clamp-2 [&_mark]:bg-amber-500/30 [&_mark]:text-amber-200" dangerouslySetInnerHTML={{ __html: r.snippet }} />
                </button>
              ))}
            </div>
          )}

          {/* MEMOS */}
          {tab === 'memos' && (
            <div className="flex-1 overflow-y-auto space-y-2">
              <div className="text-[10px] text-gray-500 px-1 mb-1">Research reports and analysis by the team</div>
              {reports.length === 0 ? (
                <div className="bg-[#111113] rounded-lg border border-[#1e1e21] p-6 text-center text-xs text-gray-600">
                  <div className="text-2xl mb-2">🧠</div>
                  No research memos yet.
                </div>
              ) : reports.map(r => (
                <button key={r.path} onClick={() => loadDoc(r.path)}
                  className={`w-full text-left p-3 rounded-lg border ${selectedDoc === r.path ? 'bg-amber-500/5 border-amber-500/30' : 'bg-[#111113] border-[#1e1e21] hover:border-[#333]'}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400">{r.category}</span>
                    <span className="text-xs font-medium text-gray-200 truncate">{r.title}</span>
                  </div>
                  <div className="text-[10px] text-gray-600 mt-1">{r.word_count} words • {timeAgo(r.last_modified)}</div>
                </button>
              ))}
            </div>
          )}

          {/* OPPORTUNITIES */}
          {tab === 'opportunities' && (
            <div className="flex-1 overflow-y-auto space-y-2">
              <div className="text-[10px] text-gray-500 px-1 mb-1">Insights and opportunities identified by Loki</div>
              {insights.length === 0 ? (
                <div className="bg-[#111113] rounded-lg border border-[#1e1e21] p-6 text-center text-xs text-gray-600">
                  <div className="text-2xl mb-2">🦊</div>
                  No opportunities yet. Loki analyzes weekly.
                </div>
              ) : insights.map(r => (
                <button key={r.path} onClick={() => loadDoc(r.path)}
                  className={`w-full text-left p-3 rounded-lg border ${selectedDoc === r.path ? 'bg-amber-500/5 border-amber-500/30' : 'bg-[#111113] border-[#1e1e21] hover:border-[#333]'}`}>
                  <div className="text-xs font-medium text-gray-200">{r.title}</div>
                  <div className="text-[10px] text-gray-400 mt-1 line-clamp-2 [&_mark]:bg-amber-500/30 [&_mark]:text-amber-200" dangerouslySetInnerHTML={{ __html: r.snippet }} />
                  <div className="text-[10px] text-gray-600 mt-1">{r.word_count} words</div>
                </button>
              ))}
            </div>
          )}

          {/* DECISIONS */}
          {tab === 'decisions' && (
            <div className="flex-1 overflow-y-auto space-y-2">
              <div className="text-[10px] text-gray-500 px-1 mb-1">Architecture Decision Records (ADRs)</div>
              {adrs.length === 0 ? (
                <div className="bg-[#111113] rounded-lg border border-[#1e1e21] p-6 text-center text-xs text-gray-600">
                  <div className="text-2xl mb-2">📋</div>
                  No ADRs found.
                </div>
              ) : adrs.map(r => (
                <button key={r.path} onClick={() => loadDoc(r.path)}
                  className={`w-full text-left p-3 rounded-lg border ${selectedDoc === r.path ? 'bg-amber-500/5 border-amber-500/30' : 'bg-[#111113] border-[#1e1e21] hover:border-[#333]'}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">ADR</span>
                    <span className="text-xs font-medium text-gray-200 truncate">{r.title}</span>
                  </div>
                  <div className="text-[10px] text-gray-600 mt-1">{timeAgo(r.last_modified)}</div>
                </button>
              ))}
            </div>
          )}

          {/* USAGE */}
          {tab === 'usage' && usage && (
            <div className="flex-1 overflow-y-auto space-y-3">
              <div className="bg-[#111113] rounded-lg border border-[#1e1e21] p-4">
                <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-3">Today</div>
                <div className="grid grid-cols-2 gap-3">
                  <div><div className="text-2xl font-bold text-amber-400">${usage.today.totalCostUsd}</div><div className="text-[10px] text-gray-600">cost</div></div>
                  <div><div className="text-2xl font-bold text-gray-300">{usage.today.events}</div><div className="text-[10px] text-gray-600">events</div></div>
                  <div><div className="text-sm text-gray-400">{(usage.today.inputTokens / 1000).toFixed(1)}k</div><div className="text-[10px] text-gray-600">input</div></div>
                  <div><div className="text-sm text-gray-400">{(usage.today.outputTokens / 1000).toFixed(1)}k</div><div className="text-[10px] text-gray-600">output</div></div>
                </div>
              </div>
              <div className="bg-[#111113] rounded-lg border border-[#1e1e21] p-4">
                <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">By Agent</div>
                <div className="space-y-1.5">
                  {Object.entries(usage.byAgent).sort(([, a], [, b]) => b.cost - a.cost).map(([agent, data]) => (
                    <div key={agent} className="flex items-center justify-between px-2 py-1.5 bg-[#0a0a0b] rounded">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs">{EMOJIS[agent] || '🤖'}</span>
                        <span className="text-xs text-gray-300 capitalize">{agent}</span>
                      </div>
                      <div className="text-[10px] text-gray-500">{data.count} calls • ${(data.cost / 100).toFixed(2)}</div>
                    </div>
                  ))}
                  {Object.keys(usage.byAgent).length === 0 && <div className="text-xs text-gray-600">No data</div>}
                </div>
              </div>
              <div className="bg-[#111113] rounded-lg border border-[#1e1e21] p-4">
                <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">By Model</div>
                <div className="space-y-1.5">
                  {Object.entries(usage.byModel).map(([model, data]) => (
                    <div key={model} className="flex items-center justify-between px-2 py-1.5 bg-[#0a0a0b] rounded">
                      <span className="text-xs text-gray-300">{model.replace('claude-', '')}</span>
                      <span className="text-[10px] text-gray-500">${(data.cost / 100).toFixed(2)}</span>
                    </div>
                  ))}
                  {Object.keys(usage.byModel).length === 0 && <div className="text-xs text-gray-600">No data</div>}
                </div>
              </div>
              {/* Recent Learnings */}
              {learnings.length > 0 && (
                <div className="bg-[#111113] rounded-lg border border-[#1e1e21] p-4">
                  <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Recent Learnings</div>
                  <div className="space-y-1.5">
                    {learnings.map(l => (
                      <div key={l.id} className="px-2 py-1.5 bg-[#0a0a0b] rounded">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs">{EMOJIS[l.agentId] || '🤖'}</span>
                          <span className="text-[10px] text-gray-300">{l.content.slice(0, 60)}</span>
                        </div>
                        <div className="text-[9px] text-gray-600 mt-0.5">{l.type} • {l.agentId}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: content viewer */}
        <div className="flex-1 bg-[#0a0a0b] rounded-lg border border-[#1e1e21] flex flex-col overflow-hidden min-h-0">
          {selectedDoc ? (
            <>
              <div className="px-5 py-3 border-b border-[#1e1e21] shrink-0">
                <div className="text-[10px] text-gray-600">{selectedDoc}</div>
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-4">
                <MarkdownView content={docContent} maxHeight="max-h-[60vh]" />
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-700">
              <span className="text-3xl mb-2">🔬</span>
              <span className="text-xs">Select a document to view</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
