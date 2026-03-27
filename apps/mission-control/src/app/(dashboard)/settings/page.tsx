'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { autoTask } from '@/lib/tasks';

type SettingsTab = 'general' | 'connection' | 'database' | 'vault' | 'gateway' | 'about';

interface SecretEntry {
  id: string; name: string; description: string | null; category: string;
  createdBy: string; createdAt: string; updatedAt: string; lastAccessedAt: string | null;
}

interface GatewayInfo {
  status: string; sessions: number; crons: number; uptime?: string;
}

const categoryLabels: Record<string, { label: string; color: string; icon: string }> = {
  api_key: { label: 'API Key', color: 'bg-blue-500/20 text-blue-400', icon: '🔑' },
  token: { label: 'Token', color: 'bg-amber-500/20 text-amber-400', icon: '🎟️' },
  password: { label: 'Password', color: 'bg-red-500/20 text-red-400', icon: '🔒' },
  certificate: { label: 'Certificate', color: 'bg-green-500/20 text-green-400', icon: '📜' },
  other: { label: 'Other', color: 'bg-gray-500/20 text-gray-400', icon: '📎' },
};

function daysAgo(dateStr: string): string {
  const d = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (d === 0) return 'Today';
  if (d === 1) return 'Yesterday';
  return `${d}d ago`;
}

function SettingsPageInner() {
  const [tab, setTab] = useState<SettingsTab>('general');
  // Vault state
  const [secrets, setSecrets] = useState<SecretEntry[]>([]);
  const [loadingVault, setLoadingVault] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', value: '', description: '', category: 'api_key' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [revealedValues, setRevealedValues] = useState<Record<string, string>>({});
  const [deletingName, setDeletingName] = useState<string | null>(null);
  // Gateway state
  const [gateway, setGateway] = useState<GatewayInfo | null>(null);
  // General state
  const [defaultModel, setDefaultModel] = useState('claude-sonnet-4-6');
  const [workspace, setWorkspace] = useState('/home/clawdbot/.openclaw/workspace');
  // Connection state
  const [conn, setConn] = useState({
    mode: 'local' as 'local' | 'ssh' | 'cloud',
    gatewayUrl: 'ws://127.0.0.1:18789',
    gatewayToken: '',
    sshHost: '',
    sshPort: '22',
    sshUser: 'clawdbot',
    sshKey: '~/.ssh/id_rsa',
    cloudUrl: '',
    cloudApiKey: '',
    tailscale: false,
  });
  // Database state
  const [dbConfig, setDbConfig] = useState({
    mode: 'local' as 'local' | 'cloud',
    localPath: './data/mission-control.db',
    walMode: true,
    cloudProvider: 'turso' as 'turso' | 'planetscale' | 'supabase' | 'neon',
    cloudUrl: '',
    cloudToken: '',
    syncInterval: '30',
  });

  const fetchSecrets = useCallback(async () => {
    try { const r = await fetch('/api/vault'); const d = await r.json(); if (d.ok) setSecrets(d.secrets); } catch (err) { console.error('[settings] vault fetch error:', err); }
    setLoadingVault(false);
  }, []);

  const fetchGateway = useCallback(async () => {
    try {
      const [hRes, sRes, cRes] = await Promise.all([fetch('/api/health'), fetch('/api/gateway/sessions'), fetch('/api/crons')]);
      const [h, s, c] = await Promise.all([hRes.json(), sRes.json(), cRes.json()]);
      setGateway({
        status: h.status === 'ok' ? 'online' : 'offline',
        sessions: s.ok ? (Array.isArray(s.sessions) ? s.sessions.length : s.sessions?.sessions?.length || 0) : 0,
        crons: c.ok ? c.crons?.length || 0 : 0,
      });
    } catch { setGateway({ status: 'offline', sessions: 0, crons: 0 }); }
  }, []);

  useEffect(() => { fetchSecrets(); fetchGateway(); }, [fetchSecrets, fetchGateway]);

  // Vault handlers
  const handleSave = async () => {
    if (!form.name || !form.value) { setError('Name and value are required'); return; }
    setSaving(true); setError('');
    try {
      const r = await fetch('/api/vault', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const d = await r.json();
      if (d.ok) { autoTask.secretAdded(form.name); setForm({ name: '', value: '', description: '', category: 'api_key' }); setShowAdd(false); fetchSecrets(); }
      else setError(d.error || 'Failed');
    } catch { setError('Failed'); }
    setSaving(false);
  };

  const handleReveal = async (name: string) => {
    if (revealedValues[name]) { setRevealedValues(p => { const n = { ...p }; delete n[name]; return n; }); return; }
    try { const r = await fetch('/api/vault/reveal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, full: false }) });
      const d = await r.json(); if (d.ok) setRevealedValues(p => ({ ...p, [name]: d.value }));
    } catch { /**/ }
  };

  const handleDelete = async (name: string) => {
    try { const r = await fetch(`/api/vault?name=${encodeURIComponent(name)}`, { method: 'DELETE' });
      const d = await r.json(); if (d.ok) { setDeletingName(null); fetchSecrets(); }
    } catch { /**/ }
  };

  // Connection settings save
  const [connSaving, setConnSaving] = useState(false);
  const [connMsg, setConnMsg] = useState('');
  const handleSaveConnection = async () => {
    setConnSaving(true); setConnMsg('');
    try {
      await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'connection_mode', value: conn.mode }) });
      await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'gateway_url', value: conn.gatewayUrl }) });
      if (conn.mode === 'ssh') {
        await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'ssh_config', value: JSON.stringify({ host: conn.sshHost, port: conn.sshPort, user: conn.sshUser, key: conn.sshKey }) }) });
      }
      setConnMsg('Saved!');
      setTimeout(() => setConnMsg(''), 2000);
    } catch { setConnMsg('Failed to save'); }
    setConnSaving(false);
  };

  // Database settings save
  const [dbSaving, setDbSaving] = useState(false);
  const [dbMsg, setDbMsg] = useState('');
  const handleSaveDatabase = async () => {
    setDbSaving(true); setDbMsg('');
    try {
      await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'db_config', value: JSON.stringify(dbConfig) }) });
      setDbMsg('Saved!');
      setTimeout(() => setDbMsg(''), 2000);
    } catch { setDbMsg('Failed to save'); }
    setDbSaving(false);
  };

  // Reset state
  const [resetConfirm, setResetConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetMsg, setResetMsg] = useState('');

  // Maintenance handlers
  const [maintMsg, setMaintMsg] = useState('');
  const handleReindex = async () => {
    setMaintMsg('Reindexing...');
    try {
      await fetch('/api/search', { method: 'POST' });
      setMaintMsg('Search index rebuilt!');
    } catch { setMaintMsg('Reindex failed'); }
    setTimeout(() => setMaintMsg(''), 3000);
  };

  const handleExportDb = async () => {
    setMaintMsg('Exporting...');
    try {
      const res = await fetch('/api/terminal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command: `cp ./data/mission-control.db /tmp/mc-export-${Date.now()}.db && echo "Exported to /tmp/"` }) });
      const d = await res.json();
      setMaintMsg(d.ok ? `Exported: ${d.output?.trim()}` : 'Export failed');
    } catch { setMaintMsg('Export failed'); }
    setTimeout(() => setMaintMsg(''), 5000);
  };

  // Gateway handlers
  const [gwMsg, setGwMsg] = useState('');
  const handleRestartGateway = async () => {
    setGwMsg('Restarting...');
    try {
      const res = await fetch('/api/terminal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command: 'kill $(ps aux | grep openclaw-gateway | grep -v grep | awk \'{print $2}\') 2>/dev/null; nohup openclaw gateway > /tmp/openclaw-gateway.log 2>&1 & echo "Gateway restarted"' }) });
      const d = await res.json();
      setGwMsg(d.ok ? 'Gateway restarted' : 'Restart failed');
      setTimeout(() => fetchGateway(), 2000);
    } catch { setGwMsg('Restart failed'); }
    setTimeout(() => setGwMsg(''), 3000);
  };

  const handleViewLogs = async () => {
    setGwMsg('Loading logs...');
    try {
      const today = new Date().toISOString().split('T')[0];
      const res = await fetch('/api/terminal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command: `tail -50 /tmp/openclaw/openclaw-${today}.log 2>/dev/null || tail -50 /tmp/openclaw-gateway.log 2>/dev/null || echo "No log files found"` }) });
      const d = await res.json();
      setGwMsg(d.ok && d.output ? d.output.slice(0, 500) : 'No logs available');
    } catch { setGwMsg('Failed to load logs'); }
    setTimeout(() => setGwMsg(''), 10000);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] gap-3">
      {/* Header */}
      <div className="flex items-center gap-3 shrink-0">
        <h2 className="text-sm font-semibold text-gray-200">Settings</h2>
        <div className="flex gap-0.5 bg-[#111113] rounded-lg p-0.5 border border-[#1e1e21]">
          {(['general', 'connection', 'database', 'vault', 'gateway', 'about'] as SettingsTab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-2.5 py-1 text-[11px] rounded capitalize ${tab === t ? 'bg-[#1e1e21] text-gray-100' : 'text-gray-500 hover:text-gray-300'}`}>
              {t === 'general' ? '⚙️ General' : t === 'connection' ? '🔌 Connection' : t === 'database' ? '💾 Database' : t === 'vault' ? '🔒 Vault' : t === 'gateway' ? '🌐 Gateway' : 'ℹ️ About'}
              {t === 'vault' && secrets.length > 0 ? ` (${secrets.length})` : ''}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {/* GENERAL TAB */}
        {tab === 'general' && (
          <div className="max-w-2xl space-y-4">
            {/* Workspace */}
            <div className="bg-[#111113] rounded-lg border border-[#1e1e21] p-4">
              <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-3 font-medium">Workspace</div>
              <div className="space-y-3">
                <div>
                  <label className="block text-[9px] text-gray-600 mb-0.5">Workspace Path</label>
                  <input type="text" value={workspace} onChange={e => setWorkspace(e.target.value)}
                    className="w-full px-3 py-1.5 bg-[#0a0a0b] border border-[#1e1e21] rounded text-[11px] text-gray-200 font-mono focus:outline-none focus:border-amber-500" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[9px] text-gray-600 mb-0.5">Default Model</label>
                    <select value={defaultModel} onChange={e => setDefaultModel(e.target.value)}
                      className="w-full px-3 py-1.5 bg-[#0a0a0b] border border-[#1e1e21] rounded text-[11px] text-gray-200 focus:outline-none">
                      <option value="claude-opus-4-6">Opus 4.6 (max reasoning)</option>
                      <option value="claude-sonnet-4-6">Sonnet 4.6 (balanced)</option>
                      <option value="claude-sonnet-4-5">Sonnet 4.5 (fast)</option>
                      <option value="claude-haiku-4-5">Haiku 4.5 (lightweight)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[9px] text-gray-600 mb-0.5">Gateway URL</label>
                    <input type="text" value="ws://127.0.0.1:18789" readOnly
                      className="w-full px-3 py-1.5 bg-[#0a0a0b] border border-[#1e1e21] rounded text-[11px] text-gray-500 font-mono" />
                  </div>
                </div>
              </div>
            </div>

            {/* Appearance */}
            <div className="bg-[#111113] rounded-lg border border-[#1e1e21] p-4">
              <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-3 font-medium">Appearance</div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'dark', label: 'Dark', active: true, colors: 'bg-[#0a0a0b] border-amber-500/40' },
                  { id: 'midnight', label: 'Midnight', active: false, colors: 'bg-[#0a0a1a] border-[#1e1e21]' },
                  { id: 'light', label: 'Light', active: false, colors: 'bg-gray-100 border-[#1e1e21]' },
                ].map(theme => (
                  <button key={theme.id} className={`p-3 rounded-lg border text-center ${theme.colors} ${theme.id !== 'dark' ? 'opacity-40 cursor-not-allowed' : ''}`}>
                    <div className={`w-full h-8 rounded mb-1.5 ${theme.colors}`} />
                    <div className="text-[10px] text-gray-400">{theme.label}</div>
                    {theme.active && <div className="text-[8px] text-amber-400">Active</div>}
                    {!theme.active && <div className="text-[8px] text-gray-600">Soon</div>}
                  </button>
                ))}
              </div>
            </div>

            {/* Notifications */}
            <div className="bg-[#111113] rounded-lg border border-[#1e1e21] p-4">
              <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-3 font-medium">Notifications</div>
              <div className="space-y-2">
                {[
                  { label: 'Agent completes task', desc: 'Notify when an agent finishes work', on: true },
                  { label: 'Approval required', desc: 'Notify when human approval is needed', on: true },
                  { label: 'Agent stuck / error', desc: 'Alert when an agent encounters issues', on: true },
                  { label: 'Autopilot runs', desc: 'Notify after autonomous runs', on: false },
                ].map(n => (
                  <div key={n.label} className="flex items-center justify-between py-1.5">
                    <div>
                      <div className="text-[11px] text-gray-300">{n.label}</div>
                      <div className="text-[9px] text-gray-600">{n.desc}</div>
                    </div>
                    <div className={`w-8 h-4 rounded-full relative cursor-pointer ${n.on ? 'bg-amber-500' : 'bg-[#2a2a2d]'}`}>
                      <div className={`absolute w-3 h-3 rounded-full bg-white top-0.5 transition-all ${n.on ? 'left-4.5' : 'left-0.5'}`}
                        style={{ left: n.on ? '17px' : '2px' }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Danger Zone */}
            <div className="bg-[#111113] rounded-lg border border-red-500/20 p-4">
              <div className="text-[10px] text-red-400 uppercase tracking-wider mb-3 font-medium">Danger Zone</div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[11px] text-gray-300">Reset Everything</div>
                    <div className="text-[9px] text-gray-600">Delete all data and restart onboarding from scratch</div>
                  </div>
                  {!resetConfirm ? (
                    <button onClick={() => setResetConfirm(true)}
                      className="px-3 py-1.5 text-[10px] font-medium text-red-400 bg-red-500/10 rounded border border-red-500/20 hover:bg-red-500/20">
                      Reset
                    </button>
                  ) : (
                    <div className="flex gap-2">
                      <button onClick={() => setResetConfirm(false)}
                        className="px-3 py-1.5 text-[10px] font-medium text-gray-400 bg-[#1a1a1d] rounded border border-[#1e1e21]">
                        Cancel
                      </button>
                      <button
                        disabled={resetting}
                        onClick={async () => {
                          setResetting(true);
                          setResetMsg('');
                          try {
                            const res = await fetch('/api/reset', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ confirm: 'RESET' }),
                            });
                            const data = await res.json();
                            if (data.ok) {
                              setResetMsg('Reset complete. Redirecting to onboarding...');
                              setTimeout(() => { window.location.href = '/onboarding'; }, 1500);
                            } else {
                              setResetMsg(data.error || 'Reset failed');
                            }
                          } catch {
                            setResetMsg('Reset failed');
                          }
                          setResetting(false);
                          setResetConfirm(false);
                        }}
                        className="px-3 py-1.5 text-[10px] font-medium text-white bg-red-600 rounded border border-red-500 hover:bg-red-500 disabled:opacity-40">
                        {resetting ? 'Resetting...' : 'Confirm Reset'}
                      </button>
                    </div>
                  )}
                </div>
                {resetMsg && <div className={`text-[10px] ${resetMsg.includes('complete') ? 'text-green-400' : 'text-red-400'}`}>{resetMsg}</div>}
              </div>
            </div>
          </div>
        )}

        {/* CONNECTION TAB */}
        {tab === 'connection' && (
          <div className="max-w-2xl space-y-4">
            {/* Mode selector */}
            <div className="bg-[#111113] rounded-lg border border-[#1e1e21] p-4">
              <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-3 font-medium">Access Mode</div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'local' as const, label: 'Local', desc: 'Gateway on this machine', icon: '🖥️', active: true },
                  { id: 'ssh' as const, label: 'SSH Remote', desc: 'Connect via SSH tunnel', icon: '🔐', active: true },
                  { id: 'cloud' as const, label: 'Cloud', desc: 'ClawHalla Cloud (SaaS)', icon: '☁️', active: false },
                ].map(mode => (
                  <button key={mode.id} onClick={() => mode.active && setConn({ ...conn, mode: mode.id })}
                    className={`p-3 rounded-lg border text-left transition-colors ${
                      conn.mode === mode.id ? 'border-amber-500/40 bg-amber-500/5' :
                      mode.active ? 'border-[#1e1e21] bg-[#0a0a0b] hover:border-[#333]' :
                      'border-[#1e1e21] bg-[#0a0a0b] opacity-40 cursor-not-allowed'
                    }`}>
                    <div className="text-lg mb-1">{mode.icon}</div>
                    <div className="text-[11px] font-medium text-gray-200">{mode.label}</div>
                    <div className="text-[9px] text-gray-600">{mode.desc}</div>
                    {!mode.active && <div className="text-[8px] text-amber-400 mt-1">Coming Soon</div>}
                  </button>
                ))}
              </div>
            </div>

            {/* Local config */}
            {conn.mode === 'local' && (
              <div className="bg-[#111113] rounded-lg border border-[#1e1e21] p-4">
                <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-3 font-medium">Local Gateway</div>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[9px] text-gray-600 mb-0.5">Gateway URI</label>
                      <input type="text" value={conn.gatewayUrl} onChange={e => setConn({ ...conn, gatewayUrl: e.target.value })}
                        className="w-full px-2.5 py-1.5 bg-[#0a0a0b] border border-[#1e1e21] rounded text-[11px] text-gray-200 font-mono focus:outline-none focus:border-amber-500" />
                    </div>
                    <div>
                      <label className="block text-[9px] text-gray-600 mb-0.5">Auth Token</label>
                      <input type="password" value={conn.gatewayToken} onChange={e => setConn({ ...conn, gatewayToken: e.target.value })}
                        placeholder="From openclaw.json → gateway.auth.token"
                        className="w-full px-2.5 py-1.5 bg-[#0a0a0b] border border-[#1e1e21] rounded text-[11px] text-gray-200 font-mono focus:outline-none focus:border-amber-500" />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 py-1.5">
                    <div className={`w-8 h-4 rounded-full relative cursor-pointer ${conn.tailscale ? 'bg-amber-500' : 'bg-[#2a2a2d]'}`}
                      onClick={() => setConn({ ...conn, tailscale: !conn.tailscale })}>
                      <div className="absolute w-3 h-3 rounded-full bg-white top-0.5 transition-all" style={{ left: conn.tailscale ? '17px' : '2px' }} />
                    </div>
                    <div>
                      <div className="text-[11px] text-gray-300">Tailscale</div>
                      <div className="text-[9px] text-gray-600">Enable Tailscale mesh networking for remote access</div>
                    </div>
                  </div>
                  <div className="bg-[#0a0a0b] rounded p-2.5 border border-[#1e1e21]">
                    <div className="text-[9px] text-gray-600 mb-1">Config file</div>
                    <div className="text-[10px] text-gray-400 font-mono">~/.openclaw/openclaw.json</div>
                  </div>
                </div>
              </div>
            )}

            {/* SSH config */}
            {conn.mode === 'ssh' && (
              <div className="bg-[#111113] rounded-lg border border-[#1e1e21] p-4">
                <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-3 font-medium">SSH Connection</div>
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <label className="block text-[9px] text-gray-600 mb-0.5">Host</label>
                      <input type="text" value={conn.sshHost} onChange={e => setConn({ ...conn, sshHost: e.target.value })}
                        placeholder="192.168.1.100 or server.example.com"
                        className="w-full px-2.5 py-1.5 bg-[#0a0a0b] border border-[#1e1e21] rounded text-[11px] text-gray-200 font-mono focus:outline-none focus:border-amber-500" />
                    </div>
                    <div>
                      <label className="block text-[9px] text-gray-600 mb-0.5">Port</label>
                      <input type="text" value={conn.sshPort} onChange={e => setConn({ ...conn, sshPort: e.target.value })}
                        className="w-full px-2.5 py-1.5 bg-[#0a0a0b] border border-[#1e1e21] rounded text-[11px] text-gray-200 font-mono focus:outline-none focus:border-amber-500" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[9px] text-gray-600 mb-0.5">User</label>
                      <input type="text" value={conn.sshUser} onChange={e => setConn({ ...conn, sshUser: e.target.value })}
                        className="w-full px-2.5 py-1.5 bg-[#0a0a0b] border border-[#1e1e21] rounded text-[11px] text-gray-200 font-mono focus:outline-none focus:border-amber-500" />
                    </div>
                    <div>
                      <label className="block text-[9px] text-gray-600 mb-0.5">SSH Key Path</label>
                      <input type="text" value={conn.sshKey} onChange={e => setConn({ ...conn, sshKey: e.target.value })}
                        className="w-full px-2.5 py-1.5 bg-[#0a0a0b] border border-[#1e1e21] rounded text-[11px] text-gray-200 font-mono focus:outline-none focus:border-amber-500" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[9px] text-gray-600 mb-0.5">Gateway URI (remote)</label>
                    <input type="text" value={conn.gatewayUrl} onChange={e => setConn({ ...conn, gatewayUrl: e.target.value })}
                      placeholder="ws://127.0.0.1:18789 (tunneled)"
                      className="w-full px-2.5 py-1.5 bg-[#0a0a0b] border border-[#1e1e21] rounded text-[11px] text-gray-200 font-mono focus:outline-none focus:border-amber-500" />
                  </div>
                  <div className="bg-[#0a0a0b] rounded p-2.5 border border-[#1e1e21]">
                    <div className="text-[9px] text-gray-600 mb-1">SSH command preview</div>
                    <div className="text-[10px] text-amber-400 font-mono">
                      ssh -L 18789:localhost:18789 {conn.sshUser}@{conn.sshHost || '<host>'} -p {conn.sshPort} -i {conn.sshKey}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Auth profiles */}
            <div className="bg-[#111113] rounded-lg border border-[#1e1e21] p-4">
              <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-3 font-medium">Auth Profiles</div>
              <div className="space-y-1.5">
                {[
                  { name: 'anthropic:manual', provider: 'Anthropic', mode: 'OAuth Token', active: true, icon: '🤖' },
                  { name: 'google:default', provider: 'Google', mode: 'API Key', active: false, icon: '🔍' },
                ].map(p => (
                  <div key={p.name} className={`flex items-center gap-3 p-2.5 rounded-lg border ${p.active ? 'border-green-500/20 bg-green-500/5' : 'border-[#1e1e21] bg-[#0a0a0b]'}`}>
                    <span className="text-sm">{p.icon}</span>
                    <div className="flex-1">
                      <div className="text-[11px] text-gray-200 font-mono">{p.name}</div>
                      <div className="text-[9px] text-gray-600">{p.provider} • {p.mode}</div>
                    </div>
                    {p.active && <span className="text-[9px] px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded">Active</span>}
                  </div>
                ))}
              </div>
            </div>

            {/* Save */}
            <div className="flex items-center gap-3">
              <button onClick={handleSaveConnection} disabled={connSaving}
                className="px-4 py-1.5 text-[10px] font-medium bg-amber-500 text-gray-900 rounded hover:bg-amber-400 disabled:opacity-40">
                {connSaving ? 'Saving...' : 'Save Connection Settings'}
              </button>
              {connMsg && <span className={`text-[10px] ${connMsg === 'Saved!' ? 'text-green-400' : 'text-red-400'}`}>{connMsg}</span>}
            </div>
          </div>
        )}

        {/* DATABASE TAB */}
        {tab === 'database' && (
          <div className="max-w-2xl space-y-4">
            {/* Mode */}
            <div className="bg-[#111113] rounded-lg border border-[#1e1e21] p-4">
              <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-3 font-medium">Storage Mode</div>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setDbConfig({ ...dbConfig, mode: 'local' })}
                  className={`p-4 rounded-lg border text-left transition-colors ${dbConfig.mode === 'local' ? 'border-amber-500/40 bg-amber-500/5' : 'border-[#1e1e21] bg-[#0a0a0b] hover:border-[#333]'}`}>
                  <div className="text-lg mb-1">🖥️</div>
                  <div className="text-[11px] font-medium text-gray-200">Local SQLite</div>
                  <div className="text-[9px] text-gray-600 mt-0.5">Fast, zero-config, WAL mode. Data stays on your machine.</div>
                  <div className="flex gap-1 mt-2">
                    <span className="text-[8px] px-1 py-0.5 bg-green-500/20 text-green-400 rounded">Recommended</span>
                    <span className="text-[8px] px-1 py-0.5 bg-blue-500/20 text-blue-400 rounded">Current</span>
                  </div>
                </button>
                <button onClick={() => setDbConfig({ ...dbConfig, mode: 'cloud' })}
                  className={`p-4 rounded-lg border text-left transition-colors ${dbConfig.mode === 'cloud' ? 'border-amber-500/40 bg-amber-500/5' : 'border-[#1e1e21] bg-[#0a0a0b] hover:border-[#333]'}`}>
                  <div className="text-lg mb-1">☁️</div>
                  <div className="text-[11px] font-medium text-gray-200">Cloud Database</div>
                  <div className="text-[9px] text-gray-600 mt-0.5">Multi-device sync, backups, team access. Requires provider.</div>
                  <div className="flex gap-1 mt-2">
                    <span className="text-[8px] px-1 py-0.5 bg-amber-500/20 text-amber-400 rounded">Beta</span>
                  </div>
                </button>
              </div>
            </div>

            {/* Local config */}
            {dbConfig.mode === 'local' && (
              <div className="bg-[#111113] rounded-lg border border-[#1e1e21] p-4">
                <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-3 font-medium">SQLite Configuration</div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-[9px] text-gray-600 mb-0.5">Database Path</label>
                    <input type="text" value={dbConfig.localPath} onChange={e => setDbConfig({ ...dbConfig, localPath: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-[#0a0a0b] border border-[#1e1e21] rounded text-[11px] text-gray-200 font-mono focus:outline-none focus:border-amber-500" />
                  </div>
                  <div className="flex items-center gap-2 py-1">
                    <div className={`w-8 h-4 rounded-full relative cursor-pointer ${dbConfig.walMode ? 'bg-amber-500' : 'bg-[#2a2a2d]'}`}
                      onClick={() => setDbConfig({ ...dbConfig, walMode: !dbConfig.walMode })}>
                      <div className="absolute w-3 h-3 rounded-full bg-white top-0.5 transition-all" style={{ left: dbConfig.walMode ? '17px' : '2px' }} />
                    </div>
                    <div>
                      <div className="text-[11px] text-gray-300">WAL Mode</div>
                      <div className="text-[9px] text-gray-600">Write-Ahead Logging for better concurrent access</div>
                    </div>
                  </div>
                  {/* DB stats */}
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: 'Engine', value: 'SQLite + Drizzle' },
                      { label: 'Schema', value: '11 tables' },
                      { label: 'Search', value: 'FTS5 (porter)' },
                    ].map(s => (
                      <div key={s.label} className="bg-[#0a0a0b] rounded p-2 border border-[#1e1e21] text-center">
                        <div className="text-[10px] text-gray-300">{s.value}</div>
                        <div className="text-[8px] text-gray-600">{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Cloud config */}
            {dbConfig.mode === 'cloud' && (
              <div className="bg-[#111113] rounded-lg border border-[#1e1e21] p-4">
                <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-3 font-medium">Cloud Provider</div>
                <div className="space-y-3">
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { id: 'turso' as const, label: 'Turso', desc: 'Edge SQLite', icon: '🟢' },
                      { id: 'planetscale' as const, label: 'PlanetScale', desc: 'MySQL compatible', icon: '🪐' },
                      { id: 'supabase' as const, label: 'Supabase', desc: 'PostgreSQL', icon: '⚡' },
                      { id: 'neon' as const, label: 'Neon', desc: 'Serverless PG', icon: '🟣' },
                    ].map(p => (
                      <button key={p.id} onClick={() => setDbConfig({ ...dbConfig, cloudProvider: p.id })}
                        className={`p-2.5 rounded-lg border text-center transition-colors ${dbConfig.cloudProvider === p.id ? 'border-amber-500/40 bg-amber-500/5' : 'border-[#1e1e21] bg-[#0a0a0b] hover:border-[#333]'}`}>
                        <div className="text-lg">{p.icon}</div>
                        <div className="text-[10px] text-gray-200 mt-1">{p.label}</div>
                        <div className="text-[8px] text-gray-600">{p.desc}</div>
                      </button>
                    ))}
                  </div>
                  <div>
                    <label className="block text-[9px] text-gray-600 mb-0.5">Connection URL</label>
                    <input type="text" value={dbConfig.cloudUrl} onChange={e => setDbConfig({ ...dbConfig, cloudUrl: e.target.value })}
                      placeholder={dbConfig.cloudProvider === 'turso' ? 'libsql://your-db.turso.io' : dbConfig.cloudProvider === 'supabase' ? 'postgresql://...' : 'mysql://...'}
                      className="w-full px-2.5 py-1.5 bg-[#0a0a0b] border border-[#1e1e21] rounded text-[11px] text-gray-200 font-mono placeholder-gray-600 focus:outline-none focus:border-amber-500" />
                  </div>
                  <div>
                    <label className="block text-[9px] text-gray-600 mb-0.5">Auth Token</label>
                    <input type="password" value={dbConfig.cloudToken} onChange={e => setDbConfig({ ...dbConfig, cloudToken: e.target.value })}
                      placeholder="Database auth token"
                      className="w-full px-2.5 py-1.5 bg-[#0a0a0b] border border-[#1e1e21] rounded text-[11px] text-gray-200 font-mono placeholder-gray-600 focus:outline-none focus:border-amber-500" />
                  </div>
                  <div>
                    <label className="block text-[9px] text-gray-600 mb-0.5">Sync Interval (seconds)</label>
                    <select value={dbConfig.syncInterval} onChange={e => setDbConfig({ ...dbConfig, syncInterval: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-[#0a0a0b] border border-[#1e1e21] rounded text-[11px] text-gray-200 focus:outline-none">
                      <option value="5">5s (real-time)</option>
                      <option value="30">30s (balanced)</option>
                      <option value="60">60s (low bandwidth)</option>
                      <option value="300">5min (batch)</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Backup & Maintenance */}
            <div className="bg-[#111113] rounded-lg border border-[#1e1e21] p-4">
              <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-3 font-medium">Maintenance</div>
              <div className="flex gap-2 flex-wrap">
                <button onClick={handleExportDb}
                  className="px-3 py-1.5 text-[10px] font-medium bg-[#1a1a1d] text-gray-400 rounded border border-[#1e1e21] hover:text-gray-200">
                  📥 Export Database
                </button>
                <button className="px-3 py-1.5 text-[10px] font-medium bg-[#1a1a1d] text-gray-400 rounded border border-[#1e1e21] opacity-40 cursor-not-allowed" title="Coming soon">
                  📤 Import Database
                </button>
                <button onClick={handleReindex}
                  className="px-3 py-1.5 text-[10px] font-medium bg-[#1a1a1d] text-gray-400 rounded border border-[#1e1e21] hover:text-gray-200">
                  🔄 Reindex Search
                </button>
                <button className="px-3 py-1.5 text-[10px] font-medium bg-[#1a1a1d] text-gray-400 rounded border border-[#1e1e21] opacity-40 cursor-not-allowed" title="Dangerous — use terminal">
                  🗑 Reset Database
                </button>
              </div>
              {maintMsg && <div className="text-[10px] text-amber-400 mt-2 font-mono whitespace-pre-wrap">{maintMsg}</div>}
            </div>

            <div className="flex items-center gap-3">
              <button onClick={handleSaveDatabase} disabled={dbSaving}
                className="px-4 py-1.5 text-[10px] font-medium bg-amber-500 text-gray-900 rounded hover:bg-amber-400 disabled:opacity-40">
                {dbSaving ? 'Saving...' : 'Save Database Settings'}
              </button>
              {dbMsg && <span className={`text-[10px] ${dbMsg === 'Saved!' ? 'text-green-400' : 'text-red-400'}`}>{dbMsg}</span>}
            </div>
          </div>
        )}

        {/* VAULT TAB */}
        {tab === 'vault' && (
          <div className="max-w-2xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-[10px] text-gray-500">
                Encrypted with AES-256-GCM • {secrets.length} secrets stored
              </div>
              <button onClick={() => setShowAdd(!showAdd)}
                className={`px-3 py-1.5 text-[10px] font-medium rounded ${showAdd ? 'bg-[#1a1a1d] text-gray-400 border border-[#1e1e21]' : 'bg-amber-500 text-gray-900 hover:bg-amber-400'}`}>
                {showAdd ? 'Cancel' : '+ Add Secret'}
              </button>
            </div>

            {/* Add form */}
            {showAdd && (
              <div className="bg-[#111113] rounded-lg border border-amber-500/20 p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[9px] text-gray-500 mb-0.5">Name</label>
                    <input type="text" placeholder="GITHUB_PAT" value={form.name}
                      onChange={e => setForm({ ...form, name: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '') })}
                      className="w-full px-2.5 py-1.5 bg-[#0a0a0b] border border-[#1e1e21] rounded text-[11px] text-gray-200 font-mono focus:outline-none focus:border-amber-500" />
                  </div>
                  <div>
                    <label className="block text-[9px] text-gray-500 mb-0.5">Category</label>
                    <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-[#0a0a0b] border border-[#1e1e21] rounded text-[11px] text-gray-200 focus:outline-none">
                      {Object.entries(categoryLabels).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-[9px] text-gray-500 mb-0.5">Value</label>
                  <input type="password" placeholder="ghp_xxxxxxxxxxxx" value={form.value}
                    onChange={e => setForm({ ...form, value: e.target.value })}
                    className="w-full px-2.5 py-1.5 bg-[#0a0a0b] border border-[#1e1e21] rounded text-[11px] text-gray-200 font-mono focus:outline-none focus:border-amber-500" />
                </div>
                <input type="text" placeholder="Description (optional)" value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  className="w-full px-2.5 py-1.5 bg-[#0a0a0b] border border-[#1e1e21] rounded text-[10px] text-gray-200 placeholder-gray-600 focus:outline-none focus:border-amber-500" />
                {error && <div className="text-[10px] text-red-400">{error}</div>}
                <button onClick={handleSave} disabled={saving}
                  className="px-4 py-1.5 text-[10px] font-medium bg-amber-500 text-gray-900 rounded hover:bg-amber-400 disabled:opacity-40">
                  {saving ? 'Encrypting...' : 'Save Secret'}
                </button>
              </div>
            )}

            {/* Secrets list */}
            {loadingVault ? (
              <div className="text-center py-6 text-[11px] text-gray-600">Loading vault...</div>
            ) : secrets.length === 0 ? (
              <div className="bg-[#111113] rounded-lg border border-[#1e1e21] p-8 text-center">
                <div className="text-2xl mb-2">🔒</div>
                <div className="text-[11px] text-gray-400">No secrets stored</div>
                <div className="text-[10px] text-gray-600 mt-1">Store API keys, tokens, and credentials securely</div>
              </div>
            ) : (
              <div className="space-y-1.5">
                {secrets.map(secret => {
                  const cat = categoryLabels[secret.category] || categoryLabels.other;
                  return (
                    <div key={secret.id} className="bg-[#111113] rounded-lg border border-[#1e1e21] px-4 py-3 hover:border-[#333] transition-colors group">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm">{cat.icon}</span>
                            <span className="font-mono text-[11px] font-medium text-gray-200">{secret.name}</span>
                            <span className={`text-[8px] px-1.5 py-0.5 rounded ${cat.color}`}>{cat.label}</span>
                          </div>
                          {secret.description && <p className="text-[9px] text-gray-500 mt-0.5 ml-6">{secret.description}</p>}
                          <div className="flex gap-3 text-[9px] text-gray-700 mt-1 ml-6">
                            <span>Created {daysAgo(secret.createdAt)}</span>
                            {secret.lastAccessedAt && <span>Accessed {daysAgo(secret.lastAccessedAt)}</span>}
                          </div>
                          {revealedValues[secret.name] && (
                            <div className="mt-1.5 ml-6 px-2.5 py-1 bg-[#0a0a0b] rounded border border-[#1e1e21] font-mono text-[10px] text-gray-400 inline-block">
                              {revealedValues[secret.name]}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-3 shrink-0">
                          <button onClick={() => handleReveal(secret.name)}
                            className="px-2 py-1 text-[9px] text-gray-400 bg-[#1a1a1d] rounded border border-[#1e1e21] hover:text-gray-200">
                            {revealedValues[secret.name] ? '🙈 Hide' : '👁 Peek'}
                          </button>
                          {deletingName === secret.name ? (
                            <div className="flex gap-1">
                              <button onClick={() => handleDelete(secret.name)}
                                className="px-2 py-1 text-[9px] text-red-400 bg-red-500/10 rounded border border-red-500/20">Confirm</button>
                              <button onClick={() => setDeletingName(null)}
                                className="px-2 py-1 text-[9px] text-gray-400 bg-[#1a1a1d] rounded border border-[#1e1e21]">No</button>
                            </div>
                          ) : (
                            <button onClick={() => setDeletingName(secret.name)}
                              className="px-2 py-1 text-[9px] text-gray-500 bg-[#1a1a1d] rounded border border-[#1e1e21] hover:text-red-400">
                              🗑
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* GATEWAY TAB */}
        {tab === 'gateway' && (
          <div className="max-w-2xl space-y-4">
            {/* Connection status */}
            <div className="bg-[#111113] rounded-lg border border-[#1e1e21] p-4">
              <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-3 font-medium">Gateway Status</div>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-[#0a0a0b] rounded-lg p-3 border border-[#1e1e21] text-center">
                  <div className={`w-3 h-3 rounded-full mx-auto mb-1.5 ${gateway?.status === 'online' ? 'bg-green-500' : 'bg-red-500'}`} />
                  <div className="text-[11px] font-medium text-gray-200 capitalize">{gateway?.status || '...'}</div>
                  <div className="text-[8px] text-gray-600">Status</div>
                </div>
                <div className="bg-[#0a0a0b] rounded-lg p-3 border border-[#1e1e21] text-center">
                  <div className="text-lg font-bold text-gray-300">{gateway?.sessions ?? '—'}</div>
                  <div className="text-[8px] text-gray-600">Sessions</div>
                </div>
                <div className="bg-[#0a0a0b] rounded-lg p-3 border border-[#1e1e21] text-center">
                  <div className="text-lg font-bold text-gray-300">{gateway?.crons ?? '—'}</div>
                  <div className="text-[8px] text-gray-600">Cron Jobs</div>
                </div>
              </div>
            </div>

            {/* Connection info */}
            <div className="bg-[#111113] rounded-lg border border-[#1e1e21] p-4">
              <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-3 font-medium">Connection</div>
              <div className="space-y-2">
                {[
                  { label: 'WebSocket', value: 'ws://127.0.0.1:18789' },
                  { label: 'Auth', value: 'anthropic:manual (Claude Max OAuth)' },
                  { label: 'Default Model', value: 'claude-opus-4-6' },
                  { label: 'Fallback Model', value: 'claude-sonnet-4-6' },
                  { label: 'Config', value: '~/.openclaw/openclaw.json' },
                  { label: 'Logs', value: '/tmp/openclaw/openclaw-*.log' },
                ].map(row => (
                  <div key={row.label} className="flex items-center justify-between py-1 border-b border-[#0a0a0b] last:border-0">
                    <span className="text-[10px] text-gray-500">{row.label}</span>
                    <span className="text-[10px] text-gray-300 font-mono">{row.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Channels */}
            <div className="bg-[#111113] rounded-lg border border-[#1e1e21] p-4">
              <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-3 font-medium">Channels</div>
              <div className="space-y-1.5">
                {[
                  { name: 'Telegram', value: '@oc_agent_test_lufy_bot', status: 'connected', icon: '📱' },
                  { name: 'Discord', value: 'Not configured', status: 'disconnected', icon: '💬' },
                  { name: 'Slack', value: 'Not configured', status: 'disconnected', icon: '💼' },
                ].map(ch => (
                  <div key={ch.name} className="flex items-center gap-2.5 py-1.5">
                    <span className="text-sm">{ch.icon}</span>
                    <span className="text-[11px] text-gray-300 flex-1">{ch.name}</span>
                    <span className="text-[10px] text-gray-500 font-mono">{ch.value}</span>
                    <span className={`w-1.5 h-1.5 rounded-full ${ch.status === 'connected' ? 'bg-green-500' : 'bg-gray-600'}`} />
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="bg-[#111113] rounded-lg border border-[#1e1e21] p-4">
              <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-3 font-medium">Actions</div>
              <div className="flex gap-2">
                <button onClick={fetchGateway}
                  className="px-3 py-1.5 text-[10px] font-medium bg-[#1a1a1d] text-gray-400 rounded border border-[#1e1e21] hover:text-gray-200">
                  🔄 Refresh Status
                </button>
                <button onClick={handleRestartGateway}
                  className="px-3 py-1.5 text-[10px] font-medium bg-[#1a1a1d] text-gray-400 rounded border border-[#1e1e21] hover:text-gray-200"
                  title="Restart gateway process">
                  ⚡ Restart Gateway
                </button>
                <button onClick={handleViewLogs}
                  className="px-3 py-1.5 text-[10px] font-medium bg-[#1a1a1d] text-gray-400 rounded border border-[#1e1e21] hover:text-gray-200"
                  title="View logs">
                  📋 View Logs
                </button>
              </div>
              {gwMsg && <div className="text-[10px] text-amber-400 mt-2 font-mono whitespace-pre-wrap max-h-40 overflow-y-auto">{gwMsg}</div>}
            </div>
          </div>
        )}

        {/* ABOUT TAB */}
        {tab === 'about' && (
          <div className="max-w-2xl space-y-4">
            {/* Brand */}
            <div className="bg-[#111113] rounded-lg border border-[#1e1e21] p-6 text-center">
              <div className="text-4xl mb-3">🦞</div>
              <div className="text-lg font-bold text-gray-100">ClawHalla</div>
              <div className="text-[11px] text-gray-500 mt-1">Enterprise Autonomous AI Operating System</div>
              <div className="text-[10px] text-amber-400 mt-2">v1.0.0</div>
              <div className="text-[9px] text-gray-600 mt-1">Built by Deega Labs</div>
            </div>

            {/* Stack */}
            <div className="bg-[#111113] rounded-lg border border-[#1e1e21] p-4">
              <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-3 font-medium">Tech Stack</div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Runtime', value: 'OpenClaw Gateway' },
                  { label: 'Frontend', value: 'Next.js 16 + Tailwind' },
                  { label: 'Database', value: 'SQLite + Drizzle ORM' },
                  { label: 'AI Models', value: 'Claude Opus/Sonnet/Haiku' },
                  { label: 'Blockchain', value: 'Base L2 (Solidity)' },
                  { label: 'Encryption', value: 'AES-256-GCM' },
                  { label: 'Real-time', value: 'SSE + chokidar' },
                  { label: 'Search', value: 'FTS5 (porter stemming)' },
                ].map(row => (
                  <div key={row.label} className="flex items-center justify-between p-2 bg-[#0a0a0b] rounded border border-[#1e1e21]">
                    <span className="text-[9px] text-gray-500">{row.label}</span>
                    <span className="text-[10px] text-gray-300">{row.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Stats */}
            <div className="bg-[#111113] rounded-lg border border-[#1e1e21] p-4">
              <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-3 font-medium">System</div>
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: 'Agents', value: '15' },
                  { label: 'Squads', value: '4' },
                  { label: 'API Routes', value: '30+' },
                  { label: 'Pages', value: '18' },
                ].map(s => (
                  <div key={s.label} className="text-center p-2 bg-[#0a0a0b] rounded border border-[#1e1e21]">
                    <div className="text-lg font-bold text-amber-400">{s.value}</div>
                    <div className="text-[8px] text-gray-600 uppercase">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Links */}
            <div className="bg-[#111113] rounded-lg border border-[#1e1e21] p-4">
              <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-3 font-medium">Links</div>
              <div className="space-y-1.5">
                {[
                  { label: 'Website', url: 'https://clawhalla.xyz', icon: '🌐' },
                  { label: 'GitHub', url: 'https://github.com/deegalabs/clawhalla', icon: '📦' },
                  { label: 'Creator', url: 'https://github.com/danielgorgonha', icon: '👤' },
                  { label: 'Organization', url: 'https://github.com/deegalabs', icon: '🏢' },
                ].map(link => (
                  <a key={link.label} href={link.url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 py-1.5 text-[11px] text-gray-400 hover:text-amber-400 transition-colors">
                    <span>{link.icon}</span>
                    <span>{link.label}</span>
                    <span className="text-[9px] text-gray-600 ml-auto font-mono">{link.url.replace('https://', '')}</span>
                  </a>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default dynamic(() => Promise.resolve(SettingsPageInner), { ssr: false });
