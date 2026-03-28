'use client';

import { useState, useEffect, useCallback } from 'react';
import { autoTask } from '@/lib/tasks';
import { AGENT_EMOJIS } from '@/lib/agents';

interface Approval {
  id: string;
  taskId: string;
  requestedBy: string;
  approver: string;
  status: string;
  command: string;
  reason: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

const typeConfig: Record<string, { bg: string; text: string; label: string }> = {
  deploy: { bg: 'bg-red-500/20', text: 'text-red-400', label: 'Deploy' },
  git_push: { bg: 'bg-amber-500/20', text: 'text-amber-400', label: 'Git Push' },
  content_publish: { bg: 'bg-purple-500/20', text: 'text-purple-400', label: 'Publish' },
  external_api: { bg: 'bg-blue-500/20', text: 'text-blue-400', label: 'API Call' },
  architecture: { bg: 'bg-indigo-500/20', text: 'text-indigo-400', label: 'Architecture' },
  security: { bg: 'bg-red-500/20', text: 'text-red-400', label: 'Security' },
  ceo_gate: { bg: 'bg-amber-500/20', text: 'text-amber-400', label: 'CEO Gate' },
  agent_action: { bg: 'bg-teal-500/20', text: 'text-teal-400', label: 'Agent Action' },
};

function timeAgo(d: string): string {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 1) return 'just now'; if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function ApprovalsPage() {
  const [pending, setPending] = useState<Approval[]>([]);
  const [history, setHistory] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [filter, setFilter] = useState('all');
  const [newApproval, setNewApproval] = useState({ title: '', type: 'ceo_gate', requestedBy: '', context: '' });

  const fetchApprovals = useCallback(async () => {
    try {
      const res = await fetch('/api/approvals');
      const data = await res.json();
      setPending(data.pending || []);
      setHistory(data.history || []);
    } catch (err) { console.error('[approvals] fetch error:', err); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchApprovals(); }, [fetchApprovals]);

  // SSE
  useEffect(() => {
    let es: EventSource | null = null;
    try { es = new EventSource('/api/sse'); es.onmessage = () => fetchApprovals(); } catch {}
    return () => { if (es) es.close(); };
  }, [fetchApprovals]);

  const handleDecision = async (id: string, decision: 'approved' | 'rejected', reason?: string) => {
    const approval = pending.find(a => a.id === id);
    await fetch(`/api/approvals/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision, decidedBy: 'user', reason }),
    });
    autoTask.approvalAction(
      decision === 'approved' ? 'Approved' : 'Rejected',
      approval?.taskId || id
    );
    setRejectingId(null);
    setRejectReason('');
    fetchApprovals();
  };

  const handleApproveAll = async () => {
    for (const a of pending) {
      await fetch(`/api/approvals/${a.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision: 'approved', decidedBy: 'user' }),
      });
    }
    autoTask.approvalAction('Approved all', `${pending.length} pending approvals`);
    fetchApprovals();
  };

  const handleCreate = async () => {
    if (!newApproval.title) return;
    await fetch('/api/approvals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newApproval),
    });
    setShowCreate(false);
    setNewApproval({ title: '', type: 'ceo_gate', requestedBy: '', context: '' });
    fetchApprovals();
  };

  const filteredHistory = filter === 'all' ? history : history.filter(a => a.status === filter);
  const approvedCount = history.filter(a => a.status === 'approved').length;
  const rejectedCount = history.filter(a => a.status === 'rejected').length;

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-600 text-sm">Loading...</div>;

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] gap-4">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 shrink-0">
        <div className={`bg-[#111113] rounded-lg p-3 border ${pending.length > 0 ? 'border-amber-500/30' : 'border-[#1e1e21]'}`}>
          <div className="text-[10px] text-gray-500 uppercase">Pending</div>
          <div className={`text-2xl font-bold ${pending.length > 0 ? 'text-amber-400' : 'text-gray-500'}`}>{pending.length}</div>
        </div>
        <div className="bg-[#111113] rounded-lg p-3 border border-[#1e1e21]">
          <div className="text-[10px] text-gray-500 uppercase">Approved</div>
          <div className="text-2xl font-bold text-green-400">{approvedCount}</div>
        </div>
        <div className="bg-[#111113] rounded-lg p-3 border border-[#1e1e21]">
          <div className="text-[10px] text-gray-500 uppercase">Rejected</div>
          <div className="text-2xl font-bold text-red-400">{rejectedCount}</div>
        </div>
        <div className="bg-[#111113] rounded-lg p-3 border border-[#1e1e21]">
          <div className="text-[10px] text-gray-500 uppercase">Total</div>
          <div className="text-2xl font-bold text-gray-300">{pending.length + history.length}</div>
        </div>
      </div>

      {/* Pending */}
      <div className="shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-200">Pending</h2>
            {pending.length > 0 && <span className="text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded">{pending.length}</span>}
          </div>
          <div className="flex gap-2">
            {pending.length > 1 && (
              <button onClick={handleApproveAll} className="px-3 py-1.5 text-[11px] font-medium bg-green-500/20 text-green-400 rounded hover:bg-green-500/30">Approve All</button>
            )}
            <button onClick={() => setShowCreate(true)} className="px-3 py-1.5 text-[11px] font-medium bg-amber-500 text-gray-900 rounded hover:bg-amber-400">+ Request</button>
          </div>
        </div>

        {pending.length === 0 ? (
          <div className="bg-[#111113] rounded-lg border border-[#1e1e21] p-6 text-center">
            <div className="text-2xl mb-1">✅</div>
            <div className="text-xs text-gray-500">No pending approvals</div>
          </div>
        ) : (
          <div className="space-y-2 max-h-[250px] overflow-y-auto">
            {pending.map(a => {
              const type = typeConfig[a.command] || typeConfig.ceo_gate;
              const isRejecting = rejectingId === a.id;
              return (
                <div key={a.id} className="bg-[#111113] rounded-lg border border-amber-500/20 p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-base">{AGENT_EMOJIS[a.requestedBy] || '🤖'}</span>
                        <span className="text-sm font-medium text-gray-200">{a.taskId}</span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded ${type.bg} ${type.text}`}>{type.label}</span>
                      </div>
                      <div className="text-[11px] text-gray-500">by @{a.requestedBy} • {timeAgo(a.createdAt)}</div>
                      {a.reason && <p className="text-xs text-gray-400 mt-2 leading-relaxed">{a.reason}</p>}
                    </div>
                    <div className="flex flex-col gap-1.5 ml-4 shrink-0">
                      <button onClick={() => handleDecision(a.id, 'approved')}
                        className="px-3 py-1.5 text-[11px] font-medium bg-green-500/20 text-green-400 rounded hover:bg-green-500/30">Approve</button>
                      {isRejecting ? (
                        <div className="space-y-1.5">
                          <input type="text" placeholder="Reason..." value={rejectReason} onChange={e => setRejectReason(e.target.value)} autoFocus
                            className="w-full px-2 py-1 bg-[#0a0a0b] border border-[#1e1e21] rounded text-[10px] text-gray-300 focus:outline-none focus:border-red-500" />
                          <div className="flex gap-1">
                            <button onClick={() => handleDecision(a.id, 'rejected', rejectReason)}
                              className="flex-1 px-2 py-1 text-[10px] bg-red-500/20 text-red-400 rounded">Confirm</button>
                            <button onClick={() => { setRejectingId(null); setRejectReason(''); }}
                              className="flex-1 px-2 py-1 text-[10px] text-gray-500 bg-[#1a1a1d] rounded">Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => setRejectingId(a.id)}
                          className="px-3 py-1.5 text-[11px] bg-red-500/10 text-red-400 rounded hover:bg-red-500/20">Reject</button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* History */}
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="flex items-center justify-between mb-3 shrink-0">
          <h2 className="text-sm font-semibold text-gray-200">History</h2>
          <div className="flex gap-0.5 bg-[#111113] rounded-lg p-0.5 border border-[#1e1e21]">
            {['all', 'approved', 'rejected'].map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-2.5 py-1 text-[11px] rounded capitalize ${filter === f ? 'bg-[#1e1e21] text-gray-100' : 'text-gray-500 hover:text-gray-300'}`}>{f}</button>
            ))}
          </div>
        </div>

        {filteredHistory.length === 0 ? (
          <div className="bg-[#111113] rounded-lg border border-[#1e1e21] p-6 text-center text-xs text-gray-600">No decisions yet</div>
        ) : (
          <div className="bg-[#111113] rounded-lg border border-[#1e1e21] overflow-hidden flex-1 min-h-0 flex flex-col">
            <div className="grid grid-cols-12 px-4 py-2 border-b border-[#1e1e21] text-[10px] text-gray-600 uppercase tracking-wider shrink-0">
              <div className="col-span-1">Status</div>
              <div className="col-span-4">Title</div>
              <div className="col-span-2">Type</div>
              <div className="col-span-2">By</div>
              <div className="col-span-1">Decision</div>
              <div className="col-span-2">Date</div>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-[#1e1e21]">
              {filteredHistory.map(a => {
                const type = typeConfig[a.command] || typeConfig.ceo_gate;
                const isApproved = a.status === 'approved';
                return (
                  <div key={a.id} className={`grid grid-cols-12 px-4 py-2.5 items-center text-xs ${isApproved ? 'hover:bg-green-500/5' : 'hover:bg-red-500/5'}`}>
                    <div className="col-span-1">
                      <span className={`text-base ${isApproved ? '' : ''}`}>{isApproved ? '✅' : '❌'}</span>
                    </div>
                    <div className="col-span-4 text-gray-300 truncate">{a.taskId}</div>
                    <div className="col-span-2">
                      <span className={`text-[9px] px-1.5 py-0.5 rounded ${type.bg} ${type.text}`}>{type.label}</span>
                    </div>
                    <div className="col-span-2 text-gray-500 flex items-center gap-1">
                      <span className="text-xs">{AGENT_EMOJIS[a.requestedBy] || ''}</span>
                      @{a.requestedBy}
                    </div>
                    <div className="col-span-1 text-gray-500">{a.approver}</div>
                    <div className="col-span-2 text-gray-600">{a.resolvedAt ? fmtDate(a.resolvedAt) : '—'}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/70 flex items-start justify-center z-50 pt-16 px-4" onClick={() => setShowCreate(false)} role="dialog" aria-modal="true" aria-label="Request Approval">
          <div className="bg-[#111113] rounded-xl border border-[#1e1e21] w-full max-w-lg p-5 space-y-3" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-gray-200">Request Approval</h3>
            <input type="text" placeholder="What needs approval?" value={newApproval.title} onChange={e => setNewApproval({ ...newApproval, title: e.target.value })}
              className="w-full px-3 py-2 bg-[#0a0a0b] border border-[#1e1e21] rounded text-sm text-gray-200 focus:outline-none focus:border-amber-500" autoFocus />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] text-gray-500 uppercase mb-1">Type</label>
                <select value={newApproval.type} onChange={e => setNewApproval({ ...newApproval, type: e.target.value })}
                  className="w-full px-3 py-1.5 bg-[#0a0a0b] border border-[#1e1e21] rounded text-xs text-gray-200 focus:outline-none focus:border-amber-500">
                  {Object.entries(typeConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] text-gray-500 uppercase mb-1">Requested by</label>
                <input type="text" placeholder="@agent" value={newApproval.requestedBy} onChange={e => setNewApproval({ ...newApproval, requestedBy: e.target.value })}
                  className="w-full px-3 py-1.5 bg-[#0a0a0b] border border-[#1e1e21] rounded text-xs text-gray-200 focus:outline-none focus:border-amber-500" />
              </div>
            </div>
            <div>
              <label className="block text-[10px] text-gray-500 uppercase mb-1">Context</label>
              <textarea rows={3} placeholder="Why is this needed? What will happen?" value={newApproval.context}
                onChange={e => setNewApproval({ ...newApproval, context: e.target.value })}
                className="w-full px-3 py-2 bg-[#0a0a0b] border border-[#1e1e21] rounded text-xs text-gray-200 focus:outline-none focus:border-amber-500 resize-none" />
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={handleCreate} className="flex-1 px-4 py-2 text-xs font-medium bg-amber-500 text-gray-900 rounded hover:bg-amber-400">Submit</button>
              <button onClick={() => setShowCreate(false)} className="flex-1 px-4 py-2 text-xs text-gray-400 bg-[#1a1a1d] rounded">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
