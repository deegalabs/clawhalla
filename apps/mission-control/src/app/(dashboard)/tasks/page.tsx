'use client';

import { useState, useEffect, useCallback, DragEvent } from 'react';
import { MarkdownView } from '@/components/ui/markdown-view';
import { AGENT_EMOJIS, AGENT_ROSTER, PRIORITY_COLORS } from '@/lib/agents';
import { useSquad } from '@/hooks/use-squad';
import { SQUADS } from '@/lib/squads';

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
  delegatedTo: string | null;
  delegatedFrom: string | null;
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
    <div className="fixed inset-0 bg-black/70 flex items-start justify-center z-50 pt-16 px-4" onClick={onClose} role="dialog" aria-modal="true" aria-label="New Board">
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

// ─── Card Detail Modal (Trello-style) ───────────────────────────
function CardDetailModal({ card, boardId, columns, onClose, onUpdate, onDelete }: {
  card: Card;
  boardId: string;
  columns: BoardColumn[];
  onClose: () => void;
  onUpdate: (card: Card) => void;
  onDelete: (id: string, mode: 'archive' | 'delete') => void;
}) {
  const { activeSquad } = useSquad();
  const [form, setForm] = useState({ ...card });
  const [checklist, setChecklist] = useState<{ text: string; done: boolean }[]>(card.checklist || []);
  const [newCheckItem, setNewCheckItem] = useState('');
  const [comments, setComments] = useState<CardComment[]>([]);
  const [history, setHistory] = useState<CardHistoryEntry[]>([]);
  const [newComment, setNewComment] = useState('');
  const [editingDesc, setEditingDesc] = useState(false);
  const [showChecklist, setShowChecklist] = useState((card.checklist || []).length > 0);
  const [dispatching, setDispatching] = useState(false);
  const [dispatchResult, setDispatchResult] = useState<{ ok: boolean; output: string; duration?: number; agentId?: string } | null>(null);
  const [showActivity, setShowActivity] = useState(true);
  const [confirmAction, setConfirmAction] = useState<'archive' | 'delete' | null>(null);
  const [labelInput, setLabelInput] = useState('');
  const [dirty, setDirty] = useState(false);
  const [showDelegate, setShowDelegate] = useState(false);
  const [delegateSquad, setDelegateSquad] = useState('');
  const [delegateMsg, setDelegateMsg] = useState('');
  const [delegating, setDelegating] = useState(false);
  const [delegateResult, setDelegateResult] = useState<{ ok: boolean; squad?: string; boardName?: string; error?: string } | null>(null);

  // Load comments and history on mount
  useEffect(() => {
    fetch(`/api/boards/${boardId}/cards/${card.id}`).then(r => r.json()).then(data => {
      if (data.history) setHistory(data.history);
    }).catch(console.error);
    fetch(`/api/boards/${boardId}/cards/${card.id}/comments`).then(r => r.json()).then(data => {
      if (Array.isArray(data)) setComments(data);
    }).catch(console.error);
  }, [boardId, card.id]);

  // Track dirty state
  const markDirty = () => { if (!dirty) setDirty(true); };
  const updateForm = (patch: Partial<Card>) => { setForm(prev => ({ ...prev, ...patch })); markDirty(); };

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
    setDirty(false);
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
    try {
      const res = await fetch('/api/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardId: card.id }),
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
        if (doneCol) updateForm({ column: doneCol.id });
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
    markDirty();
  };
  const toggleCheck = (i: number) => { setChecklist(checklist.map((c, idx) => idx === i ? { ...c, done: !c.done } : c)); markDirty(); };
  const removeCheck = (i: number) => { setChecklist(checklist.filter((_, idx) => idx !== i)); markDirty(); };
  const checkDone = checklist.filter(c => c.done).length;

  const addLabel = () => {
    if (!labelInput.trim()) return;
    const newLabels = [...(form.labels || []), labelInput.trim()];
    updateForm({ labels: newLabels });
    setLabelInput('');
  };
  const removeLabel = (label: string) => {
    updateForm({ labels: (form.labels || []).filter(l => l !== label) });
  };

  // Merge comments + history into unified activity feed
  const activityFeed = [
    ...comments.map(c => ({ type: 'comment' as const, id: c.id, by: c.author, content: c.content, time: c.createdAt })),
    ...history.map(h => ({ type: 'history' as const, id: h.id, by: h.by, action: h.action, from: h.fromValue, to: h.toValue, time: h.timestamp })),
  ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

  const currentCol = columns.find(c => c.id === form.column);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-start justify-center z-50 pt-8 px-4 overflow-y-auto" onClick={onClose} role="dialog" aria-modal="true" aria-label={`Card: ${form.title}`}>
      <div className="bg-[#18181b] rounded-xl border border-[#27272a] w-full max-w-3xl mb-8 overflow-hidden" onClick={e => e.stopPropagation()}>

        {/* Header — column indicator + title */}
        <div className="h-2 rounded-t-xl" style={{ backgroundColor: currentCol?.color || '#6b7280' }} />
        <div className="px-6 pt-4 pb-3 flex items-start justify-between">
          <div className="flex-1 mr-4">
            <input type="text" value={form.title} onChange={e => updateForm({ title: e.target.value })}
              className="w-full text-lg font-semibold text-gray-100 bg-transparent focus:outline-none focus:bg-[#0a0a0b] focus:px-2 focus:py-1 focus:-mx-2 focus:-my-1 rounded" />
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] text-gray-600">in</span>
              <span className="text-[10px] font-medium text-gray-400" style={{ color: currentCol?.color }}>{currentCol?.name || form.column}</span>
              <span className="text-[10px] text-gray-700">•</span>
              <span className="text-[10px] text-gray-600">{form.id}</span>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 p-1 hover:bg-[#27272a] rounded" aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          </button>
        </div>

        {/* Two-column layout: Main + Sidebar */}
        <div className="flex gap-0">
          {/* ─── Main Content (left) ─── */}
          <div className="flex-1 px-6 pb-6 min-w-0 space-y-5">

            {/* Labels */}
            {(form.labels?.length > 0 || labelInput) && (
              <div>
                <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5 font-medium">Labels</div>
                <div className="flex flex-wrap gap-1.5">
                  {form.labels?.map(label => (
                    <span key={label} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 bg-amber-500/15 text-amber-400 rounded-full group">
                      {label}
                      <button onClick={() => removeLabel(label)} className="text-amber-600 hover:text-amber-300 opacity-0 group-hover:opacity-100">×</button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Description */}
            <div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5 font-medium">Description</div>
              {editingDesc ? (
                <div className="space-y-2">
                  <textarea rows={6} value={form.description || ''} onChange={e => updateForm({ description: e.target.value })}
                    placeholder="Add a detailed description... (markdown supported)"
                    className="w-full px-3 py-2 bg-[#0a0a0b] border border-[#27272a] rounded-lg text-xs text-gray-300 font-mono focus:outline-none focus:border-amber-500 resize-y leading-relaxed"
                    autoFocus />
                  <div className="flex gap-2">
                    <button onClick={() => setEditingDesc(false)} className="px-3 py-1 text-[11px] font-medium bg-amber-500 text-gray-900 rounded hover:bg-amber-400">Done</button>
                    <button onClick={() => { updateForm({ description: card.description }); setEditingDesc(false); }} className="px-3 py-1 text-[11px] text-gray-500">Cancel</button>
                  </div>
                </div>
              ) : (
                <div onClick={() => setEditingDesc(true)} className="cursor-pointer rounded-lg hover:bg-[#0a0a0b] transition-colors">
                  {form.description ? (
                    <div className="px-3 py-2 border border-transparent hover:border-[#27272a] rounded-lg">
                      <MarkdownView content={form.description} maxHeight="max-h-[30vh]" />
                    </div>
                  ) : (
                    <div className="px-3 py-3 bg-[#0a0a0b] border border-[#27272a] rounded-lg text-xs text-gray-600">
                      Click to add a description...
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Checklist */}
            {showChecklist && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">
                    Checklist {checklist.length > 0 && <span className="text-gray-600">({checkDone}/{checklist.length})</span>}
                  </div>
                  {checklist.length === 0 && (
                    <button onClick={() => setShowChecklist(false)} className="text-[10px] text-gray-600 hover:text-gray-400">Hide</button>
                  )}
                </div>
                {checklist.length > 0 && (
                  <div className="h-1.5 bg-[#27272a] rounded-full overflow-hidden mb-3">
                    <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${(checkDone / checklist.length) * 100}%` }} />
                  </div>
                )}
                <div className="space-y-1">
                  {checklist.map((item, i) => (
                    <div key={i} className="flex items-center gap-2.5 py-1 px-1 rounded hover:bg-[#0a0a0b] group">
                      <button onClick={() => toggleCheck(i)} className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${item.done ? 'bg-green-500 border-green-500' : 'border-[#444] hover:border-gray-400'}`}>
                        {item.done && <span className="text-[9px] text-white font-bold">✓</span>}
                      </button>
                      <span className={`text-xs flex-1 ${item.done ? 'text-gray-600 line-through' : 'text-gray-300'}`}>{item.text}</span>
                      <button onClick={() => removeCheck(i)} className="text-[10px] text-gray-700 hover:text-red-400 opacity-0 group-hover:opacity-100 px-1">×</button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 mt-2">
                  <input type="text" placeholder="Add item..." value={newCheckItem} onChange={e => setNewCheckItem(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addCheckItem()}
                    className="flex-1 px-3 py-1.5 bg-[#0a0a0b] border border-[#27272a] rounded text-xs text-gray-300 focus:outline-none focus:border-amber-500" />
                  <button onClick={addCheckItem} className="px-3 py-1.5 text-[11px] bg-[#27272a] text-gray-400 rounded hover:text-gray-200">Add</button>
                </div>
              </div>
            )}

            {/* Dispatch Result (if any) */}
            {(dispatching || dispatchResult) && (
              <div>
                <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5 font-medium">Dispatch</div>
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

            {/* Activity Feed (comments + history merged) */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Activity</div>
                <button onClick={() => setShowActivity(!showActivity)}
                  className="text-[10px] text-gray-600 hover:text-gray-400">{showActivity ? 'Hide' : 'Show'}</button>
              </div>

              {/* Comment input */}
              <div className="flex gap-2 mb-3">
                <span className="w-7 h-7 rounded-full bg-[#27272a] flex items-center justify-center text-xs shrink-0">👤</span>
                <div className="flex-1">
                  <input type="text" placeholder="Write a comment..." value={newComment} onChange={e => setNewComment(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddComment()}
                    className="w-full px-3 py-2 bg-[#0a0a0b] border border-[#27272a] rounded-lg text-xs text-gray-300 focus:outline-none focus:border-amber-500" />
                  {newComment.trim() && (
                    <button onClick={handleAddComment} className="mt-1.5 px-3 py-1 text-[11px] font-medium bg-amber-500 text-gray-900 rounded hover:bg-amber-400">
                      Save
                    </button>
                  )}
                </div>
              </div>

              {showActivity && (
                <div className="space-y-2">
                  {activityFeed.length === 0 && <div className="text-xs text-gray-600 text-center py-3">No activity yet</div>}
                  {activityFeed.map(item => (
                    <div key={item.id} className="flex gap-2">
                      <span className="w-7 h-7 rounded-full bg-[#27272a] flex items-center justify-center text-xs shrink-0 mt-0.5">
                        {AGENT_EMOJIS[item.by] || '👤'}
                      </span>
                      <div className="flex-1 min-w-0">
                        {item.type === 'comment' ? (
                          <div className="bg-[#0a0a0b] border border-[#27272a] rounded-lg p-2.5">
                            <div className="flex items-center gap-1.5 mb-1">
                              <span className="text-[11px] text-gray-300 font-medium capitalize">{item.by}</span>
                              <span className="text-[10px] text-gray-600">{timeAgo(item.time)}</span>
                            </div>
                            <div className="text-xs text-gray-400 whitespace-pre-wrap">{item.content}</div>
                          </div>
                        ) : (
                          <div className="py-1.5 flex items-center flex-wrap gap-1 text-[11px]">
                            <span className="text-gray-300 font-medium capitalize">{item.by}</span>
                            <span className="text-gray-500">{item.action}</span>
                            {item.from && <span className="text-gray-600 bg-[#27272a] px-1.5 py-0.5 rounded">{item.from}</span>}
                            {item.from && item.to && <span className="text-gray-600">→</span>}
                            {item.to && <span className="text-gray-400 bg-[#27272a] px-1.5 py-0.5 rounded">{item.to}</span>}
                            <span className="text-gray-700 ml-auto">{timeAgo(item.time)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ─── Sidebar (right) ─── */}
          <div className="w-48 shrink-0 pr-6 pb-6 space-y-4">
            {/* Move */}
            <div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5 font-medium">Move to</div>
              <select value={form.column} onChange={e => updateForm({ column: e.target.value })}
                className="w-full px-2.5 py-1.5 bg-[#0a0a0b] border border-[#27272a] rounded-lg text-[11px] text-gray-300 focus:outline-none focus:border-amber-500">
                {columns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            {/* Assignee */}
            <div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5 font-medium">Assignee</div>
              <select value={form.assignee || ''} onChange={e => updateForm({ assignee: e.target.value || null })}
                className="w-full px-2.5 py-1.5 bg-[#0a0a0b] border border-[#27272a] rounded-lg text-[11px] text-gray-300 focus:outline-none focus:border-amber-500">
                <option value="">Unassigned</option>
                {AGENT_ROSTER.map(a => <option key={a.id} value={a.id}>{a.emoji} {a.name}</option>)}
              </select>
            </div>

            {/* Priority */}
            <div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5 font-medium">Priority</div>
              <div className="grid grid-cols-2 gap-1">
                {Object.entries(priorityConfig).map(([k, v]) => (
                  <button key={k} onClick={() => updateForm({ priority: k })}
                    className={`px-2 py-1 text-[10px] rounded border transition-colors ${
                      form.priority === k
                        ? 'border-amber-500/50 bg-amber-500/10 text-amber-400'
                        : 'border-[#27272a] bg-[#0a0a0b] text-gray-500 hover:text-gray-300'
                    }`}>
                    <span className={`inline-block w-1.5 h-1.5 rounded-full ${v.dot} mr-1`} />{v.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Due Date */}
            <div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5 font-medium">Due Date</div>
              <input type="date" value={form.dueDate || ''} onChange={e => updateForm({ dueDate: e.target.value || null })}
                className="w-full px-2.5 py-1.5 bg-[#0a0a0b] border border-[#27272a] rounded-lg text-[11px] text-gray-300 focus:outline-none focus:border-amber-500" />
              {form.dueDate && (
                <button onClick={() => updateForm({ dueDate: null })} className="text-[10px] text-gray-600 hover:text-gray-400 mt-1">Clear date</button>
              )}
            </div>

            {/* Labels */}
            <div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5 font-medium">Labels</div>
              <div className="flex gap-1">
                <input type="text" placeholder="Add label" value={labelInput} onChange={e => setLabelInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addLabel()}
                  className="flex-1 px-2 py-1 bg-[#0a0a0b] border border-[#27272a] rounded text-[10px] text-gray-300 focus:outline-none focus:border-amber-500 min-w-0" />
                <button onClick={addLabel} className="px-2 py-1 text-[10px] bg-[#27272a] text-gray-400 rounded hover:text-gray-200">+</button>
              </div>
            </div>

            {/* Sidebar divider */}
            <div className="border-t border-[#27272a]" />

            {/* Actions */}
            <div className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Actions</div>

            {/* Checklist toggle */}
            {!showChecklist && (
              <button onClick={() => setShowChecklist(true)}
                className="w-full text-left px-3 py-2 text-[11px] bg-[#0a0a0b] border border-[#27272a] rounded-lg text-gray-300 hover:bg-[#1a1a1d] hover:border-[#333]">
                ☑ Add Checklist
              </button>
            )}

            {/* Dispatch */}
            <button onClick={handleDispatch} disabled={dispatching}
              className="w-full text-left px-3 py-2 text-[11px] bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-400 hover:bg-amber-500/20 disabled:opacity-50">
              ▶ Dispatch to @{form.assignee || 'main'}
            </button>

            {/* Delegate to another squad */}
            {!form.delegatedTo && (
              <>
                <button onClick={() => setShowDelegate(!showDelegate)}
                  className="w-full text-left px-3 py-2 text-[11px] bg-blue-500/10 border border-blue-500/20 rounded-lg text-blue-400 hover:bg-blue-500/20">
                  🔄 Delegate to Squad
                </button>
                {showDelegate && (
                  <div className="bg-[#0a0a0b] border border-[#27272a] rounded-lg p-3 space-y-2">
                    <div className="text-[10px] text-gray-400 font-medium">Send this task to another squad</div>
                    <select value={delegateSquad} onChange={e => setDelegateSquad(e.target.value)}
                      className="w-full bg-[#111113] border border-[#27272a] rounded px-2 py-1.5 text-[11px] text-gray-200 focus:border-blue-500/50 focus:outline-none">
                      <option value="">Select squad...</option>
                      {SQUADS.filter(s => s.id !== activeSquad).map(s => (
                        <option key={s.id} value={s.id}>{s.emoji} {s.name}</option>
                      ))}
                    </select>
                    <textarea value={delegateMsg} onChange={e => setDelegateMsg(e.target.value)}
                      placeholder="Context for the receiving squad (optional)"
                      rows={2}
                      className="w-full bg-[#111113] border border-[#27272a] rounded px-2 py-1.5 text-[11px] text-gray-200 placeholder:text-gray-600 focus:border-blue-500/50 focus:outline-none resize-none" />
                    <div className="flex gap-1.5">
                      <button disabled={!delegateSquad || delegating} onClick={async () => {
                        setDelegating(true);
                        try {
                          const res = await fetch(`/api/boards/${boardId}/cards/${form.id}/delegate`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ targetSquad: delegateSquad, message: delegateMsg }),
                          });
                          const data = await res.json();
                          setDelegateResult(data.ok ? { ok: true, squad: delegateSquad, boardName: data.delegatedCard?.boardName } : { ok: false, error: data.error });
                          if (data.ok) onUpdate({ ...form, column: 'delegated', delegatedTo: data.delegatedCard?.id });
                        } catch (err) { setDelegateResult({ ok: false, error: String(err) }); }
                        setDelegating(false);
                      }}
                        className="flex-1 px-2 py-1.5 text-[11px] font-medium bg-blue-500/20 text-blue-400 rounded hover:bg-blue-500/30 disabled:opacity-50">
                        {delegating ? 'Delegating...' : 'Delegate'}
                      </button>
                      <button onClick={() => { setShowDelegate(false); setDelegateResult(null); }}
                        className="px-2 py-1.5 text-[11px] text-gray-500 rounded hover:text-gray-300">
                        Cancel
                      </button>
                    </div>
                    {delegateResult && (
                      <div className={`text-[10px] px-2 py-1.5 rounded ${delegateResult.ok ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                        {delegateResult.ok ? `Delegated to ${delegateResult.squad} → ${delegateResult.boardName}` : delegateResult.error}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
            {form.delegatedTo && (
              <div className="px-3 py-2 text-[11px] bg-blue-500/10 border border-blue-500/20 rounded-lg text-blue-400">
                🔄 Delegated — waiting for result
              </div>
            )}
            {form.delegatedFrom && (
              <div className="px-3 py-2 text-[11px] bg-purple-500/10 border border-purple-500/20 rounded-lg text-purple-400">
                📥 Received from another squad
              </div>
            )}

            {/* Save */}
            <button onClick={handleSave} disabled={!dirty}
              className={`w-full px-3 py-2 text-[11px] font-medium rounded-lg transition-colors ${
                dirty
                  ? 'bg-amber-500 text-gray-900 hover:bg-amber-400'
                  : 'bg-[#27272a] text-gray-600 cursor-not-allowed'
              }`}>
              {dirty ? 'Save Changes' : 'Saved'}
            </button>

            <div className="border-t border-[#27272a]" />

            {/* Archive / Delete */}
            {confirmAction === null && (
              <>
                <button onClick={() => setConfirmAction('archive')}
                  className="w-full text-left px-3 py-2 text-[11px] bg-[#0a0a0b] border border-[#27272a] rounded-lg text-gray-400 hover:bg-[#1a1a1d]">
                  📦 Archive Card
                </button>
                <button onClick={() => setConfirmAction('delete')}
                  className="w-full text-left px-3 py-2 text-[11px] bg-[#0a0a0b] border border-red-500/10 rounded-lg text-red-400/60 hover:bg-red-500/5 hover:text-red-400">
                  🗑 Delete Card
                </button>
              </>
            )}
            {confirmAction && (
              <div className="bg-[#0a0a0b] border border-[#27272a] rounded-lg p-3 space-y-2">
                <div className="text-[11px] text-gray-300">
                  {confirmAction === 'archive'
                    ? 'Archive this card? You can restore it later.'
                    : 'Permanently delete this card? This cannot be undone.'}
                </div>
                <div className="flex gap-1.5">
                  <button onClick={() => onDelete(form.id, confirmAction)}
                    className={`flex-1 px-2 py-1.5 text-[11px] font-medium rounded ${
                      confirmAction === 'delete' ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'
                    }`}>
                    {confirmAction === 'archive' ? 'Archive' : 'Delete'}
                  </button>
                  <button onClick={() => setConfirmAction(null)} className="flex-1 px-2 py-1.5 text-[11px] text-gray-500 bg-[#27272a] rounded">Cancel</button>
                </div>
              </div>
            )}

            {/* Metadata */}
            <div className="space-y-1 text-[10px] text-gray-600 pt-1">
              <div>Created {timeAgo(form.createdAt)} by <span className="text-gray-500">{form.createdBy}</span></div>
              <div>Updated {timeAgo(form.updatedAt)}</div>
              {form.completedAt && <div className="text-green-500/60">Completed {timeAgo(form.completedAt)}</div>}
            </div>
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
  const { activeSquad } = useSquad();
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
  const [showArchived, setShowArchived] = useState(false);
  const [archivedCards, setArchivedCards] = useState<Card[]>([]);

  // Fetch boards list (filtered by active squad)
  const fetchBoards = useCallback(async () => {
    try {
      const url = activeSquad ? `/api/boards?squad=${activeSquad}` : '/api/boards';
      const res = await fetch(url);
      const data = await res.json();
      if (Array.isArray(data)) {
        setBoardsList(data.map((b: Board & { columns: string | BoardColumn[] }) => ({
          ...b,
          columns: typeof b.columns === 'string' ? JSON.parse(b.columns) : b.columns,
        })));
      }
    } catch (err) { console.error('[boards] fetch error:', err); }
  }, [activeSquad]);

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

  // Initial load + re-fetch when squad changes
  useEffect(() => {
    setActiveBoardId(null);
    setActiveBoard(null);
    setBoardsList([]);
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
        body: JSON.stringify({ name, type: template.type, columns: template.columns, squad: activeSquad }),
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

  // Archived cards
  const fetchArchivedCards = useCallback(async () => {
    if (!activeBoardId) return;
    try {
      const res = await fetch(`/api/boards/${activeBoardId}/cards?archived=true`);
      const data = await res.json();
      if (Array.isArray(data)) setArchivedCards(data);
    } catch (err) { console.error('[boards] fetch archived error:', err); }
  }, [activeBoardId]);

  const handleRestoreCard = async (cardId: string) => {
    if (!activeBoardId) return;
    await fetch(`/api/boards/${activeBoardId}/cards/${cardId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archivedAt: null }),
    });
    fetchArchivedCards();
    fetchActiveBoard(activeBoardId);
  };

  const handleHardDeleteCard = async (cardId: string) => {
    if (!activeBoardId) return;
    await fetch(`/api/boards/${activeBoardId}/cards/${cardId}?hard=true`, { method: 'DELETE' });
    fetchArchivedCards();
  };

  useEffect(() => {
    if (showArchived) fetchArchivedCards();
  }, [showArchived, fetchArchivedCards]);

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

  // Card archive/delete handler
  const handleCardDelete = async (cardId: string, mode: 'archive' | 'delete') => {
    if (!activeBoardId) return;
    const url = mode === 'delete'
      ? `/api/boards/${activeBoardId}/cards/${cardId}?hard=true`
      : `/api/boards/${activeBoardId}/cards/${cardId}`;
    await fetch(url, { method: 'DELETE' });
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

  // Add virtual "delegated" column if any cards have been delegated
  const baseColumns = activeBoard?.columns || [];
  const hasDelegated = cards.some(c => c.column === 'delegated');
  const columns = hasDelegated && !baseColumns.some(c => c.id === 'delegated')
    ? [...baseColumns, { id: 'delegated', name: 'Delegated', color: '#3b82f6' }]
    : baseColumns;
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
          {activeBoard && (
            <button onClick={() => setShowArchived(!showArchived)}
              className={`px-3 py-1.5 text-[11px] rounded border border-[#1e1e21] ${showArchived ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' : 'text-gray-400 bg-[#1a1a1d] hover:text-gray-200'}`}>
              📦 {showArchived ? 'Hide Archived' : 'Archived'}
            </button>
          )}
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
                        {card.delegatedTo && (
                          <span className="text-[9px] px-1 py-0.5 bg-blue-500/10 text-blue-400 rounded">🔄 delegated</span>
                        )}
                        {card.delegatedFrom && (
                          <span className="text-[9px] px-1 py-0.5 bg-purple-500/10 text-purple-400 rounded">📥 cross-squad</span>
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

      {/* Archived Cards Panel */}
      {showArchived && activeBoard && (
        <div className="mt-3 bg-[#111113] rounded-lg border border-[#1e1e21] p-4 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-sm">📦</span>
              <span className="text-xs font-medium text-gray-300">Archived Cards</span>
              <span className="text-[10px] text-gray-600">({archivedCards.length})</span>
            </div>
            <button onClick={() => setShowArchived(false)} className="text-gray-500 hover:text-gray-300 text-sm">×</button>
          </div>
          {archivedCards.length === 0 ? (
            <div className="text-xs text-gray-600 text-center py-4">No archived cards</div>
          ) : (
            <div className="space-y-1.5 max-h-60 overflow-y-auto">
              {archivedCards.map(card => (
                <div key={card.id} className="flex items-center gap-3 px-3 py-2 bg-[#0a0a0b] rounded-lg border border-[#1e1e21] group">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-gray-300 truncate">{card.title}</div>
                    <div className="text-[10px] text-gray-600">
                      {card.column} {card.assignee && <span>• @{card.assignee}</span>}
                    </div>
                  </div>
                  <button onClick={() => handleRestoreCard(card.id)}
                    className="px-2.5 py-1 text-[10px] bg-green-500/10 text-green-400 rounded hover:bg-green-500/20 shrink-0">
                    Restore
                  </button>
                  <button onClick={() => handleHardDeleteCard(card.id)}
                    className="px-2.5 py-1 text-[10px] bg-red-500/10 text-red-400 rounded hover:bg-red-500/20 shrink-0 opacity-0 group-hover:opacity-100">
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
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
