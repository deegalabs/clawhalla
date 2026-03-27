'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';

interface OrgAgent {
  id: string; name: string; emoji: string; role: string; model: string;
  tier: number; squad: string | null; reportsTo: string; manages: string[]; skills: string[];
}
interface OrgSquad { id: string; name: string; chief: string; domain: string; members: string[]; }
interface Agent extends OrgAgent {
  status: 'active' | 'idle' | 'offline'; lastActivity?: number; liveModel?: string;
}

type TeamTab = 'org' | 'squads' | 'factory';

const modelColors: Record<string, string> = {
  'claude-opus-4-6': 'text-red-400',
  'claude-sonnet-4-6': 'text-amber-400',
  'claude-sonnet-4-5': 'text-blue-400',
  'claude-haiku-4-5': 'text-green-400',
};

const statusDot: Record<string, string> = {
  active: 'bg-green-500', idle: 'bg-amber-500', offline: 'bg-gray-600',
};

const squadColors: Record<string, { border: string; bg: string; text: string }> = {
  dev_squad: { border: 'border-blue-500/40', bg: 'bg-blue-500/10', text: 'text-blue-400' },
  blockchain_squad: { border: 'border-purple-500/40', bg: 'bg-purple-500/10', text: 'text-purple-400' },
  clop_cabinet: { border: 'border-green-500/40', bg: 'bg-green-500/10', text: 'text-green-400' },
  product_squad: { border: 'border-amber-500/40', bg: 'bg-amber-500/10', text: 'text-amber-400' },
};

function getStatus(lastActivity: number | undefined, ok: boolean): 'active' | 'idle' | 'offline' {
  if (!ok) return 'offline';
  if (!lastActivity) return 'idle';
  const diff = Date.now() - lastActivity;
  if (diff < 2 * 60 * 1000) return 'active';
  return 'idle';
}

const modelOptions = [
  { value: 'claude-sonnet-4-5', label: 'Sonnet 4.5' },
  { value: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
  { value: 'claude-haiku-4-5', label: 'Haiku 4.5' },
  { value: 'claude-opus-4-6', label: 'Opus 4.6' },
];
const squadOptions = [
  { value: '', label: 'None' },
  { value: 'dev_squad', label: 'Dev Squad' },
  { value: 'blockchain_squad', label: 'Blockchain Squad' },
  { value: 'clop_cabinet', label: 'Clop Cabinet' },
  { value: 'product_squad', label: 'Product Squad' },
];

// ---- Org Card (compact, used in tier rows) ----
function OrgCard({ agent, onSelect, isSelected }: { agent: Agent; onSelect: (a: Agent, e: React.MouseEvent) => void; isSelected: boolean }) {
  const sqColor = agent.squad ? squadColors[agent.squad] : null;
  return (
    <button onClick={(e) => onSelect(agent, e)}
      className={`relative rounded-xl border p-3 w-36 text-center transition-all hover:scale-[1.03] shrink-0 ${
        isSelected ? 'border-amber-500/60 bg-amber-500/5 shadow-lg shadow-amber-500/10' :
        'border-[#1e1e21] bg-[#111113] hover:border-[#333]'
      }`}>
      <div className={`absolute top-2 right-2 w-2 h-2 rounded-full ${statusDot[agent.status]}`} />
      <div className={`w-11 h-11 mx-auto rounded-full flex items-center justify-center text-xl mb-1.5 ${sqColor?.bg || 'bg-[#1a1a1d]'}`}>
        {agent.emoji}
      </div>
      <div className="text-[11px] font-semibold text-gray-100 truncate">{agent.name}</div>
      <div className="text-[9px] text-gray-500 truncate">{agent.role}</div>
      <div className={`text-[8px] mt-1 ${modelColors[agent.liveModel || agent.model] || 'text-gray-600'}`}>
        {(agent.liveModel || agent.model).replace('claude-', '')}
      </div>
      {agent.manages.length > 0 && (
        <div className="text-[8px] text-gray-600 mt-0.5">👥 {agent.manages.length}</div>
      )}
    </button>
  );
}

const tierLabels = ['PLATFORM', 'EXECUTIVE', 'MANAGEMENT', 'EXECUTION'];
const tierDescriptions = ['System Controller', 'Strategic Decision Makers', 'Squad Chiefs & Coordinators', 'Specialized Agents'];

// ---- Agent Detail Panel ----
function AgentDetail({ agent, allAgents, onClose }: { agent: Agent; allAgents: Agent[]; onClose: () => void }) {
  const manager = allAgents.find(a => a.id === agent.reportsTo);
  const directReports = allAgents.filter(a => a.reportsTo === agent.id);
  const peers = manager ? allAgents.filter(a => a.reportsTo === manager.id && a.id !== agent.id) : [];
  const sqColor = agent.squad ? squadColors[agent.squad] : null;

  return (
    <div className="bg-[#111113] rounded-xl border border-[#1e1e21] overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-[#1e1e21] flex items-start gap-3">
        <div className={`w-14 h-14 rounded-xl flex items-center justify-center text-3xl shrink-0 ${sqColor?.bg || 'bg-[#1a1a1d]'}`}>
          {agent.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-100">{agent.name}</span>
            <span className={`w-2 h-2 rounded-full ${statusDot[agent.status]}`} />
            <span className="text-[9px] text-gray-500 capitalize">{agent.status}</span>
          </div>
          <div className="text-[11px] text-gray-400">{agent.role}</div>
          <div className={`text-[10px] mt-0.5 ${modelColors[agent.liveModel || agent.model] || 'text-gray-600'}`}>
            {(agent.liveModel || agent.model).replace('claude-', '')}
          </div>
        </div>
        <button onClick={onClose} className="text-gray-600 hover:text-gray-300 text-sm">✕</button>
      </div>

      {/* Info grid */}
      <div className="p-4 space-y-3">
        {/* Organization */}
        <div>
          <div className="text-[9px] text-gray-600 uppercase tracking-wider mb-1.5">Organization</div>
          <div className="grid grid-cols-2 gap-2 text-[10px]">
            <div>
              <span className="text-gray-600">Tier:</span>
              <span className="text-gray-300 ml-1">{agent.tier} — {['Platform', 'Executive', 'Management', 'Execution'][agent.tier]}</span>
            </div>
            {agent.squad && (
              <div>
                <span className="text-gray-600">Squad:</span>
                <span className={`ml-1 ${sqColor?.text || 'text-gray-300'}`}>{agent.squad.replace('_', ' ')}</span>
              </div>
            )}
          </div>
        </div>

        {/* Reports to */}
        {manager && (
          <div>
            <div className="text-[9px] text-gray-600 uppercase tracking-wider mb-1.5">Reports to</div>
            <div className="flex items-center gap-2 p-2 bg-[#0a0a0b] rounded-lg border border-[#1e1e21]">
              <span className="text-lg">{manager.emoji}</span>
              <div>
                <div className="text-[10px] font-medium text-gray-200">{manager.name}</div>
                <div className="text-[9px] text-gray-500">{manager.role}</div>
              </div>
            </div>
          </div>
        )}

        {/* Direct reports */}
        {directReports.length > 0 && (
          <div>
            <div className="text-[9px] text-gray-600 uppercase tracking-wider mb-1.5">
              Direct Reports ({directReports.length})
            </div>
            <div className="space-y-1">
              {directReports.map(r => (
                <div key={r.id} className="flex items-center gap-2 p-1.5 bg-[#0a0a0b] rounded border border-[#1e1e21]">
                  <span className={`w-1.5 h-1.5 rounded-full ${statusDot[r.status]}`} />
                  <span className="text-sm">{r.emoji}</span>
                  <span className="text-[10px] text-gray-300">{r.name}</span>
                  <span className="text-[9px] text-gray-600 ml-auto">{r.role}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Works with (peers) */}
        {peers.length > 0 && (
          <div>
            <div className="text-[9px] text-gray-600 uppercase tracking-wider mb-1.5">
              Works with ({peers.length})
            </div>
            <div className="flex flex-wrap gap-1.5">
              {peers.map(p => (
                <div key={p.id} className="flex items-center gap-1.5 px-2 py-1 bg-[#0a0a0b] rounded-lg border border-[#1e1e21]">
                  <span className="text-sm">{p.emoji}</span>
                  <div>
                    <div className="text-[9px] font-medium text-gray-300">{p.name}</div>
                    <div className="text-[8px] text-gray-600">{p.role}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Skills */}
        {agent.skills.length > 0 && (
          <div>
            <div className="text-[9px] text-gray-600 uppercase tracking-wider mb-1.5">Skills</div>
            <div className="flex flex-wrap gap-1">
              {agent.skills.map(s => (
                <span key={s} className="text-[9px] px-1.5 py-0.5 bg-amber-500/10 text-amber-400/80 rounded">{s}</span>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <a href={`/chat`} className="px-3 py-1.5 text-[10px] font-medium bg-amber-500/20 text-amber-400 rounded hover:bg-amber-500/30 border border-amber-500/20">
            💬 Chat
          </a>
          <button className="px-3 py-1.5 text-[10px] font-medium bg-[#1a1a1d] text-gray-400 rounded hover:text-gray-200 border border-[#1e1e21]">
            📋 View Tasks
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Create Agent Form ----
function CreateAgentForm({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState({ id: '', name: '', role: '', model: 'claude-sonnet-4-5', tier: 3, squad: '', reportsTo: '', emoji: '🤖', skills: 'clawban', description: '' });
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const handleSubmit = async () => {
    if (!form.id || !form.name || !form.role) { setResult({ ok: false, msg: 'ID, name, and role required' }); return; }
    setSaving(true); setResult(null);
    try {
      const res = await fetch('/api/agents/factory', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, squad: form.squad || null, skills: form.skills.split(',').map(s => s.trim()).filter(Boolean) }),
      });
      const data = await res.json();
      if (data.ok) {
        setResult({ ok: true, msg: `Agent "${data.agent.name}" created` });
        // Create task for agent creation
        fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: `Created agent: ${form.name} (${form.role})`, status: 'done', priority: 'medium', assignedTo: 'main' }),
        }).catch(() => {});
        setForm({ id: '', name: '', role: '', model: 'claude-sonnet-4-5', tier: 3, squad: '', reportsTo: '', emoji: '🤖', skills: 'clawban', description: '' });
        onCreated();
      } else { setResult({ ok: false, msg: data.error || 'Failed' }); }
    } catch { setResult({ ok: false, msg: 'Failed' }); }
    setSaving(false);
  };

  return (
    <div className="bg-[#111113] rounded-lg border border-[#1e1e21] p-4 space-y-3">
      <div className="text-xs font-semibold text-gray-200">Agent Factory</div>
      <div className="grid grid-cols-4 gap-2">
        {[
          { key: 'id', label: 'ID', placeholder: 'agent_id', mono: true },
          { key: 'name', label: 'Name', placeholder: 'Agent Name' },
          { key: 'role', label: 'Role', placeholder: 'Senior Developer' },
          { key: 'emoji', label: 'Emoji', placeholder: '🤖' },
        ].map(f => (
          <div key={f.key}>
            <label className="block text-[9px] text-gray-500 mb-0.5">{f.label}</label>
            <input type="text" placeholder={f.placeholder}
              value={form[f.key as keyof typeof form] as string}
              onChange={e => setForm({ ...form, [f.key]: f.key === 'id' ? e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') : e.target.value })}
              className={`w-full px-2 py-1.5 bg-[#0a0a0b] border border-[#1e1e21] rounded text-[10px] text-gray-200 focus:outline-none focus:border-amber-500 ${f.mono ? 'font-mono' : ''}`} />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-4 gap-2">
        <div>
          <label className="block text-[9px] text-gray-500 mb-0.5">Model</label>
          <select value={form.model} onChange={e => setForm({ ...form, model: e.target.value })}
            className="w-full px-2 py-1.5 bg-[#0a0a0b] border border-[#1e1e21] rounded text-[10px] text-gray-200 focus:outline-none">
            {modelOptions.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[9px] text-gray-500 mb-0.5">Tier</label>
          <select value={form.tier} onChange={e => setForm({ ...form, tier: parseInt(e.target.value) })}
            className="w-full px-2 py-1.5 bg-[#0a0a0b] border border-[#1e1e21] rounded text-[10px] text-gray-200 focus:outline-none">
            <option value={1}>1 — Executive</option>
            <option value={2}>2 — Management</option>
            <option value={3}>3 — Execution</option>
          </select>
        </div>
        <div>
          <label className="block text-[9px] text-gray-500 mb-0.5">Squad</label>
          <select value={form.squad} onChange={e => setForm({ ...form, squad: e.target.value })}
            className="w-full px-2 py-1.5 bg-[#0a0a0b] border border-[#1e1e21] rounded text-[10px] text-gray-200 focus:outline-none">
            {squadOptions.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[9px] text-gray-500 mb-0.5">Reports to</label>
          <input type="text" placeholder="Manager ID" value={form.reportsTo}
            onChange={e => setForm({ ...form, reportsTo: e.target.value })}
            className="w-full px-2 py-1.5 bg-[#0a0a0b] border border-[#1e1e21] rounded text-[10px] text-gray-200 focus:outline-none focus:border-amber-500" />
        </div>
      </div>
      <div>
        <label className="block text-[9px] text-gray-500 mb-0.5">Skills (comma-separated)</label>
        <input type="text" placeholder="clawban, coding-agent" value={form.skills}
          onChange={e => setForm({ ...form, skills: e.target.value })}
          className="w-full px-2 py-1.5 bg-[#0a0a0b] border border-[#1e1e21] rounded text-[10px] text-gray-200 focus:outline-none focus:border-amber-500" />
      </div>
      {result && <div className={`text-[10px] ${result.ok ? 'text-green-400' : 'text-red-400'}`}>{result.msg}</div>}
      <button onClick={handleSubmit} disabled={saving}
        className="px-3 py-1.5 text-[10px] font-medium bg-amber-500 text-gray-900 rounded hover:bg-amber-400 disabled:opacity-40">
        {saving ? 'Creating...' : 'Create Agent'}
      </button>
    </div>
  );
}

// ---- Main Page ----
function TeamPageInner() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [squads, setSquads] = useState<OrgSquad[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TeamTab>('org');
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const handleSelectAgent = (agent: Agent, e?: React.MouseEvent) => {
    if (e) {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setPopoverPos({ x: rect.right + 8, y: rect.top });
    }
    setSelectedAgent(agent);
  };

  const fetchData = useCallback(async () => {
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
        const agentList: Agent[] = orgData.org.agents.map((a: OrgAgent) => {
          const session = sessionMap.get(a.id);
          return { ...a, status: getStatus(session?.lastActivity, sessData.ok), lastActivity: session?.lastActivity, liveModel: session?.model };
        });
        setAgents(agentList);
        setSquads(orgData.org.squads);
      }
    } catch (err) { console.error('[team] fetch error:', err); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); const i = setInterval(fetchData, 30000); return () => clearInterval(i); }, [fetchData]);

  const activeCount = agents.filter(a => a.status === 'active').length;

  if (loading) return <div className="text-center py-8 text-gray-500 text-sm">Loading team...</div>;

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] gap-3">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-gray-200">Team</h2>
          <span className="text-[10px] text-gray-600">{agents.length} agents • {squads.length} squads • {activeCount} active</span>
          <div className="flex gap-0.5 bg-[#111113] rounded-lg p-0.5 border border-[#1e1e21]">
            {(['org', 'squads', 'factory'] as TeamTab[]).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-2.5 py-1 text-[11px] rounded capitalize ${tab === t ? 'bg-[#1e1e21] text-gray-100' : 'text-gray-500 hover:text-gray-300'}`}>
                {t === 'org' ? '🏛 Org Chart' : t === 'squads' ? '👥 Squads' : '🏭 Factory'}
              </button>
            ))}
          </div>
        </div>
        <div />
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 relative">
        <div className="h-full overflow-auto">
          {/* ORG CHART TAB — Tier-based layout */}
          {tab === 'org' && (
            <div className="py-4 space-y-0">
              {[0, 1, 2, 3].map(tier => {
                const tierAgents = agents.filter(a => a.tier === tier);
                if (tierAgents.length === 0) return null;
                return (
                  <div key={tier}>
                    {/* Tier label */}
                    <div className="flex items-center gap-2 mb-3">
                      <div className="text-[9px] font-semibold text-gray-600 uppercase tracking-widest">
                        Tier {tier} — {tierLabels[tier]}
                      </div>
                      <div className="text-[8px] text-gray-700">{tierDescriptions[tier]}</div>
                      <div className="flex-1 h-px bg-[#1e1e21]" />
                      <span className="text-[9px] text-gray-700">{tierAgents.length}</span>
                    </div>
                    {/* Agent cards row */}
                    <div className={`flex ${tier === 0 ? 'justify-center' : 'justify-center'} gap-3 flex-wrap mb-2`}>
                      {tierAgents.map(a => (
                        <OrgCard key={a.id} agent={a} onSelect={handleSelectAgent}
                          isSelected={selectedAgent?.id === a.id} />
                      ))}
                    </div>
                    {/* Connector line to next tier */}
                    {tier < 3 && agents.some(a => a.tier === tier + 1) && (
                      <div className="flex justify-center py-1">
                        <div className="flex flex-col items-center">
                          <div className="w-px h-3 bg-[#2a2a2d]" />
                          <div className="w-3 h-3 rounded-full border border-[#2a2a2d] bg-[#111113] flex items-center justify-center">
                            <div className="w-1 h-1 rounded-full bg-[#2a2a2d]" />
                          </div>
                          <div className="w-px h-3 bg-[#2a2a2d]" />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* SQUADS TAB */}
          {tab === 'squads' && (
            <div className="grid grid-cols-2 gap-3 p-1">
              {squads.map(squad => {
                const members = agents.filter(a => a.squad === squad.id);
                const sc = squadColors[squad.id] || { border: 'border-gray-500/30', bg: 'bg-gray-500/10', text: 'text-gray-400' };
                return (
                  <div key={squad.id} className={`bg-[#111113] rounded-lg border ${sc.border} p-4`}>
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <div className={`text-xs font-semibold ${sc.text}`}>{squad.name}</div>
                        <div className="text-[9px] text-gray-600">{squad.domain}</div>
                      </div>
                      <span className="text-[9px] text-gray-500">{members.length} members</span>
                    </div>
                    {/* Chief */}
                    {(() => {
                      const chief = members.find(m => m.id === squad.chief);
                      if (!chief) return null;
                      return (
                        <div className="flex items-center gap-2 p-2 bg-[#0a0a0b] rounded-lg border border-[#1e1e21] mb-2">
                          <span className="text-lg">{chief.emoji}</span>
                          <div className="flex-1">
                            <div className="text-[10px] font-medium text-gray-200">{chief.name}</div>
                            <div className="text-[8px] text-gray-500">{chief.role} • Chief</div>
                          </div>
                          <span className={`w-2 h-2 rounded-full ${statusDot[chief.status]}`} />
                        </div>
                      );
                    })()}
                    {/* Members */}
                    <div className="space-y-1">
                      {members.filter(m => m.id !== squad.chief).map(m => (
                        <button key={m.id} onClick={(e) => handleSelectAgent(m, e)}
                          className="w-full flex items-center gap-2 p-1.5 rounded hover:bg-[#1a1a1d] transition-colors text-left">
                          <span className="text-sm">{m.emoji}</span>
                          <div className="flex-1 min-w-0">
                            <div className="text-[10px] text-gray-300 truncate">{m.name}</div>
                            <div className="text-[8px] text-gray-600 truncate">{m.role}</div>
                          </div>
                          <span className={`w-1.5 h-1.5 rounded-full ${statusDot[m.status]}`} />
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* FACTORY TAB */}
          {tab === 'factory' && (
            <div className="max-w-2xl mx-auto py-2">
              <CreateAgentForm onCreated={fetchData} />
            </div>
          )}
        </div>

        {/* Floating popover: Agent detail */}
        {selectedAgent && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setSelectedAgent(null)} />
            <div className="fixed z-50 w-80 max-h-[70vh] overflow-y-auto shadow-2xl shadow-black/50"
              style={{
                top: Math.min(popoverPos.y, window.innerHeight - 400),
                left: Math.min(popoverPos.x, window.innerWidth - 340),
              }}>
              <AgentDetail agent={selectedAgent} allAgents={agents} onClose={() => setSelectedAgent(null)} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default dynamic(() => Promise.resolve(TeamPageInner), { ssr: false });
