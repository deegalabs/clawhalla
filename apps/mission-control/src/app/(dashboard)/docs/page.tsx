'use client';

import { useState, useEffect, useCallback } from 'react';

interface DocEntry {
  name: string;
  path: string;
  category: string;
  size: number;
  wordCount: number;
  modifiedAt: string;
  content: string;
}

interface SearchResult {
  path: string;
  title: string;
  category: string;
  snippet: string;
  rank: number;
  word_count: number;
  size: number;
  last_modified: number;
}

const categoryColors: Record<string, { bg: string; text: string }> = {
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
  // Legacy categories from API
  Journal: { bg: 'bg-purple-500/20', text: 'text-purple-400' },
  Insights: { bg: 'bg-teal-500/20', text: 'text-teal-400' },
  Transcription: { bg: 'bg-amber-500/20', text: 'text-amber-400' },
  ADR: { bg: 'bg-red-500/20', text: 'text-red-400' },
  Report: { bg: 'bg-blue-500/20', text: 'text-blue-400' },
  Other: { bg: 'bg-gray-500/20', text: 'text-gray-400' },
};

const searchCategories = ['All', 'memory', 'persona', 'skill', 'board', 'company', 'project', 'squad', 'report', 'adr', 'doc'];

function daysAgo(dateStr: string | number): string {
  const date = typeof dateStr === 'number' ? new Date(dateStr) : new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return `${diff}d ago`;
}

export default function DocsPage() {
  const [docs, setDocs] = useState<DocEntry[]>([]);
  const [selected, setSelected] = useState<DocEntry | null>(null);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [loading, setLoading] = useState(true);
  const [indexed, setIndexed] = useState(false);
  const [indexStats, setIndexStats] = useState<{ totalFiles: number; totalWords: number } | null>(null);

  useEffect(() => {
    fetch('/api/docs')
      .then(r => r.json())
      .then(data => {
        setDocs(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Trigger initial index
  useEffect(() => {
    if (!indexed) {
      fetch('/api/search', { method: 'POST' })
        .then(r => r.json())
        .then(data => {
          setIndexed(true);
          if (data.ok) {
            // Fetch stats after indexing
            fetch('/api/search?q=*&limit=0')
              .catch(() => {});
          }
        })
        .catch(() => {});
    }
  }, [indexed]);

  // Debounced search
  const doSearch = useCallback((q: string, cat: string) => {
    if (q.trim().length < 2) {
      setSearchResults(null);
      return;
    }
    setSearchLoading(true);
    const catParam = cat !== 'All' ? `&category=${cat}` : '';
    fetch(`/api/search?q=${encodeURIComponent(q)}${catParam}&limit=50`)
      .then(r => r.json())
      .then(data => {
        if (data.ok) {
          setSearchResults(data.results);
          setIndexStats(data.stats);
        }
      })
      .catch(() => {})
      .finally(() => setSearchLoading(false));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => doSearch(search, categoryFilter), 300);
    return () => clearTimeout(timer);
  }, [search, categoryFilter, doSearch]);

  const isSearching = search.trim().length >= 2;

  // Browse mode filtering
  const filtered = docs.filter(doc => {
    const matchesCategory = categoryFilter === 'All' || doc.category === categoryFilter;
    return matchesCategory;
  });

  // Load full content for search result
  const loadSearchResult = (result: SearchResult) => {
    const existing = docs.find(d => d.path === result.path);
    if (existing) {
      setSelected(existing);
    } else {
      // Create a temporary entry
      setSelected({
        name: result.title,
        path: result.path,
        category: result.category,
        size: result.size,
        wordCount: result.word_count,
        modifiedAt: new Date(result.last_modified).toISOString(),
        content: 'Loading...',
      });
      // Fetch full content
      fetch('/api/docs')
        .then(r => r.json())
        .then((allDocs: DocEntry[]) => {
          const doc = allDocs.find(d => d.path === result.path);
          if (doc) setSelected(doc);
        })
        .catch(() => {});
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] gap-4">
      {/* Top Section - Search and Filters */}
      <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <input
              type="text"
              placeholder="Search all workspace documents (FTS)..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-amber-500"
            />
            {searchLoading && (
              <span className="absolute right-3 top-2.5 text-xs text-amber-400">Searching...</span>
            )}
          </div>
        </div>
        <div className="flex gap-2 mt-3 flex-wrap">
          {searchCategories.map(cat => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                categoryFilter === cat
                  ? 'bg-amber-500 text-gray-900'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {cat}
            </button>
          ))}
          <span className="text-xs text-gray-500 ml-auto">
            {isSearching && searchResults
              ? `${searchResults.length} results`
              : `${filtered.length} documents`
            }
            {indexStats && ` • ${indexStats.totalFiles} indexed • ${(indexStats.totalWords / 1000).toFixed(0)}k words`}
          </span>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 gap-4 overflow-hidden">
        {/* Left Panel - Document List or Search Results */}
        <div className="w-96 bg-gray-900 rounded-lg border border-gray-800 overflow-hidden flex flex-col">
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center h-32 text-gray-500">
                Loading documents...
              </div>
            ) : isSearching && searchResults ? (
              // Search results
              searchResults.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-gray-500">
                  No results for &quot;{search}&quot;
                </div>
              ) : (
                <div className="divide-y divide-gray-800">
                  {searchResults.map(result => {
                    const colors = categoryColors[result.category] || categoryColors.doc;
                    return (
                      <button
                        key={result.path}
                        onClick={() => loadSearchResult(result)}
                        className={`w-full text-left p-3 transition-colors ${
                          selected?.path === result.path
                            ? 'bg-amber-500/10 border-l-2 border-l-amber-500'
                            : 'hover:bg-gray-800/50'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-medium text-gray-200 text-sm truncate">
                            {result.title}
                          </span>
                          <span className={`px-2 py-0.5 text-xs rounded ${colors.bg} ${colors.text} shrink-0`}>
                            {result.category}
                          </span>
                        </div>
                        <div
                          className="text-xs text-gray-400 mt-1 line-clamp-2 [&_mark]:bg-amber-500/30 [&_mark]:text-amber-200 [&_mark]:rounded [&_mark]:px-0.5"
                          dangerouslySetInnerHTML={{ __html: result.snippet }}
                        />
                        <div className="flex gap-3 text-xs text-gray-600 mt-2">
                          <span>{(result.size / 1024).toFixed(1)}KB</span>
                          <span>{result.word_count} words</span>
                          <span>{daysAgo(result.last_modified)}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )
            ) : filtered.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-gray-500">
                No documents found
              </div>
            ) : (
              // Browse mode
              <div className="divide-y divide-gray-800">
                {filtered.map(doc => {
                  const colors = categoryColors[doc.category] || categoryColors.doc;
                  return (
                    <button
                      key={doc.path}
                      onClick={() => setSelected(doc)}
                      className={`w-full text-left p-3 transition-colors ${
                        selected?.path === doc.path
                          ? 'bg-amber-500/10 border-l-2 border-l-amber-500'
                          : 'hover:bg-gray-800/50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-medium text-gray-200 text-sm truncate">
                          {doc.name}
                        </span>
                        <span className={`px-2 py-0.5 text-xs rounded ${colors.bg} ${colors.text} shrink-0`}>
                          {doc.category}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 truncate mt-1">
                        {doc.path}
                      </div>
                      <div className="flex gap-3 text-xs text-gray-600 mt-2">
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

        {/* Right Panel - Content Viewer */}
        <div className="flex-1 bg-gray-950 rounded-lg border border-gray-800 flex flex-col overflow-hidden">
          {selected ? (
            <>
              <div className="p-4 border-b border-gray-800">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-semibold text-gray-100">{selected.name}</h2>
                  <span className={`px-2 py-0.5 text-xs rounded ${(categoryColors[selected.category] || categoryColors.doc).bg} ${(categoryColors[selected.category] || categoryColors.doc).text}`}>
                    {selected.category}
                  </span>
                </div>
                <div className="text-sm text-gray-500 mt-1">
                  {selected.path}
                </div>
                <div className="flex gap-4 text-xs text-gray-600 mt-2">
                  <span>{(selected.size / 1024).toFixed(1)}KB</span>
                  <span>{selected.wordCount} words</span>
                  <span>Modified {daysAgo(selected.modifiedAt)}</span>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-6">
                <pre className="whitespace-pre-wrap text-sm text-gray-300 font-mono leading-relaxed">
                  {selected.content}
                  {selected.content.length >= 5000 && (
                    <span className="text-amber-500 block mt-4">
                      ... content truncated (showing first 5000 chars)
                    </span>
                  )}
                </pre>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              Select a document to view
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
