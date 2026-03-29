'use client';

import { useState, useEffect, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AgentManifest {
  name: string;
  displayName: string;
  title: string;
  squad: string;
  model: string;
  emoji: string;
  role: string;
  domain: string[];
  capabilities: Record<string, string> | string[];
  communicationStyle?: string;
  reportsTo?: string;
  executionModes?: string[];
}

interface AgentIdentity {
  epithet?: string;
  vibe?: string;
  mythology?: string;
}

interface Agent {
  id: string;
  manifest: AgentManifest;
  identity: AgentIdentity;
}

interface Squad {
  id: string;
  agents: Agent[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MODELS = [
  { id: 'claude-opus-4-6', label: 'Opus 4.6', tier: 'opus' },
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6', tier: 'sonnet' },
  { id: 'claude-haiku-4-5', label: 'Haiku 4.5', tier: 'haiku' },
];

const SQUAD_TEMPLATES = [
  { id: 'dev', label: 'Dev Squad', desc: 'Full-stack development team', agents: 4 },
  { id: 'personal', label: 'Personal', desc: 'PA, research, content', agents: 3 },
  { id: 'hackathon', label: 'Hackathon', desc: 'Fast-paced sprint team', agents: 3 },
  { id: 'social', label: 'Social', desc: 'Content and community', agents: 3 },
  { id: 'support', label: 'Support', desc: 'QA, monitoring, triage', agents: 4 },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function modelColor(model: string): string {
  if (model.includes('opus')) return 'border-amber-500 text-amber-400';
  if (model.includes('sonnet')) return 'border-blue-500 text-blue-400';
  if (model.includes('haiku')) return 'border-gray-500 text-gray-400';
  return 'border-gray-600 text-gray-500';
}

function modelLabel(model: string): string {
  if (model.includes('opus-4-6')) return 'Opus 4.6';
  if (model.includes('opus-4-5')) return 'Opus 4.5';
  if (model.includes('sonnet-4-6')) return 'Sonnet 4.6';
  if (model.includes('sonnet-4-5')) return 'Sonnet 4.5';
  if (model.includes('haiku')) return 'Haiku 4.5';
  return model.split('/').pop() || model;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function AgentCard({ agent, onClick }: { agent: Agent; onClick: () => void }) {
  const m = agent.manifest;
  const caps = typeof m.capabilities === 'object' && !Array.isArray(m.capabilities)
    ? Object.entries(m.capabilities)
    : [];

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-[#1a1a1d] border border-[#2a2a2d] rounded-lg p-4 hover:border-[#3a3a3d] transition-colors"
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl">{m.emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-100">{m.displayName}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${modelColor(m.model)}`}>
              {modelLabel(m.model)}
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">{m.title}</p>
          {agent.identity.vibe && (
            <p className="text-[11px] text-gray-600 mt-1 line-clamp-2">{agent.identity.vibe}</p>
          )}
          {caps.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {caps.slice(0, 6).map(([k]) => (
                <span key={k} className="text-[10px] px-1.5 py-0.5 rounded bg-[#111113] text-gray-500 border border-[#2a2a2d]">
                  {k}
                </span>
              ))}
              {caps.length > 6 && (
                <span className="text-[10px] text-gray-600">+{caps.length - 6}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

function AgentDetail({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const m = agent.manifest;
  const id = agent.identity;
  const caps = typeof m.capabilities === 'object' && !Array.isArray(m.capabilities)
    ? Object.entries(m.capabilities)
    : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-[#111113] border border-[#2a2a2d] rounded-xl w-full max-w-lg max-h-[80vh] overflow-y-auto mx-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-start gap-4 mb-4">
            <span className="text-4xl">{m.emoji}</span>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-gray-100">{m.displayName}</h2>
                <span className={`text-[10px] px-1.5 py-0.5 rounded border ${modelColor(m.model)}`}>
                  {modelLabel(m.model)}
                </span>
              </div>
              <p className="text-sm text-gray-400">{m.title}</p>
              {id.epithet && <p className="text-xs text-amber-600 mt-1 italic">{id.epithet}</p>}
            </div>
            <button onClick={onClose} className="text-gray-600 hover:text-gray-400 text-lg">✕</button>
          </div>

          {id.vibe && (
            <div className="mb-4">
              <h3 className="text-[10px] uppercase tracking-widest text-gray-600 mb-1">Vibe</h3>
              <p className="text-sm text-gray-300">{id.vibe}</p>
            </div>
          )}

          {id.mythology && (
            <div className="mb-4">
              <h3 className="text-[10px] uppercase tracking-widest text-gray-600 mb-1">Mythology</h3>
              <p className="text-sm text-gray-400 leading-relaxed">{id.mythology}</p>
            </div>
          )}

          {m.domain.length > 0 && (
            <div className="mb-4">
              <h3 className="text-[10px] uppercase tracking-widest text-gray-600 mb-1">Domain</h3>
              <div className="flex flex-wrap gap-1.5">
                {m.domain.map(d => (
                  <span key={d} className="text-xs px-2 py-0.5 rounded bg-[#1a1a1d] text-gray-300 border border-[#2a2a2d]">
                    {d}
                  </span>
                ))}
              </div>
            </div>
          )}

          {caps.length > 0 && (
            <div className="mb-4">
              <h3 className="text-[10px] uppercase tracking-widest text-gray-600 mb-1">Capabilities</h3>
              <div className="space-y-1">
                {caps.map(([k, v]) => (
                  <div key={k} className="flex gap-2 text-xs">
                    <span className="text-amber-500 font-mono w-8 shrink-0">{k}</span>
                    <span className="text-gray-400">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="border-t border-[#2a2a2d] pt-3 mt-4 space-y-1">
            {m.reportsTo && (
              <p className="text-xs text-gray-600">Reports to: <span className="text-gray-400">{m.reportsTo}</span></p>
            )}
            {m.communicationStyle && (
              <p className="text-xs text-gray-600">Style: <span className="text-gray-400">{m.communicationStyle}</span></p>
            )}
            {m.executionModes && (
              <p className="text-xs text-gray-600">Modes: <span className="text-gray-400">{m.executionModes.join(', ')}</span></p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SquadCard({ squad, onSelect }: { squad: Squad; onSelect: () => void }) {
  const chief = squad.agents.find(a =>
    a.manifest.title.toLowerCase().includes('chief') || a.manifest.reportsTo === undefined
  );

  return (
    <button
      onClick={onSelect}
      className="w-full text-left bg-[#111113] border border-[#2a2a2d] rounded-lg p-5 hover:border-amber-900/50 transition-colors"
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-gray-100 capitalize">{squad.id.replace(/-/g, ' ')} Squad</h3>
        <span className="text-xs text-gray-600">{squad.agents.length} agents</span>
      </div>
      <div className="flex -space-x-2 mb-3">
        {squad.agents.map(a => (
          <span
            key={a.id}
            title={a.manifest.displayName}
            className="w-8 h-8 rounded-full bg-[#1a1a1d] border-2 border-[#111113] flex items-center justify-center text-sm"
          >
            {a.manifest.emoji}
          </span>
        ))}
      </div>
      {chief && (
        <p className="text-xs text-gray-500">
          Chief: {chief.manifest.emoji} {chief.manifest.displayName}
        </p>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Create Squad Modal
// ---------------------------------------------------------------------------

function CreateSquadModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [mode, setMode] = useState<'template' | 'custom'>('template');
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Custom squad fields
  const [customName, setCustomName] = useState('');
  const [customAgents, setCustomAgents] = useState<{ name: string; role: string; model: string; emoji: string }[]>([
    { name: '', role: '', model: 'claude-sonnet-4-6', emoji: '' },
  ]);

  const addAgent = () => {
    if (customAgents.length >= 10) return;
    setCustomAgents([...customAgents, { name: '', role: '', model: 'claude-sonnet-4-6', emoji: '' }]);
  };

  const removeAgent = (i: number) => {
    if (customAgents.length <= 1) return;
    setCustomAgents(customAgents.filter((_, idx) => idx !== i));
  };

  const updateAgent = (i: number, field: string, value: string) => {
    const updated = [...customAgents];
    updated[i] = { ...updated[i], [field]: value };
    setCustomAgents(updated);
  };

  const handleCreateTemplate = async () => {
    if (!selectedTemplate) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/squads/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ squadId: selectedTemplate }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Failed to create squad');
      setSuccess(true);
      setTimeout(() => { onCreated(); onClose(); }, 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    }
    setCreating(false);
  };

  const handleCreateCustom = async () => {
    if (!customName.trim()) { setError('Squad name is required'); return; }
    const validAgents = customAgents.filter(a => a.name.trim() && a.role.trim());
    if (validAgents.length === 0) { setError('At least one agent with name and role is required'); return; }

    setCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/agents/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          squadId: customName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
          agents: validAgents.map((a, i) => ({
            name: a.name.trim(),
            role: a.role.trim(),
            model: a.model,
            emoji: a.emoji || '🤖',
            tier: i === 0 ? 0 : 2,
          })),
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Failed to create squad');
      setSuccess(true);
      setTimeout(() => { onCreated(); onClose(); }, 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    }
    setCreating(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-[#111113] border border-[#2a2a2d] rounded-xl w-full max-w-xl max-h-[85vh] overflow-y-auto mx-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-bold text-gray-100">Create Squad</h2>
            <button onClick={onClose} className="text-gray-600 hover:text-gray-400 text-lg">✕</button>
          </div>

          {success ? (
            <div className="text-center py-8">
              <span className="text-3xl">✓</span>
              <p className="text-sm text-green-400 mt-2">Squad created successfully</p>
            </div>
          ) : (
            <>
              {/* Mode toggle */}
              <div className="flex gap-1 mb-5 bg-[#0a0a0b] rounded-lg p-1">
                <button
                  onClick={() => setMode('template')}
                  className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    mode === 'template' ? 'bg-[#1a1a1d] text-gray-100' : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  From Template
                </button>
                <button
                  onClick={() => setMode('custom')}
                  className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    mode === 'custom' ? 'bg-[#1a1a1d] text-gray-100' : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  Custom
                </button>
              </div>

              {/* Template mode */}
              {mode === 'template' && (
                <div className="space-y-3">
                  {SQUAD_TEMPLATES.map(t => (
                    <button
                      key={t.id}
                      onClick={() => setSelectedTemplate(t.id)}
                      className={`w-full text-left p-4 rounded-lg border transition-colors ${
                        selectedTemplate === t.id
                          ? 'border-amber-500 bg-amber-500/5'
                          : 'border-[#2a2a2d] hover:border-[#3a3a3d] bg-[#0a0a0b]'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-200">{t.label}</span>
                        <span className="text-[10px] text-gray-600">{t.agents} agents</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{t.desc}</p>
                    </button>
                  ))}

                  <button
                    onClick={handleCreateTemplate}
                    disabled={!selectedTemplate || creating}
                    className="w-full py-2.5 rounded-lg text-sm font-medium bg-amber-500 text-black hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {creating ? 'Creating...' : 'Create Squad'}
                  </button>
                </div>
              )}

              {/* Custom mode */}
              {mode === 'custom' && (
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] uppercase tracking-widest text-gray-500 mb-1 block">Squad Name</label>
                    <input
                      value={customName}
                      onChange={e => setCustomName(e.target.value)}
                      placeholder="e.g. Research Team"
                      className="w-full px-3 py-2 text-sm bg-[#0a0a0b] border border-[#2a2a2d] rounded-lg text-gray-200 placeholder:text-gray-700 focus:border-amber-500/50 focus:outline-none"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-[10px] uppercase tracking-widest text-gray-500">Agents</label>
                      <button
                        onClick={addAgent}
                        disabled={customAgents.length >= 10}
                        className="text-[10px] text-amber-400 hover:text-amber-300 disabled:text-gray-700"
                      >
                        + Add Agent
                      </button>
                    </div>

                    <div className="space-y-3">
                      {customAgents.map((agent, i) => (
                        <div key={i} className="bg-[#0a0a0b] border border-[#2a2a2d] rounded-lg p-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] text-gray-600">Agent {i + 1}{i === 0 ? ' (Chief)' : ''}</span>
                            {customAgents.length > 1 && (
                              <button onClick={() => removeAgent(i)} className="text-[10px] text-red-400 hover:text-red-300">Remove</button>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              value={agent.name}
                              onChange={e => updateAgent(i, 'name', e.target.value)}
                              placeholder="Name"
                              className="px-2.5 py-1.5 text-xs bg-[#111113] border border-[#2a2a2d] rounded text-gray-200 placeholder:text-gray-700 focus:border-amber-500/50 focus:outline-none"
                            />
                            <input
                              value={agent.role}
                              onChange={e => updateAgent(i, 'role', e.target.value)}
                              placeholder="Role"
                              className="px-2.5 py-1.5 text-xs bg-[#111113] border border-[#2a2a2d] rounded text-gray-200 placeholder:text-gray-700 focus:border-amber-500/50 focus:outline-none"
                            />
                            <select
                              value={agent.model}
                              onChange={e => updateAgent(i, 'model', e.target.value)}
                              className="px-2.5 py-1.5 text-xs bg-[#111113] border border-[#2a2a2d] rounded text-gray-200 focus:border-amber-500/50 focus:outline-none"
                            >
                              {MODELS.map(m => (
                                <option key={m.id} value={m.id}>{m.label}</option>
                              ))}
                            </select>
                            <input
                              value={agent.emoji}
                              onChange={e => updateAgent(i, 'emoji', e.target.value)}
                              placeholder="Emoji"
                              maxLength={4}
                              className="px-2.5 py-1.5 text-xs bg-[#111113] border border-[#2a2a2d] rounded text-gray-200 placeholder:text-gray-700 focus:border-amber-500/50 focus:outline-none"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={handleCreateCustom}
                    disabled={creating}
                    className="w-full py-2.5 rounded-lg text-sm font-medium bg-amber-500 text-black hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {creating ? 'Creating...' : 'Create Custom Squad'}
                  </button>
                </div>
              )}

              {error && (
                <p className="text-xs text-red-400 mt-3">{error}</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

type View = 'overview' | 'squad';

export default function SquadsPage() {
  const [squads, setSquads] = useState<Squad[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>('overview');
  const [selectedSquad, setSelectedSquad] = useState<Squad | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const loadSquads = useCallback(() => {
    fetch('/api/squads')
      .then(r => r.json())
      .then(d => { setSquads(d.data || []); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  useEffect(() => { loadSquads(); }, [loadSquads]);

  const selectSquad = (squad: Squad) => {
    setSelectedSquad(squad);
    setView('squad');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-400 text-sm">Failed to load squads: {error}</p>
      </div>
    );
  }

  // ── Overview ──────────────────────────────────────────────────────────
  if (view === 'overview') {
    const totalAgents = squads.reduce((n, s) => n + s.agents.length, 0);

    return (
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-lg font-bold text-gray-100">Squads</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              {squads.length} squads &middot; {totalAgents} agents
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 text-xs font-medium bg-amber-500 text-black rounded-lg hover:bg-amber-400 transition-colors"
          >
            + Create Squad
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {squads.map(squad => (
            <SquadCard key={squad.id} squad={squad} onSelect={() => selectSquad(squad)} />
          ))}
        </div>

        {squads.length === 0 && (
          <div className="text-center py-16">
            <p className="text-gray-500 text-sm">No squads found in workspace</p>
            <p className="text-gray-700 text-xs mt-1">
              Create a squad from a template or build a custom one
            </p>
          </div>
        )}

        {showCreate && (
          <CreateSquadModal
            onClose={() => setShowCreate(false)}
            onCreated={loadSquads}
          />
        )}
      </div>
    );
  }

  // ── Squad Detail ──────────────────────────────────────────────────────
  if (view === 'squad' && selectedSquad) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setView('overview'); setSelectedSquad(null); }}
              className="text-gray-500 hover:text-gray-300 text-sm"
            >
              &larr; Back
            </button>
            <div>
              <h1 className="text-lg font-bold text-gray-100 capitalize">
                {selectedSquad.id.replace(/-/g, ' ')} Squad
              </h1>
              <p className="text-xs text-gray-500">{selectedSquad.agents.length} agents</p>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {selectedSquad.agents.map(agent => (
            <AgentCard
              key={agent.id}
              agent={agent}
              onClick={() => setSelectedAgent(agent)}
            />
          ))}
        </div>

        {selectedAgent && (
          <AgentDetail agent={selectedAgent} onClose={() => setSelectedAgent(null)} />
        )}
      </div>
    );
  }

  return null;
}
