'use client';

import { useState, useEffect } from 'react';

// ---------------------------------------------------------------------------
// Types (mirrors workspace.ts)
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

interface BoardTask {
  id: string;
  title: string;
  column: string;
  assignee?: string;
  points?: number;
  priority?: string;
  epic?: string;
  status: string;
  metadata: Record<string, string>;
}

interface SquadBoard {
  squadId: string;
  sprintName?: string;
  sprintDates?: string;
  velocity?: string;
  epic?: string;
  squadMembers?: string;
  columns: { name: string; tasks: BoardTask[] }[];
}

// ---------------------------------------------------------------------------
// Model badge colors
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

function priorityColor(p?: string): string {
  if (p === 'critical') return 'text-red-400';
  if (p === 'high') return 'text-orange-400';
  if (p === 'medium') return 'text-yellow-400';
  if (p === 'low') return 'text-gray-500';
  return 'text-gray-500';
}

function statusDot(status: string): string {
  if (status === 'done') return 'bg-green-500';
  if (status === 'doing') return 'bg-blue-500';
  if (status === 'review') return 'bg-purple-500';
  if (status === 'blocked') return 'bg-red-500';
  return 'bg-gray-600';
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
          {/* Header */}
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

          {/* Vibe */}
          {id.vibe && (
            <div className="mb-4">
              <h3 className="text-[10px] uppercase tracking-widest text-gray-600 mb-1">Vibe</h3>
              <p className="text-sm text-gray-300">{id.vibe}</p>
            </div>
          )}

          {/* Mythology */}
          {id.mythology && (
            <div className="mb-4">
              <h3 className="text-[10px] uppercase tracking-widest text-gray-600 mb-1">Mythology</h3>
              <p className="text-sm text-gray-400 leading-relaxed">{id.mythology}</p>
            </div>
          )}

          {/* Domain */}
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

          {/* Capabilities */}
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

          {/* Meta */}
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

function TaskCard({ task }: { task: BoardTask }) {
  return (
    <div className="bg-[#111113] border border-[#2a2a2d] rounded-md p-3 hover:border-[#3a3a3d] transition-colors">
      <div className="flex items-start gap-2">
        <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${statusDot(task.status)}`} />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-300 leading-snug">{task.title}</p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="text-[10px] font-mono text-gray-600">{task.id}</span>
            {task.assignee && (
              <span className="text-[10px] text-blue-400">{task.assignee}</span>
            )}
            {task.priority && (
              <span className={`text-[10px] ${priorityColor(task.priority)}`}>{task.priority}</span>
            )}
            {task.points !== undefined && (
              <span className="text-[10px] text-gray-600">{task.points}pts</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function BoardView({ board }: { board: SquadBoard }) {
  return (
    <div>
      {/* Sprint header */}
      {board.sprintName && (
        <div className="mb-4 px-1">
          <h3 className="text-sm font-semibold text-gray-200">{board.sprintName}</h3>
          <div className="flex gap-3 mt-1 text-xs text-gray-500">
            {board.sprintDates && <span>{board.sprintDates}</span>}
            {board.velocity && <span>{board.velocity}</span>}
            {board.epic && <span className="text-amber-600">{board.epic}</span>}
          </div>
        </div>
      )}

      {/* Kanban columns */}
      <div className="flex gap-3 overflow-x-auto pb-4">
        {board.columns.map(col => (
          <div key={col.name} className="min-w-[260px] flex-1">
            <div className="flex items-center justify-between mb-2 px-1">
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{col.name}</h4>
              <span className="text-[10px] text-gray-600 bg-[#1a1a1d] px-1.5 py-0.5 rounded">{col.tasks.length}</span>
            </div>
            <div className="space-y-2">
              {col.tasks.map(task => (
                <TaskCard key={task.id} task={task} />
              ))}
              {col.tasks.length === 0 && (
                <p className="text-xs text-gray-700 text-center py-4">No tasks</p>
              )}
            </div>
          </div>
        ))}
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
  const [board, setBoard] = useState<SquadBoard | null>(null);
  const [boardLoading, setBoardLoading] = useState(false);
  const [tab, setTab] = useState<'agents' | 'board'>('agents');

  useEffect(() => {
    fetch('/api/squads')
      .then(r => r.json())
      .then(d => { setSquads(d.data || []); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  const selectSquad = (squad: Squad) => {
    setSelectedSquad(squad);
    setView('squad');
    setTab('agents');
    setBoardLoading(true);
    fetch(`/api/squads/${squad.id}/board`)
      .then(r => r.json())
      .then(d => { setBoard(d.data || null); setBoardLoading(false); })
      .catch(() => { setBoard(null); setBoardLoading(false); });
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
              Add squad directories with manifest.yaml files to your workspace/squads/ folder
            </p>
          </div>
        )}
      </div>
    );
  }

  // ── Squad Detail ──────────────────────────────────────────────────────
  if (view === 'squad' && selectedSquad) {
    return (
      <div className="max-w-6xl mx-auto">
        {/* Back + header */}
        <div className="flex items-center gap-3 mb-5">
          <button
            onClick={() => { setView('overview'); setSelectedSquad(null); setBoard(null); }}
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

        {/* Tabs */}
        <div className="flex gap-1 mb-5 border-b border-[#2a2a2d]">
          <button
            onClick={() => setTab('agents')}
            className={`px-4 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
              tab === 'agents'
                ? 'border-amber-500 text-gray-100'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            Agents ({selectedSquad.agents.length})
          </button>
          <button
            onClick={() => setTab('board')}
            className={`px-4 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
              tab === 'board'
                ? 'border-amber-500 text-gray-100'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            Board
          </button>
        </div>

        {/* Agents tab */}
        {tab === 'agents' && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {selectedSquad.agents.map(agent => (
              <AgentCard
                key={agent.id}
                agent={agent}
                onClick={() => setSelectedAgent(agent)}
              />
            ))}
          </div>
        )}

        {/* Board tab */}
        {tab === 'board' && (
          boardLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : board ? (
            <BoardView board={board} />
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-500 text-sm">No board found for this squad</p>
              <p className="text-gray-700 text-xs mt-1">
                Create a board.md at workspace/boards/squads/{selectedSquad.id}/board.md
              </p>
            </div>
          )
        )}

        {/* Agent detail modal */}
        {selectedAgent && (
          <AgentDetail agent={selectedAgent} onClose={() => setSelectedAgent(null)} />
        )}
      </div>
    );
  }

  return null;
}
