'use client';

import { useState, useEffect, useCallback } from 'react';
import { MarkdownView } from '@/components/ui/markdown-view';

interface MemoryEntry { name: string; path: string; date: string; size: number; wordCount: number; content: string; modifiedAt: string; }
interface LongTermMemory { content: string; wordCount: number; modifiedAt: string | null; size: number; }
interface SearchResult { path: string; title: string; snippet: string; word_count: number; last_modified: number; }

interface RagStatus {
  agentId: string;
  provider: string;
  model: string;
  indexed: number;
  total: number;
  chunks: number;
  dirty: boolean;
  vectorReady: boolean;
  ftsReady: boolean;
  issues: string[];
  mode: 'rag' | 'md' | 'default';
}

interface RagResult {
  content: string;
  source: string;
  score: number;
  metadata?: Record<string, unknown>;
}

type Tab = 'journal' | 'longterm' | 'knowledge';
type TimeGroup = 'today' | 'yesterday' | 'thisWeek' | 'thisMonth' | 'older';

function daysAgo(d: string): string {
  const diff = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  if (diff === 0) return 'Today'; if (diff === 1) return 'Yesterday'; return `${diff}d ago`;
}

function getTimeGroup(dateStr: string): TimeGroup {
  const now = new Date(); const d = new Date(dateStr);
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return 'thisWeek';
  if (diffDays < 30) return 'thisMonth';
  return 'older';
}

const groupLabels: Record<TimeGroup, string> = {
  today: 'Today', yesterday: 'Yesterday', thisWeek: 'This Week', thisMonth: 'This Month', older: 'Older',
};

function groupEntries(entries: MemoryEntry[]): Record<TimeGroup, MemoryEntry[]> {
  const g: Record<TimeGroup, MemoryEntry[]> = { today: [], yesterday: [], thisWeek: [], thisMonth: [], older: [] };
  for (const e of entries) g[getTimeGroup(e.date)].push(e);
  return g;
}

export default function MemoryPage() {
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [longTerm, setLongTerm] = useState<LongTermMemory | null>(null);
  const [knowledge, setKnowledge] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState<MemoryEntry | null>(null);
  const [tab, setTab] = useState<Tab>('journal');
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [viewContent, setViewContent] = useState<{ title: string; content: string } | null>(null);

  // RAG state
  const [ragStatus, setRagStatus] = useState<RagStatus[]>([]);
  const [ragProvider, setRagProvider] = useState<string>('');
  const [ragEnabled, setRagEnabled] = useState(false);
  const [ragQuery, setRagQuery] = useState('');
  const [ragResults, setRagResults] = useState<RagResult[]>([]);
  const [ragSearching, setRagSearching] = useState(false);
  const [ragAgent, setRagAgent] = useState('main');
  const [reindexing, setReindexing] = useState(false);

  useEffect(() => {
    fetch('/api/memory').then(r => r.json()).then(setEntries).catch(() => {});
    fetch('/api/memory/longterm').then(r => r.json()).then(setLongTerm).catch(() => {});
    // Load knowledge base entries
    fetch('/api/search?q=insight+transcription+research&limit=30').then(r => r.json())
      .then(data => { if (data.ok) setKnowledge(data.results); }).catch(() => {});
    // Load RAG config/status
    fetch('/api/memory/config').then(r => r.json()).then(data => {
      if (data.ok) {
        setRagStatus(data.agents || []);
        setRagProvider(data.config?.provider || '');
        setRagEnabled(data.config?.enabled || false);
      }
    }).catch(() => {});
    // Trigger index
    fetch('/api/search', { method: 'POST' }).catch(() => {});
  }, []);

  // SSE
  useEffect(() => {
    let es: EventSource | null = null;
    try {
      es = new EventSource('/api/sse');
      es.onmessage = (event) => {
        const d = JSON.parse(event.data);
        if (d.type === 'file_change' && (d.event?.path?.includes('memory/') || d.event?.path?.includes('knowledge'))) {
          fetch('/api/memory').then(r => r.json()).then(setEntries).catch(() => {});
        }
      };
    } catch {}
    return () => { if (es) es.close(); };
  }, []);

  // Debounced text search
  const doSearch = useCallback((q: string) => {
    if (q.trim().length < 2) { setSearchResults(null); return; }
    setSearchLoading(true);
    fetch(`/api/search?q=${encodeURIComponent(q)}&limit=30`).then(r => r.json())
      .then(data => { if (data.ok) setSearchResults(data.results); })
      .catch(() => {}).finally(() => setSearchLoading(false));
  }, []);

  useEffect(() => { const t = setTimeout(() => doSearch(search), 300); return () => clearTimeout(t); }, [search, doSearch]);

  // RAG semantic search
  const doRagSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setRagResults([]); return; }
    setRagSearching(true);
    try {
      const res = await fetch(`/api/memory/rag?q=${encodeURIComponent(q)}&agent=${ragAgent}&limit=10`);
      const data = await res.json();
      if (data.ok) setRagResults(data.results || []);
    } catch {}
    setRagSearching(false);
  }, [ragAgent]);

  const handleReindex = async () => {
    setReindexing(true);
    try {
      await fetch('/api/memory/rag', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ force: true }) });
      // Refresh status
      const res = await fetch('/api/memory/config');
      const data = await res.json();
      if (data.ok) setRagStatus(data.agents || []);
    } catch {}
    setReindexing(false);
  };

  const loadContent = async (path: string, title: string) => {
    try {
      const res = await fetch('/api/docs');
      const docs = await res.json();
      const doc = docs.find((d: { path: string; content: string }) => d.path === path);
      setViewContent({ title, content: doc?.content || 'Content not found' });
      setSelected(null);
    } catch { setViewContent({ title, content: 'Failed to load' }); }
  };

  const grouped = groupEntries(entries);
  const isSearching = search.trim().length >= 2;
  const totalWords = entries.reduce((s, e) => s + e.wordCount, 0) + (longTerm?.wordCount || 0);
  const totalChunks = ragStatus.reduce((s, a) => s + a.chunks, 0);
  const totalIndexed = ragStatus.reduce((s, a) => s + a.indexed, 0);

  return (
    <div className="flex h-[calc(100vh-7rem)] gap-4">
      {/* Left Panel */}
      <div className="w-80 bg-[#111113] rounded-lg border border-[#1e1e21] flex flex-col overflow-hidden shrink-0">
        {/* Search */}
        <div className="p-3 border-b border-[#1e1e21]">
          <input type="text" placeholder="Search memories..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full px-3 py-1.5 bg-[#0a0a0b] border border-[#1e1e21] rounded text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-amber-500" />
          {searchLoading && <div className="text-[10px] text-amber-400 mt-1">Searching...</div>}
        </div>

        {/* Stats */}
        <div className="px-3 py-2 border-b border-[#1e1e21] flex items-center gap-3 text-[10px] text-gray-600">
          <span>{entries.length} entries</span>
          <span>&middot;</span>
          <span>{(totalWords / 1000).toFixed(0)}k words</span>
          {ragEnabled && (
            <>
              <span>&middot;</span>
              <span className="text-purple-400">{totalChunks} chunks</span>
            </>
          )}
        </div>

        {/* Tabs */}
        <div className="px-3 pt-2 flex gap-0.5 border-b border-[#1e1e21]">
          {([
            { id: 'journal' as Tab, label: 'Journal', count: entries.length },
            { id: 'longterm' as Tab, label: 'Long-Term', count: null },
            { id: 'knowledge' as Tab, label: 'RAG', count: ragEnabled ? totalIndexed : knowledge.length },
          ]).map(t => (
            <button key={t.id} onClick={() => { setTab(t.id); setViewContent(null); setSelected(null); }}
              className={`px-2.5 py-1.5 text-[11px] rounded-t ${tab === t.id ? 'bg-[#1e1e21] text-gray-100' : 'text-gray-500 hover:text-gray-300'}`}>
              {t.label}{t.count !== null ? ` (${t.count})` : ''}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-2">
          {isSearching && searchResults ? (
            <div className="space-y-1">
              <div className="px-2 py-1 text-[10px] text-gray-500">{searchResults.length} results</div>
              {searchResults.map(r => (
                <button key={r.path} onClick={() => loadContent(r.path, r.title)}
                  className="w-full text-left px-3 py-2 rounded hover:bg-[#1a1a1d]">
                  <div className="text-xs text-gray-200 font-medium">{r.title}</div>
                  <div className="text-[10px] text-gray-400 mt-0.5 line-clamp-2 [&_mark]:bg-amber-500/30 [&_mark]:text-amber-200" dangerouslySetInnerHTML={{ __html: r.snippet }} />
                  <div className="text-[9px] text-gray-600 mt-0.5">{r.word_count} words</div>
                </button>
              ))}
            </div>
          ) : tab === 'journal' ? (
            <div className="space-y-3">
              {(['today', 'yesterday', 'thisWeek', 'thisMonth', 'older'] as TimeGroup[]).map(group => {
                const items = grouped[group];
                if (items.length === 0) return null;
                return (
                  <div key={group}>
                    <div className="px-2 py-1 text-[10px] text-gray-500 uppercase tracking-wider flex items-center justify-between">
                      <span>{groupLabels[group]}</span>
                      <span className="text-gray-700">{items.length}</span>
                    </div>
                    {items.map(entry => (
                      <button key={entry.path} onClick={() => { setSelected(entry); setViewContent(null); }}
                        className={`w-full text-left px-3 py-2 rounded text-xs ${selected?.path === entry.path ? 'bg-amber-500/10 text-gray-100' : 'text-gray-400 hover:bg-[#1a1a1d]'}`}>
                        <div className="font-medium">{entry.date}</div>
                        <div className="text-[10px] text-gray-600 mt-0.5">{entry.wordCount} words &middot; {(entry.size / 1024).toFixed(1)}KB</div>
                      </button>
                    ))}
                  </div>
                );
              })}
              {entries.length === 0 && <div className="px-3 py-6 text-center text-xs text-gray-700">No journal entries</div>}
            </div>
          ) : tab === 'longterm' ? (
            <div className="p-2">
              {longTerm ? (
                <button onClick={() => { setViewContent({ title: 'Long-Term Memory', content: longTerm.content }); setSelected(null); }}
                  className="w-full text-left p-3 rounded-lg bg-[#0a0a0b] border border-[#1e1e21] hover:border-amber-500/30">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">&#x1f9e0;</span>
                    <span className="text-xs font-medium text-gray-200">MEMORY.md</span>
                  </div>
                  <div className="text-[10px] text-gray-500">{longTerm.wordCount.toLocaleString()} words &middot; {longTerm.modifiedAt ? daysAgo(longTerm.modifiedAt) : '\u2014'}</div>
                </button>
              ) : (
                <div className="text-center py-6 text-xs text-gray-700">No long-term memory found</div>
              )}
            </div>
          ) : tab === 'knowledge' ? (
            <div className="space-y-3">
              {/* RAG Status */}
              {ragEnabled ? (
                <>
                  {/* Provider info */}
                  <div className="px-2 py-2 bg-[#0a0a0b] rounded border border-[#1e1e21]">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-purple-400 font-medium uppercase tracking-wider">RAG Index</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded ${ragStatus.some(a => a.vectorReady) ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                        {ragStatus.some(a => a.vectorReady) ? 'READY' : 'OFFLINE'}
                      </span>
                    </div>
                    <div className="text-[10px] text-gray-500">
                      Provider: <span className="text-gray-300">{ragProvider}</span>
                    </div>
                    <div className="text-[10px] text-gray-500 mt-0.5">
                      {ragStatus.length} agents &middot; {totalIndexed} files &middot; {totalChunks} chunks
                    </div>
                    <button onClick={handleReindex} disabled={reindexing}
                      className="mt-2 w-full text-[10px] px-2 py-1 bg-purple-500/10 text-purple-400 rounded hover:bg-purple-500/20 disabled:opacity-50">
                      {reindexing ? 'Indexing...' : 'Reindex All'}
                    </button>
                  </div>

                  {/* Per-agent status */}
                  <div className="px-2 py-1 text-[10px] text-gray-500 uppercase tracking-wider">Agents</div>
                  {ragStatus.map(a => {
                    const isRag = a.mode === 'rag' || (a.mode === 'default' && ragEnabled);
                    const isMdOnly = a.mode === 'md';
                    return (
                      <button key={a.agentId} onClick={() => { if (isRag) { setRagAgent(a.agentId); setViewContent(null); setSelected(null); } }}
                        className={`w-full text-left px-3 py-2 rounded text-xs ${ragAgent === a.agentId && isRag ? 'bg-purple-500/10 text-gray-100' : isMdOnly ? 'text-gray-500' : 'text-gray-400 hover:bg-[#1a1a1d]'}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium capitalize">{a.agentId}</span>
                            <span className={`text-[8px] px-1 py-px rounded ${isMdOnly ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400'}`}>
                              {isMdOnly ? '.md' : 'RAG'}
                            </span>
                          </div>
                          {isRag && (
                            <span className={`text-[9px] ${a.vectorReady ? 'text-green-500' : 'text-red-500'}`}>
                              {a.vectorReady ? '\u25cf' : '\u25cb'}
                            </span>
                          )}
                        </div>
                        {isRag ? (
                          <div className="text-[10px] text-gray-600 mt-0.5">
                            {a.indexed}/{a.total} files &middot; {a.chunks} chunks
                            {a.dirty ? ' \u00b7 needs reindex' : ''}
                          </div>
                        ) : (
                          <div className="text-[10px] text-gray-600 mt-0.5">File-based memory only</div>
                        )}
                        {a.issues.length > 0 && a.issues[0] && (
                          <div className="text-[9px] text-amber-500/70 mt-0.5">{a.issues[0]}</div>
                        )}
                      </button>
                    );
                  })}

                  {/* Semantic search */}
                  <div className="px-2 py-1 text-[10px] text-gray-500 uppercase tracking-wider mt-2">Semantic Search</div>
                  <div className="px-2">
                    <div className="flex gap-1">
                      <input type="text" placeholder={`Search ${ragAgent}'s memory...`} value={ragQuery}
                        onChange={e => setRagQuery(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') doRagSearch(ragQuery); }}
                        className="flex-1 px-2 py-1 bg-[#0a0a0b] border border-[#1e1e21] rounded text-[11px] text-gray-200 placeholder-gray-600 focus:outline-none focus:border-purple-500" />
                      <button onClick={() => doRagSearch(ragQuery)} disabled={ragSearching || ragQuery.length < 2}
                        className="px-2 py-1 bg-purple-500/20 text-purple-400 rounded text-[10px] hover:bg-purple-500/30 disabled:opacity-40">
                        {ragSearching ? '...' : 'Go'}
                      </button>
                    </div>
                  </div>
                  {ragResults.length > 0 && (
                    <div className="space-y-1 mt-1">
                      {ragResults.map((r, i) => (
                        <button key={i} onClick={() => setViewContent({ title: r.source || `Result ${i + 1}`, content: r.content })}
                          className="w-full text-left px-3 py-2 rounded hover:bg-[#1a1a1d]">
                          <div className="text-xs text-gray-200 font-medium truncate">{r.source || `Chunk ${i + 1}`}</div>
                          <div className="text-[10px] text-gray-400 mt-0.5 line-clamp-2">{r.content?.slice(0, 120)}...</div>
                          {r.score != null && (
                            <div className="text-[9px] text-purple-400/60 mt-0.5">Score: {(r.score * 100).toFixed(0)}%</div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="px-3 py-6 text-center">
                  <div className="text-2xl mb-2">&#x1f50d;</div>
                  <div className="text-xs text-gray-500 mb-2">RAG Memory Search not configured</div>
                  <div className="text-[10px] text-gray-600 mb-3">Enable semantic search across agent memories using vector embeddings.</div>
                  <a href="/settings" className="text-[10px] px-3 py-1.5 bg-purple-500/20 text-purple-400 rounded hover:bg-purple-500/30">
                    Configure in Settings
                  </a>

                  {/* Show file-based knowledge if RAG not enabled */}
                  {knowledge.length > 0 && (
                    <div className="mt-4 text-left">
                      <div className="px-2 py-1 text-[10px] text-gray-500 uppercase tracking-wider">File-based Knowledge</div>
                      {knowledge.map(k => (
                        <button key={k.path} onClick={() => loadContent(k.path, k.title)}
                          className="w-full text-left px-3 py-2 rounded hover:bg-[#1a1a1d]">
                          <div className="text-xs text-gray-200 font-medium truncate">{k.title}</div>
                          <div className="text-[9px] text-gray-600 mt-0.5">{k.word_count} words &middot; {k.path.split('/').pop()}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {/* Right Panel - Content Viewer */}
      <div className="flex-1 bg-[#0a0a0b] rounded-lg border border-[#1e1e21] flex flex-col overflow-hidden">
        {selected ? (
          <>
            <div className="px-5 py-3 border-b border-[#1e1e21] shrink-0">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-100">Journal: {selected.date}</h2>
                <span className="text-[10px] text-gray-600">{daysAgo(selected.modifiedAt)}</span>
              </div>
              <div className="text-[10px] text-gray-500 mt-0.5">{selected.wordCount.toLocaleString()} words &middot; {(selected.size / 1024).toFixed(1)}KB</div>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <MarkdownView content={selected.content} maxHeight="max-h-[60vh]" />
            </div>
          </>
        ) : viewContent ? (
          <>
            <div className="px-5 py-3 border-b border-[#1e1e21] shrink-0">
              <h2 className="text-sm font-semibold text-gray-100">{viewContent.title}</h2>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <MarkdownView content={viewContent.content} maxHeight="max-h-[60vh]" />
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-700">
            <span className="text-3xl mb-2">&#x1f9e0;</span>
            <span className="text-xs">Select a memory to view</span>
            {tab === 'knowledge' && ragEnabled && (
              <span className="text-[10px] text-gray-600 mt-1">Or use semantic search to find relevant memories</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
