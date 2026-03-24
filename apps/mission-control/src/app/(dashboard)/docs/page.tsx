'use client';

import { useState, useEffect } from 'react';

interface DocEntry {
  name: string;
  path: string;
  category: string;
  size: number;
  wordCount: number;
  modifiedAt: string;
  content: string;
}

const categoryColors: Record<string, { bg: string; text: string }> = {
  Journal: { bg: 'bg-purple-500/20', text: 'text-purple-400' },
  Insights: { bg: 'bg-teal-500/20', text: 'text-teal-400' },
  Transcription: { bg: 'bg-amber-500/20', text: 'text-amber-400' },
  ADR: { bg: 'bg-red-500/20', text: 'text-red-400' },
  Report: { bg: 'bg-blue-500/20', text: 'text-blue-400' },
  Other: { bg: 'bg-gray-500/20', text: 'text-gray-400' },
};

const categories = ['All', 'Journal', 'Report', 'ADR', 'Insights', 'Transcription', 'Other'];
const fileTypes = ['.md', '.yaml'];

function daysAgo(dateStr: string): string {
  const date = new Date(dateStr);
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
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/docs')
      .then(r => r.json())
      .then(data => {
        setDocs(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filtered = docs.filter(doc => {
    const matchesSearch = search === '' || 
      doc.name.toLowerCase().includes(search.toLowerCase()) ||
      doc.path.toLowerCase().includes(search.toLowerCase()) ||
      doc.content.toLowerCase().includes(search.toLowerCase());
    
    const matchesCategory = categoryFilter === 'All' || doc.category === categoryFilter;
    const matchesType = !typeFilter || doc.name.endsWith(typeFilter);
    
    return matchesSearch && matchesCategory && matchesType;
  });

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] gap-4">
      {/* Top Section - Search and Filters */}
      <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <input
            type="text"
            placeholder="Search documents..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-amber-500"
          />
          <div className="flex gap-2 flex-wrap">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  categoryFilter === cat
                    ? 'bg-amber-500 text-gray-900'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2 mt-3">
          {fileTypes.map(type => (
            <button
              key={type}
              onClick={() => setTypeFilter(typeFilter === type ? null : type)}
              className={`px-3 py-1 text-xs rounded transition-colors ${
                typeFilter === type
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {type}
            </button>
          ))}
          <span className="text-xs text-gray-500 ml-auto">
            {filtered.length} documents
          </span>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 gap-4 overflow-hidden">
        {/* Left Panel - Document List */}
        <div className="w-96 bg-gray-900 rounded-lg border border-gray-800 overflow-hidden flex flex-col">
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center h-32 text-gray-500">
                Loading documents...
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-gray-500">
                No documents found
              </div>
            ) : (
              <div className="divide-y divide-gray-800">
                {filtered.map(doc => {
                  const colors = categoryColors[doc.category] || categoryColors.Other;
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
                  <span className={`px-2 py-0.5 text-xs rounded ${categoryColors[selected.category]?.bg} ${categoryColors[selected.category]?.text}`}>
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
