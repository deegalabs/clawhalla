'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { SQUADS } from '@/lib/squads';

// ─── Types ──────────────────────────────────────────────────────

// Workspace-backed types (from /api/squads)
interface AgentManifest {
  name: string; displayName: string; title: string; squad: string;
  model: string; emoji: string; role: string;
  domain: string[]; capabilities: Record<string, string> | string[];
  communicationStyle?: string; reportsTo?: string; executionModes?: string[];
}
interface AgentIdentity { epithet?: string; vibe?: string; mythology?: string; }
interface WsAgent { id: string; manifest: AgentManifest; identity: AgentIdentity; }
interface WsSquad { id: string; agents: WsAgent[]; }

// DB/org-backed types (from /api/org-structure)
interface OrgAgent {
  id: string; name: string; emoji: string; role: string; model: string;
  tier: number; squad: string | null; reportsTo: string; manages: string[]; skills: string[];
}
interface OrgSquad { id: string; name: string; chief: string; domain: string; members: string[]; }
interface LiveAgent extends OrgAgent {
  status: 'active' | 'idle' | 'offline'; lastActivity?: number; liveModel?: string;
}

type SquadsTab = 'squads' | 'org' | 'roster';

// ─── Constants ──────────────────────────────────────────────────

const MODELS = [
  { id: 'claude-opus-4-6', label: 'Opus 4.6', tier: 'opus' },
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6', tier: 'sonnet' },
  { id: 'claude-haiku-4-5', label: 'Haiku 4.5', tier: 'haiku' },
];

// Derived from lib/squads.ts (single source of truth)
const SQUAD_TEMPLATES = SQUADS.map(s => ({
  id: s.id,
  label: s.name,
  desc: s.description,
  agents: s.agents.length,
}));

const modelColors: Record<string, string> = {
  'claude-opus-4-6': 'text-red-400', 'claude-sonnet-4-6': 'text-amber-400',
  'claude-sonnet-4-5': 'text-blue-400', 'claude-haiku-4-5': 'text-green-400',
};
const statusDot: Record<string, string> = { active: 'bg-green-500', idle: 'bg-amber-500', offline: 'bg-gray-600' };

const defaultSquadColors: Record<string, { border: string; bg: string; text: string }> = {
  dev_squad: { border: 'border-blue-500/40', bg: 'bg-blue-500/10', text: 'text-blue-400' },
  blockchain_squad: { border: 'border-purple-500/40', bg: 'bg-purple-500/10', text: 'text-purple-400' },
  clop_cabinet: { border: 'border-green-500/40', bg: 'bg-green-500/10', text: 'text-green-400' },
  product_squad: { border: 'border-amber-500/40', bg: 'bg-amber-500/10', text: 'text-amber-400' },
  personal: { border: 'border-cyan-500/40', bg: 'bg-cyan-500/10', text: 'text-cyan-400' },
  hackathon: { border: 'border-pink-500/40', bg: 'bg-pink-500/10', text: 'text-pink-400' },
  social: { border: 'border-indigo-500/40', bg: 'bg-indigo-500/10', text: 'text-indigo-400' },
};

const modelOptions = [
  { value: 'claude-sonnet-4-5', label: 'Sonnet 4.5' },
  { value: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
  { value: 'claude-haiku-4-5', label: 'Haiku 4.5' },
  { value: 'claude-opus-4-6', label: 'Opus 4.6' },
];

// ─── Helpers ────────────────────────────────────────────────────

function modelColor(model: string): string {
  if (model.includes('opus')) return 'border-amber-500 text-amber-400';
  if (model.includes('sonnet')) return 'border-blue-500 text-blue-400';
  if (model.includes('haiku')) return 'border-gray-500 text-gray-400';
  return 'border-gray-600 text-gray-500';
}
function modelLabel(model: string): string {
  if (model.includes('opus-4-6')) return 'Opus 4.6';
  if (model.includes('sonnet-4-6')) return 'Sonnet 4.6';
  if (model.includes('sonnet-4-5')) return 'Sonnet 4.5';
  if (model.includes('haiku')) return 'Haiku 4.5';
  return model.split('/').pop() || model;
}
function getSquadColor(squadId: string | null) {
  if (!squadId) return null;
  return defaultSquadColors[squadId] || { border: 'border-gray-500/30', bg: 'bg-gray-500/10', text: 'text-gray-400' };
}
function getStatus(lastActivity: number | undefined, ok: boolean): 'active' | 'idle' | 'offline' {
  if (!ok) return 'offline';
  if (!lastActivity) return 'idle';
  return Date.now() - lastActivity < 2 * 60 * 1000 ? 'active' : 'idle';
}

// ═══════════════════════════════════════════════════════════════
// SQUADS TAB — Workspace Agent Cards
// ═══════════════════════════════════════════════════════════════

function WsAgentCard({ agent, onClick }: { agent: WsAgent; onClick: () => void }) {
  const m = agent.manifest;
  const caps = typeof m.capabilities === 'object' && !Array.isArray(m.capabilities) ? Object.entries(m.capabilities) : [];
  return (
    <button onClick={onClick} className="w-full text-left bg-[#1a1a1d] border border-[#2a2a2d] rounded-lg p-4 hover:border-[#3a3a3d] transition-colors">
      <div className="flex items-start gap-3">
        <span className="text-2xl">{m.emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-100">{m.displayName}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${modelColor(m.model)}`}>{modelLabel(m.model)}</span>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">{m.title}</p>
          {agent.identity.vibe && <p className="text-[11px] text-gray-600 mt-1 line-clamp-2">{agent.identity.vibe}</p>}
          {caps.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {caps.slice(0, 6).map(([k]) => (
                <span key={k} className="text-[10px] px-1.5 py-0.5 rounded bg-[#111113] text-gray-500 border border-[#2a2a2d]">{k}</span>
              ))}
              {caps.length > 6 && <span className="text-[10px] text-gray-600">+{caps.length - 6}</span>}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

function WsAgentDetail({ agent, onClose }: { agent: WsAgent; onClose: () => void }) {
  const m = agent.manifest;
  const id = agent.identity;
  const caps = typeof m.capabilities === 'object' && !Array.isArray(m.capabilities) ? Object.entries(m.capabilities) : [];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-[#111113] border border-[#2a2a2d] rounded-xl w-full max-w-lg max-h-[80vh] overflow-y-auto mx-4" onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex items-start gap-4 mb-4">
            <span className="text-4xl">{m.emoji}</span>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-gray-100">{m.displayName}</h2>
                <span className={`text-[10px] px-1.5 py-0.5 rounded border ${modelColor(m.model)}`}>{modelLabel(m.model)}</span>
              </div>
              <p className="text-sm text-gray-400">{m.title}</p>
              {id.epithet && <p className="text-xs text-amber-600 mt-1 italic">{id.epithet}</p>}
            </div>
            <button onClick={onClose} className="text-gray-600 hover:text-gray-400 text-lg">✕</button>
          </div>
          {id.vibe && <div className="mb-4"><h3 className="text-[10px] uppercase tracking-widest text-gray-600 mb-1">Vibe</h3><p className="text-sm text-gray-300">{id.vibe}</p></div>}
          {id.mythology && <div className="mb-4"><h3 className="text-[10px] uppercase tracking-widest text-gray-600 mb-1">Mythology</h3><p className="text-sm text-gray-400 leading-relaxed">{id.mythology}</p></div>}
          {m.domain.length > 0 && (
            <div className="mb-4">
              <h3 className="text-[10px] uppercase tracking-widest text-gray-600 mb-1">Domain</h3>
              <div className="flex flex-wrap gap-1.5">{m.domain.map(d => <span key={d} className="text-xs px-2 py-0.5 rounded bg-[#1a1a1d] text-gray-300 border border-[#2a2a2d]">{d}</span>)}</div>
            </div>
          )}
          {caps.length > 0 && (
            <div className="mb-4">
              <h3 className="text-[10px] uppercase tracking-widest text-gray-600 mb-1">Capabilities</h3>
              <div className="space-y-1">{caps.map(([k, v]) => <div key={k} className="flex gap-2 text-xs"><span className="text-amber-500 font-mono w-8 shrink-0">{k}</span><span className="text-gray-400">{v}</span></div>)}</div>
            </div>
          )}
          <div className="border-t border-[#2a2a2d] pt-3 mt-4 space-y-1">
            {m.reportsTo && <p className="text-xs text-gray-600">Reports to: <span className="text-gray-400">{m.reportsTo}</span></p>}
            {m.communicationStyle && <p className="text-xs text-gray-600">Style: <span className="text-gray-400">{m.communicationStyle}</span></p>}
            {m.executionModes && <p className="text-xs text-gray-600">Modes: <span className="text-gray-400">{m.executionModes.join(', ')}</span></p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function WsSquadCard({ squad, onSelect }: { squad: WsSquad; onSelect: () => void }) {
  const chief = squad.agents.find(a => a.manifest.title.toLowerCase().includes('chief') || a.manifest.reportsTo === undefined);
  return (
    <button onClick={onSelect} className="w-full text-left bg-[#111113] border border-[#2a2a2d] rounded-lg p-5 hover:border-amber-900/50 transition-colors">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-gray-100 capitalize">{squad.id.replace(/-/g, ' ')} Squad</h3>
        <span className="text-xs text-gray-600">{squad.agents.length} agents</span>
      </div>
      <div className="flex -space-x-2 mb-3">
        {squad.agents.map(a => <span key={a.id} title={a.manifest.displayName} className="w-8 h-8 rounded-full bg-[#1a1a1d] border-2 border-[#111113] flex items-center justify-center text-sm">{a.manifest.emoji}</span>)}
      </div>
      {chief && <p className="text-xs text-gray-500">Chief: {chief.manifest.emoji} {chief.manifest.displayName}</p>}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════
// ORG CHART TAB — Tier Hierarchy (from Team page)
// ═══════════════════════════════════════════════════════════════

const tierLabels = ['PLATFORM', 'EXECUTIVE', 'MANAGEMENT', 'EXECUTION'];
const tierDescriptions = ['System Controller', 'Strategic Decision Makers', 'Squad Chiefs & Coordinators', 'Specialized Agents'];

function OrgCard({ agent, onSelect, isSelected }: { agent: LiveAgent; onSelect: (a: LiveAgent, e: React.MouseEvent) => void; isSelected: boolean }) {
  const sqColor = getSquadColor(agent.squad);
  return (
    <button onClick={(e) => onSelect(agent, e)}
      className={`relative rounded-xl border p-3 w-36 text-center transition-all hover:scale-[1.03] shrink-0 ${
        isSelected ? 'border-amber-500/60 bg-amber-500/5 shadow-lg shadow-amber-500/10' : 'border-[#1e1e21] bg-[#111113] hover:border-[#333]'
      }`}>
      <div className={`absolute top-2 right-2 w-2 h-2 rounded-full ${statusDot[agent.status]}`} />
      <div className={`w-11 h-11 mx-auto rounded-full flex items-center justify-center text-xl mb-1.5 ${sqColor?.bg || 'bg-[#1a1a1d]'}`}>{agent.emoji}</div>
      <div className="text-[11px] font-semibold text-gray-100 truncate">{agent.name}</div>
      <div className="text-[9px] text-gray-500 truncate">{agent.role}</div>
      <div className={`text-[8px] mt-1 ${modelColors[agent.liveModel || agent.model] || 'text-gray-600'}`}>{(agent.liveModel || agent.model).replace('claude-', '')}</div>
      {agent.manages.length > 0 && <div className="text-[8px] text-gray-600 mt-0.5">👥 {agent.manages.length}</div>}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════
// AGENT DETAIL PANEL (from Team page — view + edit + delete)
// ═══════════════════════════════════════════════════════════════

function OrgAgentDetail({ agent, allAgents, squads, onClose, onRefresh }: { agent: LiveAgent; allAgents: LiveAgent[]; squads: OrgSquad[]; onClose: () => void; onRefresh: () => void }) {
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: agent.name, role: agent.role, model: agent.model, emoji: agent.emoji, squad: agent.squad || '', tier: agent.tier, reportsTo: agent.reportsTo || '' });
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const manager = allAgents.find(a => a.id === agent.reportsTo);
  const directReports = allAgents.filter(a => a.reportsTo === agent.id);
  const sqColor = getSquadColor(agent.squad);
  const isChief = agent.id === 'claw' || agent.id === 'main';

  const squadOpts = useMemo(() => {
    const opts = [{ value: '', label: 'None' }];
    for (const s of squads) opts.push({ value: s.id, label: s.name });
    return opts;
  }, [squads]);

  const managerOpts = useMemo(() => {
    return allAgents.filter(a => a.id !== agent.id && a.tier < agent.tier).map(a => ({ value: a.id, label: `${a.emoji} ${a.name}` }));
  }, [allAgents, agent.id, agent.tier]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/agents/factory', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: agent.id, ...editForm, squad: editForm.squad || null }) });
      const data = await res.json();
      if (data.ok) { setEditing(false); onRefresh(); }
    } catch { /* ignore */ }
    setSaving(false);
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/agents/factory?id=${agent.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.ok) { onClose(); onRefresh(); }
    } catch { /* ignore */ }
    setDeleting(false);
  };

  const inputCls = 'w-full px-2 py-1 bg-[#0a0a0b] border border-[#1e1e21] rounded text-[10px] text-gray-200 focus:outline-none focus:border-amber-500/60';

  return (
    <div className="bg-[#111113] rounded-xl border border-[#1e1e21] overflow-hidden">
      <div className="p-4 border-b border-[#1e1e21] flex items-start gap-3">
        <div className={`w-14 h-14 rounded-xl flex items-center justify-center text-3xl shrink-0 ${sqColor?.bg || 'bg-[#1a1a1d]'}`}>
          {editing ? editForm.emoji : agent.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-100">{editing ? editForm.name : agent.name}</span>
            <span className={`w-2 h-2 rounded-full ${statusDot[agent.status]}`} />
            <span className="text-[9px] text-gray-500 capitalize">{agent.status}</span>
          </div>
          <div className="text-[11px] text-gray-400">{editing ? editForm.role : agent.role}</div>
          <div className={`text-[10px] mt-0.5 ${modelColors[editing ? editForm.model : (agent.liveModel || agent.model)] || 'text-gray-600'}`}>
            {(editing ? editForm.model : (agent.liveModel || agent.model)).replace('claude-', '')}
          </div>
        </div>
        <button onClick={onClose} className="text-gray-600 hover:text-gray-300 text-sm">✕</button>
      </div>
      <div className="p-4 space-y-3">
        {editing ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div><label className="block text-[8px] text-gray-600 mb-0.5">Name</label><input value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} className={inputCls} /></div>
              <div><label className="block text-[8px] text-gray-600 mb-0.5">Emoji</label><input value={editForm.emoji} onChange={e => setEditForm({ ...editForm, emoji: e.target.value })} className={inputCls} /></div>
            </div>
            <div><label className="block text-[8px] text-gray-600 mb-0.5">Role</label><input value={editForm.role} onChange={e => setEditForm({ ...editForm, role: e.target.value })} className={inputCls} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className="block text-[8px] text-gray-600 mb-0.5">Model</label><select value={editForm.model} onChange={e => setEditForm({ ...editForm, model: e.target.value })} className={inputCls}>{modelOptions.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}</select></div>
              <div><label className="block text-[8px] text-gray-600 mb-0.5">Tier</label><select value={editForm.tier} onChange={e => setEditForm({ ...editForm, tier: parseInt(e.target.value) })} className={inputCls}><option value={0}>0 — Platform</option><option value={1}>1 — Executive</option><option value={2}>2 — Management</option><option value={3}>3 — Execution</option></select></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className="block text-[8px] text-gray-600 mb-0.5">Squad</label><select value={editForm.squad} onChange={e => setEditForm({ ...editForm, squad: e.target.value })} className={inputCls}>{squadOpts.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select></div>
              <div><label className="block text-[8px] text-gray-600 mb-0.5">Reports to</label><select value={editForm.reportsTo} onChange={e => setEditForm({ ...editForm, reportsTo: e.target.value })} className={inputCls}><option value="">None</option>{managerOpts.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}</select></div>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={handleSave} disabled={saving} className="px-3 py-1.5 text-[10px] font-medium bg-amber-500 text-gray-900 rounded hover:bg-amber-400 disabled:opacity-40">{saving ? 'Saving...' : 'Save'}</button>
              <button onClick={() => { setEditing(false); setEditForm({ name: agent.name, role: agent.role, model: agent.model, emoji: agent.emoji, squad: agent.squad || '', tier: agent.tier, reportsTo: agent.reportsTo || '' }); }} className="px-3 py-1.5 text-[10px] font-medium text-gray-400 rounded hover:text-gray-200 border border-[#1e1e21]">Cancel</button>
            </div>
          </>
        ) : (
          <>
            <div>
              <div className="text-[9px] text-gray-600 uppercase tracking-wider mb-1.5">Organization</div>
              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div><span className="text-gray-600">Tier:</span><span className="text-gray-300 ml-1">{agent.tier} — {['Platform', 'Executive', 'Management', 'Execution'][agent.tier]}</span></div>
                {agent.squad && <div><span className="text-gray-600">Squad:</span><span className={`ml-1 ${sqColor?.text || 'text-gray-300'}`}>{agent.squad.replace(/_/g, ' ')}</span></div>}
              </div>
            </div>
            {manager && (
              <div>
                <div className="text-[9px] text-gray-600 uppercase tracking-wider mb-1.5">Reports to</div>
                <div className="flex items-center gap-2 p-2 bg-[#0a0a0b] rounded-lg border border-[#1e1e21]">
                  <span className="text-lg">{manager.emoji}</span>
                  <div><div className="text-[10px] font-medium text-gray-200">{manager.name}</div><div className="text-[9px] text-gray-500">{manager.role}</div></div>
                </div>
              </div>
            )}
            {directReports.length > 0 && (
              <div>
                <div className="text-[9px] text-gray-600 uppercase tracking-wider mb-1.5">Direct Reports ({directReports.length})</div>
                <div className="space-y-1">
                  {directReports.map(r => (
                    <div key={r.id} className="flex items-center gap-2 p-1.5 bg-[#0a0a0b] rounded border border-[#1e1e21]">
                      <span className={`w-1.5 h-1.5 rounded-full ${statusDot[r.status]}`} /><span className="text-sm">{r.emoji}</span><span className="text-[10px] text-gray-300">{r.name}</span><span className="text-[9px] text-gray-600 ml-auto">{r.role}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {agent.skills.length > 0 && (
              <div>
                <div className="text-[9px] text-gray-600 uppercase tracking-wider mb-1.5">Skills</div>
                <div className="flex flex-wrap gap-1">{agent.skills.map(s => <span key={s} className="text-[9px] px-1.5 py-0.5 bg-amber-500/10 text-amber-400/80 rounded">{s}</span>)}</div>
              </div>
            )}
            <div className="flex gap-2 pt-1 flex-wrap">
              <a href="/chat" className="px-3 py-1.5 text-[10px] font-medium bg-amber-500/20 text-amber-400 rounded hover:bg-amber-500/30 border border-amber-500/20">💬 Chat</a>
              {!isChief && <button onClick={() => setEditing(true)} className="px-3 py-1.5 text-[10px] font-medium bg-[#1a1a1d] text-gray-400 rounded hover:text-gray-200 border border-[#1e1e21]">✏️ Edit</button>}
              {!isChief && !confirmDelete && <button onClick={() => setConfirmDelete(true)} className="px-3 py-1.5 text-[10px] font-medium text-red-400/60 rounded hover:text-red-400 border border-[#1e1e21] hover:border-red-500/30">🗑 Delete</button>}
              {confirmDelete && (
                <div className="flex items-center gap-1.5">
                  <button onClick={handleDelete} disabled={deleting} className="px-2.5 py-1.5 text-[10px] font-medium bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 border border-red-500/30 disabled:opacity-40">{deleting ? 'Removing...' : 'Confirm Delete'}</button>
                  <button onClick={() => setConfirmDelete(false)} className="px-2 py-1.5 text-[10px] text-gray-500 hover:text-gray-300">Cancel</button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ROSTER TAB — Table + Create (from Team/Factory)
// ═══════════════════════════════════════════════════════════════

function RosterTab({ agents, squads, onCreated, onSelect }: { agents: LiveAgent[]; squads: OrgSquad[]; onCreated: () => void; onSelect: (a: LiveAgent, e: React.MouseEvent) => void }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ id: '', name: '', role: '', model: 'claude-sonnet-4-5', tier: 3, squad: '', reportsTo: 'claw', emoji: '🤖', skills: 'clawban', description: '' });
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const squadOpts = useMemo(() => { const opts = [{ value: '', label: 'None' }]; for (const s of squads) opts.push({ value: s.id, label: s.name }); return opts; }, [squads]);
  const managerOpts = useMemo(() => agents.filter(a => a.tier < 3).map(a => ({ value: a.id, label: `${a.emoji} ${a.name}` })), [agents]);
  const inputCls = 'w-full px-2 py-1.5 bg-[#0a0a0b] border border-[#1e1e21] rounded text-[10px] text-gray-200 focus:outline-none focus:border-amber-500/60';
  const tierLabel = (t: number) => ['Platform', 'Executive', 'Management', 'Execution'][t] || '?';

  const handleSubmit = async () => {
    if (!form.id || !form.name || !form.role) { setResult({ ok: false, msg: 'ID, name, and role required' }); return; }
    setSaving(true); setResult(null);
    try {
      const res = await fetch('/api/agents/factory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, squad: form.squad || null, skills: form.skills.split(',').map(s => s.trim()).filter(Boolean) }) });
      const data = await res.json();
      if (data.ok) { setResult({ ok: true, msg: `Agent "${data.agent.name}" created` }); setForm({ id: '', name: '', role: '', model: 'claude-sonnet-4-5', tier: 3, squad: '', reportsTo: 'claw', emoji: '🤖', skills: 'clawban', description: '' }); setShowForm(false); onCreated(); }
      else { setResult({ ok: false, msg: data.error || 'Failed' }); }
    } catch { setResult({ ok: false, msg: 'Failed' }); }
    setSaving(false);
  };

  return (
    <div className="space-y-4 py-2">
      <div className="flex items-center justify-between">
        <div className="text-[10px] text-gray-500">{agents.length} agents registered</div>
        <button onClick={() => setShowForm(!showForm)} className={`px-3 py-1.5 text-[10px] font-medium rounded border transition-colors ${showForm ? 'bg-[#1a1a1d] text-gray-400 border-[#1e1e21]' : 'bg-amber-500 text-gray-900 border-amber-500 hover:bg-amber-400'}`}>
          {showForm ? '✕ Cancel' : '+ New Agent'}
        </button>
      </div>

      {showForm && (
        <div className="bg-[#111113] rounded-lg border border-amber-500/20 p-4 space-y-3">
          <div className="text-[11px] font-semibold text-amber-400">Create New Agent</div>
          <div className="grid grid-cols-4 gap-2">
            <div><label className="block text-[8px] text-gray-600 mb-0.5">ID</label><input placeholder="agent_id" value={form.id} onChange={e => setForm({ ...form, id: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') })} className={`${inputCls} font-mono`} /></div>
            <div><label className="block text-[8px] text-gray-600 mb-0.5">Name</label><input placeholder="Agent Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={inputCls} /></div>
            <div><label className="block text-[8px] text-gray-600 mb-0.5">Role</label><input placeholder="Senior Developer" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} className={inputCls} /></div>
            <div><label className="block text-[8px] text-gray-600 mb-0.5">Emoji</label><input placeholder="🤖" value={form.emoji} onChange={e => setForm({ ...form, emoji: e.target.value })} className={inputCls} /></div>
          </div>
          <div className="grid grid-cols-4 gap-2">
            <div><label className="block text-[8px] text-gray-600 mb-0.5">Model</label><select value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} className={inputCls}>{modelOptions.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}</select></div>
            <div><label className="block text-[8px] text-gray-600 mb-0.5">Tier</label><select value={form.tier} onChange={e => setForm({ ...form, tier: parseInt(e.target.value) })} className={inputCls}><option value={1}>1 — Executive</option><option value={2}>2 — Management</option><option value={3}>3 — Execution</option></select></div>
            <div><label className="block text-[8px] text-gray-600 mb-0.5">Squad</label><select value={form.squad} onChange={e => setForm({ ...form, squad: e.target.value })} className={inputCls}>{squadOpts.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select></div>
            <div><label className="block text-[8px] text-gray-600 mb-0.5">Reports to</label><select value={form.reportsTo} onChange={e => setForm({ ...form, reportsTo: e.target.value })} className={inputCls}><option value="">None</option>{managerOpts.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}</select></div>
          </div>
          <div><label className="block text-[8px] text-gray-600 mb-0.5">Skills (comma-separated)</label><input placeholder="clawban, coding-agent" value={form.skills} onChange={e => setForm({ ...form, skills: e.target.value })} className={inputCls} /></div>
          {result && <div className={`text-[10px] ${result.ok ? 'text-green-400' : 'text-red-400'}`}>{result.msg}</div>}
          <button onClick={handleSubmit} disabled={saving} className="px-3 py-1.5 text-[10px] font-medium bg-amber-500 text-gray-900 rounded hover:bg-amber-400 disabled:opacity-40">{saving ? 'Creating...' : 'Create Agent'}</button>
        </div>
      )}

      <div className="bg-[#111113] rounded-lg border border-[#1e1e21] overflow-hidden">
        <table className="w-full text-[10px]">
          <thead>
            <tr className="border-b border-[#1e1e21] text-gray-600 text-left">
              <th className="px-3 py-2 font-medium">Agent</th><th className="px-3 py-2 font-medium">Role</th>
              <th className="px-3 py-2 font-medium">Model</th><th className="px-3 py-2 font-medium">Tier</th>
              <th className="px-3 py-2 font-medium">Squad</th><th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {agents.map(a => {
              const sc = getSquadColor(a.squad);
              return (
                <tr key={a.id} onClick={(e) => onSelect(a, e)} className="border-b border-[#1e1e21]/50 hover:bg-[#1a1a1d] cursor-pointer transition-colors">
                  <td className="px-3 py-2"><div className="flex items-center gap-2"><span className="text-base">{a.emoji}</span><div><div className="text-gray-200 font-medium">{a.name}</div><div className="text-[8px] text-gray-600 font-mono">{a.id}</div></div></div></td>
                  <td className="px-3 py-2 text-gray-400">{a.role}</td>
                  <td className={`px-3 py-2 ${modelColors[a.liveModel || a.model] || 'text-gray-500'}`}>{(a.liveModel || a.model).replace('claude-', '')}</td>
                  <td className="px-3 py-2 text-gray-500">{a.tier} — {tierLabel(a.tier)}</td>
                  <td className="px-3 py-2">{a.squad ? <span className={`px-1.5 py-0.5 rounded text-[9px] ${sc?.bg || ''} ${sc?.text || 'text-gray-400'}`}>{a.squad.replace(/_/g, ' ')}</span> : <span className="text-gray-700">—</span>}</td>
                  <td className="px-3 py-2"><div className="flex items-center gap-1.5"><span className={`w-1.5 h-1.5 rounded-full ${statusDot[a.status]}`} /><span className="text-gray-500 capitalize">{a.status}</span></div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// CREATE SQUAD MODAL
// ═══════════════════════════════════════════════════════════════

function CreateSquadModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [mode, setMode] = useState<'template' | 'custom'>('template');
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customAgents, setCustomAgents] = useState<{ name: string; role: string; model: string; emoji: string }[]>([{ name: '', role: '', model: 'claude-sonnet-4-6', emoji: '' }]);

  const addAgent = () => { if (customAgents.length < 10) setCustomAgents([...customAgents, { name: '', role: '', model: 'claude-sonnet-4-6', emoji: '' }]); };
  const removeAgent = (i: number) => { if (customAgents.length > 1) setCustomAgents(customAgents.filter((_, idx) => idx !== i)); };
  const updateAgent = (i: number, field: string, value: string) => { const u = [...customAgents]; u[i] = { ...u[i], [field]: value }; setCustomAgents(u); };

  const handleCreateTemplate = async () => {
    if (!selectedTemplate) return;
    setCreating(true); setError(null);
    try {
      const res = await fetch('/api/squads/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ squadId: selectedTemplate }) });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Failed');
      setSuccess(true); setTimeout(() => { onCreated(); onClose(); }, 1000);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unknown error'); }
    setCreating(false);
  };

  const handleCreateCustom = async () => {
    if (!customName.trim()) { setError('Squad name is required'); return; }
    const validAgents = customAgents.filter(a => a.name.trim() && a.role.trim());
    if (validAgents.length === 0) { setError('At least one agent with name and role required'); return; }
    setCreating(true); setError(null);
    try {
      const res = await fetch('/api/agents/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ squadId: customName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''), agents: validAgents.map((a, i) => ({ name: a.name.trim(), role: a.role.trim(), model: a.model, emoji: a.emoji || '🤖', tier: i === 0 ? 0 : 2 })) }) });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Failed');
      setSuccess(true); setTimeout(() => { onCreated(); onClose(); }, 1000);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unknown error'); }
    setCreating(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-[#111113] border border-[#2a2a2d] rounded-xl w-full max-w-xl max-h-[85vh] overflow-y-auto mx-4" onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-bold text-gray-100">Create Squad</h2>
            <button onClick={onClose} className="text-gray-600 hover:text-gray-400 text-lg">✕</button>
          </div>
          {success ? (
            <div className="text-center py-8"><span className="text-3xl">✓</span><p className="text-sm text-green-400 mt-2">Squad created successfully</p></div>
          ) : (
            <>
              <div className="flex gap-1 mb-5 bg-[#0a0a0b] rounded-lg p-1">
                <button onClick={() => setMode('template')} className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${mode === 'template' ? 'bg-[#1a1a1d] text-gray-100' : 'text-gray-500 hover:text-gray-300'}`}>From Template</button>
                <button onClick={() => setMode('custom')} className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${mode === 'custom' ? 'bg-[#1a1a1d] text-gray-100' : 'text-gray-500 hover:text-gray-300'}`}>Custom</button>
              </div>
              {mode === 'template' && (
                <div className="space-y-3">
                  {SQUAD_TEMPLATES.map(t => (
                    <button key={t.id} onClick={() => setSelectedTemplate(t.id)} className={`w-full text-left p-4 rounded-lg border transition-colors ${selectedTemplate === t.id ? 'border-amber-500 bg-amber-500/5' : 'border-[#2a2a2d] hover:border-[#3a3a3d] bg-[#0a0a0b]'}`}>
                      <div className="flex items-center justify-between"><span className="text-sm font-medium text-gray-200">{t.label}</span><span className="text-[10px] text-gray-600">{t.agents} agents</span></div>
                      <p className="text-xs text-gray-500 mt-0.5">{t.desc}</p>
                    </button>
                  ))}
                  <button onClick={handleCreateTemplate} disabled={!selectedTemplate || creating} className="w-full py-2.5 rounded-lg text-sm font-medium bg-amber-500 text-black hover:bg-amber-400 disabled:opacity-40 transition-colors">{creating ? 'Creating...' : 'Create Squad'}</button>
                </div>
              )}
              {mode === 'custom' && (
                <div className="space-y-4">
                  <div><label className="text-[10px] uppercase tracking-widest text-gray-500 mb-1 block">Squad Name</label><input value={customName} onChange={e => setCustomName(e.target.value)} placeholder="e.g. Research Team" className="w-full px-3 py-2 text-sm bg-[#0a0a0b] border border-[#2a2a2d] rounded-lg text-gray-200 placeholder:text-gray-700 focus:border-amber-500/50 focus:outline-none" /></div>
                  <div>
                    <div className="flex items-center justify-between mb-2"><label className="text-[10px] uppercase tracking-widest text-gray-500">Agents</label><button onClick={addAgent} disabled={customAgents.length >= 10} className="text-[10px] text-amber-400 hover:text-amber-300 disabled:text-gray-700">+ Add Agent</button></div>
                    <div className="space-y-3">
                      {customAgents.map((agent, i) => (
                        <div key={i} className="bg-[#0a0a0b] border border-[#2a2a2d] rounded-lg p-3">
                          <div className="flex items-center justify-between mb-2"><span className="text-[10px] text-gray-600">Agent {i + 1}{i === 0 ? ' (Chief)' : ''}</span>{customAgents.length > 1 && <button onClick={() => removeAgent(i)} className="text-[10px] text-red-400 hover:text-red-300">Remove</button>}</div>
                          <div className="grid grid-cols-2 gap-2">
                            <input value={agent.name} onChange={e => updateAgent(i, 'name', e.target.value)} placeholder="Name" className="px-2.5 py-1.5 text-xs bg-[#111113] border border-[#2a2a2d] rounded text-gray-200 placeholder:text-gray-700 focus:border-amber-500/50 focus:outline-none" />
                            <input value={agent.role} onChange={e => updateAgent(i, 'role', e.target.value)} placeholder="Role" className="px-2.5 py-1.5 text-xs bg-[#111113] border border-[#2a2a2d] rounded text-gray-200 placeholder:text-gray-700 focus:border-amber-500/50 focus:outline-none" />
                            <select value={agent.model} onChange={e => updateAgent(i, 'model', e.target.value)} className="px-2.5 py-1.5 text-xs bg-[#111113] border border-[#2a2a2d] rounded text-gray-200 focus:border-amber-500/50 focus:outline-none">{MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}</select>
                            <input value={agent.emoji} onChange={e => updateAgent(i, 'emoji', e.target.value)} placeholder="Emoji" maxLength={4} className="px-2.5 py-1.5 text-xs bg-[#111113] border border-[#2a2a2d] rounded text-gray-200 placeholder:text-gray-700 focus:border-amber-500/50 focus:outline-none" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <button onClick={handleCreateCustom} disabled={creating} className="w-full py-2.5 rounded-lg text-sm font-medium bg-amber-500 text-black hover:bg-amber-400 disabled:opacity-40 transition-colors">{creating ? 'Creating...' : 'Create Custom Squad'}</button>
                </div>
              )}
              {error && <p className="text-xs text-red-400 mt-3">{error}</p>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN PAGE — 3 tabs: Squads, Org Chart, Roster
// ═══════════════════════════════════════════════════════════════

function SquadsPageInner() {
  // Workspace data
  const [wsSquads, setWsSquads] = useState<WsSquad[]>([]);
  const [wsLoading, setWsLoading] = useState(true);
  const [selectedWsSquad, setSelectedWsSquad] = useState<WsSquad | null>(null);
  const [selectedWsAgent, setSelectedWsAgent] = useState<WsAgent | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  // Org data (for org chart + roster)
  const [orgAgents, setOrgAgents] = useState<LiveAgent[]>([]);
  const [orgSquads, setOrgSquads] = useState<OrgSquad[]>([]);
  const [orgLoading, setOrgLoading] = useState(true);
  const [selectedOrgAgent, setSelectedOrgAgent] = useState<LiveAgent | null>(null);
  const [orgPopPos, setOrgPopPos] = useState({ x: 0, y: 0 });

  const [tab, setTab] = useState<SquadsTab>('squads');

  const loadWsSquads = useCallback(() => {
    fetch('/api/squads').then(r => r.json()).then(d => { setWsSquads(d.data || []); setWsLoading(false); }).catch(() => setWsLoading(false));
  }, []);

  const loadOrgData = useCallback(async () => {
    try {
      const [orgRes, sessRes] = await Promise.all([fetch('/api/org-structure'), fetch('/api/gateway/sessions')]);
      const orgData = await orgRes.json();
      const sessData = await sessRes.json();
      const sessionMap = new Map<string, { lastActivity?: number; model?: string }>();
      if (sessData.ok && sessData.sessions) {
        const list = Array.isArray(sessData.sessions) ? sessData.sessions : sessData.sessions.sessions || [];
        for (const s of list) {
          const id = (s.agentId || s.key || s.id || '').replace(/^agent:/, '').split(':')[0];
          if (id) sessionMap.set(id, { lastActivity: s.lastActivityMs || s.lastActivity, model: s.model });
        }
      }
      if (orgData.ok && orgData.org) {
        const agents: LiveAgent[] = orgData.org.agents.map((a: OrgAgent) => {
          const session = sessionMap.get(a.id);
          return { ...a, status: getStatus(session?.lastActivity, sessData.ok), lastActivity: session?.lastActivity, liveModel: session?.model };
        });
        setOrgAgents(agents);
        setOrgSquads(orgData.org.squads);
      }
    } catch { /* ignore */ }
    setOrgLoading(false);
  }, []);

  useEffect(() => { loadWsSquads(); loadOrgData(); }, [loadWsSquads, loadOrgData]);

  const handleSelectOrg = (agent: LiveAgent, e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setOrgPopPos({ x: Math.min(rect.right + 8, window.innerWidth - 340), y: Math.min(rect.top, window.innerHeight - 400) });
    setSelectedOrgAgent(agent);
  };

  const totalWsAgents = wsSquads.reduce((n, s) => n + s.agents.length, 0);
  const activeCount = orgAgents.filter(a => a.status === 'active').length;

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] gap-3">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-gray-200">Squads</h2>
          <div className="flex gap-0.5 bg-[#111113] rounded-lg p-0.5 border border-[#1e1e21]">
            {(['squads', 'org', 'roster'] as SquadsTab[]).map(t => (
              <button key={t} onClick={() => { setTab(t); setSelectedWsSquad(null); setSelectedOrgAgent(null); }}
                className={`px-2.5 py-1 text-[11px] rounded ${tab === t ? 'bg-[#1e1e21] text-gray-100' : 'text-gray-500 hover:text-gray-300'}`}>
                {t === 'squads' ? '👥 Squads' : t === 'org' ? '🏛 Org Chart' : '📋 Roster'}
              </button>
            ))}
          </div>
          <span className="text-[10px] text-gray-600">
            {tab === 'squads' ? `${wsSquads.length} squads · ${totalWsAgents} agents` : `${orgAgents.length} agents · ${activeCount} active`}
          </span>
        </div>
        {tab === 'squads' && (
          <button onClick={() => setShowCreate(true)} className="px-4 py-1.5 text-xs font-medium bg-amber-500 text-black rounded-lg hover:bg-amber-400">+ Create Squad</button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 relative overflow-auto">

        {/* ── SQUADS TAB ── */}
        {tab === 'squads' && !selectedWsSquad && (
          <div className="max-w-5xl mx-auto">
            {wsLoading ? (
              <div className="flex items-center justify-center h-64"><div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" /></div>
            ) : wsSquads.length === 0 ? (
              <div className="text-center py-16"><p className="text-gray-500 text-sm">No squads found in workspace</p><p className="text-gray-700 text-xs mt-1">Create a squad from a template or build a custom one</p></div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {wsSquads.map(squad => <WsSquadCard key={squad.id} squad={squad} onSelect={() => setSelectedWsSquad(squad)} />)}
              </div>
            )}
          </div>
        )}

        {tab === 'squads' && selectedWsSquad && (
          <div className="max-w-6xl mx-auto">
            <div className="flex items-center gap-3 mb-5">
              <button onClick={() => setSelectedWsSquad(null)} className="text-gray-500 hover:text-gray-300 text-sm">&larr; Back</button>
              <div>
                <h1 className="text-lg font-bold text-gray-100 capitalize">{selectedWsSquad.id.replace(/-/g, ' ')} Squad</h1>
                <p className="text-xs text-gray-500">{selectedWsSquad.agents.length} agents</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {selectedWsSquad.agents.map(agent => <WsAgentCard key={agent.id} agent={agent} onClick={() => setSelectedWsAgent(agent)} />)}
            </div>
            {selectedWsAgent && <WsAgentDetail agent={selectedWsAgent} onClose={() => setSelectedWsAgent(null)} />}
          </div>
        )}

        {/* ── ORG CHART TAB ── */}
        {tab === 'org' && (
          orgLoading ? (
            <div className="flex items-center justify-center h-64"><div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" /></div>
          ) : (
            <div className="py-4 space-y-0">
              {[0, 1, 2, 3].map(tier => {
                const tierAgents = orgAgents.filter(a => a.tier === tier);
                if (tierAgents.length === 0) return null;
                return (
                  <div key={tier}>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="text-[9px] font-semibold text-gray-600 uppercase tracking-widest">Tier {tier} — {tierLabels[tier]}</div>
                      <div className="text-[8px] text-gray-700">{tierDescriptions[tier]}</div>
                      <div className="flex-1 h-px bg-[#1e1e21]" />
                      <span className="text-[9px] text-gray-700">{tierAgents.length}</span>
                    </div>
                    <div className="flex justify-center gap-3 flex-wrap mb-2">
                      {tierAgents.map(a => <OrgCard key={a.id} agent={a} onSelect={handleSelectOrg} isSelected={selectedOrgAgent?.id === a.id} />)}
                    </div>
                    {tier < 3 && orgAgents.some(a => a.tier === tier + 1) && (
                      <div className="flex justify-center py-1">
                        <div className="flex flex-col items-center">
                          <div className="w-px h-3 bg-[#2a2a2d]" />
                          <div className="w-3 h-3 rounded-full border border-[#2a2a2d] bg-[#111113] flex items-center justify-center"><div className="w-1 h-1 rounded-full bg-[#2a2a2d]" /></div>
                          <div className="w-px h-3 bg-[#2a2a2d]" />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )
        )}

        {/* ── ROSTER TAB ── */}
        {tab === 'roster' && (
          orgLoading ? (
            <div className="flex items-center justify-center h-64"><div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" /></div>
          ) : (
            <RosterTab agents={orgAgents} squads={orgSquads} onCreated={loadOrgData} onSelect={handleSelectOrg} />
          )
        )}

        {/* Floating Agent Detail popover (for Org + Roster tabs) */}
        {selectedOrgAgent && (tab === 'org' || tab === 'roster') && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setSelectedOrgAgent(null)} />
            <div className="fixed z-50 w-80 max-h-[70vh] overflow-y-auto shadow-2xl shadow-black/50" style={{ top: orgPopPos.y, left: orgPopPos.x }}>
              <OrgAgentDetail agent={selectedOrgAgent} allAgents={orgAgents} squads={orgSquads} onClose={() => setSelectedOrgAgent(null)} onRefresh={loadOrgData} />
            </div>
          </>
        )}
      </div>

      {showCreate && <CreateSquadModal onClose={() => setShowCreate(false)} onCreated={() => { loadWsSquads(); loadOrgData(); }} />}
    </div>
  );
}

export default dynamic(() => Promise.resolve(SquadsPageInner), { ssr: false });
