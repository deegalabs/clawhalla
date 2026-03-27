'use client';

import { useState, useEffect, useCallback, DragEvent } from 'react';
import { MarkdownView } from '@/components/ui/markdown-view';
import { AGENT_EMOJIS, AGENT_ROSTER, PRIORITY_COLORS } from '@/lib/agents';

// ─── Types ──────────────────────────────────────────────────────
interface BoardColumn {
  id: string;
  name: string;
  color?: string;
  wipLimit?: number;
}

interface Board {
  id: string;
  name: string;
  description: string | null;
  type: string;
  columns: BoardColumn[];
  owner: string;
  squad: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

interface Card {
  id: string;
  boardId: string;
  title: string;
  description: string | null;
  column: string;
  position: number;
  assignee: string | null;
  labels: string[];
  priority: string;
  dueDate: string | null;
  checklist: { text: string; done: boolean }[];
  attachments: string[];
  parentCardId: string | null;
  storyId: string | null;
  epicId: string | null;
  sprintId: string | null;
  progress: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  archivedAt: string | null;
}

interface BoardTemplate {
  id: string;
  name: string;
  description: string;
  type: string;
  columns: BoardColumn[];
}

interface CardComment {
  id: string;
  cardId: string;
  author: string;
  content: string;
  createdAt: string;
}

interface CardHistoryEntry {
  id: string;
  cardId: string;
  action: string;
  by: string;
  fromValue: string | null;
  toValue: string | null;
  timestamp: string;
}

// ─── Constants ──────────────────────────────────────────────────
const priorityConfig: Record<string, { border: string; dot: string; label: string }> = {
  critical: { border: 'border-l-red-500', dot: 'bg-red-500', label: 'Critical' },
  high: { border: 'border-l-amber-500', dot: 'bg-amber-500', label: 'High' },
  medium: { border: 'border-l-blue-500', dot: 'bg-blue-500', label: 'Medium' },
  low: { border: 'border-l-gray-600', dot: 'bg-gray-600', label: 'Low' },
};

function timeAgo(d?: string | null): string {
  if (!d) return '';
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

// ─── New Board Modal ────────────────────────────────────────────
function NewBoardModal({ onClose, onCreate }: {
  onClose: () => void;
  onCreate: (name: string, template: BoardTemplate) => void;
}) {
  const [templates, setTemplates] = useState<BoardTemplate[]>([]);
  const [selected, setSelected] = useState<BoardTemplate | null>(null);
  const [name, setName] = useState('');

  useEffect(() => {
    fetch('/api/boards/templates').then(r => r.json()).then(setTemplates).catch(console.error);
  }, []);

  const handleCreate = () => {
    if (!name.trim() || !selected) return;
    onCreate(name.trim(), selected);
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-start justify-center z-50 pt-16 px-4" onClick={onClose}>
      <div className="bg-[#111113] rounded-xl border border-[#1e1e21] w-full max-w-lg p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-gray-200">New Board</h3>

        <input
          type="text"
          placeholder="Board name"
          value={name}
          onChange={e => setName(e.target.value)}
          className="w-full px-3 py-2 bg-[#0a0a0b] border border-[#1e1e21] rounded text-sm text-gray-200 focus:outline-none focus:border-amber-500"
          autoFocus
        />

        <div>
          <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Choose template</div>
          <div className="grid grid-cols-2 gap-2">
            {templates.map(t => (
              <button
                key={t.id}
                onClick={() => { setSelected(t); if (!name) setName(t.name); }}
                className={`text-left p-3 rounded-lg border transition-colors ${
                  selected?.id === t.id
                    ? 'border-amber-500/50 bg-amber-500/5'
                    : 'border-[#1e1e21] bg-[#0a0a0b] hover:border-[#333]'
                }`}
              >
                <div className="text-xs font-medium text-gray-200">{t.name}</div>
                <div className="text-[10px] text-gray-500 mt-0.5">{t.description}</div>
                <div className="flex gap-1 mt-2 flex-wrap">
                  {t.columns.map(c => (
                    <span key={c.id} className="text-[9px] px-1.5 py-0.5 rounded" style={{ backgroundColor: `${c.color}20`, color: c.color }}>
                      {c.name}
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={handleCreate}
            disabled={!name.trim() || !selected}
            className="flex-1 px-4 py-2 text-xs font-medium bg-amber-500 text-gray-900 rounded hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Create Board
          </button>
          <button onClick={onClose} className="flex-1 px-4 py-2 text-xs text-gray-400 bg-[#1a1a1d] rounded">Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── Card Detail Modal ──────────────────────────────────────────
function CardDetailModal({ card, boardId, columns, onClose, onUpdate, onDelete }: {
  card: Card;
  boardId: string;
  columns: BoardColumn[];
  onClose: () => void;
  onUpdate: (card: Card) => void;
  onDelete: (id: string) => void;
}) {
  const [form, setForm] = useState({ ...card });
  const [tab, setTab] = useState<'details' | 'checklist' | 'comments' | 'history' | 'dispatch'>('details');
  const [checklist, setChecklist] = useState<{ text: string; done: boolean }[]>(card.checklist || []);
  const [newCheckItem, setNewCheckItem] = useState('');
  const [comments, setComments] = useState<CardComment[]>([]);
  const [history, setHistory] = useState<CardHistoryEntry[]>([]);
  const [newComment, setNewComment] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [dispatchResult, setDispatchResult] = useState<{ ok: boolean; output: string; duration?: number; agentId?: string } | null>(null);

  // Load comments and history on mount
  useEffect(() => {
    fetch(`/api/boards/${boardId}/cards/${card.id}`).then(r => r.json()).then(data => {
      if (data.history) setHistory(data.history);
    }).catch(console.error);

    fetch(`/api/boards/${boardId}/cards/${card.id}/comments`).then(r => r.json()).then(data => {
      if (Array.isArray(data)) setComments(data);
    }).catch(console.error);
  }, [boardId, card.id]);

  const handleSave = async () => {
    const updates: Record<string, unknown> = {};
    if (form.title !== card.title) updates.title = form.title;
    if (form.description !== card.description) updates.description = form.description;
    if (form.column !== card.column) updates.column = form.column;
    if (form.assignee !== card.assignee) updates.assignee = form.assignee;
    if (form.priority !== card.priority) updates.priority = form.priority;
    if (form.dueDate !== card.dueDate) updates.dueDate = form.dueDate;
    if (JSON.stringify(checklist) !== JSON.stringify(card.checklist)) updates.checklist = checklist;
    if (JSON.stringify(form.labels) !== JSON.stringify(card.labels)) updates.labels = form.labels;

    if (Object.keys(updates).length > 0) {
      await fetch(`/api/boards/${boardId}/cards/${card.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
    }
    onUpdate({ ...form, checklist });
  };

  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    const res = await fetch(`/api/boards/${boardId}/cards/${card.id}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: newComment.trim() }),
    });
    const comment = await res.json();
    setComments([...comments, comment]);
    setNewComment('');
  };

  const handleDispatch = async () => {
    setDispatching(true);
    setDispatchResult(null);
    setTab('dispatch');
    try {
      const res = await fetch('/api/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardId: card.id, taskId: card.id }),
      });
      const data = await res.json();
      setDispatchResult({
        ok: data.success,
        output: data.output || data.error || 'No output',
        duration: data.duration,
        agentId: data.agentId,
      });
      if (data.success) {
        const doneCol = columns.find(c => /^(done|deployed|resolved|published|closed)$/i.test(c.id));
        if (doneCol) setForm(prev => ({ ...prev, column: doneCol.id }));
      }
    } catch (err) {
      setDispatchResult({ ok: false, output: String(err) });
    }
    setDispatching(false);
  };

  const addCheckItem = () => {
    if (!newCheckItem.trim()) return;
    setChecklist([...checklist, { text: newCheckItem.trim(), done: false }]);
    setNewCheckItem('');
  };
  const toggleCheck = (i: number) => setChecklist(checklist.map((c, idx) => idx === i ? { ...c, done: !c.done } : c));
  const removeCheck = (i: number) => setChecklist(checklist.filter((_, idx) => idx !== i));
  const checkDone = checklist.filter(c => c.done).length;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-start justify-center z-50 pt-12 px-4" onClick={onClose}>
      <div className="bg-[#111113] rounded-xl border border-[#1e1e21] w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 py-3 border-b border-[#1e1e21] flex items-start justify-between shrink-0">
          <div className="flex-1">
            <input type="text" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
              className="w-full text-base font-semibold text-gray-100 bg-transparent focus:outline-none" />
            <div className="text-[10px] text-gray-600 mt-0.5">{form.id} {timeAgo(form.createdAt)}</div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg ml-4">×</button>
        </div>

        {/* Toolbar */}
        <div className="px-5 py-2 border-b border-[#1e1e21] flex flex-wrap gap-1.5 shrink-0">
          <select value={form.column} onChange={e => setForm({ ...form, column: e.target.value })}
            className="px-2 py-1 bg-[#0a0a0b] border border-[#1e1e21] rounded text-[11px] text-gray-300 focus:outline-none focus:border-amber-500">
            {columns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}
            className="px-2 py-1 bg-[#0a0a0b] border border-[#1e1e21] rounded text-[11px] text-gray-300 focus:outline-none focus:border-amber-500">
            {Object.entries(priorityConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select value={form.assignee || ''} onChange={e => setForm({ ...form, assignee: e.target.value || null })}
            className="px-2 py-1 bg-[#0a0a0b] border border-[#1e1e21] rounded text-[11px] text-gray-300 focus:outline-none focus:border-amber-500">
            <option value="">Unassigned</option>
            {AGENT_ROSTER.map(a => <option key={a.id} value={a.id}>{a.emoji} {a.name}</option>)}
          </select>
          <input type="date" value={form.dueDate || ''} onChange={e => setForm({ ...form, dueDate: e.target.value || null })}
            className="px-2 py-1 bg-[#0a0a0b] border border-[#1e1e21] rounded text-[11px] text-gray-300 focus:outline-none focus:border-amber-500" />
        </div>

        {/* Tabs */}
        <div className="px-5 pt-1 flex gap-0.5 border-b border-[#1e1e21] shrink-0">
          {(['details', 'checklist', 'comments', 'history', 'dispatch'] as const).map(t => (
            <button key={t} data-tab={t} onClick={() => setTab(t)}
              className={`px-3 py-1.5 text-[11px] rounded-t capitalize ${tab === t ? 'bg-[#1e1e21] text-gray-100' : 'text-gray-500 hover:text-gray-300'}`}>
              {t === 'dispatch' ? '▶ Dispatch' : t}
              {t === 'checklist' && checklist.length > 0 ? ` (${checkDone}/${checklist.length})` : ''}
              {t === 'comments' && comments.length > 0 ? ` (${comments.length})` : ''}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 min-h-0">
          {tab === 'details' && (
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] text-gray-500 uppercase mb-1">Description</label>
                <textarea rows={8} value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })}
                  placeholder="Card description... (markdown supported)"
                  className="w-full px-3 py-2 bg-[#0a0a0b] border border-[#1e1e21] rounded text-xs text-gray-300 font-mono focus:outline-none focus:border-amber-500 resize-none leading-relaxed" />
              </div>
              {form.description && (
                <div className="bg-[#0a0a0b] rounded-lg border border-[#1e1e21] p-3">
                  <MarkdownView content={form.description} maxHeight="max-h-[30vh]" />
                </div>
              )}
              <div className="grid grid-cols-3 gap-3 text-[11px]">
                <div><span className="text-gray-600">Created:</span> <span className="text-gray-400">{timeAgo(form.createdAt)}</span></div>
                <div><span className="text-gray-600">Updated:</span> <span className="text-gray-400">{timeAgo(form.updatedAt)}</span></div>
                <div><span className="text-gray-600">Completed:</span> <span className="text-gray-400">{form.completedAt ? timeAgo(form.completedAt) : '—'}</span></div>
              </div>
            </div>
          )}

          {tab === 'checklist' && (
            <div className="space-y-2">
              {checklist.length > 0 && (
                <div className="h-1.5 bg-[#1a1a1d] rounded-full overflow-hidden mb-3">
                  <div className="h-full bg-green-500 rounded-full" style={{ width: `${(checkDone / checklist.length) * 100}%` }} />
                </div>
              )}
              {checklist.map((item, i) => (
                <div key={i} className="flex items-center gap-2 group">
                  <button onClick={() => toggleCheck(i)} className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${item.done ? 'bg-green-500 border-green-500' : 'border-[#333] hover:border-gray-400'}`}>
                    {item.done && <span className="text-[9px] text-white">✓</span>}
                  </button>
                  <span className={`text-xs flex-1 ${item.done ? 'text-gray-600 line-through' : 'text-gray-300'}`}>{item.text}</span>
                  <button onClick={() => removeCheck(i)} className="text-[10px] text-gray-700 hover:text-red-400 opacity-0 group-hover:opacity-100">×</button>
                </div>
              ))}
              <div className="flex gap-2 mt-3">
                <input type="text" placeholder="Add item..." value={newCheckItem} onChange={e => setNewCheckItem(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addCheckItem()}
                  className="flex-1 px-3 py-1.5 bg-[#0a0a0b] border border-[#1e1e21] rounded text-xs text-gray-300 focus:outline-none focus:border-amber-500" />
                <button onClick={addCheckItem} className="px-3 py-1.5 text-[11px] bg-[#1a1a1d] text-gray-400 rounded hover:text-gray-200">Add</button>
              </div>
            </div>
          )}

          {tab === 'comments' && (
            <div className="space-y-3">
              {comments.length === 0 && <div className="text-xs text-gray-600 text-center py-4">No comments yet</div>}
              {comments.map(c => (
                <div key={c.id} className="bg-[#0a0a0b] rounded-lg border border-[#1e1e21] p-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-xs">{AGENT_EMOJIS[c.author] || '👤'}</span>
                    <span className="text-[11px] text-gray-300 font-medium capitalize">{c.author}</span>
                    <span className="text-[10px] text-gray-600">{timeAgo(c.createdAt)}</span>
                  </div>
                  <div className="text-xs text-gray-400">{c.content}</div>
                </div>
              ))}
              <div className="flex gap-2 mt-2">
                <input type="text" placeholder="Add comment..." value={newComment} onChange={e => setNewComment(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddComment()}
                  className="flex-1 px-3 py-1.5 bg-[#0a0a0b] border border-[#1e1e21] rounded text-xs text-gray-300 focus:outline-none focus:border-amber-500" />
                <button onClick={handleAddComment} className="px-3 py-1.5 text-[11px] bg-[#1a1a1d] text-gray-400 rounded hover:text-gray-200">Send</button>
              </div>
            </div>
          )}

          {tab === 'history' && (
            <div className="space-y-1.5">
              {history.length === 0 && <div className="text-xs text-gray-600 text-center py-4">No history</div>}
              {history.map(h => (
                <div key={h.id} className="flex items-center gap-2 text-[11px] px-2 py-1.5 bg-[#0a0a0b] rounded">
                  <span>{AGENT_EMOJIS[h.by] || '👤'}</span>
                  <span className="text-gray-400 capitalize">{h.by}</span>
                  <span className="text-gray-600">{h.action}</span>
                  {h.fromValue && <span className="text-gray-700">{h.fromValue}</span>}
                  {h.fromValue && h.toValue && <span className="text-gray-700">→</span>}
                  {h.toValue && <span className="text-gray-400">{h.toValue}</span>}
                  <span className="text-gray-700 ml-auto">{timeAgo(h.timestamp)}</span>
                </div>
              ))}
            </div>
          )}

          {tab === 'dispatch' && (
            <div className="space-y-3">
              <div className="bg-[#0a0a0b] rounded-lg border border-[#1e1e21] p-3">
                <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Dispatch Info</div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div><span className="text-gray-600">Agent:</span> <span className="text-amber-400">@{form.assignee || 'main'}</span></div>
                  <div><span className="text-gray-600">Priority:</span> <span className="text-gray-300">{form.priority}</span></div>
                  <div><span className="text-gray-600">Column:</span> <span className="text-gray-300">{columns.find(c => c.id === form.column)?.name || form.column}</span></div>
                  <div><span className="text-gray-600">Labels:</span> <span className="text-gray-300">{form.labels?.join(', ') || '—'}</span></div>
                </div>
              </div>

              {!dispatching && !dispatchResult && (
                <button onClick={handleDispatch}
                  className="w-full py-3 text-sm font-medium bg-amber-500 text-gray-900 rounded-lg hover:bg-amber-400 flex items-center justify-center gap-2">
                  <span>▶</span> Run Task — Dispatch to @{form.assignee || 'main'}
                </button>
              )}

              {dispatching && (
                <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-4 text-center">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <span className="flex gap-1">
                      <span className="w-2 h-2 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </span>
                  </div>
                  <div className="text-sm text-amber-400">Agent @{form.assignee || 'main'} executing...</div>
                  <div className="text-[10px] text-gray-600 mt-1">This may take up to 2 minutes</div>
                </div>
              )}

              {dispatchResult && (
                <div className={`rounded-lg border p-4 ${dispatchResult.ok ? 'bg-green-500/5 border-green-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">{dispatchResult.ok ? '✅' : '❌'}</span>
                    <div>
                      <div className={`text-sm font-medium ${dispatchResult.ok ? 'text-green-400' : 'text-red-400'}`}>
                        {dispatchResult.ok ? 'Task Completed' : 'Task Failed'}
                      </div>
                      <div className="text-[10px] text-gray-600">
                        Agent: @{dispatchResult.agentId}
                        {dispatchResult.duration && ` • ${Math.round(dispatchResult.duration / 1000)}s`}
                      </div>
                    </div>
                  </div>
                  <MarkdownView content={dispatchResult.output} maxHeight="max-h-60" />
                  {!dispatchResult.ok && (
                    <button onClick={() => { setDispatchResult(null); handleDispatch(); }}
                      className="mt-3 px-4 py-1.5 text-[11px] font-medium bg-amber-500 text-gray-900 rounded hover:bg-amber-400">
                      Retry
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-2.5 border-t border-[#1e1e21] flex items-center justify-between shrink-0">
          <div>
            {confirmDelete ? (
              <div className="flex gap-2">
                <button onClick={() => onDelete(form.id)} className="px-3 py-1 text-[11px] bg-red-500/20 text-red-400 rounded">Confirm</button>
                <button onClick={() => setConfirmDelete(false)} className="px-3 py-1 text-[11px] text-gray-500">Cancel</button>
              </div>
            ) : (
              <button onClick={() => setConfirmDelete(true)} className="px-3 py-1 text-[11px] text-gray-600 hover:text-red-400">Delete</button>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-1.5 text-[11px] text-gray-400 bg-[#1a1a1d] rounded">Cancel</button>
            <button onClick={handleSave} className="px-4 py-1.5 text-[11px] font-medium bg-amber-500 text-gray-900 rounded hover:bg-amber-400">Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── New Card Inline ────────────────────────────────────────────
function NewCardInline({ columnId, boardId, onCreated }: {
  columnId: string;
  boardId: string;
  onCreated: () => void;
}) {
  const [show, setShow] = useState(false);
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState('medium');

  const handleCreate = async () => {
    if (!title.trim()) return;
    await fetch(`/api/boards/${boardId}/cards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title.trim(), column: columnId, priority }),
    });
    setTitle('');
    setPriority('medium');
    setShow(false);
    onCreated();
  };

  if (!show) {
    return (
      <button onClick={() => setShow(true)}
        className="w-full text-left px-2.5 py-1.5 text-[11px] text-gray-600 hover:text-amber-400 rounded hover:bg-[#141416]">
        + Add card
      </button>
    );
  }

  return (
    <div className="p-2 space-y-1.5">
      <input type="text" placeholder="Card title..." value={title} onChange={e => setTitle(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setShow(false); }}
        className="w-full px-2.5 py-1.5 bg-[#0a0a0b] border border-[#1e1e21] rounded text-xs text-gray-200 focus:outline-none focus:border-amber-500"
        autoFocus />
      <div className="flex items-center gap-1.5">
        <select value={priority} onChange={e => setPriority(e.target.value)}
          className="px-1.5 py-1 bg-[#0a0a0b] border border-[#1e1e21] rounded text-[10px] text-gray-300 focus:outline-none">
          {Object.entries(priorityConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <button onClick={handleCreate} className="px-2.5 py-1 text-[10px] font-medium bg-amber-500 text-gray-900 rounded hover:bg-amber-400">Add</button>
        <button onClick={() => setShow(false)} className="px-2.5 py-1 text-[10px] text-gray-500">×</button>
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────
export default function BoardsPage() {
  const [boardsList, setBoardsList] = useState<Board[]>([]);
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
  const [activeBoard, setActiveBoard] = useState<(Board & { cards: Card[] }) | null>(null);
  const [showNewBoard, setShowNewBoard] = useState(false);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [filter, setFilter] = useState({ search: '', assignee: '', priority: '' });
  const [loading, setLoading] = useState(true);
  const [showBoardMenu, setShowBoardMenu] = useState(false);
  const [editingBoardName, setEditingBoardName] = useState(false);
  const [boardNameDraft, setBoardNameDraft] = useState('');
  const [confirmArchive, setConfirmArchive] = useState(false);

  // Fetch boards list
  const fetchBoards = useCallback(async () => {
    try {
      const res = await fetch('/api/boards');
      const data = await res.json();
      if (Array.isArray(data)) {
        setBoardsList(data.map((b: Board & { columns: string | BoardColumn[] }) => ({
          ...b,
          columns: typeof b.columns === 'string' ? JSON.parse(b.columns) : b.columns,
        })));
      }
    } catch (err) { console.error('[boards] fetch error:', err); }
  }, []);

  // Fetch active board with cards
  const fetchActiveBoard = useCallback(async (boardId: string) => {
    try {
      const res = await fetch(`/api/boards/${boardId}`);
      const data = await res.json();
      if (data.id) {
        setActiveBoard(data);
      }
    } catch (err) { console.error('[boards] fetch board error:', err); }
    setLoading(false);
  }, []);

  // Initial load
  useEffect(() => {
    fetchBoards().then(() => setLoading(false));
  }, [fetchBoards]);

  // When boards list loads, select first board
  useEffect(() => {
    if (boardsList.length > 0 && !activeBoardId) {
      setActiveBoardId(boardsList[0].id);
    }
  }, [boardsList, activeBoardId]);

  // When active board changes, fetch it
  useEffect(() => {
    if (activeBoardId) {
      fetchActiveBoard(activeBoardId);
    } else {
      setActiveBoard(null);
    }
  }, [activeBoardId, fetchActiveBoard]);

  // SSE for real-time updates
  useEffect(() => {
    let es: EventSource | null = null;
    try {
      es = new EventSource('/api/sse');
      es.onmessage = () => {
        fetchBoards();
        if (activeBoardId) fetchActiveBoard(activeBoardId);
      };
      es.onerror = () => { es?.close(); };
    } catch { /* SSE not available */ }
    return () => { if (es) es.close(); };
  }, [fetchBoards, fetchActiveBoard, activeBoardId]);

  // Polling fallback
  useEffect(() => {
    const interval = setInterval(() => {
      fetchBoards();
      if (activeBoardId) fetchActiveBoard(activeBoardId);
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchBoards, fetchActiveBoard, activeBoardId]);

  // Create board from template
  const handleCreateBoard = async (name: string, template: BoardTemplate) => {
    try {
      const res = await fetch('/api/boards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, type: template.type, columns: template.columns }),
      });
      const newBoard = await res.json();
      setShowNewBoard(false);
      await fetchBoards();
      setActiveBoardId(newBoard.id);
    } catch (err) { console.error('[boards] create error:', err); }
  };

  // Board management
  const handleRenameBoard = async () => {
    if (!activeBoardId || !boardNameDraft.trim()) return;
    await fetch(`/api/boards/${activeBoardId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: boardNameDraft.trim() }),
    });
    setEditingBoardName(false);
    fetchBoards();
    fetchActiveBoard(activeBoardId);
  };

  const handleArchiveBoard = async () => {
    if (!activeBoardId) return;
    await fetch(`/api/boards/${activeBoardId}`, { method: 'DELETE' });
    setConfirmArchive(false);
    setShowBoardMenu(false);
    const remaining = boardsList.filter(b => b.id !== activeBoardId);
    setActiveBoardId(remaining.length > 0 ? remaining[0].id : null);
    fetchBoards();
  };

  // Drag and drop
  const onDragStart = (e: DragEvent, cardId: string) => {
    e.dataTransfer.setData('text/plain', cardId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const onDragOver = (e: DragEvent, col: string) => {
    e.preventDefault();
    setDragOverColumn(col);
  };

  const onDrop = async (e: DragEvent, column: string) => {
    e.preventDefault();
    setDragOverColumn(null);
    const cardId = e.dataTransfer.getData('text/plain');
    if (!cardId || !activeBoardId) return;

    // Optimistic update
    setActiveBoard(prev => {
      if (!prev) return prev;
      return { ...prev, cards: prev.cards.map(c => c.id === cardId ? { ...c, column } : c) };
    });

    await fetch(`/api/boards/${activeBoardId}/cards/${cardId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ column }),
    });
  };

  // Card update handler
  const handleCardUpdate = (updatedCard: Card) => {
    setSelectedCard(null);
    if (activeBoardId) fetchActiveBoard(activeBoardId);
  };

  // Card delete handler
  const handleCardDelete = async (cardId: string) => {
    if (!activeBoardId) return;
    await fetch(`/api/boards/${activeBoardId}/cards/${cardId}`, { method: 'DELETE' });
    setSelectedCard(null);
    fetchActiveBoard(activeBoardId);
  };

  // Filter cards
  const cards = activeBoard?.cards || [];
  const filteredCards = cards.filter(c => {
    if (filter.search && !c.title.toLowerCase().includes(filter.search.toLowerCase())) return false;
    if (filter.assignee && c.assignee !== filter.assignee) return false;
    if (filter.priority && c.priority !== filter.priority) return false;
    return true;
  });

  const columns = activeBoard?.columns || [];
  const assignees = [...new Set(cards.map(c => c.assignee).filter(Boolean))] as string[];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-7rem)]">
        <div className="text-sm text-gray-500">Loading boards...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 shrink-0">
        <div className="flex items-center gap-3">
          {/* Board Selector */}
          <div className="flex items-center gap-1.5">
            <select
              value={activeBoardId || ''}
              onChange={e => setActiveBoardId(e.target.value)}
              className="px-2.5 py-1.5 bg-[#111113] border border-[#1e1e21] rounded-lg text-sm font-semibold text-gray-200 focus:outline-none focus:border-amber-500 appearance-none cursor-pointer"
            >
              {boardsList.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
            {activeBoard && (
              <span className="text-[10px] text-gray-600 capitalize">{activeBoard.type}</span>
            )}
            {/* Board menu */}
            {activeBoard && (
              <div className="relative">
                <button onClick={() => setShowBoardMenu(!showBoardMenu)}
                  className="px-1.5 py-0.5 text-gray-500 hover:text-gray-300 text-sm">⋯</button>
                {showBoardMenu && (
                  <div className="absolute top-7 left-0 bg-[#111113] border border-[#1e1e21] rounded-lg shadow-xl z-40 w-44 py-1"
                    onMouseLeave={() => { setShowBoardMenu(false); setConfirmArchive(false); }}>
                    {editingBoardName ? (
                      <div className="px-3 py-2">
                        <input type="text" value={boardNameDraft} onChange={e => setBoardNameDraft(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleRenameBoard(); if (e.key === 'Escape') setEditingBoardName(false); }}
                          className="w-full px-2 py-1 bg-[#0a0a0b] border border-[#1e1e21] rounded text-xs text-gray-200 focus:outline-none focus:border-amber-500"
                          autoFocus />
                        <div className="flex gap-1 mt-1">
                          <button onClick={handleRenameBoard} className="px-2 py-0.5 text-[10px] bg-amber-500 text-gray-900 rounded">Save</button>
                          <button onClick={() => setEditingBoardName(false)} className="px-2 py-0.5 text-[10px] text-gray-500">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <button onClick={() => { setEditingBoardName(true); setBoardNameDraft(activeBoard.name); }}
                          className="w-full text-left px-3 py-1.5 text-[11px] text-gray-300 hover:bg-[#1a1a1d]">Rename board</button>
                        {confirmArchive ? (
                          <div className="px-3 py-1.5">
                            <div className="text-[10px] text-red-400 mb-1">Archive this board?</div>
                            <div className="flex gap-1">
                              <button onClick={handleArchiveBoard} className="px-2 py-0.5 text-[10px] bg-red-500/20 text-red-400 rounded">Yes, archive</button>
                              <button onClick={() => setConfirmArchive(false)} className="px-2 py-0.5 text-[10px] text-gray-500">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <button onClick={() => setConfirmArchive(true)}
                            className="w-full text-left px-3 py-1.5 text-[11px] text-red-400 hover:bg-[#1a1a1d]">Archive board</button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Board stats */}
          {activeBoard && (
            <div className="flex items-center gap-3 text-[10px] text-gray-600">
              <span>{cards.length} cards</span>
              <span>{cards.filter(c => {
                const doneCol = columns.find(col => /^(done|deployed|resolved|published|closed)$/i.test(col.id));
                return doneCol && c.column === doneCol.id;
              }).length} done</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Filters */}
          <input type="text" placeholder="Search..." value={filter.search} onChange={e => setFilter({ ...filter, search: e.target.value })}
            className="px-2 py-1 bg-[#111113] border border-[#1e1e21] rounded text-[11px] text-gray-300 w-28 focus:outline-none focus:border-amber-500 placeholder-gray-600" />
          <select value={filter.assignee} onChange={e => setFilter({ ...filter, assignee: e.target.value })}
            className="px-2 py-1 bg-[#111113] border border-[#1e1e21] rounded text-[11px] text-gray-300 focus:outline-none">
            <option value="">All agents</option>
            {assignees.map(a => <option key={a} value={a}>{AGENT_EMOJIS[a] || '🤖'} @{a}</option>)}
          </select>
          <select value={filter.priority} onChange={e => setFilter({ ...filter, priority: e.target.value })}
            className="px-2 py-1 bg-[#111113] border border-[#1e1e21] rounded text-[11px] text-gray-300 focus:outline-none">
            <option value="">Priority</option>
            {Object.entries(priorityConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <button onClick={() => setShowNewBoard(true)}
            className="px-3 py-1.5 text-[11px] text-gray-400 bg-[#1a1a1d] rounded hover:text-gray-200 border border-[#1e1e21]">
            + Board
          </button>
        </div>
      </div>

      {/* Empty state — no boards */}
      {boardsList.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-3">
            <div className="text-4xl">📋</div>
            <div className="text-sm text-gray-300">No boards yet</div>
            <div className="text-xs text-gray-600">Create your first board to start tracking work</div>
            <button onClick={() => setShowNewBoard(true)}
              className="px-4 py-2 text-xs font-medium bg-amber-500 text-gray-900 rounded-lg hover:bg-amber-400">
              Create Board
            </button>
          </div>
        </div>
      )}

      {/* Kanban Board */}
      {activeBoard && columns.length > 0 && (
        <div className="grid gap-3 flex-1 min-h-0" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
          {columns.map(col => {
            const colCards = filteredCards.filter(c => c.column === col.id);
            const isOverWip = col.wipLimit && colCards.length > col.wipLimit;

            return (
              <div
                key={col.id}
                className={`bg-[#111113] rounded-lg border border-[#1e1e21] border-t-2 flex flex-col min-h-0 ${
                  dragOverColumn === col.id ? 'ring-1 ring-amber-500/30' : ''
                } ${isOverWip ? 'border-t-red-500' : ''}`}
                style={{ borderTopColor: isOverWip ? undefined : col.color }}
                onDragOver={e => onDragOver(e, col.id)}
                onDragLeave={() => setDragOverColumn(null)}
                onDrop={e => onDrop(e, col.id)}
              >
                {/* Column header */}
                <div className="px-3 py-2 flex items-center justify-between shrink-0 border-b border-[#1e1e21]">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: col.color || '#6b7280' }} />
                    <span className="text-xs font-medium text-gray-300">{col.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-gray-600">{colCards.length}</span>
                    {col.wipLimit && (
                      <span className={`text-[9px] px-1 py-0.5 rounded ${isOverWip ? 'bg-red-500/20 text-red-400' : 'bg-[#1a1a1d] text-gray-600'}`}>
                        max {col.wipLimit}
                      </span>
                    )}
                  </div>
                </div>

                {/* Cards */}
                <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
                  {colCards.map(card => (
                    <div
                      key={card.id}
                      draggable
                      onDragStart={e => onDragStart(e, card.id)}
                      className={`bg-[#0a0a0b] rounded-lg p-2.5 border-l-2 ${priorityConfig[card.priority]?.border || 'border-l-gray-600'} cursor-pointer hover:bg-[#141416] group/card`}
                    >
                      <div className="flex items-start justify-between" onClick={() => setSelectedCard(card)}>
                        <div className="text-[12px] text-gray-200 font-medium leading-tight flex-1">{card.title}</div>
                        {card.assignee && (
                          <button
                            onClick={e => { e.stopPropagation(); setSelectedCard(card); setTimeout(() => { const el = document.querySelector('[data-tab="dispatch"]') as HTMLButtonElement; el?.click(); }, 100); }}
                            className="opacity-0 group-hover/card:opacity-100 text-[9px] px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded hover:bg-amber-500/30 shrink-0 ml-1"
                            title="Dispatch to agent"
                          >▶</button>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap" onClick={() => setSelectedCard(card)}>
                        {card.assignee && (
                          <span className="flex items-center gap-1 text-[10px] text-amber-500">
                            {AGENT_EMOJIS[card.assignee] && <span className="text-xs">{AGENT_EMOJIS[card.assignee]}</span>}
                            @{card.assignee}
                          </span>
                        )}
                        {card.labels?.slice(0, 2).map(label => (
                          <span key={label} className="text-[9px] px-1 py-0.5 bg-[#1a1a1d] text-gray-500 rounded">{label}</span>
                        ))}
                        {card.checklist && card.checklist.length > 0 && (
                          <span className="text-[9px] text-gray-600">
                            ✓ {card.checklist.filter(c => c.done).length}/{card.checklist.length}
                          </span>
                        )}
                        {card.dueDate && (
                          <span className="text-[9px] text-gray-600">📅 {new Date(card.dueDate).toLocaleDateString('en', { month: 'short', day: 'numeric' })}</span>
                        )}
                      </div>
                    </div>
                  ))}
                  {colCards.length === 0 && !dragOverColumn && (
                    <div className="text-[10px] text-gray-700 text-center py-6">Empty</div>
                  )}
                  {dragOverColumn === col.id && colCards.length === 0 && (
                    <div className="text-[10px] text-amber-500 text-center py-6">Drop here</div>
                  )}
                </div>

                {/* Add card */}
                <div className="shrink-0 border-t border-[#1e1e21]">
                  <NewCardInline columnId={col.id} boardId={activeBoard.id} onCreated={() => fetchActiveBoard(activeBoard.id)} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      {selectedCard && activeBoard && (
        <CardDetailModal
          card={selectedCard}
          boardId={activeBoard.id}
          columns={columns}
          onClose={() => setSelectedCard(null)}
          onUpdate={handleCardUpdate}
          onDelete={handleCardDelete}
        />
      )}

      {showNewBoard && (
        <NewBoardModal onClose={() => setShowNewBoard(false)} onCreate={handleCreateBoard} />
      )}
    </div>
  );
}
