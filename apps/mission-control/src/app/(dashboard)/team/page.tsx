'use client';

import { useState, useEffect, useCallback } from 'react';

interface OrgAgent {
  id: string;
  name: string;
  emoji: string;
  role: string;
  model: string;
  tier: number;
  squad: string | null;
  reportsTo: string;
  manages: string[];
  skills: string[];
}

interface OrgSquad {
  id: string;
  name: string;
  chief: string;
  domain: string;
  members: string[];
}

interface Agent extends OrgAgent {
  status: 'active' | 'idle' | 'offline';
  lastActivity?: number;
  liveModel?: string;
}

const modelColors: Record<string, string> = {
  'claude-opus-4-5': 'bg-red-500/20 text-red-400 border-red-500/50',
  'claude-opus-4-6': 'bg-red-500/20 text-red-400 border-red-500/50',
  'claude-sonnet-4-6': 'bg-amber-500/20 text-amber-400 border-amber-500/50',
  'claude-sonnet-4-5': 'bg-blue-500/20 text-blue-400 border-blue-500/50',
  'claude-haiku-4-5': 'bg-green-500/20 text-green-400 border-green-500/50',
};

const squadBorderColors: Record<string, string> = {
  dev_squad: 'border-l-blue-500',
  blockchain_squad: 'border-l-purple-500',
  clop_cabinet: 'border-l-green-500',
  product_squad: 'border-l-amber-500',
};

const squadCardColors: Record<string, string> = {
  dev_squad: 'blue',
  blockchain_squad: 'purple',
  clop_cabinet: 'green',
  product_squad: 'amber',
};

const statusColors = {
  active: { bg: 'bg-green-500/10', text: 'text-green-500', dot: 'bg-green-500' },
  idle: { bg: 'bg-amber-500/10', text: 'text-amber-500', dot: 'bg-amber-500' },
  offline: { bg: 'bg-gray-500/10', text: 'text-gray-500', dot: 'bg-gray-500' },
};

function getStatus(lastActivity: number | undefined, gatewayConnected: boolean): 'active' | 'idle' | 'offline' {
  if (!gatewayConnected) return 'offline';
  if (!lastActivity) return 'idle';
  const diff = Date.now() - lastActivity;
  if (diff < 2 * 60 * 1000) return 'active';
  if (diff < 30 * 60 * 1000) return 'idle';
  return 'idle';
}

function timeAgo(ms?: number): string {
  if (!ms) return '';
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const tierLabels = ['PLATFORM', 'EXECUTIVE', 'MANAGEMENT', 'EXECUTION'];

function AgentCard({ agent }: { agent: Agent }) {
  const displayModel = agent.liveModel || agent.model;
  const modelColor = modelColors[displayModel] || 'bg-gray-500/20 text-gray-400';
  const squadBorder = agent.squad ? squadBorderColors[agent.squad] : 'border-l-gray-500';
  const statusStyle = statusColors[agent.status];

  return (
    <div className={`bg-gray-800 rounded-lg p-4 border border-gray-700 border-l-4 ${squadBorder} hover:border-gray-600 transition-colors`}>
      <div className="text-3xl mb-2">{agent.emoji}</div>
      <div className="font-semibold text-gray-100">{agent.name}</div>
      <div className="text-sm text-gray-400 mt-1">{agent.role}</div>
      <div className={`inline-block px-2 py-0.5 text-xs rounded border mt-2 ${modelColor}`}>
        {displayModel.replace('claude-', '')}
      </div>
      <div className="flex items-center gap-2 mt-3">
        <span className={`w-2 h-2 rounded-full ${statusStyle.dot}`}></span>
        <span className={`text-xs ${statusStyle.text}`}>{agent.status}</span>
        {agent.lastActivity && (
          <span className="text-xs text-gray-600">{timeAgo(agent.lastActivity)}</span>
        )}
      </div>
      <div className="text-xs text-gray-500 mt-2">reports to: {agent.reportsTo}</div>
      {agent.manages.length > 0 && (
        <div className="text-xs text-gray-600 mt-1">
          manages: {agent.manages.join(', ')}
        </div>
      )}
      {agent.skills.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {agent.skills.slice(0, 4).map(skill => (
            <span key={skill} className="text-[9px] px-1.5 py-0.5 bg-[#1a1a1d] text-gray-500 rounded">
              {skill}
            </span>
          ))}
          {agent.skills.length > 4 && (
            <span className="text-[9px] text-gray-600">+{agent.skills.length - 4}</span>
          )}
        </div>
      )}
    </div>
  );
}

const modelOptions = [
  { value: 'claude-sonnet-4-5', label: 'Sonnet 4.5 (balanced)' },
  { value: 'claude-sonnet-4-6', label: 'Sonnet 4.6 (strategic)' },
  { value: 'claude-haiku-4-5', label: 'Haiku 4.5 (fast/cheap)' },
  { value: 'claude-opus-4-6', label: 'Opus 4.6 (max reasoning)' },
];

const squadOptions = [
  { value: '', label: 'None' },
  { value: 'dev_squad', label: 'Dev Squad' },
  { value: 'blockchain_squad', label: 'Blockchain Squad' },
  { value: 'clop_cabinet', label: 'Clop Cabinet' },
  { value: 'product_squad', label: 'Product Squad' },
];

function CreateAgentForm({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState({
    id: '', name: '', role: '', model: 'claude-sonnet-4-5',
    tier: 3, squad: '', reportsTo: '', emoji: '🤖',
    skills: 'clawban', description: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async () => {
    if (!form.id || !form.name || !form.role) {
      setError('ID, name, and role are required');
      return;
    }
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/agents/factory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          squad: form.squad || null,
          skills: form.skills.split(',').map(s => s.trim()).filter(Boolean),
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setSuccess(`Agent "${data.agent.name}" created successfully`);
        setForm({ id: '', name: '', role: '', model: 'claude-sonnet-4-5', tier: 3, squad: '', reportsTo: '', emoji: '🤖', skills: 'clawban', description: '' });
        onCreated();
      } else {
        setError(data.error || 'Failed to create agent');
      }
    } catch {
      setError('Failed to create agent');
    }
    setSaving(false);
  };

  return (
    <div className="bg-[#111113] rounded-lg border border-[#1e1e21] p-5 space-y-4">
      <h3 className="text-sm font-semibold text-gray-200">New Agent</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label className="block text-[11px] text-gray-500 mb-1">ID</label>
          <input
            type="text" placeholder="agent_id"
            value={form.id}
            onChange={e => setForm({ ...form, id: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') })}
            className="w-full px-2.5 py-1.5 bg-[#0a0a0b] border border-[#1e1e21] rounded text-xs text-gray-200 font-mono focus:outline-none focus:border-amber-500"
          />
        </div>
        <div>
          <label className="block text-[11px] text-gray-500 mb-1">Name</label>
          <input
            type="text" placeholder="Agent Name"
            value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
            className="w-full px-2.5 py-1.5 bg-[#0a0a0b] border border-[#1e1e21] rounded text-xs text-gray-200 focus:outline-none focus:border-amber-500"
          />
        </div>
        <div>
          <label className="block text-[11px] text-gray-500 mb-1">Role</label>
          <input
            type="text" placeholder="Senior Developer"
            value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}
            className="w-full px-2.5 py-1.5 bg-[#0a0a0b] border border-[#1e1e21] rounded text-xs text-gray-200 focus:outline-none focus:border-amber-500"
          />
        </div>
        <div>
          <label className="block text-[11px] text-gray-500 mb-1">Emoji</label>
          <input
            type="text" placeholder="🤖"
            value={form.emoji} onChange={e => setForm({ ...form, emoji: e.target.value })}
            className="w-full px-2.5 py-1.5 bg-[#0a0a0b] border border-[#1e1e21] rounded text-xs text-gray-200 focus:outline-none focus:border-amber-500"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label className="block text-[11px] text-gray-500 mb-1">Model</label>
          <select value={form.model} onChange={e => setForm({ ...form, model: e.target.value })}
            className="w-full px-2.5 py-1.5 bg-[#0a0a0b] border border-[#1e1e21] rounded text-xs text-gray-200 focus:outline-none focus:border-amber-500">
            {modelOptions.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[11px] text-gray-500 mb-1">Tier</label>
          <select value={form.tier} onChange={e => setForm({ ...form, tier: parseInt(e.target.value) })}
            className="w-full px-2.5 py-1.5 bg-[#0a0a0b] border border-[#1e1e21] rounded text-xs text-gray-200 focus:outline-none focus:border-amber-500">
            <option value={1}>1 — Executive</option>
            <option value={2}>2 — Management</option>
            <option value={3}>3 — Execution</option>
          </select>
        </div>
        <div>
          <label className="block text-[11px] text-gray-500 mb-1">Squad</label>
          <select value={form.squad} onChange={e => setForm({ ...form, squad: e.target.value })}
            className="w-full px-2.5 py-1.5 bg-[#0a0a0b] border border-[#1e1e21] rounded text-xs text-gray-200 focus:outline-none focus:border-amber-500">
            {squadOptions.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[11px] text-gray-500 mb-1">Reports to</label>
          <input
            type="text" placeholder="Manager agent id"
            value={form.reportsTo} onChange={e => setForm({ ...form, reportsTo: e.target.value })}
            className="w-full px-2.5 py-1.5 bg-[#0a0a0b] border border-[#1e1e21] rounded text-xs text-gray-200 focus:outline-none focus:border-amber-500"
          />
        </div>
      </div>
      <div>
        <label className="block text-[11px] text-gray-500 mb-1">Skills (comma-separated)</label>
        <input
          type="text" placeholder="clawban, coding-agent, github"
          value={form.skills} onChange={e => setForm({ ...form, skills: e.target.value })}
          className="w-full px-2.5 py-1.5 bg-[#0a0a0b] border border-[#1e1e21] rounded text-xs text-gray-200 focus:outline-none focus:border-amber-500"
        />
      </div>
      <div>
        <label className="block text-[11px] text-gray-500 mb-1">Description (optional)</label>
        <textarea
          placeholder="Brief description of what this agent does..."
          value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
          rows={2}
          className="w-full px-2.5 py-1.5 bg-[#0a0a0b] border border-[#1e1e21] rounded text-xs text-gray-200 focus:outline-none focus:border-amber-500 resize-none"
        />
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      {success && <p className="text-xs text-green-400">{success}</p>}
      <button
        onClick={handleSubmit} disabled={saving}
        className="px-4 py-1.5 text-xs font-medium bg-amber-500 text-gray-900 rounded hover:bg-amber-400 disabled:opacity-50"
      >
        {saving ? 'Creating...' : 'Create Agent'}
      </button>
    </div>
  );
}

export default function TeamPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [squads, setSquads] = useState<OrgSquad[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const fetchData = useCallback(async () => {
      try {
        // Fetch org structure and gateway sessions in parallel
        const [orgRes, sessRes] = await Promise.all([
          fetch('/api/org-structure'),
          fetch('/api/gateway/sessions'),
        ]);

        const orgData = await orgRes.json();
        const sessData = await sessRes.json();

        // Build session map from gateway
        const sessionMap = new Map<string, { lastActivity?: number; model?: string }>();
        if (sessData.ok && sessData.sessions) {
          const sessionList = Array.isArray(sessData.sessions)
            ? sessData.sessions
            : sessData.sessions.sessions || [];
          for (const s of sessionList) {
            const rawId = s.agentId || s.key || s.id || '';
            const id = rawId.replace(/^agent:/, '').split(':')[0];
            if (id) {
              sessionMap.set(id, {
                lastActivity: s.lastActivityMs || s.lastActivity,
                model: s.model,
              });
            }
          }
        }

        if (orgData.ok && orgData.org) {
          // Build agents from org_structure.yaml + live session data
          const agentList: Agent[] = orgData.org.agents.map((a: OrgAgent) => {
            const session = sessionMap.get(a.id);
            return {
              ...a,
              status: getStatus(session?.lastActivity, sessData.ok),
              lastActivity: session?.lastActivity,
              liveModel: session?.model,
            };
          });

          setAgents(agentList);
          setSquads(orgData.org.squads);
        }
      } catch {
        // Silent fallback — show empty state
      }
      setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const tier0 = agents.filter(a => a.tier === 0);
  const tier1 = agents.filter(a => a.tier === 1);
  const tier2 = agents.filter(a => a.tier === 2);
  const tier3 = agents.filter(a => a.tier === 3);

  const activeCount = agents.filter(a => a.status === 'active').length;
  const idleCount = agents.filter(a => a.status === 'idle').length;

  if (loading) {
    return <div className="text-center py-8 text-gray-500">Loading team...</div>;
  }

  return (
    <div className="space-y-8">
      {/* Mission Statement */}
      <div className="bg-amber-900/20 border border-amber-700 rounded-lg p-6 text-center">
        <p className="text-lg italic text-amber-200">
          &quot;Enterprise Autonomous AI Operating System — Monte seu time de desenvolvimento AI&quot;
        </p>
      </div>

      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-100">Meet the Team</h2>
          <p className="text-gray-400 mt-1">{agents.length} AI agents across {squads.length} squads</p>
        </div>
        <div className="flex gap-4 text-sm items-center">
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="px-3 py-1.5 text-xs font-medium bg-amber-500 text-gray-900 rounded hover:bg-amber-400"
          >
            {showCreate ? 'Cancel' : '+ Create Agent'}
          </button>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500"></span>
            <span className="text-gray-400">{activeCount} active</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
            <span className="text-gray-400">{idleCount} idle</span>
          </div>
        </div>
      </div>

      {/* Create Agent Form */}
      {showCreate && <CreateAgentForm onCreated={fetchData} />}

      {/* Tier 0 - Platform */}
      {tier0.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">
            Tier 0 — {tierLabels[0]}
          </div>
          <div className="flex justify-center">
            <div className="w-80">
              {tier0[0] && <AgentCard agent={tier0[0]} />}
            </div>
          </div>
          <div className="flex justify-center my-4">
            <div className="w-px h-8 bg-gray-700"></div>
          </div>
        </div>
      )}

      {/* Tier 1 - Executive */}
      {tier1.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">
            Tier 1 — {tierLabels[1]}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto">
            {tier1.map(agent => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
          </div>
          <div className="flex justify-center my-4">
            <div className="w-px h-8 bg-gray-700"></div>
          </div>
        </div>
      )}

      {/* Tier 2 - Management */}
      {tier2.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">
            Tier 2 — {tierLabels[2]}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto">
            {tier2.map(agent => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
          </div>
          <div className="flex justify-center my-4">
            <div className="w-px h-8 bg-gray-700"></div>
          </div>
        </div>
      )}

      {/* Tier 3 - Execution */}
      {tier3.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">
            Tier 3 — {tierLabels[3]}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {tier3.map(agent => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
          </div>
        </div>
      )}

      {/* Squad Summary */}
      <div className="mt-12">
        <h3 className="text-xl font-semibold text-gray-100 mb-4">Squads</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {squads.map(squad => {
            const members = agents.filter(a => a.squad === squad.id);
            const activeMembers = members.filter(m => m.status === 'active').length;
            const borderColor = {
              blue: 'border-l-blue-500',
              purple: 'border-l-purple-500',
              green: 'border-l-green-500',
              amber: 'border-l-amber-500',
            }[squadCardColors[squad.id] || 'blue'];

            return (
              <div key={squad.id} className={`bg-gray-900 rounded-lg p-4 border border-gray-800 border-l-4 ${borderColor}`}>
                <div className="flex justify-between items-start">
                  <h4 className="font-semibold text-gray-100">{squad.name}</h4>
                  {activeMembers > 0 && (
                    <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded">
                      {activeMembers} active
                    </span>
                  )}
                </div>
                <div className="text-sm text-gray-400 mt-1">Chief: {squad.chief}</div>
                <p className="text-xs text-gray-500 mt-2">{squad.domain}</p>
                <div className="mt-3 flex flex-wrap gap-1">
                  {members.map(m => (
                    <span
                      key={m.id}
                      className={`text-xs px-2 py-0.5 rounded ${
                        m.status === 'active' ? 'bg-green-500/10 text-green-400' :
                        m.status === 'idle' ? 'bg-amber-500/10 text-amber-400' :
                        'bg-gray-800 text-gray-400'
                      }`}
                    >
                      {m.emoji} {m.name}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
