'use client';

import { useState, useEffect, useCallback } from 'react';
import { autoTask } from '@/lib/tasks';

interface Project {
  slug: string; name: string; status: string; description: string;
  squad: string | null; repo: string | null; site: string | null;
  tech: string[]; createdAt: string; updatedAt: string;
}

interface GitInfo { ahead: number; behind: number; branch: string; dirty: boolean; }

const statusStyles: Record<string, { bg: string; text: string }> = {
  active: { bg: 'bg-green-500/20', text: 'text-green-400' },
  paused: { bg: 'bg-amber-500/20', text: 'text-amber-400' },
  planning: { bg: 'bg-blue-500/20', text: 'text-blue-400' },
  done: { bg: 'bg-gray-500/20', text: 'text-gray-400' },
};

const squadColors: Record<string, string> = {
  dev_squad: 'border-l-blue-500', blockchain_squad: 'border-l-purple-500',
  clop_cabinet: 'border-l-green-500', product_squad: 'border-l-amber-500',
};

const squadOptions = ['', 'dev_squad', 'blockchain_squad', 'clop_cabinet', 'product_squad'];
function fmtSquad(s: string | null): string { return s ? s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Unassigned'; }

// ─── Project Form Modal ─────────────────────────────────────────
function ProjectFormModal({ project, onClose, onSave, onDelete }: {
  project: Project | null; onClose: () => void;
  onSave: (p: Project, isNew: boolean) => void;
  onDelete?: (slug: string) => void;
}) {
  const isNew = !project;
  const [form, setForm] = useState<Project>(project || {
    slug: '', name: '', status: 'active', description: '', squad: null,
    repo: null, site: null, tech: [], createdAt: '', updatedAt: '',
  });
  const [techInput, setTechInput] = useState(form.tech.join(', '));
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="fixed inset-0 bg-black/70 flex items-start justify-center z-50 pt-12 px-4" onClick={onClose}>
      <div className="bg-[#111113] rounded-xl border border-[#1e1e21] w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-[#1e1e21] flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-200">{isNew ? 'New Project' : 'Edit Project'}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300">×</button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="block text-[10px] text-gray-500 uppercase mb-1">Name</label>
            <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value, slug: isNew ? e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-') : form.slug })}
              className="w-full px-3 py-2 bg-[#0a0a0b] border border-[#1e1e21] rounded text-sm text-gray-200 focus:outline-none focus:border-amber-500" />
          </div>
          {isNew && (
            <div>
              <label className="block text-[10px] text-gray-500 uppercase mb-1">Slug</label>
              <input type="text" value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value })}
                className="w-full px-3 py-1.5 bg-[#0a0a0b] border border-[#1e1e21] rounded text-xs text-gray-400 font-mono focus:outline-none focus:border-amber-500" />
            </div>
          )}
          <div>
            <label className="block text-[10px] text-gray-500 uppercase mb-1">Description</label>
            <textarea rows={3} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
              className="w-full px-3 py-2 bg-[#0a0a0b] border border-[#1e1e21] rounded text-xs text-gray-200 focus:outline-none focus:border-amber-500 resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] text-gray-500 uppercase mb-1">Status</label>
              <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}
                className="w-full px-3 py-1.5 bg-[#0a0a0b] border border-[#1e1e21] rounded text-xs text-gray-200 focus:outline-none focus:border-amber-500">
                <option value="active">Active</option><option value="paused">Paused</option>
                <option value="planning">Planning</option><option value="done">Done</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-gray-500 uppercase mb-1">Squad</label>
              <select value={form.squad || ''} onChange={e => setForm({ ...form, squad: e.target.value || null })}
                className="w-full px-3 py-1.5 bg-[#0a0a0b] border border-[#1e1e21] rounded text-xs text-gray-200 focus:outline-none focus:border-amber-500">
                {squadOptions.map(s => <option key={s} value={s}>{s ? fmtSquad(s) : 'None'}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 uppercase mb-1">Repository URL</label>
            <input type="text" placeholder="https://github.com/org/repo" value={form.repo || ''} onChange={e => setForm({ ...form, repo: e.target.value || null })}
              className="w-full px-3 py-1.5 bg-[#0a0a0b] border border-[#1e1e21] rounded text-xs text-gray-200 font-mono focus:outline-none focus:border-amber-500" />
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 uppercase mb-1">Website URL</label>
            <input type="text" placeholder="https://example.com" value={form.site || ''} onChange={e => setForm({ ...form, site: e.target.value || null })}
              className="w-full px-3 py-1.5 bg-[#0a0a0b] border border-[#1e1e21] rounded text-xs text-gray-200 font-mono focus:outline-none focus:border-amber-500" />
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 uppercase mb-1">Tech Stack (comma separated)</label>
            <input type="text" placeholder="Next.js, TypeScript, SQLite" value={techInput}
              onChange={e => { setTechInput(e.target.value); setForm({ ...form, tech: e.target.value.split(',').map(t => t.trim()).filter(Boolean) }); }}
              className="w-full px-3 py-1.5 bg-[#0a0a0b] border border-[#1e1e21] rounded text-xs text-gray-200 focus:outline-none focus:border-amber-500" />
          </div>
        </div>
        <div className="px-5 py-3 border-t border-[#1e1e21] flex items-center justify-between">
          <div>
            {!isNew && onDelete && (
              confirmDelete ? (
                <div className="flex gap-2">
                  <button onClick={() => onDelete(form.slug)} className="px-3 py-1 text-[11px] bg-red-500/20 text-red-400 rounded">Confirm Delete</button>
                  <button onClick={() => setConfirmDelete(false)} className="px-3 py-1 text-[11px] text-gray-500">Cancel</button>
                </div>
              ) : (
                <button onClick={() => setConfirmDelete(true)} className="px-3 py-1 text-[11px] text-gray-600 hover:text-red-400">Delete</button>
              )
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-1.5 text-[11px] text-gray-400 bg-[#1a1a1d] rounded">Cancel</button>
            <button onClick={() => onSave(form, isNew)} className="px-4 py-1.5 text-[11px] font-medium bg-amber-500 text-gray-900 rounded hover:bg-amber-400">
              {isNew ? 'Create' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Git Panel (inside project detail) ───────────────────────────
function GitPanel() {
  const [repo, setRepo] = useState<{ remote: string; branch: string; ahead: number; behind: number; dirty: boolean; changedFiles: string[]; commits: { hash: string; message: string }[] } | null>(null);
  const [pushing, setPushing] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const fetch_ = useCallback(async () => {
    try { const r = await fetch('/api/git'); const d = await r.json(); if (d.ok) setRepo(d.repo); } catch {}
  }, []);
  useEffect(() => { fetch_(); }, [fetch_]);

  const doAction = async (action: string) => {
    setPushing(true); setResult(null);
    try { const r = await fetch('/api/git', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) }); const d = await r.json(); setResult(d.ok ? d.output : d.error); fetch_(); } catch (e) { setResult(String(e)); }
    setPushing(false);
  };

  if (!repo) return null;
  const name = repo.remote.split('/').slice(-2).join('/').replace('.git', '');

  return (
    <div className="border-t border-[#1e1e21]">
      <button onClick={() => setExpanded(!expanded)} className="w-full px-5 py-2.5 flex items-center justify-between hover:bg-[#0a0a0b]">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-500">{expanded ? '▼' : '▶'}</span>
          <span className="text-[10px] text-gray-400">⎇</span>
          <span className="text-[11px] font-medium text-gray-300">{name}</span>
          <span className="text-[10px] text-gray-600">({repo.branch})</span>
        </div>
        <div className="flex items-center gap-2">
          {repo.ahead > 0 && <span className="text-[9px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded">{repo.ahead}↑</span>}
          {repo.behind > 0 && <span className="text-[9px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">{repo.behind}↓</span>}
          {repo.ahead === 0 && repo.behind === 0 && <span className="text-[9px] text-green-500">✓</span>}
        </div>
      </button>
      {expanded && (
        <div className="border-t border-[#1e1e21]">
          <div className="px-5 py-2 flex gap-2">
            <button onClick={() => doAction('push')} disabled={pushing || repo.ahead === 0} className="px-2.5 py-1 text-[10px] font-medium bg-amber-500 text-gray-900 rounded hover:bg-amber-400 disabled:opacity-40">{pushing ? '...' : 'Push'}</button>
            <button onClick={() => doAction('pull')} disabled={pushing} className="px-2.5 py-1 text-[10px] font-medium bg-blue-500/20 text-blue-400 rounded hover:bg-blue-500/30 disabled:opacity-40">Pull</button>
            <button onClick={fetch_} className="px-2.5 py-1 text-[10px] text-gray-500 bg-[#1a1a1d] rounded hover:text-gray-300">↻</button>
          </div>
          {result && <div className="px-5 py-1.5 text-[10px] text-gray-400 font-mono">{result}</div>}
          <div className="max-h-[180px] overflow-y-auto divide-y divide-[#1e1e21]">
            {repo.commits.slice(0, 8).map((c, i) => (
              <div key={c.hash} className="px-5 py-1.5 flex items-center gap-2 text-[11px] hover:bg-[#1a1a1d]">
                <code className="text-amber-500/60 font-mono w-14 shrink-0">{c.hash}</code>
                <span className={`flex-1 truncate ${i < repo.ahead ? 'text-gray-200' : 'text-gray-500'}`}>{c.message}</span>
                {i < repo.ahead && <span className="text-[9px] text-amber-500/40 shrink-0">new</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Project Detail Modal ────────────────────────────────────────
function ProjectDetail({ project, onClose, onEdit }: { project: Project; onClose: () => void; onEdit: () => void }) {
  const status = statusStyles[project.status] || statusStyles.active;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-start justify-center z-50 pt-12 px-4" onClick={onClose}>
      <div className="bg-[#111113] rounded-xl border border-[#1e1e21] w-full max-w-xl max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-[#1e1e21]">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-100">{project.name}</h2>
            <div className="flex items-center gap-2">
              <span className={`text-[10px] px-2 py-0.5 rounded capitalize ${status.bg} ${status.text}`}>{project.status}</span>
              <button onClick={onEdit} className="text-[10px] text-gray-500 hover:text-amber-400 px-2 py-0.5 bg-[#1a1a1d] rounded">Edit</button>
              <button onClick={onClose} className="text-gray-500 hover:text-gray-300">×</button>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">{project.description}</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="px-5 py-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-gray-500 uppercase">Squad</span>
              <span className="text-xs text-gray-300">{fmtSquad(project.squad)}</span>
            </div>
            {project.tech.length > 0 && (
              <div>
                <span className="text-[10px] text-gray-500 uppercase block mb-1.5">Tech Stack</span>
                <div className="flex flex-wrap gap-1.5">
                  {project.tech.map(t => <span key={t} className="text-[10px] px-2 py-0.5 bg-[#1a1a1d] text-gray-400 rounded">{t}</span>)}
                </div>
              </div>
            )}
            {project.repo && (
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-500 uppercase">Repository</span>
                <a href={project.repo} target="_blank" rel="noopener noreferrer" className="text-xs text-amber-400 hover:text-amber-300">
                  {project.repo.replace('https://github.com/', '')} ↗
                </a>
              </div>
            )}
            {project.site && (
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-500 uppercase">Website</span>
                <a href={project.site} target="_blank" rel="noopener noreferrer" className="text-xs text-amber-400 hover:text-amber-300">
                  {project.site.replace('https://', '')} ↗
                </a>
              </div>
            )}
          </div>
          {project.repo && <GitPanel />}
        </div>
        <div className="px-5 py-3 border-t border-[#1e1e21] flex justify-end">
          <button onClick={onClose} className="px-4 py-1.5 text-[11px] text-gray-400 bg-[#1a1a1d] rounded hover:text-gray-200">Close</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────
export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState<Project | null>(null);
  const [editing, setEditing] = useState<Project | null | 'new'>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [gitInfo, setGitInfo] = useState<GitInfo | null>(null);
  const [gitAction, setGitAction] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    try { const r = await fetch('/api/projects'); const d = await r.json(); if (d.ok) setProjects(d.projects); } catch {}
  }, []);

  const fetchGit = useCallback(async () => {
    try { const r = await fetch('/api/git'); const d = await r.json(); if (d.ok) setGitInfo({ ahead: d.repo.ahead, behind: d.repo.behind, branch: d.repo.branch, dirty: d.repo.dirty }); } catch {}
  }, []);

  const doGitAction = async (action: string) => {
    setGitAction(action);
    try { await fetch('/api/git', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) }); fetchGit(); } catch {}
    setGitAction(null);
  };

  useEffect(() => { fetchProjects(); fetchGit(); }, [fetchProjects, fetchGit]);

  const handleSave = async (project: Project, isNew: boolean) => {
    if (isNew) {
      await fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(project) });
      autoTask.projectAction('Created project', project.name);
    } else {
      await fetch('/api/projects', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(project) });
      autoTask.projectAction('Updated project', project.name);
    }
    setEditing(null); setSelected(null); fetchProjects();
  };

  const handleDelete = async (slug: string) => {
    const project = projects.find(p => p.slug === slug);
    await fetch(`/api/projects?slug=${slug}`, { method: 'DELETE' });
    autoTask.projectAction('Deleted project', project?.name || slug);
    setEditing(null); setSelected(null); fetchProjects();
  };

  const filtered = statusFilter === 'all' ? projects : projects.filter(p => p.status === statusFilter);
  const activeCount = projects.filter(p => p.status === 'active').length;
  const pausedCount = projects.filter(p => p.status === 'paused').length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-gray-200">Projects</h2>
          <div className="flex gap-1.5 text-[10px]">
            <span className="px-2 py-0.5 bg-[#1a1a1d] rounded text-gray-400">{projects.length}</span>
            <span className="px-2 py-0.5 bg-green-500/10 rounded text-green-400">{activeCount} active</span>
            <span className="px-2 py-0.5 bg-amber-500/10 rounded text-amber-400">{pausedCount} paused</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5 bg-[#111113] rounded-lg p-0.5 border border-[#1e1e21]">
            {['all', 'active', 'paused'].map(s => (
              <button key={s} onClick={() => setStatusFilter(s)} className={`px-2.5 py-1 text-[11px] rounded capitalize ${statusFilter === s ? 'bg-[#1e1e21] text-gray-100' : 'text-gray-500 hover:text-gray-300'}`}>{s}</button>
            ))}
          </div>
          <button onClick={() => setEditing('new')} className="px-3 py-1.5 text-[11px] font-medium bg-amber-500 text-gray-900 rounded hover:bg-amber-400">+ New</button>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map(project => {
          const status = statusStyles[project.status] || statusStyles.active;
          const borderColor = project.squad ? squadColors[project.squad] || 'border-l-gray-600' : 'border-l-gray-600';

          return (
            <div key={project.slug} onClick={() => setSelected(project)}
              className={`bg-[#111113] rounded-lg p-4 border border-[#1e1e21] border-l-2 ${borderColor} hover:border-[#333] cursor-pointer group`}>
              <div className="flex items-start justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-100 group-hover:text-amber-400">{project.name}</h3>
                <span className={`text-[10px] px-1.5 py-0.5 rounded capitalize ${status.bg} ${status.text}`}>{project.status}</span>
              </div>
              <p className="text-[11px] text-gray-500 mb-3 line-clamp-2 leading-relaxed">{project.description}</p>

              {project.tech.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {project.tech.slice(0, 3).map(t => <span key={t} className="text-[9px] px-1.5 py-0.5 bg-[#0a0a0b] text-gray-600 rounded">{t}</span>)}
                  {project.tech.length > 3 && <span className="text-[9px] text-gray-700">+{project.tech.length - 3}</span>}
                </div>
              )}

              <div className="flex items-center justify-between pt-2 border-t border-[#1e1e21]">
                <span className="text-[10px] text-gray-600">{fmtSquad(project.squad)}</span>
                {project.repo && gitInfo ? (
                  <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                    {gitInfo.dirty && <span className="text-[9px] text-red-400" title="Uncommitted">●</span>}
                    {gitInfo.ahead > 0 && (
                      <>
                        <span className="text-[9px] text-amber-400">{gitInfo.ahead}↑</span>
                        <button onClick={() => doGitAction('push')} disabled={gitAction === 'push'}
                          className="text-[9px] px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded hover:bg-amber-500/30 disabled:opacity-50">
                          {gitAction === 'push' ? '...' : 'Push'}
                        </button>
                      </>
                    )}
                    {gitInfo.behind > 0 && (
                      <>
                        <span className="text-[9px] text-blue-400">{gitInfo.behind}↓</span>
                        <button onClick={() => doGitAction('pull')} disabled={gitAction === 'pull'}
                          className="text-[9px] px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded hover:bg-blue-500/30 disabled:opacity-50">
                          {gitAction === 'pull' ? '...' : 'Pull'}
                        </button>
                      </>
                    )}
                    {gitInfo.ahead === 0 && gitInfo.behind === 0 && !gitInfo.dirty && <span className="text-[9px] text-green-500">✓</span>}
                  </div>
                ) : project.repo ? <span className="text-[10px] text-gray-700">↗</span> : null}
              </div>
            </div>
          );
        })}
      </div>

      {/* Detail Modal */}
      {selected && !editing && (
        <ProjectDetail project={selected} onClose={() => setSelected(null)} onEdit={() => setEditing(selected)} />
      )}

      {/* Create/Edit Modal */}
      {editing && (
        <ProjectFormModal
          project={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
