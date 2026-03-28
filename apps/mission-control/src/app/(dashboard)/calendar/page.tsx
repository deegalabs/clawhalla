'use client';

import { useState, useEffect, useCallback } from 'react';
import { PageLoading } from '@/components/ui/loading';
import { autoTask } from '@/lib/tasks';
import { AGENT_EMOJIS } from '@/lib/agents';

interface CronJob {
  id: string;
  name: string;
  agentId: string;
  schedule: { kind: string; expr: string; tz?: string };
  enabled: boolean;
  payload?: { message?: string; model?: string };
  state?: { nextRunAtMs?: number; lastRunAtMs?: number; lastStatus?: string; lastDurationMs?: number; consecutiveErrors?: number };
}

const agentColors: Record<string, { bg: string; border: string }> = {
  main: { bg: 'bg-red-500/10', border: 'border-red-500/30' },
  frigg: { bg: 'bg-green-500/10', border: 'border-green-500/30' },
  mimir: { bg: 'bg-teal-500/10', border: 'border-teal-500/30' },
  bragi: { bg: 'bg-purple-500/10', border: 'border-purple-500/30' },
  loki: { bg: 'bg-amber-500/10', border: 'border-amber-500/30' },
};
const defaultColor = { bg: 'bg-gray-500/10', border: 'border-gray-500/30' };


const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const hours = Array.from({ length: 18 }, (_, i) => i + 6);

function parseCron(expr: string): { days: number[]; hour: number; minute: number } {
  const p = expr.split(' ');
  if (p.length < 5) return { days: [], hour: 0, minute: 0 };
  const minute = parseInt(p[0]) || 0;
  const hour = parseInt(p[1]) || 0;
  const wd = p[4];
  let d: number[] = [];
  if (wd === '*') d = [0, 1, 2, 3, 4, 5, 6];
  else if (wd.includes('-')) { const [s, e] = wd.split('-').map(Number); for (let i = s; i <= e; i++) d.push(i); }
  else if (wd.includes(',')) d = wd.split(',').map(Number);
  else { const n = parseInt(wd); if (!isNaN(n)) d = [n]; }
  return { days: d, hour, minute };
}

function fmtTime(h: number, m: number) { return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; }
function isFrequent(expr: string) { const p = expr.split(' '); return p[0]?.includes('/') || p[1]?.includes('/') || p[1] === '*'; }

function timeUntil(ms?: number): string {
  if (!ms) return '';
  const diff = ms - Date.now();
  if (diff < 0) return 'overdue';
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function timeSince(ms?: number): string {
  if (!ms) return '';
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

export default function CalendarPage() {
  const [crons, setCrons] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'week' | 'list'>('week');
  const [showCreate, setShowCreate] = useState(false);
  const [editingCron, setEditingCron] = useState<CronJob | null>(null);
  const [newCron, setNewCron] = useState({ name: '', agentId: 'main', cron: '0 * * * *', message: '', model: '', timezone: '' });
  const [editForm, setEditForm] = useState({ name: '', cron: '', message: '' });
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<string | null>(null);

  const today = new Date();
  const currentDay = today.getDay();

  const fetchCrons = useCallback(async () => {
    try {
      const res = await fetch('/api/crons');
      const data = await res.json();
      if (data.ok) setCrons(data.jobs || []);
    } catch (err) { console.error('[calendar] fetch error:', err); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchCrons(); const i = setInterval(fetchCrons, 60000); return () => clearInterval(i); }, [fetchCrons]);

  const doAction = async (id: string, action: string) => {
    setActionLoading(id);
    await fetch('/api/crons', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action }) });
    const job = crons.find(c => c.id === id);
    if (job) autoTask.cronAction(action, job.name);
    fetchCrons(); setActionLoading(null);
  };

  const doDelete = async (id: string) => {
    const job = crons.find(c => c.id === id);
    setActionLoading(id);
    await fetch(`/api/crons?id=${id}`, { method: 'DELETE' });
    if (job) autoTask.cronAction('deleted', job.name);
    fetchCrons(); setActionLoading(null);
  };

  const handleCreate = async () => {
    if (!newCron.name || !newCron.message) return;
    await fetch('/api/crons', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newCron) });
    autoTask.cronAction('created', newCron.name);
    setShowCreate(false); setNewCron({ name: '', agentId: 'main', cron: '0 * * * *', message: '', model: '', timezone: '' }); fetchCrons();
  };

  const openEdit = (job: CronJob) => {
    setEditingCron(job);
    setEditForm({ name: job.name, cron: job.schedule?.expr || '', message: job.payload?.message || '' });
  };

  const handleEdit = async () => {
    if (!editingCron) return;
    await fetch('/api/crons', { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editingCron.id, name: editForm.name, cron: editForm.cron, message: editForm.message }) });
    autoTask.cronAction('updated', editForm.name);
    setEditingCron(null); fetchCrons();
  };

  const handleCalendarDrop = async (cronId: string, dayIdx: number, hour: number) => {
    const job = crons.find(c => c.id === cronId);
    if (!job) return;
    const p = parseCron(job.schedule.expr);
    // Build new cron: keep minute, update hour and weekday
    const parts = job.schedule.expr.split(' ');
    const newExpr = `${parts[0]} ${hour} ${parts[2]} ${parts[3]} ${dayIdx}`;
    await fetch('/api/crons', { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: cronId, cron: newExpr }) });
    autoTask.cronAction('rescheduled', job.name);
    fetchCrons();
  };

  const alwaysRunning = crons.filter(c => c.enabled && c.schedule?.expr && isFrequent(c.schedule.expr));
  const scheduled = crons.filter(c => c.schedule?.expr && !isFrequent(c.schedule.expr));

  const getForSlot = (dayIdx: number, hour: number) =>
    scheduled.filter(c => c.enabled && c.schedule?.expr).map(c => {
      const p = parseCron(c.schedule.expr); return p.days.includes(dayIdx) && p.hour === hour ? { ...c, time: fmtTime(p.hour, p.minute) } : null;
    }).filter(Boolean) as (CronJob & { time: string })[];

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] gap-4">
      {/* Next Up — unified view, no duplicates */}
      {crons.filter(c => c.enabled && c.state?.nextRunAtMs).length > 0 && (
        <div className="bg-[#111113] rounded-lg border border-[#1e1e21] overflow-hidden shrink-0">
          <div className="px-4 py-2 border-b border-[#1e1e21] flex items-center justify-between">
            <div className="text-[10px] text-gray-500 uppercase tracking-wider">Next Up</div>
            <span className="text-[10px] text-gray-600">{crons.filter(c => c.enabled).length} active</span>
          </div>
          <div className="divide-y divide-[#1e1e21] max-h-[220px] overflow-y-auto">
            {crons.filter(c => c.enabled && c.state?.nextRunAtMs).sort((a, b) => (a.state?.nextRunAtMs || 0) - (b.state?.nextRunAtMs || 0)).map(c => {
              const isHb = c.name.toLowerCase().includes('heartbeat');
              const isLoading = actionLoading === c.id;
              return (
                <div key={c.id} className="px-4 py-2.5 flex items-center justify-between hover:bg-[#0a0a0b] group">
                  <div className="flex items-center gap-2.5 cursor-pointer flex-1 min-w-0" onClick={() => openEdit(c)}>
                    <span className="text-base shrink-0">{isHb ? '💓' : AGENT_EMOJIS[c.agentId] || '🤖'}</span>
                    <div className="min-w-0">
                      <div className="text-xs text-gray-200 truncate">{c.name}</div>
                      <div className="text-[10px] text-gray-600 font-mono">{c.schedule?.expr}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {c.state?.lastStatus && (
                      <span className={`text-[9px] px-1.5 py-0.5 rounded ${c.state.lastStatus === 'ok' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                        {c.state.lastStatus}
                      </span>
                    )}
                    <span className="text-[10px] text-amber-400">Next: {timeUntil(c.state?.nextRunAtMs)}</span>
                    <button onClick={() => doAction(c.id, 'run')} disabled={isLoading}
                      className="px-2 py-0.5 text-[10px] bg-blue-500/20 text-blue-400 rounded hover:bg-blue-500/30 disabled:opacity-50">
                      {isLoading ? '...' : 'Run Now'}
                    </button>
                    <button onClick={() => doAction(c.id, 'disable')} disabled={isLoading}
                      className="px-2 py-0.5 text-[10px] bg-red-500/10 text-red-400 rounded hover:bg-red-500/20 disabled:opacity-50">
                      Pause
                    </button>
                    <button onClick={() => openEdit(c)}
                      className="px-2 py-0.5 text-[10px] text-gray-500 bg-[#1a1a1d] rounded hover:text-gray-300">
                      Edit
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-gray-200">Schedule</h2>
          <div className="flex gap-0.5 bg-[#111113] rounded-lg p-0.5 border border-[#1e1e21]">
            {(['week', 'list'] as const).map(v => (
              <button key={v} onClick={() => setView(v)} className={`px-2.5 py-1 text-[11px] rounded capitalize ${view === v ? 'bg-[#1e1e21] text-gray-100' : 'text-gray-500 hover:text-gray-300'}`}>{v}</button>
            ))}
          </div>
          <span className="text-[10px] text-gray-600">{crons.length} jobs ({crons.filter(c => c.enabled).length} active)</span>
        </div>
        <button onClick={() => setShowCreate(true)} className="px-3 py-1.5 text-[11px] font-medium bg-amber-500 text-gray-900 rounded hover:bg-amber-400">+ New Cron</button>
      </div>

      {/* Week View — drag-drop + click to edit */}
      {view === 'week' && !loading && (
        <div className="bg-[#111113] rounded-lg border border-[#1e1e21] overflow-hidden flex-1 min-h-0 flex flex-col">
          <div className="grid grid-cols-8 border-b border-[#1e1e21]">
            <div className="p-2 text-[10px] text-gray-600 border-r border-[#1e1e21]">Time</div>
            {days.map((d, i) => (
              <div key={d} className={`p-2 text-[11px] font-medium text-center border-r border-[#1e1e21] last:border-r-0 ${i === currentDay ? 'bg-amber-500/5 text-amber-400' : 'text-gray-400'}`}>{d}</div>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto min-h-0">
            {hours.map(h => (
              <div key={h} className="grid grid-cols-8 border-b border-[#1e1e21] last:border-b-0">
                <div className="p-1.5 text-[10px] text-gray-600 border-r border-[#1e1e21]">{String(h).padStart(2, '0')}:00</div>
                {days.map((_, di) => {
                  const slotKey = `${di}-${h}`;
                  const slots = getForSlot(di, h);
                  const isDragOver = dragOverSlot === slotKey;
                  return (
                    <div key={slotKey}
                      className={`p-0.5 min-h-[40px] border-r border-[#1e1e21] last:border-r-0 ${di === currentDay ? 'bg-amber-500/5' : ''} ${isDragOver ? 'bg-amber-500/10 ring-1 ring-amber-500/30 ring-inset' : ''}`}
                      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverSlot(slotKey); }}
                      onDragLeave={() => setDragOverSlot(null)}
                      onDrop={e => { e.preventDefault(); setDragOverSlot(null); const id = e.dataTransfer.getData('text/plain'); if (id) handleCalendarDrop(id, di, h); }}
                    >
                      {slots.map((s) => {
                        const c = agentColors[s.agentId] || defaultColor;
                        return (
                          <div key={s.id}
                            draggable
                            onDragStart={e => { e.dataTransfer.setData('text/plain', s.id); e.dataTransfer.effectAllowed = 'move'; }}
                            onClick={() => openEdit(s)}
                            className={`px-1.5 py-1 rounded text-[9px] ${c.bg} border ${c.border} mb-0.5 truncate cursor-grab active:cursor-grabbing hover:brightness-125`}
                            title={`${s.name} — drag to reschedule, click to edit`}
                          >
                            <span className="text-gray-300">{s.name}</span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* List View */}
      {view === 'list' && !loading && (
        <div className="space-y-2 flex-1 min-h-0 overflow-y-auto">
          {crons.map(job => {
            const c = agentColors[job.agentId] || defaultColor;
            const isLoading = actionLoading === job.id;
            return (
              <div key={job.id} className={`bg-[#111113] rounded-lg border ${job.enabled ? c.border : 'border-[#1e1e21]'} p-4 ${!job.enabled ? 'opacity-50' : ''} group`}>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-base">{AGENT_EMOJIS[job.agentId] || '🤖'}</span>
                      <span className="text-sm font-medium text-gray-200">{job.name}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded ${job.enabled ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}`}>
                        {job.enabled ? 'Active' : 'Disabled'}
                      </span>
                    </div>
                    <div className="text-[11px] text-gray-500 font-mono">{job.schedule?.expr}</div>
                    {job.payload?.message && (
                      <div className="text-[10px] text-gray-600 mt-1 line-clamp-1">{job.payload.message}</div>
                    )}
                    <div className="flex gap-4 mt-2 text-[10px] text-gray-600">
                      {job.state?.nextRunAtMs && <span>Next: <span className="text-amber-400">{timeUntil(job.state.nextRunAtMs)}</span></span>}
                      {job.state?.lastRunAtMs && <span>Last: {timeSince(job.state.lastRunAtMs)}</span>}
                      {job.state?.lastStatus && <span className={job.state.lastStatus === 'ok' ? 'text-green-500' : 'text-red-400'}>{job.state.lastStatus}</span>}
                      {job.state?.lastDurationMs && <span>{Math.round(job.state.lastDurationMs / 1000)}s</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 shrink-0 ml-3">
                    <button onClick={() => doAction(job.id, 'run')} disabled={isLoading || !job.enabled}
                      className="px-2 py-1 text-[10px] bg-blue-500/20 text-blue-400 rounded hover:bg-blue-500/30 disabled:opacity-40">Run</button>
                    <button onClick={() => doAction(job.id, job.enabled ? 'disable' : 'enable')} disabled={isLoading}
                      className="px-2 py-1 text-[10px] bg-[#1a1a1d] text-gray-400 rounded hover:text-gray-200">
                      {job.enabled ? 'Disable' : 'Enable'}
                    </button>
                    <button onClick={() => openEdit(job)} disabled={isLoading}
                      className="px-2 py-1 text-[10px] text-gray-500 bg-[#1a1a1d] rounded hover:text-gray-200">Edit</button>
                    <button onClick={() => doDelete(job.id)} disabled={isLoading}
                      className="px-2 py-1 text-[10px] text-gray-600 hover:text-red-400">×</button>
                  </div>
                </div>
              </div>
            );
          })}
          {crons.length === 0 && (
            <div className="bg-[#111113] rounded-lg border border-[#1e1e21] p-8 text-center text-gray-600 text-xs">No cron jobs configured</div>
          )}
        </div>
      )}

      {loading && <PageLoading title="Loading calendar..." />}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/70 flex items-start justify-center z-50 pt-16 px-4" onClick={() => setShowCreate(false)} role="dialog" aria-modal="true" aria-label="New Cron Job">
          <div className="bg-[#111113] rounded-xl border border-[#1e1e21] w-full max-w-lg p-5 space-y-3" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-gray-200">New Cron Job</h3>
            <input type="text" placeholder="Job name" value={newCron.name} onChange={e => setNewCron({ ...newCron, name: e.target.value })}
              className="w-full px-3 py-2 bg-[#0a0a0b] border border-[#1e1e21] rounded text-sm text-gray-200 focus:outline-none focus:border-amber-500" />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] text-gray-500 uppercase mb-1">Agent</label>
                <select value={newCron.agentId} onChange={e => setNewCron({ ...newCron, agentId: e.target.value })}
                  className="w-full px-3 py-1.5 bg-[#0a0a0b] border border-[#1e1e21] rounded text-xs text-gray-200 focus:outline-none focus:border-amber-500">
                  {Object.keys(AGENT_EMOJIS).filter(a => a !== 'claw').map(a => <option key={a} value={a}>{AGENT_EMOJIS[a]} {a}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] text-gray-500 uppercase mb-1">Schedule (cron)</label>
                <input type="text" placeholder="0 * * * *" value={newCron.cron} onChange={e => setNewCron({ ...newCron, cron: e.target.value })}
                  className="w-full px-3 py-1.5 bg-[#0a0a0b] border border-[#1e1e21] rounded text-xs text-gray-200 font-mono focus:outline-none focus:border-amber-500" />
              </div>
            </div>
            <div>
              <label className="block text-[10px] text-gray-500 uppercase mb-1">Message (agent instruction)</label>
              <textarea rows={4} placeholder="What should the agent do each run?" value={newCron.message}
                onChange={e => setNewCron({ ...newCron, message: e.target.value })}
                className="w-full px-3 py-2 bg-[#0a0a0b] border border-[#1e1e21] rounded text-xs text-gray-200 focus:outline-none focus:border-amber-500 resize-none" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] text-gray-500 uppercase mb-1">Model (optional)</label>
                <select value={newCron.model} onChange={e => setNewCron({ ...newCron, model: e.target.value })}
                  className="w-full px-3 py-1.5 bg-[#0a0a0b] border border-[#1e1e21] rounded text-xs text-gray-200 focus:outline-none focus:border-amber-500">
                  <option value="">Default</option>
                  <option value="anthropic/claude-sonnet-4-5">Sonnet 4.5</option>
                  <option value="anthropic/claude-sonnet-4-6">Sonnet 4.6</option>
                  <option value="anthropic/claude-haiku-4-5">Haiku 4.5</option>
                  <option value="anthropic/claude-opus-4-6">Opus 4.6</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] text-gray-500 uppercase mb-1">Timezone</label>
                <input type="text" placeholder="America/Sao_Paulo" value={newCron.timezone}
                  onChange={e => setNewCron({ ...newCron, timezone: e.target.value })}
                  className="w-full px-3 py-1.5 bg-[#0a0a0b] border border-[#1e1e21] rounded text-xs text-gray-200 focus:outline-none focus:border-amber-500" />
              </div>
            </div>
            <div className="bg-[#0a0a0b] rounded p-3 text-[10px] text-gray-500 space-y-1">
              <div className="font-medium text-gray-400">Cron cheat sheet:</div>
              <div><code className="text-amber-400/60">0 * * * *</code> — Every hour</div>
              <div><code className="text-amber-400/60">0 9 * * 1-5</code> — 9am weekdays</div>
              <div><code className="text-amber-400/60">30 6 * * *</code> — 6:30am daily</div>
              <div><code className="text-amber-400/60">0 */6 * * *</code> — Every 6 hours</div>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={handleCreate} className="flex-1 px-4 py-2 text-xs font-medium bg-amber-500 text-gray-900 rounded hover:bg-amber-400">Create</button>
              <button onClick={() => setShowCreate(false)} className="flex-1 px-4 py-2 text-xs text-gray-400 bg-[#1a1a1d] rounded">Cancel</button>
            </div>
          </div>
        </div>
      )}
      {/* Edit Modal */}
      {editingCron && (
        <div className="fixed inset-0 bg-black/70 flex items-start justify-center z-50 pt-16 px-4" onClick={() => setEditingCron(null)} role="dialog" aria-modal="true" aria-label="Edit Cron Job">
          <div className="bg-[#111113] rounded-xl border border-[#1e1e21] w-full max-w-lg p-5 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-200">Edit Cron Job</h3>
              <div className="flex items-center gap-2">
                <span className="text-xs">{AGENT_EMOJIS[editingCron.agentId] || '🤖'}</span>
                <span className="text-[10px] text-gray-500">@{editingCron.agentId}</span>
              </div>
            </div>
            <div>
              <label className="block text-[10px] text-gray-500 uppercase mb-1">Name</label>
              <input type="text" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                className="w-full px-3 py-2 bg-[#0a0a0b] border border-[#1e1e21] rounded text-sm text-gray-200 focus:outline-none focus:border-amber-500" />
            </div>
            <div>
              <label className="block text-[10px] text-gray-500 uppercase mb-1">Schedule (cron expression)</label>
              <input type="text" value={editForm.cron} onChange={e => setEditForm({ ...editForm, cron: e.target.value })}
                className="w-full px-3 py-1.5 bg-[#0a0a0b] border border-[#1e1e21] rounded text-xs text-gray-200 font-mono focus:outline-none focus:border-amber-500" />
            </div>
            <div>
              <label className="block text-[10px] text-gray-500 uppercase mb-1">Message</label>
              <textarea rows={5} value={editForm.message} onChange={e => setEditForm({ ...editForm, message: e.target.value })}
                className="w-full px-3 py-2 bg-[#0a0a0b] border border-[#1e1e21] rounded text-xs text-gray-200 focus:outline-none focus:border-amber-500 resize-none font-mono leading-relaxed" />
            </div>
            {editingCron.state && (
              <div className="bg-[#0a0a0b] rounded p-3 text-[10px] text-gray-500 space-y-1">
                <div className="font-medium text-gray-400">Status</div>
                {editingCron.state.lastRunAtMs && <div>Last run: {timeSince(editingCron.state.lastRunAtMs)} • {editingCron.state.lastStatus}</div>}
                {editingCron.state.lastDurationMs && <div>Duration: {Math.round(editingCron.state.lastDurationMs / 1000)}s</div>}
                {editingCron.state.nextRunAtMs && <div>Next: in {timeUntil(editingCron.state.nextRunAtMs)}</div>}
                {(editingCron.state.consecutiveErrors || 0) > 0 && <div className="text-red-400">Consecutive errors: {editingCron.state.consecutiveErrors}</div>}
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <button onClick={handleEdit} className="flex-1 px-4 py-2 text-xs font-medium bg-amber-500 text-gray-900 rounded hover:bg-amber-400">Save</button>
              <button onClick={() => setEditingCron(null)} className="flex-1 px-4 py-2 text-xs text-gray-400 bg-[#1a1a1d] rounded">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
