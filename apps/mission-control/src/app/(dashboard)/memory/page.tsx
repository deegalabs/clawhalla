'use client';

import { useState, useEffect } from 'react';

interface MemoryEntry {
  name: string;
  path: string;
  date: string;
  size: number;
  wordCount: number;
  content: string;
  modifiedAt: string;
}

interface LongTermMemory {
  content: string;
  wordCount: number;
  modifiedAt: string | null;
  size: number;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function daysAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return `${diff} days ago`;
}

function groupByMonth(entries: MemoryEntry[]): Record<string, MemoryEntry[]> {
  const groups: Record<string, MemoryEntry[]> = {};
  for (const entry of entries) {
    const month = entry.date.slice(0, 7); // YYYY-MM
    if (!groups[month]) groups[month] = [];
    groups[month].push(entry);
  }
  return groups;
}

export default function MemoryPage() {
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [longTerm, setLongTerm] = useState<LongTermMemory | null>(null);
  const [selected, setSelected] = useState<MemoryEntry | null>(null);
  const [showLongTerm, setShowLongTerm] = useState(false);
  const [search, setSearch] = useState('');
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch('/api/memory')
      .then(r => r.json())
      .then(data => {
        setEntries(data);
        // Expand current month by default
        const currentMonth = new Date().toISOString().slice(0, 7);
        setExpandedMonths(new Set([currentMonth]));
      });
    fetch('/api/memory/longterm')
      .then(r => r.json())
      .then(setLongTerm);
  }, []);

  const filtered = entries.filter(e =>
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    e.content.toLowerCase().includes(search.toLowerCase())
  );

  const grouped = groupByMonth(filtered);
  const months = Object.keys(grouped).sort().reverse();

  const toggleMonth = (month: string) => {
    const next = new Set(expandedMonths);
    if (next.has(month)) next.delete(month);
    else next.add(month);
    setExpandedMonths(next);
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      {/* Left Panel - Index */}
      <div className="w-80 bg-gray-900 rounded-lg border border-gray-800 flex flex-col overflow-hidden">
        {/* Search */}
        <div className="p-3 border-b border-gray-800">
          <input
            type="text"
            placeholder="Search memories..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-amber-500"
          />
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {/* Long-Term Memory Card */}
          {longTerm && (
            <button
              onClick={() => { setShowLongTerm(true); setSelected(null); }}
              className={`w-full text-left p-3 rounded-lg border transition-colors ${
                showLongTerm
                  ? 'bg-amber-500/10 border-amber-500'
                  : 'bg-gray-800 border-gray-700 hover:border-gray-600'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">🧠</span>
                <span className="font-medium text-gray-100">Long-Term Memory</span>
              </div>
              <div className="text-xs text-gray-500">
                {longTerm.wordCount.toLocaleString()} words • {longTerm.modifiedAt ? daysAgo(longTerm.modifiedAt) : 'Never updated'}
              </div>
            </button>
          )}

          {/* Daily Journal */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Daily Journal
            </h3>
            {months.map(month => (
              <div key={month} className="mb-2">
                <button
                  onClick={() => toggleMonth(month)}
                  className="w-full flex items-center justify-between px-2 py-1.5 text-sm text-gray-400 hover:text-gray-200"
                >
                  <span>{new Date(month + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
                  <span className="text-xs text-gray-600">{grouped[month].length}</span>
                </button>
                {expandedMonths.has(month) && (
                  <div className="ml-2 space-y-1">
                    {grouped[month].map(entry => (
                      <button
                        key={entry.path}
                        onClick={() => { setSelected(entry); setShowLongTerm(false); }}
                        className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                          selected?.path === entry.path
                            ? 'bg-amber-500/10 border border-amber-500 text-gray-100'
                            : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                        }`}
                      >
                        <div className="font-medium">{entry.date}</div>
                        <div className="text-xs text-gray-500">
                          {entry.wordCount} words • {(entry.size / 1024).toFixed(1)}KB
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {months.length === 0 && (
              <p className="text-sm text-gray-500 px-2">No journal entries found</p>
            )}
          </div>
        </div>
      </div>

      {/* Right Panel - Content */}
      <div className="flex-1 bg-gray-950 rounded-lg border border-gray-800 flex flex-col overflow-hidden">
        {showLongTerm && longTerm ? (
          <>
            <div className="p-4 border-b border-gray-800">
              <div className="flex items-center gap-2">
                <span className="text-xl">🧠</span>
                <h2 className="text-lg font-semibold text-gray-100">Long-Term Memory</h2>
              </div>
              <div className="text-sm text-gray-500 mt-1">
                {longTerm.wordCount.toLocaleString()} words • {longTerm.modifiedAt ? `Modified ${daysAgo(longTerm.modifiedAt)}` : ''}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <pre className="whitespace-pre-wrap text-sm text-gray-300 font-mono leading-relaxed">
                {longTerm.content}
              </pre>
            </div>
          </>
        ) : selected ? (
          <>
            <div className="p-4 border-b border-gray-800">
              <h2 className="text-lg font-semibold text-gray-100">{selected.date}</h2>
              <div className="text-sm text-gray-500 mt-1">
                {selected.wordCount.toLocaleString()} words • {(selected.size / 1024).toFixed(1)}KB • Modified {daysAgo(selected.modifiedAt)}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <pre className="whitespace-pre-wrap text-sm text-gray-300 font-mono leading-relaxed">
                {selected.content}
              </pre>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            Select a memory entry to view
          </div>
        )}
      </div>
    </div>
  );
}
