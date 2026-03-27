'use client';

import { useState, useEffect, useCallback, DragEvent } from 'react';
import { MarkdownView } from '@/components/ui/markdown-view';
import { AGENT_EMOJIS } from '@/lib/agents';

// Types
interface Task {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  assignedTo?: string;
  assigned_to?: string;
  storyId?: string;
  story_id?: string;
  sprintId?: string;
  sprint_id?: string;
  tags?: string;
  notes?: string;
  estimatedHours?: number;
  estimated_hours?: number;
  createdAt?: string;
  created_at?: string;
  updatedAt?: string;
  updated_at?: string;
  completedAt?: string;
  completed_at?: string;
}

type BoardView = 'kanban' | 'sprints' | 'epics';

interface Epic { id: string; title: string; status: string; notes?: string; }
interface Story { id: string; epicId?: string; epic_id?: string; title: string; status: string; points?: number; }
interface Sprint { id: string; name: string; status: string; startDate?: string; start_date?: string; endDate?: string; end_date?: string; storyIds?: string; story_ids?: string; }

// Constants
const columns = [
  { id: 'backlog', label: 'Backlog', dotColor: 'bg-gray-500', borderColor: 'border-t-gray-500' },
  { id: 'in_progress', label: 'In Progress', dotColor: 'bg-blue-500', borderColor: 'border-t-blue-500' },
  { id: 'review', label: 'Review', dotColor: 'bg-amber-500', borderColor: 'border-t-amber-500' },
  { id: 'done', label: 'Done', dotColor: 'bg-green-500', borderColor: 'border-t-green-500' },
];

const priorityConfig: Record<string, { border: string; dot: string; label: string }> = {
  critical: { border: 'border-l-red-500', dot: 'bg-red-500', label: 'Critical' },
  high: { border: 'border-l-amber-500', dot: 'bg-amber-500', label: 'High' },
  medium: { border: 'border-l-blue-500', dot: 'bg-blue-500', label: 'Medium' },
  low: { border: 'border-l-gray-600', dot: 'bg-gray-600', label: 'Low' },
};


function norm(t: Task): Task {
  return { ...t, assignedTo: t.assignedTo || t.assigned_to, storyId: t.storyId || t.story_id,
    sprintId: t.sprintId || t.sprint_id, createdAt: t.createdAt || t.created_at,
    completedAt: t.completedAt || t.completed_at, estimatedHours: t.estimatedHours || t.estimated_hours,
    tags: t.tags || '', notes: t.notes || '' };
}

function timeAgo(d?: string): string {
  if (!d) return ''; const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 1) return 'now'; if (m < 60) return `${m}m`; const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`; return `${Math.floor(h / 24)}d`;
}

// ─── Task Detail Modal ──────────────────────────────────────────
function TaskDetailModal({ task, onClose, onSave, onDelete }: {
  task: Task; onClose: () => void;
  onSave: (t: Task) => void; onDelete: (id: string) => void;
}) {
  const [form, setForm] = useState({ ...task });
  const [tab, setTab] = useState<'details' | 'checklist' | 'notes' | 'dispatch'>('details');
  const [checklist, setChecklist] = useState<{ text: string; done: boolean }[]>(() => {
    try { const parsed = JSON.parse(task.notes || '[]'); return Array.isArray(parsed) ? parsed.filter((c: { text?: string }) => c && typeof c.text === 'string') as { text: string; done: boolean }[] : []; }
    catch { return []; }
  });
  const [newCheckItem, setNewCheckItem] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [dispatchResult, setDispatchResult] = useState<{ ok: boolean; output: string; duration?: number; agentId?: string } | null>(null);

  const handleDispatch = async () => {
    setDispatching(true);
    setDispatchResult(null);
    setTab('dispatch');
    try {
      const res = await fetch('/api/dispatch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: form.id }),
      });
      const data = await res.json();
      setDispatchResult({
        ok: data.success,
        output: data.output || data.error || 'No output',
        duration: data.duration,
        agentId: data.agentId,
      });
      if (data.success) {
        setForm(prev => ({ ...prev, status: 'done' }));
      }
    } catch (err) {
      setDispatchResult({ ok: false, output: String(err) });
    }
    setDispatching(false);
  };

  const handleSave = () => {
    const notes = checklist.length > 0 ? JSON.stringify(checklist) : form.notes;
    onSave({ ...form, notes });
  };

  const addCheckItem = () => { if (!newCheckItem.trim()) return; setChecklist([...checklist, { text: newCheckItem.trim(), done: false }]); setNewCheckItem(''); };
  const toggleCheck = (i: number) => { setChecklist(checklist.map((c, idx) => idx === i ? { ...c, done: !c.done } : c)); };
  const removeCheck = (i: number) => { setChecklist(checklist.filter((_, idx) => idx !== i)); };
  const checkDone = checklist.filter(c => c.done).length;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-start justify-center z-50 pt-12 px-4" onClick={onClose}>
      <div className="bg-[#111113] rounded-xl border border-[#1e1e21] w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 py-3 border-b border-[#1e1e21] flex items-start justify-between shrink-0">
          <div className="flex-1">
            <input type="text" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
              className="w-full text-base font-semibold text-gray-100 bg-transparent focus:outline-none" />
            <div className="text-[10px] text-gray-600 mt-0.5">{form.id} • {timeAgo(form.createdAt)}</div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg ml-4">×</button>
        </div>

        {/* Toolbar */}
        <div className="px-5 py-2 border-b border-[#1e1e21] flex flex-wrap gap-1.5 shrink-0">
          <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}
            className="px-2 py-1 bg-[#0a0a0b] border border-[#1e1e21] rounded text-[11px] text-gray-300 focus:outline-none focus:border-amber-500">
            {columns.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}
            className="px-2 py-1 bg-[#0a0a0b] border border-[#1e1e21] rounded text-[11px] text-gray-300 focus:outline-none focus:border-amber-500">
            {Object.entries(priorityConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <input type="text" placeholder="@agent" value={form.assignedTo || ''} onChange={e => setForm({ ...form, assignedTo: e.target.value })}
            className="px-2 py-1 bg-[#0a0a0b] border border-[#1e1e21] rounded text-[11px] text-gray-300 w-24 focus:outline-none focus:border-amber-500" />
          <input type="text" placeholder="Sprint" value={form.sprintId || ''} onChange={e => setForm({ ...form, sprintId: e.target.value })}
            className="px-2 py-1 bg-[#0a0a0b] border border-[#1e1e21] rounded text-[11px] text-gray-300 w-20 focus:outline-none focus:border-amber-500" />
          <input type="text" placeholder="Story" value={form.storyId || ''} onChange={e => setForm({ ...form, storyId: e.target.value })}
            className="px-2 py-1 bg-[#0a0a0b] border border-[#1e1e21] rounded text-[11px] text-gray-300 w-20 focus:outline-none focus:border-amber-500" />
          <input type="text" placeholder="Tags" value={form.tags || ''} onChange={e => setForm({ ...form, tags: e.target.value })}
            className="px-2 py-1 bg-[#0a0a0b] border border-[#1e1e21] rounded text-[11px] text-gray-300 flex-1 focus:outline-none focus:border-amber-500" />
        </div>

        {/* Tabs */}
        <div className="px-5 pt-1 flex gap-0.5 border-b border-[#1e1e21] shrink-0">
          {(['details', 'checklist', 'notes', 'dispatch'] as const).map(t => (
            <button key={t} data-tab={t} onClick={() => setTab(t)}
              className={`px-3 py-1.5 text-[11px] rounded-t capitalize ${tab === t ? 'bg-[#1e1e21] text-gray-100' : 'text-gray-500 hover:text-gray-300'}`}>
              {t === 'dispatch' ? '▶ Dispatch' : t}{t === 'checklist' && checklist.length > 0 ? ` (${checkDone}/${checklist.length})` : ''}
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
                  placeholder="Task description... (markdown supported)"
                  className="w-full px-3 py-2 bg-[#0a0a0b] border border-[#1e1e21] rounded text-xs text-gray-300 font-mono focus:outline-none focus:border-amber-500 resize-none leading-relaxed" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-gray-500 uppercase mb-1">Est. Hours</label>
                  <input type="number" value={form.estimatedHours || ''} onChange={e => setForm({ ...form, estimatedHours: parseInt(e.target.value) || undefined })}
                    className="w-full px-3 py-1.5 bg-[#0a0a0b] border border-[#1e1e21] rounded text-xs text-gray-300 focus:outline-none focus:border-amber-500" />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-500 uppercase mb-1">Completed</label>
                  <div className="px-3 py-1.5 text-xs text-gray-500">{form.completedAt ? timeAgo(form.completedAt) + ' ago' : '—'}</div>
                </div>
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
          {tab === 'notes' && (
            <div>
              <MarkdownView content={form.notes || ''} defaultView="rendered" maxHeight="max-h-[40vh]" />
              <textarea rows={8} value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })}
                placeholder="Notes, code snippets, links..."
                className="w-full px-3 py-2 bg-[#0a0a0b] border border-[#1e1e21] rounded text-xs text-gray-300 font-mono focus:outline-none focus:border-amber-500 focus-visible:outline-none resize-none leading-relaxed mt-2" />
            </div>
          )}
          {tab === 'dispatch' && (
            <div className="space-y-3">
              {/* Dispatch info */}
              <div className="bg-[#0a0a0b] rounded-lg border border-[#1e1e21] p-3">
                <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Dispatch Info</div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div><span className="text-gray-600">Agent:</span> <span className="text-amber-400">@{form.assignedTo || 'main'}</span></div>
                  <div><span className="text-gray-600">Priority:</span> <span className="text-gray-300">{form.priority || 'medium'}</span></div>
                  <div><span className="text-gray-600">Status:</span> <span className="text-gray-300">{form.status}</span></div>
                  <div><span className="text-gray-600">Tags:</span> <span className="text-gray-300">{form.tags || '—'}</span></div>
                </div>
              </div>

              {/* Run button */}
              {!dispatching && !dispatchResult && (
                <button onClick={handleDispatch}
                  className="w-full py-3 text-sm font-medium bg-amber-500 text-gray-900 rounded-lg hover:bg-amber-400 flex items-center justify-center gap-2">
                  <span>▶</span> Run Task — Dispatch to @{form.assignedTo || 'main'}
                </button>
              )}

              {/* Running state */}
              {dispatching && (
                <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-4 text-center">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <span className="flex gap-1">
                      <span className="w-2 h-2 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </span>
                  </div>
                  <div className="text-sm text-amber-400">Agent @{form.assignedTo || 'main'} executing...</div>
                  <div className="text-[10px] text-gray-600 mt-1">This may take up to 2 minutes</div>
                </div>
              )}

              {/* Result */}
              {dispatchResult && (
                <div className={`rounded-lg border p-4 ${dispatchResult.ok ? 'bg-green-500/5 border-green-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-lg ${dispatchResult.ok ? '' : ''}`}>{dispatchResult.ok ? '✅' : '❌'}</span>
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
                  {/* Retry button if failed */}
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
          <div>{confirmDelete ? (
            <div className="flex gap-2">
              <button onClick={() => onDelete(form.id)} className="px-3 py-1 text-[11px] bg-red-500/20 text-red-400 rounded">Confirm</button>
              <button onClick={() => setConfirmDelete(false)} className="px-3 py-1 text-[11px] text-gray-500">Cancel</button>
            </div>
          ) : (
            <button onClick={() => setConfirmDelete(true)} className="px-3 py-1 text-[11px] text-gray-600 hover:text-red-400">Delete</button>
          )}</div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-1.5 text-[11px] text-gray-400 bg-[#1a1a1d] rounded">Cancel</button>
            <button onClick={handleSave} className="px-4 py-1.5 text-[11px] font-medium bg-amber-500 text-gray-900 rounded hover:bg-amber-400">Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────
export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [epicsData, setEpicsData] = useState<Epic[]>([]);
  const [storiesData, setStoriesData] = useState<Story[]>([]);
  const [sprintsData, setSprintsData] = useState<Sprint[]>([]);
  const [view, setView] = useState<BoardView>('kanban');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [filter, setFilter] = useState({ search: '', assignee: '', priority: '' });
  const [newTask, setNewTask] = useState({ title: '', description: '', priority: 'medium', assignedTo: '', sprintId: '', storyId: '', tags: '', estimatedHours: '' });
  const [showNewSprint, setShowNewSprint] = useState(false);
  const [showNewEpic, setShowNewEpic] = useState(false);
  const [newSprint, setNewSprint] = useState({ name: '', startDate: '', endDate: '' });
  const [newEpic, setNewEpic] = useState({ title: '', priority: 'medium', notes: '' });

  const handleCreateSprint = async () => {
    if (!newSprint.name) return;
    await fetch('/api/sprints', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newSprint) });
    setShowNewSprint(false); setNewSprint({ name: '', startDate: '', endDate: '' }); fetchTasks();
  };

  const handleCreateEpic = async () => {
    if (!newEpic.title) return;
    await fetch('/api/epics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newEpic) });
    setShowNewEpic(false); setNewEpic({ title: '', priority: 'medium', notes: '' }); fetchTasks();
  };

  const fetchTasks = useCallback(() => {
    fetch('/api/board/sync?project=clawhalla').then(r => r.json()).then(data => {
      setTasks((data.tasks || []).map((t: Task) => norm(t)));
      setEpicsData(data.epics || []); setStoriesData(data.stories || []); setSprintsData(data.sprints || []);
    }).catch(console.error);
  }, []);

  useEffect(() => { fetchTasks(); const i = setInterval(fetchTasks, 30000); return () => clearInterval(i); }, [fetchTasks]);
  useEffect(() => { let es: EventSource | null = null; try { es = new EventSource('/api/sse'); es.onmessage = (e) => { const d = JSON.parse(e.data); if (d.type === 'file_change') fetchTasks(); }; } catch {} return () => { if (es) es.close(); }; }, [fetchTasks]);

  const filtered = tasks.filter(t => {
    if (filter.search && !t.title.toLowerCase().includes(filter.search.toLowerCase())) return false;
    if (filter.assignee && t.assignedTo !== filter.assignee) return false;
    if (filter.priority && t.priority !== filter.priority) return false;
    return true;
  });

  const onDragStart = (e: DragEvent, id: string) => { e.dataTransfer.setData('text/plain', id); e.dataTransfer.effectAllowed = 'move'; };
  const onDragOver = (e: DragEvent, col: string) => { e.preventDefault(); setDragOverColumn(col); };
  const onDrop = (e: DragEvent, status: string) => { e.preventDefault(); setDragOverColumn(null); const id = e.dataTransfer.getData('text/plain'); if (id) updateStatus(id, status); };

  const updateStatus = async (id: string, status: string) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status } : t));
    await fetch(`/api/tasks/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
  };

  const handleSaveTask = async (task: Task) => {
    await fetch(`/api/tasks/${task.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: task.title, description: task.description, status: task.status, priority: task.priority,
        assignedTo: task.assignedTo, sprintId: task.sprintId, storyId: task.storyId, tags: task.tags, notes: task.notes, estimatedHours: task.estimatedHours }) });
    setSelectedTask(null); fetchTasks();
  };

  const handleDeleteTask = async (id: string) => { await fetch(`/api/tasks/${id}`, { method: 'DELETE' }); setSelectedTask(null); fetchTasks(); };

  const handleCreateTask = async () => {
    await fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newTask, estimatedHours: newTask.estimatedHours ? parseInt(newTask.estimatedHours) : null }) });
    setShowCreate(false); setNewTask({ title: '', description: '', priority: 'medium', assignedTo: '', sprintId: '', storyId: '', tags: '', estimatedHours: '' }); fetchTasks();
  };

  const assignees = [...new Set(tasks.map(t => t.assignedTo).filter(Boolean))] as string[];

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-gray-200">Board</h2>
          <div className="flex gap-0.5 bg-[#111113] rounded-lg p-0.5 border border-[#1e1e21]">
            {(['kanban', 'sprints', 'epics'] as BoardView[]).map(v => (
              <button key={v} onClick={() => setView(v)} className={`px-2.5 py-1 text-[11px] rounded capitalize ${view === v ? 'bg-[#1e1e21] text-gray-100' : 'text-gray-500 hover:text-gray-300'}`}>{v}</button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input type="text" placeholder="Search..." value={filter.search} onChange={e => setFilter({ ...filter, search: e.target.value })}
            className="px-2 py-1 bg-[#111113] border border-[#1e1e21] rounded text-[11px] text-gray-300 w-28 focus:outline-none focus:border-amber-500 placeholder-gray-600" />
          <select value={filter.assignee} onChange={e => setFilter({ ...filter, assignee: e.target.value })}
            className="px-2 py-1 bg-[#111113] border border-[#1e1e21] rounded text-[11px] text-gray-300 focus:outline-none">
            <option value="">All</option>{assignees.map(a => <option key={a} value={a}>@{a}</option>)}
          </select>
          <select value={filter.priority} onChange={e => setFilter({ ...filter, priority: e.target.value })}
            className="px-2 py-1 bg-[#111113] border border-[#1e1e21] rounded text-[11px] text-gray-300 focus:outline-none">
            <option value="">Priority</option>{Object.entries(priorityConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <button onClick={() => setShowCreate(true)} className="px-3 py-1.5 text-[11px] font-medium bg-amber-500 text-gray-900 rounded hover:bg-amber-400">+ New</button>
        </div>
      </div>

      {/* KANBAN */}
      {view === 'kanban' && (
        <div className="grid grid-cols-4 gap-3 flex-1 min-h-0">
          {columns.map(col => {
            const colTasks = filtered.filter(t => t.status === col.id);
            return (
              <div key={col.id} className={`bg-[#111113] rounded-lg border border-[#1e1e21] border-t-2 ${col.borderColor} flex flex-col min-h-0 ${dragOverColumn === col.id ? 'ring-1 ring-amber-500/30' : ''}`}
                onDragOver={e => onDragOver(e, col.id)} onDragLeave={() => setDragOverColumn(null)} onDrop={e => onDrop(e, col.id)}>
                <div className="px-3 py-2 flex items-center justify-between shrink-0 border-b border-[#1e1e21]">
                  <div className="flex items-center gap-2"><span className={`w-2 h-2 rounded-full ${col.dotColor}`} /><span className="text-xs font-medium text-gray-300">{col.label}</span></div>
                  <span className="text-[10px] text-gray-600">{colTasks.length}</span>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
                  {colTasks.map(task => (
                    <div key={task.id} draggable onDragStart={e => onDragStart(e, task.id)}
                      className={`bg-[#0a0a0b] rounded-lg p-2.5 border-l-2 ${priorityConfig[task.priority]?.border || 'border-l-gray-600'} cursor-pointer hover:bg-[#141416] group/card`}>
                      <div className="flex items-start justify-between" onClick={() => setSelectedTask(task)}>
                        <div className="text-[12px] text-gray-200 font-medium leading-tight flex-1">{task.title}</div>
                        {task.status !== 'done' && task.assignedTo && (
                          <button onClick={e => { e.stopPropagation(); setSelectedTask(task); setTimeout(() => { const el = document.querySelector('[data-tab="dispatch"]') as HTMLButtonElement; el?.click(); }, 100); }}
                            className="opacity-0 group-hover/card:opacity-100 text-[9px] px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded hover:bg-amber-500/30 shrink-0 ml-1"
                            title="Dispatch to agent">▶</button>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap" onClick={() => setSelectedTask(task)}>
                        {task.assignedTo && <span className="flex items-center gap-1 text-[10px] text-amber-500">{AGENT_EMOJIS[task.assignedTo] && <span className="text-xs">{AGENT_EMOJIS[task.assignedTo]}</span>}@{task.assignedTo}</span>}
                        {task.tags && task.tags.split(',').filter(Boolean).slice(0, 2).map(tag => <span key={tag} className="text-[9px] px-1 py-0.5 bg-[#1a1a1d] text-gray-500 rounded">{tag.trim()}</span>)}
                      </div>
                    </div>
                  ))}
                  {colTasks.length === 0 && <div className="text-[10px] text-gray-700 text-center py-8">{dragOverColumn === col.id ? 'Drop here' : 'Empty'}</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* SPRINTS */}
      {view === 'sprints' && (
        <div className="flex-1 overflow-y-auto space-y-3">
          {sprintsData.map(sp => {
            const ids = sp.storyIds || sp.story_ids; const stIds: string[] = ids ? (() => { try { return typeof ids === 'string' ? JSON.parse(ids) : ids; } catch { return []; } })() : [];
            const st = filtered.filter(t => t.sprintId === sp.id || stIds.includes(t.storyId || ''));
            const dn = st.filter(t => t.status === 'done').length; const pct = st.length > 0 ? Math.round((dn / st.length) * 100) : 0;
            return (
              <div key={sp.id} className="bg-[#111113] rounded-lg border border-[#1e1e21] p-4 group">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-semibold text-gray-200">{sp.name}</div>
                    <span className="text-[10px] text-gray-600">{sp.startDate || sp.start_date} → {sp.endDate || sp.end_date}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded capitalize ${sp.status === 'done' ? 'bg-green-500/20 text-green-400' : sp.status === 'active' ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-500/20 text-gray-400'}`}>{sp.status}</span>
                    <span className="text-[10px] text-gray-500">{dn}/{st.length}</span>
                    <select defaultValue={sp.status} onChange={async (e) => {
                      await fetch('/api/sprints', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: sp.id, status: e.target.value }) }); fetchTasks();
                    }} className="opacity-0 group-hover:opacity-100 px-1 py-0.5 bg-[#0a0a0b] border border-[#1e1e21] rounded text-[9px] text-gray-400 focus:outline-none">
                      <option value="planning">Planning</option><option value="active">Active</option><option value="done">Done</option>
                    </select>
                    <button onClick={async () => { await fetch(`/api/sprints?id=${sp.id}`, { method: 'DELETE' }); fetchTasks(); }}
                      className="opacity-0 group-hover:opacity-100 text-[10px] text-gray-600 hover:text-red-400" title="Delete sprint">×</button>
                  </div>
                </div>
                <div className="h-1 bg-[#1a1a1d] rounded-full overflow-hidden mb-3"><div className="h-full bg-amber-500 rounded-full" style={{ width: `${pct}%` }} /></div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5">
                  {st.map(task => (
                    <div key={task.id} onClick={() => setSelectedTask(task)} className={`px-2.5 py-1.5 rounded border-l-2 ${priorityConfig[task.priority]?.border || 'border-l-gray-600'} bg-[#0a0a0b] cursor-pointer hover:bg-[#141416]`}>
                      <div className="text-[11px] text-gray-300 truncate">{task.title}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${task.status === 'done' ? 'bg-green-500' : task.status === 'in_progress' ? 'bg-blue-500' : 'bg-gray-600'}`} />
                        {task.assignedTo && <span className="text-[9px] text-gray-600">@{task.assignedTo}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          {/* New Sprint form */}
          {showNewSprint ? (
            <div className="bg-[#111113] rounded-lg border border-amber-500/30 p-4 space-y-3">
              <div className="text-xs font-semibold text-gray-200">New Sprint</div>
              <input type="text" placeholder="Sprint name" value={newSprint.name} onChange={e => setNewSprint({ ...newSprint, name: e.target.value })}
                className="w-full px-3 py-2 bg-[#0a0a0b] border border-[#1e1e21] rounded text-xs text-gray-200 focus:outline-none focus:border-amber-500" autoFocus />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-gray-500 mb-1">Start Date</label>
                  <input type="date" value={newSprint.startDate} onChange={e => setNewSprint({ ...newSprint, startDate: e.target.value })}
                    className="w-full px-3 py-1.5 bg-[#0a0a0b] border border-[#1e1e21] rounded text-xs text-gray-200 focus:outline-none focus:border-amber-500" />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-500 mb-1">End Date</label>
                  <input type="date" value={newSprint.endDate} onChange={e => setNewSprint({ ...newSprint, endDate: e.target.value })}
                    className="w-full px-3 py-1.5 bg-[#0a0a0b] border border-[#1e1e21] rounded text-xs text-gray-200 focus:outline-none focus:border-amber-500" />
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={handleCreateSprint} className="px-4 py-1.5 text-[11px] font-medium bg-amber-500 text-gray-900 rounded hover:bg-amber-400">Create</button>
                <button onClick={() => setShowNewSprint(false)} className="px-4 py-1.5 text-[11px] text-gray-400 bg-[#1a1a1d] rounded">Cancel</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowNewSprint(true)} className="w-full p-3 rounded-lg border border-dashed border-[#333] text-xs text-gray-500 hover:text-amber-400 hover:border-amber-500/30">
              + New Sprint
            </button>
          )}
        </div>
      )}

      {/* EPICS */}
      {view === 'epics' && (
        <div className="flex-1 overflow-y-auto space-y-3">
          {epicsData.map(epic => {
            const eS = storiesData.filter(s => (s.epicId || s.epic_id) === epic.id);
            const dS = eS.filter(s => s.status === 'done').length; const pct = eS.length > 0 ? Math.round((dS / eS.length) * 100) : 0;
            return (
              <div key={epic.id} className="bg-[#111113] rounded-lg border border-[#1e1e21] p-4 group">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-gray-200">{epic.title}</h3>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded capitalize ${epic.status === 'done' ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400'}`}>{epic.status}</span>
                    <select defaultValue={epic.status} onChange={async (e) => {
                      await fetch('/api/epics', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: epic.id, status: e.target.value }) }); fetchTasks();
                    }} className="opacity-0 group-hover:opacity-100 px-1 py-0.5 bg-[#0a0a0b] border border-[#1e1e21] rounded text-[9px] text-gray-400 focus:outline-none">
                      <option value="active">Active</option><option value="done">Done</option><option value="backlog">Backlog</option>
                    </select>
                    <button onClick={async () => { await fetch(`/api/epics?id=${epic.id}`, { method: 'DELETE' }); fetchTasks(); }}
                      className="opacity-0 group-hover:opacity-100 text-[10px] text-gray-600 hover:text-red-400" title="Delete epic">×</button>
                  </div>
                </div>
                {epic.notes && <p className="text-[10px] text-gray-500 mb-2">{epic.notes}</p>}
                <div className="h-1 bg-[#1a1a1d] rounded-full overflow-hidden mb-2"><div className="h-full bg-amber-500 rounded-full" style={{ width: `${pct}%` }} /></div>
                <div className="text-[10px] text-gray-600 mb-3">{dS}/{eS.length} stories</div>
                <div className="space-y-1">
                  {eS.map(story => (
                    <div key={story.id} className="flex items-center gap-2 px-2.5 py-1.5 bg-[#0a0a0b] rounded">
                      <span className={`w-1.5 h-1.5 rounded-full ${story.status === 'done' ? 'bg-green-500' : 'bg-gray-600'}`} />
                      <span className="text-[11px] text-gray-300 flex-1 truncate">{story.title}</span>
                      {story.points && <span className="text-[9px] text-gray-600">{story.points}pt</span>}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          {/* New Epic form */}
          {showNewEpic ? (
            <div className="bg-[#111113] rounded-lg border border-amber-500/30 p-4 space-y-3">
              <div className="text-xs font-semibold text-gray-200">New Epic</div>
              <input type="text" placeholder="Epic title" value={newEpic.title} onChange={e => setNewEpic({ ...newEpic, title: e.target.value })}
                className="w-full px-3 py-2 bg-[#0a0a0b] border border-[#1e1e21] rounded text-xs text-gray-200 focus:outline-none focus:border-amber-500" autoFocus />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-gray-500 mb-1">Priority</label>
                  <select value={newEpic.priority} onChange={e => setNewEpic({ ...newEpic, priority: e.target.value })}
                    className="w-full px-3 py-1.5 bg-[#0a0a0b] border border-[#1e1e21] rounded text-xs text-gray-200 focus:outline-none focus:border-amber-500">
                    <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-gray-500 mb-1">Notes</label>
                  <input type="text" placeholder="Optional notes" value={newEpic.notes} onChange={e => setNewEpic({ ...newEpic, notes: e.target.value })}
                    className="w-full px-3 py-1.5 bg-[#0a0a0b] border border-[#1e1e21] rounded text-xs text-gray-200 focus:outline-none focus:border-amber-500" />
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={handleCreateEpic} className="px-4 py-1.5 text-[11px] font-medium bg-amber-500 text-gray-900 rounded hover:bg-amber-400">Create</button>
                <button onClick={() => setShowNewEpic(false)} className="px-4 py-1.5 text-[11px] text-gray-400 bg-[#1a1a1d] rounded">Cancel</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowNewEpic(true)} className="w-full p-3 rounded-lg border border-dashed border-[#333] text-xs text-gray-500 hover:text-amber-400 hover:border-amber-500/30">
              + New Epic
            </button>
          )}
        </div>
      )}

      {/* Modals */}
      {selectedTask && <TaskDetailModal task={selectedTask} onClose={() => setSelectedTask(null)} onSave={handleSaveTask} onDelete={handleDeleteTask} />}

      {showCreate && (
        <div className="fixed inset-0 bg-black/70 flex items-start justify-center z-50 pt-16 px-4" onClick={() => setShowCreate(false)}>
          <div className="bg-[#111113] rounded-xl border border-[#1e1e21] w-full max-w-lg p-5 space-y-3" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-gray-200">New Task</h3>
            <input type="text" placeholder="Task title" value={newTask.title} onChange={e => setNewTask({ ...newTask, title: e.target.value })}
              className="w-full px-3 py-2 bg-[#0a0a0b] border border-[#1e1e21] rounded text-sm text-gray-200 focus:outline-none focus:border-amber-500" />
            <textarea placeholder="Description" rows={3} value={newTask.description} onChange={e => setNewTask({ ...newTask, description: e.target.value })}
              className="w-full px-3 py-2 bg-[#0a0a0b] border border-[#1e1e21] rounded text-xs text-gray-200 focus:outline-none focus:border-amber-500 resize-none" />
            <div className="grid grid-cols-2 gap-2">
              <select value={newTask.priority} onChange={e => setNewTask({ ...newTask, priority: e.target.value })}
                className="px-3 py-2 bg-[#0a0a0b] border border-[#1e1e21] rounded text-xs text-gray-200 focus:outline-none">
                {Object.entries(priorityConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <input type="text" placeholder="@agent" value={newTask.assignedTo} onChange={e => setNewTask({ ...newTask, assignedTo: e.target.value })}
                className="px-3 py-2 bg-[#0a0a0b] border border-[#1e1e21] rounded text-xs text-gray-200 focus:outline-none focus:border-amber-500" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <input type="text" placeholder="Sprint" value={newTask.sprintId} onChange={e => setNewTask({ ...newTask, sprintId: e.target.value })}
                className="px-3 py-2 bg-[#0a0a0b] border border-[#1e1e21] rounded text-xs text-gray-200 focus:outline-none focus:border-amber-500" />
              <input type="text" placeholder="Story" value={newTask.storyId} onChange={e => setNewTask({ ...newTask, storyId: e.target.value })}
                className="px-3 py-2 bg-[#0a0a0b] border border-[#1e1e21] rounded text-xs text-gray-200 focus:outline-none focus:border-amber-500" />
              <input type="text" placeholder="Hours" value={newTask.estimatedHours} onChange={e => setNewTask({ ...newTask, estimatedHours: e.target.value })}
                className="px-3 py-2 bg-[#0a0a0b] border border-[#1e1e21] rounded text-xs text-gray-200 focus:outline-none focus:border-amber-500" />
            </div>
            <input type="text" placeholder="Tags (comma sep)" value={newTask.tags} onChange={e => setNewTask({ ...newTask, tags: e.target.value })}
              className="w-full px-3 py-2 bg-[#0a0a0b] border border-[#1e1e21] rounded text-xs text-gray-200 focus:outline-none focus:border-amber-500" />
            <div className="flex gap-2 pt-1">
              <button onClick={handleCreateTask} className="flex-1 px-4 py-2 text-xs font-medium bg-amber-500 text-gray-900 rounded hover:bg-amber-400">Create</button>
              <button onClick={() => setShowCreate(false)} className="flex-1 px-4 py-2 text-xs text-gray-400 bg-[#1a1a1d] rounded">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
