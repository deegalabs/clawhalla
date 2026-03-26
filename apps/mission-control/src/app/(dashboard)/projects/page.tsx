'use client';

import { useState, useEffect, useCallback } from 'react';

interface Project {
  name: string;
  slug: string;
  status: 'active' | 'paused' | 'planning' | 'done';
  description: string;
  squad: string | null;
  repo?: string;
  site?: string;
  tech?: string[];
  tasks?: { backlog: number; in_progress: number; review: number; done: number; total: number };
}

const projectsData: Project[] = [
  { name: 'ClawHalla', slug: 'clawhalla', status: 'active', description: 'Enterprise AI Operating System — Docker + Mission Control + Agent hierarchy + Smart contracts on Base L2', squad: 'dev_squad', repo: 'https://github.com/deegalabs/clawhalla', site: 'https://clawhalla.xyz', tech: ['Next.js', 'TypeScript', 'SQLite', 'Solidity', 'wagmi', 'Tailwind'] },
  { name: 'Mission Control', slug: 'mission-control', status: 'active', description: 'Next.js dashboard for multi-agent orchestration — 17 pages, 27 API routes, real-time SSE', squad: 'dev_squad', tech: ['Next.js 15', 'Drizzle ORM', 'FTS5', 'SSE', 'AES-256'] },
  { name: 'Content Strategy', slug: 'content-strategy', status: 'active', description: 'LinkedIn + social media content pipeline — Mimir researches, Bragi creates, Loki analyzes', squad: 'clop_cabinet', tech: ['LinkedIn API', 'Playwright'] },
  { name: 'IPÊ City Outreach', slug: 'ipe-city-outreach', status: 'active', description: 'Community event Apr-May 2026, Jurerê Internacional — 1519 contacts, email campaign', squad: null, tech: ['Node.js', 'SMTP'] },
  { name: 'Safe City', slug: 'safe-city', status: 'paused', description: 'Anonymous community safety alert PWA for Florianópolis — privacy-first, no login required', squad: 'dev_squad', tech: ['PWA', 'React', 'Geolocation'] },
  { name: 'Cronos Shield', slug: 'cronos-shield', status: 'paused', description: 'AI-powered security ecosystem for Cronos chain — smart contract auditing + DeFi monitoring', squad: 'blockchain_squad', tech: ['Solidity', 'AI Agents'] },
  { name: 'DeegaLabs Webapp', slug: 'deegalabs-webapp', status: 'paused', description: 'Portfolio website for Deega Labs — company showcase and project gallery', squad: 'dev_squad', tech: ['Astro', 'Tailwind'] },
  { name: 'Shielded BTC', slug: 'shielded-btc', status: 'paused', description: 'BTC Collateral Protocol on StarkNet — privacy-preserving DeFi with ZK proofs', squad: 'blockchain_squad', tech: ['Cairo', 'StarkNet', 'ZK'] },
];

const statusStyles: Record<string, { bg: string; text: string; dot: string }> = {
  active: { bg: 'bg-green-500/20', text: 'text-green-400', dot: 'bg-green-500' },
  paused: { bg: 'bg-amber-500/20', text: 'text-amber-400', dot: 'bg-amber-500' },
  planning: { bg: 'bg-blue-500/20', text: 'text-blue-400', dot: 'bg-blue-500' },
  done: { bg: 'bg-gray-500/20', text: 'text-gray-400', dot: 'bg-gray-500' },
};

const squadColors: Record<string, string> = {
  dev_squad: 'border-l-blue-500',
  blockchain_squad: 'border-l-purple-500',
  clop_cabinet: 'border-l-green-500',
  product_squad: 'border-l-amber-500',
};

function formatSquad(s: string | null): string {
  if (!s) return 'Unassigned';
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ─── Git Panel ──────────────────────────────────────────────────
interface GitRepo { path: string; remote: string; branch: string; ahead: number; behind: number; dirty: boolean; changedFiles: string[]; commits: { hash: string; message: string }[]; }

function GitPanel() {
  const [repo, setRepo] = useState<GitRepo | null>(null);
  const [pushing, setPushing] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const fetch_ = useCallback(async () => {
    try { const r = await fetch('/api/git'); const d = await r.json(); if (d.ok) setRepo(d.repo); } catch {}
  }, []);

  useEffect(() => { fetch_(); }, [fetch_]);

  const push = async () => {
    setPushing(true); setResult(null);
    try { const r = await fetch('/api/git', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'push' }) }); const d = await r.json(); setResult(d.ok ? d.output : d.error); if (d.ok) fetch_(); } catch (e) { setResult(String(e)); }
    setPushing(false);
  };

  if (!repo) return null;
  const name = repo.remote.split('/').slice(-2).join('/').replace('.git', '');

  return (
    <div className="border-t border-[#1e1e21]">
      {/* Collapsible header */}
      <button onClick={() => setExpanded(!expanded)} className="w-full px-5 py-2.5 flex items-center justify-between hover:bg-[#0a0a0b]">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-500">{expanded ? '▼' : '▶'}</span>
          <span className="text-[10px] text-gray-400">⎇</span>
          <span className="text-[11px] font-medium text-gray-300">{name}</span>
          <span className="text-[10px] text-gray-600">({repo.branch})</span>
        </div>
        <div className="flex items-center gap-2">
          {repo.ahead > 0 && <span className="text-[9px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded">{repo.ahead} ahead</span>}
          {repo.ahead === 0 && <span className="text-[9px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded">✓</span>}
        </div>
      </button>
      {expanded && (
        <div className="border-t border-[#1e1e21]">
          <div className="px-5 py-2 flex gap-2">
            <button onClick={push} disabled={pushing || repo.ahead === 0} className="px-2.5 py-1 text-[10px] font-medium bg-amber-500 text-gray-900 rounded hover:bg-amber-400 disabled:opacity-40">{pushing ? 'Pushing...' : 'Push'}</button>
            <button onClick={fetch_} className="px-2.5 py-1 text-[10px] text-gray-500 bg-[#1a1a1d] rounded hover:text-gray-300">Refresh</button>
          </div>
          {result && <div className="px-5 py-1.5 text-[10px] text-gray-400 font-mono">{result}</div>}
          <div className="max-h-[180px] overflow-y-auto divide-y divide-[#1e1e21]">
            {repo.commits.slice(0, 8).map((c, i) => (
              <div key={c.hash} className="px-5 py-1.5 flex items-center gap-2 text-[11px] hover:bg-[#1a1a1d]">
                <code className="text-amber-500/60 font-mono w-14 shrink-0">{c.hash}</code>
                <span className={`flex-1 truncate ${i < repo.ahead ? 'text-gray-200' : 'text-gray-500'}`}>{c.message}</span>
                {i < repo.ahead && <span className="text-[9px] text-amber-500/40 shrink-0">unpushed</span>}
              </div>
            ))}
          </div>
          {repo.dirty && (
            <div className="px-5 py-2 bg-red-500/5 border-t border-[#1e1e21]">
              <div className="text-[10px] text-red-400 font-medium mb-0.5">Uncommitted:</div>
              {repo.changedFiles.map(f => <div key={f} className="text-[10px] text-gray-600 font-mono">{f}</div>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Project Detail Modal ────────────────────────────────────────
function ProjectDetail({ project, taskData, onClose }: { project: Project; taskData: Record<string, { backlog: number; in_progress: number; review: number; done: number; total: number }>; onClose: () => void }) {
  const status = statusStyles[project.status];
  const tasks = taskData[project.slug] || { backlog: 0, in_progress: 0, review: 0, done: 0, total: 0 };
  const progress = tasks.total > 0 ? Math.round((tasks.done / tasks.total) * 100) : 0;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-start justify-center z-50 pt-16 px-4" onClick={onClose}>
      <div className="bg-[#111113] rounded-xl border border-[#1e1e21] w-full max-w-xl overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#1e1e21]">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-100">{project.name}</h2>
            <div className="flex items-center gap-2">
              <span className={`text-[10px] px-2 py-0.5 rounded capitalize ${status.bg} ${status.text}`}>{project.status}</span>
              <button onClick={onClose} className="text-gray-500 hover:text-gray-300">×</button>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">{project.description}</p>
        </div>

        {/* Task stats */}
        <div className="px-5 py-3 border-b border-[#1e1e21]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-gray-500 uppercase">Progress</span>
            <span className="text-xs text-gray-400">{tasks.done}/{tasks.total} tasks ({progress}%)</span>
          </div>
          <div className="h-2 bg-[#1a1a1d] rounded-full overflow-hidden mb-3">
            <div className="h-full bg-amber-500 rounded-full" style={{ width: `${progress}%` }} />
          </div>
          <div className="grid grid-cols-4 gap-2">
            <div className="text-center px-2 py-1.5 bg-[#0a0a0b] rounded">
              <div className="text-sm font-bold text-gray-400">{tasks.backlog}</div>
              <div className="text-[9px] text-gray-600">Backlog</div>
            </div>
            <div className="text-center px-2 py-1.5 bg-[#0a0a0b] rounded">
              <div className="text-sm font-bold text-blue-400">{tasks.in_progress}</div>
              <div className="text-[9px] text-gray-600">Building</div>
            </div>
            <div className="text-center px-2 py-1.5 bg-[#0a0a0b] rounded">
              <div className="text-sm font-bold text-amber-400">{tasks.review}</div>
              <div className="text-[9px] text-gray-600">Review</div>
            </div>
            <div className="text-center px-2 py-1.5 bg-[#0a0a0b] rounded">
              <div className="text-sm font-bold text-green-400">{tasks.done}</div>
              <div className="text-[9px] text-gray-600">Done</div>
            </div>
          </div>
        </div>

        {/* Details */}
        <div className="px-5 py-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-gray-500 uppercase">Squad</span>
            <span className="text-xs text-gray-300">{formatSquad(project.squad)}</span>
          </div>
          {project.tech && (
            <div>
              <span className="text-[10px] text-gray-500 uppercase block mb-1.5">Tech Stack</span>
              <div className="flex flex-wrap gap-1.5">
                {project.tech.map(t => (
                  <span key={t} className="text-[10px] px-2 py-0.5 bg-[#1a1a1d] text-gray-400 rounded">{t}</span>
                ))}
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

        {/* Git Panel (inside project if has repo) */}
        {project.repo && <GitPanel />}

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[#1e1e21] flex justify-end">
          <button onClick={onClose} className="px-4 py-1.5 text-[11px] text-gray-400 bg-[#1a1a1d] rounded hover:text-gray-200">Close</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────
export default function ProjectsPage() {
  const [selected, setSelected] = useState<Project | null>(null);
  const [taskData, setTaskData] = useState<Record<string, { backlog: number; in_progress: number; review: number; done: number; total: number }>>({});
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [gitInfo, setGitInfo] = useState<{ ahead: number; behind: number; branch: string; dirty: boolean } | null>(null);
  const [gitAction, setGitAction] = useState<string | null>(null);

  const fetchGit = useCallback(async () => {
    try { const r = await fetch('/api/git'); const d = await r.json(); if (d.ok) setGitInfo({ ahead: d.repo.ahead, behind: d.repo.behind, branch: d.repo.branch, dirty: d.repo.dirty }); } catch {}
  }, []);

  const doGitAction = async (action: string) => {
    setGitAction(action);
    try { await fetch('/api/git', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) }); fetchGit(); } catch {}
    setGitAction(null);
  };

  useEffect(() => {
    fetchGit();
    fetch('/api/board/sync?project=clawhalla').then(r => r.json()).then(data => {
      const tasks = data.tasks || [];
      const counts = {
        backlog: tasks.filter((t: { status: string }) => t.status === 'backlog').length,
        in_progress: tasks.filter((t: { status: string }) => t.status === 'in_progress').length,
        review: tasks.filter((t: { status: string }) => t.status === 'review').length,
        done: tasks.filter((t: { status: string }) => t.status === 'done').length,
        total: tasks.length,
      };
      setTaskData({ clawhalla: counts, 'mission-control': counts });
    }).catch(() => {});
  }, [fetchGit]);

  const filtered = statusFilter === 'all' ? projectsData : projectsData.filter(p => p.status === statusFilter);
  const activeCount = projectsData.filter(p => p.status === 'active').length;
  const pausedCount = projectsData.filter(p => p.status === 'paused').length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-gray-200">Projects</h2>
          <div className="flex gap-1.5 text-[10px]">
            <span className="px-2 py-0.5 bg-[#1a1a1d] rounded text-gray-400">{projectsData.length} total</span>
            <span className="px-2 py-0.5 bg-green-500/10 rounded text-green-400">{activeCount} active</span>
            <span className="px-2 py-0.5 bg-amber-500/10 rounded text-amber-400">{pausedCount} paused</span>
          </div>
        </div>
        <div className="flex gap-0.5 bg-[#111113] rounded-lg p-0.5 border border-[#1e1e21]">
          {['all', 'active', 'paused'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-2.5 py-1 text-[11px] rounded capitalize ${statusFilter === s ? 'bg-[#1e1e21] text-gray-100' : 'text-gray-500 hover:text-gray-300'}`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Project Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map(project => {
          const status = statusStyles[project.status];
          const tasks = taskData[project.slug];
          const progress = tasks ? Math.round((tasks.done / tasks.total) * 100) : 0;
          const borderColor = project.squad ? squadColors[project.squad] : 'border-l-gray-600';

          return (
            <div key={project.slug} onClick={() => setSelected(project)}
              className={`bg-[#111113] rounded-lg p-4 border border-[#1e1e21] border-l-2 ${borderColor} hover:border-[#333] cursor-pointer group`}>
              <div className="flex items-start justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-100 group-hover:text-amber-400">{project.name}</h3>
                <span className={`text-[10px] px-1.5 py-0.5 rounded capitalize ${status.bg} ${status.text}`}>{project.status}</span>
              </div>
              <p className="text-[11px] text-gray-500 mb-3 line-clamp-2 leading-relaxed">{project.description}</p>

              {/* Progress */}
              {tasks && (
                <div className="mb-3">
                  <div className="flex justify-between text-[10px] mb-1">
                    <span className="text-gray-600">{tasks.done}/{tasks.total} tasks</span>
                    <span className="text-gray-500">{progress}%</span>
                  </div>
                  <div className="h-1 bg-[#1a1a1d] rounded-full overflow-hidden">
                    <div className="h-full bg-amber-500 rounded-full" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              )}

              {/* Tech tags */}
              {project.tech && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {project.tech.slice(0, 3).map(t => (
                    <span key={t} className="text-[9px] px-1.5 py-0.5 bg-[#0a0a0b] text-gray-600 rounded">{t}</span>
                  ))}
                  {project.tech.length > 3 && <span className="text-[9px] text-gray-700">+{project.tech.length - 3}</span>}
                </div>
              )}

              <div className="flex items-center justify-between pt-2 border-t border-[#1e1e21]">
                <span className="text-[10px] text-gray-600">{formatSquad(project.squad)}</span>
                {project.repo && gitInfo ? (
                  <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                    {gitInfo.dirty && <span className="text-[9px] text-red-400" title="Uncommitted changes">●</span>}
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
                    {gitInfo.ahead === 0 && gitInfo.behind === 0 && !gitInfo.dirty && (
                      <span className="text-[9px] text-green-500">✓ synced</span>
                    )}
                  </div>
                ) : project.repo ? (
                  <span className="text-[10px] text-gray-700">↗ repo</span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {/* Detail Modal */}
      {selected && <ProjectDetail project={selected} taskData={taskData} onClose={() => setSelected(null)} />}
    </div>
  );
}
