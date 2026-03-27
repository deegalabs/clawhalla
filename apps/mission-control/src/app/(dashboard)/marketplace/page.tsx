'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { autoTask } from '@/lib/tasks';

interface PackTemplate {
  name: string; version: string; description: string; author: string;
  squad: { id: string; name: string; domain: string };
  agents: { id: string; name: string; emoji: string; role: string }[];
  file: string;
}

const CATEGORIES = ['All', 'Development', 'Blockchain', 'Content', 'Operations', 'Analytics'];

function MarketplacePageInner() {
  const [packs, setPacks] = useState<PackTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState<string | null>(null);
  const [installResult, setInstallResult] = useState<{ name: string; ok: boolean; message: string } | null>(null);
  const [category, setCategory] = useState('All');
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/api/packs').then(r => r.json()).then(data => { if (data.ok) setPacks(data.packs); }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleInstall = async (pack: PackTemplate) => {
    setInstalling(pack.squad.id); setInstallResult(null);
    try {
      const res = await fetch('/api/packs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pack) });
      const data = await res.json();
      setInstallResult({ name: pack.name, ok: data.ok, message: data.ok ? `Installed ${data.created} agents (${data.skipped} skipped)` : data.error });
      if (data.ok) {
        autoTask.packInstalled(pack.name, pack.agents.length);
      }
    } catch (e) { setInstallResult({ name: pack.name, ok: false, message: String(e) }); }
    setInstalling(null);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] gap-3">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-gray-200">Squad Packs</h2>
          <span className="text-[10px] text-gray-600">{packs.length} packs available</span>
        </div>
      </div>

      {/* Search + Categories */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="relative flex-1 max-w-xs">
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search packs..."
            className="w-full px-3 py-1.5 pl-8 bg-[#111113] border border-[#1e1e21] rounded-lg text-[11px] text-gray-200 placeholder-gray-600 focus:outline-none focus:border-amber-500" />
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-600" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="7" cy="7" r="5" /><path d="M11 11l3 3" /></svg>
        </div>
        <div className="flex gap-1">
          {CATEGORIES.map(c => (
            <button key={c} onClick={() => setCategory(c)}
              className={`px-2.5 py-1 text-[10px] rounded-full border transition-colors ${category === c ? 'bg-[#1e1e21] border-[#333] text-gray-100' : 'border-[#1e1e21] text-gray-500 hover:text-gray-300'}`}>
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Install result */}
      {installResult && (
        <div className={`px-3 py-2 rounded-lg text-[11px] shrink-0 ${installResult.ok ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
          <span className="font-medium">{installResult.name}:</span> {installResult.message}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0 space-y-6">
        {/* Free Packs */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Available Packs</span>
            <span className="text-[9px] px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded">Open Source</span>
          </div>
          {loading ? (
            <div className="text-[11px] text-gray-600">Loading...</div>
          ) : packs.length === 0 ? (
            <div className="bg-[#111113] rounded-lg border border-[#1e1e21] p-6 text-center text-[11px] text-gray-600">No packs available</div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              {packs.filter(pack => {
                if (search && !pack.name.toLowerCase().includes(search.toLowerCase()) && !pack.description.toLowerCase().includes(search.toLowerCase())) return false;
                if (category !== 'All' && !pack.squad.domain.toLowerCase().includes(category.toLowerCase())) return false;
                return true;
              }).map(pack => (
                <div key={pack.squad.id} className={`bg-[#111113] rounded-xl border border-[#1e1e21] overflow-hidden hover:border-[#333] transition-colors`}>
                  {/* Pack header */}
                  <div className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-lg">📦</div>
                        <div>
                          <div className="text-[11px] font-semibold text-gray-200">{pack.name}</div>
                          <div className="text-[9px] text-gray-600">v{pack.version} • {pack.author}</div>
                        </div>
                      </div>
                      <span className="text-[9px] px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded border border-green-500/20">Free</span>
                    </div>
                    <p className="text-[10px] text-gray-400 mb-3 line-clamp-2">{pack.description}</p>
                    {/* Agents */}
                    <div className="flex flex-wrap gap-1 mb-3">
                      {pack.agents.map(a => (
                        <span key={a.id} className="text-[9px] px-1.5 py-0.5 bg-[#0a0a0b] border border-[#1e1e21] text-gray-400 rounded flex items-center gap-1">
                          <span>{a.emoji}</span>{a.name}
                        </span>
                      ))}
                    </div>
                    <button onClick={() => handleInstall(pack)} disabled={installing === pack.squad.id}
                      className="w-full py-1.5 text-[10px] font-medium bg-amber-500 text-gray-900 rounded-lg hover:bg-amber-400 disabled:opacity-40">
                      {installing === pack.squad.id ? 'Installing...' : `Install ${pack.agents.length} agents`}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Community */}
        <div className="bg-[#111113] rounded-xl border border-[#1e1e21] p-6 text-center">
          <div className="text-xl mb-2">🌐</div>
          <div className="text-xs font-medium text-gray-300">Community Packs</div>
          <p className="text-[10px] text-gray-600 mt-1 max-w-sm mx-auto">
            Create and share your own agent packs. Personas are .md files — value is in quality, ecosystem, and evolution speed.
          </p>
          <div className="flex gap-2 justify-center mt-3">
            <a href="https://github.com/deegalabs/clawhalla" target="_blank" rel="noopener noreferrer"
              className="px-3 py-1.5 text-[10px] bg-[#1a1a1d] text-gray-400 rounded border border-[#1e1e21] hover:text-gray-200">
              GitHub →
            </a>
            <a href="https://clawhalla.xyz" target="_blank" rel="noopener noreferrer"
              className="px-3 py-1.5 text-[10px] bg-[#1a1a1d] text-gray-400 rounded border border-[#1e1e21] hover:text-gray-200">
              Docs →
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export default dynamic(() => Promise.resolve(MarketplacePageInner), { ssr: false });
