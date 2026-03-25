'use client';

import { useState, useEffect, useCallback } from 'react';

interface FeedbackEntry {
  id: string;
  agentId: string;
  taskId: string;
  type: 'correction' | 'praise' | 'pattern' | 'rule';
  content: string;
  context: string;
  createdAt: string;
}

const typeConfig = {
  correction: { label: 'Correction', color: 'bg-red-500/20 text-red-400', icon: '❌' },
  praise: { label: 'Praise', color: 'bg-green-500/20 text-green-400', icon: '✅' },
  pattern: { label: 'Pattern', color: 'bg-blue-500/20 text-blue-400', icon: '🔄' },
  rule: { label: 'Rule', color: 'bg-amber-500/20 text-amber-400', icon: '📏' },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function FeedbackPage() {
  const [entries, setEntries] = useState<FeedbackEntry[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ agentId: '', type: 'correction', content: '', context: '', taskId: '' });
  const [saving, setSaving] = useState(false);

  const fetchEntries = useCallback(async () => {
    try {
      const res = await fetch('/api/feedback');
      const data = await res.json();
      if (data.ok) setEntries(data.entries);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  const handleSubmit = async () => {
    if (!form.agentId || !form.content) return;
    setSaving(true);
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      setForm({ agentId: '', type: 'correction', content: '', context: '', taskId: '' });
      setShowForm(false);
      fetchEntries();
    } catch { /* silent */ }
    setSaving(false);
  };

  const filtered = filter === 'all' ? entries : entries.filter(e => e.type === filter);
  const stats = {
    total: entries.length,
    corrections: entries.filter(e => e.type === 'correction').length,
    praises: entries.filter(e => e.type === 'praise').length,
    patterns: entries.filter(e => e.type === 'pattern').length,
    rules: entries.filter(e => e.type === 'rule').length,
  };

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { label: 'Total', count: stats.total, color: 'text-gray-400' },
          { label: 'Corrections', count: stats.corrections, color: 'text-red-400' },
          { label: 'Praises', count: stats.praises, color: 'text-green-400' },
          { label: 'Patterns', count: stats.patterns, color: 'text-blue-400' },
          { label: 'Rules', count: stats.rules, color: 'text-amber-400' },
        ].map(s => (
          <div key={s.label} className="bg-[#111113] rounded-lg p-3 border border-[#1e1e21] text-center">
            <div className={`text-xl font-bold ${s.color}`}>{s.count}</div>
            <div className="text-[10px] text-gray-600 uppercase">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Header + filters */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-gray-100">Feedback</h2>
          <div className="flex gap-1 bg-[#111113] rounded-lg p-0.5 border border-[#1e1e21] ml-3">
            {['all', 'correction', 'praise', 'pattern', 'rule'].map(t => (
              <button
                key={t}
                onClick={() => setFilter(t)}
                className={`px-2.5 py-1 text-[11px] rounded capitalize ${
                  filter === t ? 'bg-[#1e1e21] text-gray-100' : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-3 py-1.5 text-xs font-medium bg-amber-500 text-gray-900 rounded hover:bg-amber-400"
        >
          {showForm ? 'Cancel' : '+ Add Feedback'}
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="bg-[#111113] rounded-lg border border-[#1e1e21] p-5 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <input type="text" placeholder="Agent ID (e.g., freya)" value={form.agentId}
              onChange={e => setForm({ ...form, agentId: e.target.value })}
              className="px-3 py-2 bg-[#0a0a0b] border border-[#1e1e21] rounded text-xs text-gray-200 focus:outline-none focus:border-amber-500" />
            <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}
              className="px-3 py-2 bg-[#0a0a0b] border border-[#1e1e21] rounded text-xs text-gray-200 focus:outline-none focus:border-amber-500">
              <option value="correction">Correction</option>
              <option value="praise">Praise</option>
              <option value="pattern">Pattern</option>
              <option value="rule">Rule</option>
            </select>
            <input type="text" placeholder="Task ID (optional)" value={form.taskId}
              onChange={e => setForm({ ...form, taskId: e.target.value })}
              className="px-3 py-2 bg-[#0a0a0b] border border-[#1e1e21] rounded text-xs text-gray-200 focus:outline-none focus:border-amber-500" />
          </div>
          <textarea placeholder="What happened? What should the agent learn?" rows={3} value={form.content}
            onChange={e => setForm({ ...form, content: e.target.value })}
            className="w-full px-3 py-2 bg-[#0a0a0b] border border-[#1e1e21] rounded text-xs text-gray-200 focus:outline-none focus:border-amber-500 resize-none" />
          <input type="text" placeholder="Context (optional)" value={form.context}
            onChange={e => setForm({ ...form, context: e.target.value })}
            className="w-full px-3 py-2 bg-[#0a0a0b] border border-[#1e1e21] rounded text-xs text-gray-200 focus:outline-none focus:border-amber-500" />
          <button onClick={handleSubmit} disabled={saving}
            className="px-4 py-1.5 text-xs font-medium bg-amber-500 text-gray-900 rounded hover:bg-amber-400 disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Feedback'}
          </button>
        </div>
      )}

      {/* Entries */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="bg-[#111113] rounded-lg border border-[#1e1e21] p-8 text-center text-gray-600">
            No feedback entries yet
          </div>
        ) : (
          filtered.map(entry => {
            const config = typeConfig[entry.type];
            return (
              <div key={entry.id} className="bg-[#111113] rounded-lg border border-[#1e1e21] px-5 py-3 hover:bg-[#141416]">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span>{config.icon}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded ${config.color}`}>{config.label}</span>
                      <span className="text-xs text-amber-500">@{entry.agentId}</span>
                      {entry.taskId && <span className="text-[10px] text-gray-600">{entry.taskId}</span>}
                    </div>
                    <p className="text-sm text-gray-300">{entry.content}</p>
                    {entry.context && <p className="text-xs text-gray-500 mt-1">{entry.context}</p>}
                  </div>
                  <span className="text-[10px] text-gray-600 ml-4 shrink-0">{timeAgo(entry.createdAt)}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
