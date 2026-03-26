'use client';

import { useState, useEffect, useCallback } from 'react';
import { MarkdownView } from '@/components/ui/markdown-view';

interface DocEntry { name: string; path: string; category: string; size: number; wordCount: number; modifiedAt: string; content: string; }
interface SearchResult { path: string; title: string; category: string; snippet: string; word_count: number; size: number; last_modified: number; }

const catColors: Record<string, { bg: string; text: string }> = {
  memory: { bg: 'bg-purple-500/20', text: 'text-purple-400' },
  insight: { bg: 'bg-teal-500/20', text: 'text-teal-400' },
  transcription: { bg: 'bg-amber-500/20', text: 'text-amber-400' },
  adr: { bg: 'bg-red-500/20', text: 'text-red-400' },
  report: { bg: 'bg-blue-500/20', text: 'text-blue-400' },
  board: { bg: 'bg-green-500/20', text: 'text-green-400' },
  persona: { bg: 'bg-pink-500/20', text: 'text-pink-400' },
  skill: { bg: 'bg-cyan-500/20', text: 'text-cyan-400' },
  company: { bg: 'bg-indigo-500/20', text: 'text-indigo-400' },
  methodology: { bg: 'bg-orange-500/20', text: 'text-orange-400' },
  project: { bg: 'bg-emerald-500/20', text: 'text-emerald-400' },
  squad: { bg: 'bg-violet-500/20', text: 'text-violet-400' },
  doc: { bg: 'bg-gray-500/20', text: 'text-gray-400' },
};

function daysAgo(d: string | number): string {
  const diff = Math.floor((Date.now() - (typeof d === 'number' ? d : new Date(d).getTime())) / 86400000);
  if (diff === 0) return 'Today'; if (diff === 1) return 'Yesterday'; return `${diff}d ago`;
}

function getFolder(path: string): string {
  const parts = path.split('/');
  if (parts.length <= 1) return 'root';
  return parts[0];
}

type SortBy = 'date' | 'name' | 'size';

export default function DocsPage() {
  const [docs, setDocs] = useState<DocEntry[]>([]);
  const [selected, setSelected] = useState<DocEntry | null>(null);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [catFilter, setCatFilter] = useState('all');
  const [folderFilter, setFolderFilter] = useState('all');
  const [sortBy, setSortBy] = useState<SortBy>('date');
  const [loading, setLoading] = useState(true);
  const [indexStats, setIndexStats] = useState<{ totalFiles: number; totalWords: number } | null>(null);

  useEffect(() => {
    fetch('/api/docs').then(r => r.json()).then(data => { setDocs(data); setLoading(false); }).catch(() => setLoading(false));
    fetch('/api/search', { method: 'POST' }).catch(() => {});
  }, []);

  // SSE
  useEffect(() => {
    let es: EventSource | null = null;
    try { es = new EventSource('/api/sse'); es.onmessage = () => {
      fetch('/api/docs').then(r => r.json()).then(setDocs).catch(() => {});
    }; } catch {}
    return () => { if (es) es.close(); };
  }, []);

  // Search
  const doSearch = useCallback((q: string) => {
    if (q.trim().length < 2) { setSearchResults(null); return; }
    setSearchLoading(true);
    const catParam = catFilter !== 'all' ? `&category=${catFilter}` : '';
    fetch(`/api/search?q=${encodeURIComponent(q)}${catParam}&limit=50`).then(r => r.json())
      .then(data => { if (data.ok) { setSearchResults(data.results); setIndexStats(data.stats); } })
      .catch(() => {}).finally(() => setSearchLoading(false));
  }, [catFilter]);

  useEffect(() => { const t = setTimeout(() => doSearch(search), 300); return () => clearTimeout(t); }, [search, doSearch]);

  // Computed
  const isSearching = search.trim().length >= 2;

  const filtered = docs.filter(d => {
    if (catFilter !== 'all' && d.category !== catFilter) return false;
    if (folderFilter !== 'all' && getFolder(d.path) !== folderFilter) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'date') return new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime();
    if (sortBy === 'name') return a.name.localeCompare(b.name);
    return b.size - a.size;
  });

  // Category counts
  const catCounts: Record<string, number> = {};
  for (const d of docs) { catCounts[d.category] = (catCounts[d.category] || 0) + 1; }
  const categories = Object.entries(catCounts).sort(([, a], [, b]) => b - a);

  // Folder counts
  const folderCounts: Record<string, number> = {};
  for (const d of docs) { const f = getFolder(d.path); folderCounts[f] = (folderCounts[f] || 0) + 1; }
  const folders = Object.entries(folderCounts).sort(([, a], [, b]) => b - a);

  const totalWords = docs.reduce((s, d) => s + d.wordCount, 0);

  const loadSearchResult = (result: SearchResult) => {
    const existing = docs.find(d => d.path === result.path);
    if (existing) { setSelected(existing); }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] gap-3">
      {/* Top bar */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-gray-200">Docs</h2>
          <div className="flex gap-2 text-[10px] text-gray-600">
            <span>{docs.length} files</span>
            <span>•</span>
            <span>{(totalWords / 1000).toFixed(0)}k words</span>
            {indexStats && <><span>•</span><span>{indexStats.totalFiles} indexed</span></>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input type="text" placeholder="Search docs..." value={search} onChange={e => setSearch(e.target.value)}
            className="px-3 py-1.5 bg-[#111113] border border-[#1e1e21] rounded text-xs text-gray-200 w-48 focus:outline-none focus:border-amber-500 placeholder-gray-600" />
          {searchLoading && <span className="text-[10px] text-amber-400">...</span>}
          <select value={sortBy} onChange={e => setSortBy(e.target.value as SortBy)}
            className="px-2 py-1.5 bg-[#111113] border border-[#1e1e21] rounded text-[11px] text-gray-400 focus:outline-none">
            <option value="date">Recent</option>
            <option value="name">Name</option>
            <option value="size">Size</option>
          </select>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-4 shrink-0">
        {/* Category pills */}
        <div className="flex gap-1 flex-wrap flex-1">
          <button onClick={() => setCatFilter('all')}
            className={`px-2 py-0.5 text-[10px] rounded ${catFilter === 'all' ? 'bg-amber-500 text-gray-900' : 'bg-[#111113] text-gray-500 hover:text-gray-300'}`}>
            All ({docs.length})
          </button>
          {categories.map(([cat, count]) => {
            const c = catColors[cat] || catColors.doc;
            return (
              <button key={cat} onClick={() => setCatFilter(catFilter === cat ? 'all' : cat)}
                className={`px-2 py-0.5 text-[10px] rounded capitalize ${catFilter === cat ? `${c.bg} ${c.text}` : 'bg-[#111113] text-gray-600 hover:text-gray-400'}`}>
                {cat} ({count})
              </button>
            );
          })}
        </div>
        {/* Folder filter */}
        <select value={folderFilter} onChange={e => setFolderFilter(e.target.value)}
          className="px-2 py-1 bg-[#111113] border border-[#1e1e21] rounded text-[10px] text-gray-400 focus:outline-none shrink-0">
          <option value="all">All folders</option>
          {folders.map(([f, count]) => <option key={f} value={f}>{f}/ ({count})</option>)}
        </select>
      </div>

      {/* Main content */}
      <div className="flex flex-1 gap-3 min-h-0">
        {/* Left: Document list */}
        <div className="w-96 bg-[#111113] rounded-lg border border-[#1e1e21] overflow-hidden flex flex-col shrink-0">
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center h-32 text-gray-600 text-xs">Loading...</div>
            ) : isSearching && searchResults ? (
              searchResults.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-gray-600 text-xs">No results for &quot;{search}&quot;</div>
              ) : (
                <div className="divide-y divide-[#1e1e21]">
                  {searchResults.map(result => {
                    const c = catColors[result.category] || catColors.doc;
                    return (
                      <button key={result.path} onClick={() => loadSearchResult(result)}
                        className={`w-full text-left p-3 hover:bg-[#1a1a1d] ${selected?.path === result.path ? 'bg-amber-500/5 border-l-2 border-l-amber-500' : ''}`}>
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-xs text-gray-200 font-medium truncate">{result.title}</span>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded shrink-0 ${c.bg} ${c.text}`}>{result.category}</span>
                        </div>
                        <div className="text-[10px] text-gray-400 mt-1 line-clamp-2 [&_mark]:bg-amber-500/30 [&_mark]:text-amber-200" dangerouslySetInnerHTML={{ __html: result.snippet }} />
                        <div className="flex gap-3 text-[9px] text-gray-600 mt-1.5">
                          <span>{(result.size / 1024).toFixed(1)}KB</span>
                          <span>{result.word_count} words</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )
            ) : sorted.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-gray-600 text-xs">No documents</div>
            ) : (
              <div className="divide-y divide-[#1e1e21]">
                {sorted.map(doc => {
                  const c = catColors[doc.category] || catColors.doc;
                  return (
                    <button key={doc.path} onClick={() => setSelected(doc)}
                      className={`w-full text-left p-3 hover:bg-[#1a1a1d] ${selected?.path === doc.path ? 'bg-amber-500/5 border-l-2 border-l-amber-500' : ''}`}>
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs text-gray-200 font-medium truncate">{doc.name}</span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded shrink-0 ${c.bg} ${c.text}`}>{doc.category}</span>
                      </div>
                      <div className="text-[10px] text-gray-600 truncate mt-0.5">{doc.path}</div>
                      <div className="flex gap-3 text-[9px] text-gray-600 mt-1">
                        <span>{(doc.size / 1024).toFixed(1)}KB</span>
                        <span>{doc.wordCount} words</span>
                        <span>{daysAgo(doc.modifiedAt)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right: Content viewer */}
        <div className="flex-1 bg-[#0a0a0b] rounded-lg border border-[#1e1e21] flex flex-col overflow-hidden">
          {selected ? (
            <>
              <div className="px-5 py-3 border-b border-[#1e1e21] shrink-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-gray-100">{selected.name}</h2>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded ${(catColors[selected.category] || catColors.doc).bg} ${(catColors[selected.category] || catColors.doc).text}`}>{selected.category}</span>
                </div>
                <div className="text-[10px] text-gray-600 mt-0.5">{selected.path}</div>
                <div className="flex gap-4 text-[10px] text-gray-600 mt-1">
                  <span>{(selected.size / 1024).toFixed(1)}KB</span>
                  <span>{selected.wordCount} words</span>
                  <span>{daysAgo(selected.modifiedAt)}</span>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-4">
                <MarkdownView content={selected.content} maxHeight="max-h-[60vh]" />
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-700">
              <span className="text-3xl mb-2">📚</span>
              <span className="text-xs">Select a document to view</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
