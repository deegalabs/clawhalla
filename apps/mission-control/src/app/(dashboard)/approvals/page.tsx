'use client';

import { useState, useEffect } from 'react';

interface Approval {
  id: string;
  taskId: string; // title
  requestedBy: string;
  approver: string;
  status: string;
  command: string; // type
  reason: string | null; // context
  createdAt: string;
  resolvedAt: string | null;
}

const typeStyles: Record<string, { bg: string; text: string }> = {
  ceo_gate: { bg: 'bg-amber-500/20', text: 'text-amber-400' },
  deploy: { bg: 'bg-red-500/20', text: 'text-red-400' },
  architecture: { bg: 'bg-purple-500/20', text: 'text-purple-400' },
};

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

export default function ApprovalsPage() {
  const [pending, setPending] = useState<Approval[]>([]);
  const [history, setHistory] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchApprovals = async () => {
    try {
      const res = await fetch('/api/approvals');
      const data = await res.json();
      setPending(data.pending || []);
      setHistory(data.history || []);
    } catch (error) {
      console.error('Failed to fetch approvals:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApprovals();
    
    // Seed sample data if empty
    const seedData = async () => {
      const res = await fetch('/api/approvals');
      const data = await res.json();
      if (data.pending?.length === 0 && data.history?.length === 0) {
        await fetch('/api/approvals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: 'Deploy Mission Control to production',
            type: 'deploy',
            requestedBy: 'thor',
            context: 'Sprint 3 complete. All features tested locally. Ready for production deployment.',
          }),
        });
        await fetch('/api/approvals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: 'ADR-002: Heartbeat Integration Architecture',
            type: 'architecture',
            requestedBy: 'odin',
            context: 'Defines how agents poll Mission Control for tasks during OpenClaw heartbeats.',
          }),
        });
        fetchApprovals();
      }
    };
    seedData();
  }, []);

  const handleDecision = async (id: string, decision: 'approved' | 'rejected') => {
    try {
      await fetch(`/api/approvals/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, decidedBy: 'daniel' }),
      });
      fetchApprovals();
    } catch (error) {
      console.error('Failed to update approval:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        Loading approvals...
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Pending Approvals */}
      <div>
        <h2 className="text-xl font-semibold text-gray-100 mb-4">
          Pending Approvals
          {pending.length > 0 && (
            <span className="ml-2 px-2 py-0.5 text-sm bg-amber-500/20 text-amber-400 rounded">
              {pending.length}
            </span>
          )}
        </h2>
        
        {pending.length === 0 ? (
          <div className="bg-gray-900 rounded-lg border border-gray-800 p-8 text-center text-gray-500">
            No pending approvals
          </div>
        ) : (
          <div className="grid gap-4">
            {pending.map(approval => {
              const type = approval.command || 'ceo_gate';
              const styles = typeStyles[type] || typeStyles.ceo_gate;
              return (
                <div
                  key={approval.id}
                  className="bg-gray-900 rounded-lg border border-amber-500/50 p-5"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h3 className="font-semibold text-gray-100">{approval.taskId}</h3>
                        <span className={`px-2 py-0.5 text-xs rounded capitalize ${styles.bg} ${styles.text}`}>
                          {type.replace('_', ' ')}
                        </span>
                      </div>
                      <div className="text-sm text-gray-500 mt-1">
                        Requested by <span className="text-gray-400">{approval.requestedBy}</span> • {timeAgo(approval.createdAt)}
                      </div>
                      {approval.reason && (
                        <p className="text-sm text-gray-400 mt-3">{approval.reason}</p>
                      )}
                    </div>
                    <div className="flex gap-2 ml-4">
                      <button
                        onClick={() => handleDecision(approval.id, 'approved')}
                        className="px-4 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg text-sm font-medium transition-colors"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleDecision(approval.id, 'rejected')}
                        className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg text-sm font-medium transition-colors"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Decision History */}
      <div>
        <h2 className="text-xl font-semibold text-gray-100 mb-4">Decision History</h2>
        
        {history.length === 0 ? (
          <div className="bg-gray-900 rounded-lg border border-gray-800 p-8 text-center text-gray-500">
            No decisions yet
          </div>
        ) : (
          <div className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-800 text-left text-sm text-gray-500">
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Title</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Requested By</th>
                  <th className="px-4 py-3 font-medium">Decision</th>
                  <th className="px-4 py-3 font-medium">Decided By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {history.map(approval => {
                  const type = approval.command || 'ceo_gate';
                  const styles = typeStyles[type] || typeStyles.ceo_gate;
                  const isApproved = approval.status === 'approved';
                  return (
                    <tr
                      key={approval.id}
                      className={isApproved ? 'bg-green-500/5' : 'bg-red-500/5'}
                    >
                      <td className="px-4 py-3 text-sm text-gray-400">
                        {approval.resolvedAt ? formatDate(approval.resolvedAt) : '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-200">{approval.taskId}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 text-xs rounded capitalize ${styles.bg} ${styles.text}`}>
                          {type.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-400">{approval.requestedBy}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 text-xs rounded capitalize ${
                          isApproved 
                            ? 'bg-green-500/20 text-green-400' 
                            : 'bg-red-500/20 text-red-400'
                        }`}>
                          {approval.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-400">{approval.approver}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
