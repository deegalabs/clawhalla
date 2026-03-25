'use client';

import { useState, useEffect, useCallback } from 'react';

const projects = [
  { name: "ClawHalla", status: "active", description: "Enterprise AI Operating System — Mission Control dashboard", progress: 30, squad: "dev_squad", updatedDaysAgo: 0 },
  { name: "Mission Control", status: "active", description: "Next.js dashboard for agent orchestration", progress: 35, squad: "dev_squad", updatedDaysAgo: 0 },
  { name: "Content Strategy", status: "active", description: "LinkedIn + social media content pipeline", progress: 60, squad: "clop_cabinet", updatedDaysAgo: 1 },
  { name: "IPÊ City Outreach", status: "active", description: "Community event Apr-May 2026 Jurerê Internacional", progress: 15, squad: null, updatedDaysAgo: 2 },
  { name: "Safe City", status: "active", description: "Anonymous community safety alert PWA for Florianópolis", progress: 45, squad: "dev_squad", updatedDaysAgo: 5 },
  { name: "Cronos Shield", status: "paused", description: "AI-powered security ecosystem for Cronos chain", progress: 80, squad: "blockchain_squad", updatedDaysAgo: 14 },
  { name: "DeegaLabs Webapp", status: "paused", description: "Portfolio website for DeegaLabs", progress: 90, squad: "dev_squad", updatedDaysAgo: 10 },
  { name: "Shielded BTC", status: "paused", description: "BTC Collateral Protocol on StarkNet", progress: 70, squad: "blockchain_squad", updatedDaysAgo: 21 },
];

const statusStyles: Record<string, { bg: string; text: string }> = {
  active: { bg: 'bg-green-500/20', text: 'text-green-400' },
  paused: { bg: 'bg-amber-500/20', text: 'text-amber-400' },
  planning: { bg: 'bg-blue-500/20', text: 'text-blue-400' },
};

const squadStyles: Record<string, { bg: string; text: string; progress: string }> = {
  dev_squad: { bg: 'bg-blue-500/20', text: 'text-blue-400', progress: 'bg-blue-500' },
  blockchain_squad: { bg: 'bg-purple-500/20', text: 'text-purple-400', progress: 'bg-purple-500' },
  clop_cabinet: { bg: 'bg-green-500/20', text: 'text-green-400', progress: 'bg-green-500' },
  product_squad: { bg: 'bg-amber-500/20', text: 'text-amber-400', progress: 'bg-amber-500' },
};

const defaultSquadStyle = { bg: 'bg-gray-500/20', text: 'text-gray-400', progress: 'bg-gray-500' };

function formatSquadName(squad: string | null): string {
  if (!squad) return 'Unassigned';
  return squad.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
}

interface GitRepo {
  path: string;
  remote: string;
  branch: string;
  ahead: number;
  behind: number;
  dirty: boolean;
  changedFiles: string[];
  commits: { hash: string; message: string }[];
  lastCommitDate: string;
}

function GitPanel() {
  const [repo, setRepo] = useState<GitRepo | null>(null);
  const [loading, setLoading] = useState(true);
  const [pushing, setPushing] = useState(false);
  const [pushResult, setPushResult] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/git');
      const data = await res.json();
      if (data.ok) setRepo(data.repo);
    } catch {
      // Silent
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const handlePush = async () => {
    setPushing(true);
    setPushResult(null);
    try {
      const res = await fetch('/api/git', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'push' }),
      });
      const data = await res.json();
      setPushResult(data.ok ? data.output : data.error);
      if (data.ok) fetchStatus();
    } catch (e) {
      setPushResult(e instanceof Error ? e.message : 'Push failed');
    }
    setPushing(false);
  };

  if (loading) return <div className="text-gray-500 text-sm">Loading repo status...</div>;
  if (!repo) return <div className="text-gray-500 text-sm">Git repo not available</div>;

  const repoName = repo.remote.split('/').slice(-2).join('/').replace('.git', '');

  return (
    <div className="bg-[#111113] rounded-lg border border-[#1e1e21] overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-[#1e1e21] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-400">
            <circle cx="4" cy="4" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="12" cy="4" r="2" />
            <path d="M4 6v4c0 1.1.9 2 2 2h4" />
            <path d="M12 6v0" />
          </svg>
          <div>
            <span className="text-sm font-medium text-gray-200">{repoName}</span>
            <span className="text-xs text-gray-600 ml-2">({repo.branch})</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {repo.ahead > 0 && (
            <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded">
              {repo.ahead} ahead
            </span>
          )}
          {repo.behind > 0 && (
            <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded">
              {repo.behind} behind
            </span>
          )}
          {repo.ahead === 0 && repo.behind === 0 && (
            <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded">
              Up to date
            </span>
          )}
          <button
            onClick={handlePush}
            disabled={pushing || repo.ahead === 0}
            className="px-3 py-1.5 text-xs font-medium bg-amber-500 text-gray-900 rounded hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {pushing ? 'Pushing...' : 'Push'}
          </button>
          <button
            onClick={fetchStatus}
            className="px-3 py-1.5 text-xs text-gray-400 bg-[#1a1a1d] rounded border border-[#1e1e21] hover:text-gray-200"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Push result */}
      {pushResult && (
        <div className="px-5 py-2 bg-[#0a0a0b] border-b border-[#1e1e21]">
          <pre className="text-xs text-gray-400 font-mono whitespace-pre-wrap">{pushResult}</pre>
        </div>
      )}

      {/* Recent commits */}
      <div className="divide-y divide-[#1e1e21]">
        {repo.commits.slice(0, 8).map((commit, i) => (
          <div key={commit.hash} className="px-5 py-2.5 flex items-center gap-3 hover:bg-[#1a1a1d]">
            <code className="text-xs text-amber-500/70 font-mono w-16 shrink-0">{commit.hash}</code>
            <span className={`text-sm ${i < repo.ahead ? 'text-gray-200' : 'text-gray-500'}`}>
              {commit.message}
            </span>
            {i < repo.ahead && (
              <span className="text-[10px] text-amber-500/50 ml-auto shrink-0">unpushed</span>
            )}
          </div>
        ))}
      </div>

      {/* Dirty files */}
      {repo.dirty && (
        <div className="px-5 py-3 border-t border-[#1e1e21] bg-red-500/5">
          <div className="text-xs text-red-400 font-medium mb-1">Uncommitted changes:</div>
          {repo.changedFiles.map(f => (
            <div key={f} className="text-xs text-gray-500 font-mono">{f}</div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ProjectsPage() {
  const activeCount = projects.filter(p => p.status === 'active').length;
  const pausedCount = projects.filter(p => p.status === 'paused').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <h2 className="text-2xl font-bold text-gray-100">Projects</h2>
        <div className="flex gap-2 text-sm">
          <span className="px-2 py-1 bg-gray-800 rounded text-gray-400">
            {projects.length} total
          </span>
          <span className="px-2 py-1 bg-green-500/20 rounded text-green-400">
            {activeCount} active
          </span>
          <span className="px-2 py-1 bg-amber-500/20 rounded text-amber-400">
            {pausedCount} paused
          </span>
        </div>
      </div>

      {/* Git Panel */}
      <GitPanel />

      {/* Project Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {projects.map(project => {
          const status = statusStyles[project.status] || statusStyles.planning;
          const squad = project.squad ? squadStyles[project.squad] : defaultSquadStyle;

          return (
            <div
              key={project.name}
              className="bg-gray-900 rounded-lg p-5 border border-gray-800 hover:border-gray-700 transition-colors"
            >
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-semibold text-gray-100">{project.name}</h3>
                <span className={`px-2 py-0.5 text-xs rounded ${status.bg} ${status.text} capitalize`}>
                  {project.status}
                </span>
              </div>
              <p className="text-sm text-gray-400 mb-4 line-clamp-2">
                {project.description}
              </p>
              <div className="mb-3">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-500">Progress</span>
                  <span className="text-gray-400">{project.progress}%</span>
                </div>
                <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${squad.progress} rounded-full transition-all`}
                    style={{ width: `${project.progress}%` }}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between pt-3 border-t border-gray-800">
                <span className={`px-2 py-0.5 text-xs rounded ${squad.bg} ${squad.text}`}>
                  {formatSquadName(project.squad)}
                </span>
                <span className="text-xs text-gray-500">
                  {project.updatedDaysAgo === 0
                    ? 'Updated today'
                    : `Updated ${project.updatedDaysAgo}d ago`}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
