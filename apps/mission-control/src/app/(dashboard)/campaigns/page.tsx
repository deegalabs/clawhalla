'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Campaign {
  id: string;
  name: string;
  subject: string;
  fromName: string;
  fromEmail: string;
  replyTo: string | null;
  templateHtml: string;
  templateText: string | null;
  smtpVaultKey: string;
  status: string;
  totalContacts: number;
  sentCount: number;
  failedCount: number;
  settings: SendSettings | null;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  stats?: { total: number; pending: number; sent: number; failed: number };
  isRunning?: boolean;
}

interface SendSettings {
  delayMinDay: number;
  delayMaxDay: number;
  delayMinNight: number;
  delayMaxNight: number;
  pauseWindows: string;
  breakEvery: number;
  breakMinMs: number;
  breakMaxMs: number;
  timezone: string;
  maxConsecutiveFails: number;
}

interface CampaignForm {
  name: string;
  subject: string;
  fromName: string;
  fromEmail: string;
  replyTo: string;
  templateHtml: string;
  templateText: string;
  smtpVaultKey: string;
  settings: SendSettings;
}

interface Contact {
  id: string;
  email: string;
  name: string | null;
  status: string;
  sentAt: string | null;
  error: string | null;
}

type View = 'list' | 'create' | 'detail';
type DetailTab = 'overview' | 'contacts' | 'template' | 'settings';

const DEFAULT_SETTINGS: SendSettings = {
  delayMinDay: 120000,
  delayMaxDay: 300000,
  delayMinNight: 480000,
  delayMaxNight: 720000,
  pauseWindows: '23:00-08:00',
  breakEvery: 15,
  breakMinMs: 900000,
  breakMaxMs: 2700000,
  timezone: 'America/Sao_Paulo',
  maxConsecutiveFails: 5,
};

const EMPTY_FORM: CampaignForm = {
  name: '', subject: '', fromName: '', fromEmail: '', replyTo: '',
  templateHtml: '', templateText: '', smtpVaultKey: 'SMTP_CONNECTION',
  settings: { ...DEFAULT_SETTINGS },
};

// Sandboxed HTML preview — prevents XSS by rendering in a sandboxed iframe
function SandboxPreview({ html, className }: { html: string; className?: string }) {
  const interpolated = html
    .replace(/\{\{name\}\}/g, 'John Doe')
    .replace(/\{\{email\}\}/g, 'john@example.com')
    .replace(/\{\{company\}\}/g, 'Acme Corp');

  return (
    <iframe
      sandbox=""
      srcDoc={interpolated}
      className={className || 'w-full h-full border-0'}
      title="Email preview"
      style={{ background: 'white' }}
    />
  );
}

function fmtMs(ms: number): string {
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  return `${(ms / 60000).toFixed(1)}min`;
}

function fmtDate(d: string | null): string {
  if (!d) return '-';
  return new Date(typeof d === 'string' ? d : Number(d)).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function CampaignsPage() {
  const [view, setView] = useState<View>('list');
  const [detailTab, setDetailTab] = useState<DetailTab>('overview');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selected, setSelected] = useState<Campaign | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [form, setForm] = useState<CampaignForm>({ ...EMPTY_FORM });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [smtpConfigured, setSmtpConfigured] = useState<boolean | null>(null);
  const [editing, setEditing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Fetch campaigns ────────────────────────────────────────────────
  const fetchCampaigns = useCallback(async () => {
    try {
      const res = await fetch('/api/campaigns');
      const data = await res.json();
      setCampaigns(Array.isArray(data) ? data : []);
      setError(null);
    } catch {
      setError('Failed to load campaigns');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCampaigns(); }, [fetchCampaigns]);

  // Check SMTP vault key
  const checkSmtp = useCallback(async (key: string) => {
    try {
      const res = await fetch('/api/vault');
      const data = await res.json();
      const secrets = Array.isArray(data) ? data : data.secrets || [];
      setSmtpConfigured(secrets.some((s: { name: string }) => s.name === key));
    } catch {
      setSmtpConfigured(null);
    }
  }, []);

  useEffect(() => { checkSmtp(form.smtpVaultKey); }, [form.smtpVaultKey, checkSmtp]);

  // Poll when sending
  useEffect(() => {
    const hasSending = campaigns.some(c => c.status === 'sending');
    if (!hasSending && !selected?.isRunning) return;
    const interval = setInterval(() => {
      fetchCampaigns();
      if (selected) loadDetail(selected.id);
    }, 5000);
    return () => clearInterval(interval);
  }, [campaigns, selected]);

  // ── Load campaign detail ───────────────────────────────────────────
  const loadDetail = async (id: string) => {
    try {
      const res = await fetch(`/api/campaigns/${id}`);
      const data = await res.json();
      if (data.id) {
        setSelected(data);
        setView('detail');
        checkSmtp(data.smtpVaultKey);
        loadContacts(id);
      }
    } catch { /* ignore */ }
  };

  const loadContacts = async (campaignId: string) => {
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/contacts`);
      const data = await res.json();
      setContacts(Array.isArray(data) ? data : []);
    } catch {
      setContacts([]);
    }
  };

  // ── Create campaign ────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!form.name || !form.subject || !form.fromName || !form.fromEmail || !form.templateHtml) {
      setError('Fill in all required fields (marked with *)');
      return;
    }
    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        const data = await res.json();
        setForm({ ...EMPTY_FORM });
        setSuccess('Campaign created!');
        setTimeout(() => setSuccess(null), 3000);
        fetchCampaigns();
        loadDetail(data.id);
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to create');
      }
    } catch { setError('Network error'); }
  };

  // ── Update campaign ────────────────────────────────────────────────
  const handleUpdate = async () => {
    if (!selected) return;
    try {
      const res = await fetch(`/api/campaigns/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name, subject: form.subject, fromName: form.fromName,
          fromEmail: form.fromEmail, replyTo: form.replyTo || null,
          templateHtml: form.templateHtml, templateText: form.templateText || null,
          smtpVaultKey: form.smtpVaultKey, settings: form.settings,
        }),
      });
      if (res.ok) {
        setEditing(false);
        setSuccess('Campaign updated!');
        setTimeout(() => setSuccess(null), 3000);
        loadDetail(selected.id);
        fetchCampaigns();
      }
    } catch { setError('Failed to update'); }
  };

  // ── Campaign actions ───────────────────────────────────────────────
  const campaignAction = async (id: string, action: string) => {
    try {
      const res = await fetch(`/api/campaigns/${id}?action=${action}`, { method: 'POST' });
      const data = await res.json();
      if (!data.ok && data.error) setError(data.error);
      else {
        setSuccess(data.message || `Action "${action}" executed`);
        setTimeout(() => setSuccess(null), 3000);
      }
      fetchCampaigns();
      if (selected?.id === id) loadDetail(id);
    } catch { setError('Action failed'); }
  };

  const deleteCampaign = async (id: string) => {
    if (!confirm('Delete this campaign and all its contacts? This cannot be undone.')) return;
    await fetch(`/api/campaigns/${id}`, { method: 'DELETE' });
    setSelected(null);
    setView('list');
    fetchCampaigns();
  };

  // ── CSV import ─────────────────────────────────────────────────────
  const handleCSVImport = async (file: File) => {
    if (!selected) return;
    setImporting(true);
    setSuccess(null);

    try {
      const text = await file.text();
      const lines = text.split('\n').filter(l => l.trim());
      if (lines.length < 2) { setError('CSV must have a header row and at least one data row'); setImporting(false); return; }

      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      const emailIdx = headers.indexOf('email');
      const nameIdx = headers.indexOf('name');
      if (emailIdx === -1) { setError('CSV must have an "email" column'); setImporting(false); return; }

      const contacts = lines.slice(1).map(line => {
        const cols = line.split(',').map(c => c.trim());
        const vars: Record<string, string> = {};
        headers.forEach((h, i) => { if (h !== 'email' && h !== 'name' && cols[i]) vars[h] = cols[i]; });
        return {
          email: cols[emailIdx],
          name: nameIdx >= 0 ? cols[nameIdx] : undefined,
          variables: Object.keys(vars).length > 0 ? vars : undefined,
        };
      }).filter(c => c.email);

      const res = await fetch(`/api/campaigns/${selected.id}?action=import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contacts }),
      });
      const data = await res.json();
      setSuccess(`Imported ${data.imported} contacts (${data.skipped} skipped). Total: ${data.total}`);
      setTimeout(() => setSuccess(null), 5000);
      loadDetail(selected.id);
    } catch {
      setError('Failed to parse CSV file');
    } finally {
      setImporting(false);
    }
  };

  // ── Start editing ──────────────────────────────────────────────────
  const startEditing = () => {
    if (!selected) return;
    setForm({
      name: selected.name,
      subject: selected.subject,
      fromName: selected.fromName,
      fromEmail: selected.fromEmail,
      replyTo: selected.replyTo || '',
      templateHtml: selected.templateHtml,
      templateText: selected.templateText || '',
      smtpVaultKey: selected.smtpVaultKey,
      settings: selected.settings || { ...DEFAULT_SETTINGS },
    });
    setEditing(true);
  };

  // ── UI Helpers ─────────────────────────────────────────────────────

  const statusBadge = (status: string) => {
    const styles: Record<string, string> = {
      draft: 'bg-zinc-700 text-zinc-300',
      sending: 'bg-amber-900/50 text-amber-300 animate-pulse',
      paused: 'bg-blue-900/50 text-blue-300',
      completed: 'bg-emerald-900/50 text-emerald-300',
      failed: 'bg-red-900/50 text-red-300',
    };
    return <span className={`px-2 py-0.5 rounded text-xs font-medium ${styles[status] || styles.draft}`}>{status}</span>;
  };

  const statusIcon = (status: string) => {
    const icons: Record<string, string> = { draft: '📝', sending: '📨', paused: '⏸️', completed: '✅', failed: '❌' };
    return icons[status] || '📝';
  };

  const inputClass = 'w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-amber-600 focus:outline-none';
  const labelClass = 'block text-xs text-zinc-400 mb-1 font-medium';

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            📧 Campaigns
          </h1>
          <p className="text-sm text-zinc-500 mt-1">Mass email with anti-spam protection</p>
        </div>
        <div className="flex gap-2">
          {view !== 'list' && (
            <button onClick={() => { setView('list'); setSelected(null); setEditing(false); }}
              className="px-3 py-1.5 rounded text-sm bg-zinc-800 text-zinc-400 hover:bg-zinc-700">
              &larr; All Campaigns
            </button>
          )}
          {view === 'list' && (
            <button onClick={() => { setView('create'); setForm({ ...EMPTY_FORM }); }}
              className="px-4 py-1.5 rounded text-sm bg-amber-600 text-white hover:bg-amber-500 font-medium">
              + New Campaign
            </button>
          )}
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="mb-4 p-3 bg-red-900/30 border border-red-800 rounded text-red-300 text-sm flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-200 ml-4" aria-label="Dismiss">✕</button>
        </div>
      )}
      {success && (
        <div className="mb-4 p-3 bg-emerald-900/30 border border-emerald-800 rounded text-emerald-300 text-sm">
          {success}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* LIST VIEW                                                      */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {view === 'list' && (
        loading ? (
          <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 bg-zinc-800/50 rounded-lg animate-pulse" />)}</div>
        ) : campaigns.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">📧</div>
            <h2 className="text-lg text-zinc-300 font-medium mb-2">No campaigns yet</h2>
            <p className="text-sm text-zinc-500 mb-6 max-w-md mx-auto">
              Create email campaigns with built-in anti-spam protection.
              Emails are sent with human-like delays to avoid spam filters.
            </p>
            <button onClick={() => { setView('create'); setForm({ ...EMPTY_FORM }); }}
              className="px-5 py-2 bg-amber-600 text-white rounded text-sm hover:bg-amber-500 font-medium">
              Create your first campaign
            </button>
            <div className="mt-8 p-4 bg-zinc-900 border border-zinc-800 rounded-lg max-w-md mx-auto text-left">
              <h3 className="text-xs font-semibold text-zinc-400 mb-2">Before you start</h3>
              <p className="text-xs text-zinc-500">
                SMTP credentials must be configured in{' '}
                <Link href="/settings" className="text-amber-400 hover:text-amber-300 underline">Settings &rarr; Vault</Link>.
                Add a secret named <code className="text-zinc-300 bg-zinc-800 px-1 rounded">SMTP_CONNECTION</code> with JSON:
              </p>
              <pre className="mt-2 text-xs text-zinc-400 bg-zinc-800 p-2 rounded overflow-x-auto">
{`{
  "host": "smtp.example.com",
  "port": 587,
  "user": "you@example.com",
  "pass": "your-password"
}`}
              </pre>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {campaigns.map(c => {
              const progress = c.totalContacts > 0 ? Math.round((c.sentCount / c.totalContacts) * 100) : 0;
              return (
                <div key={c.id} onClick={() => loadDetail(c.id)}
                  className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 hover:border-zinc-600 cursor-pointer transition-colors group">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{statusIcon(c.status)}</span>
                      <div>
                        <h3 className="text-white font-medium group-hover:text-amber-400 transition-colors">{c.name}</h3>
                        <p className="text-xs text-zinc-500 mt-0.5">{c.subject}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-sm text-zinc-300 font-mono">{c.sentCount}/{c.totalContacts}</div>
                        <div className="text-xs text-zinc-600">sent</div>
                      </div>
                      {statusBadge(c.status)}
                    </div>
                  </div>
                  {c.totalContacts > 0 && (
                    <div className="mt-3 flex items-center gap-3">
                      <div className="flex-1 bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                        <div className="flex h-full">
                          <div className="bg-emerald-500 transition-all" style={{ width: `${progress}%` }} />
                          {c.failedCount > 0 && (
                            <div className="bg-red-500 transition-all" style={{ width: `${Math.round((c.failedCount / c.totalContacts) * 100)}%` }} />
                          )}
                        </div>
                      </div>
                      <span className="text-xs text-zinc-600 w-10 text-right">{progress}%</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* CREATE VIEW                                                    */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {view === 'create' && (
        <div className="space-y-6">
          {/* SMTP Setup Guide */}
          {smtpConfigured === false && (
            <div className="p-4 bg-amber-900/20 border border-amber-800 rounded-lg">
              <h3 className="text-sm font-semibold text-amber-300 mb-2">⚠️ SMTP not configured</h3>
              <p className="text-xs text-amber-200/70 mb-3">
                You need to add SMTP credentials to the Vault before sending campaigns.
              </p>
              <div className="flex items-center gap-3">
                <Link href="/settings" className="px-3 py-1.5 bg-amber-600 text-white rounded text-xs hover:bg-amber-500 font-medium">
                  Go to Settings &rarr; Vault
                </Link>
                <span className="text-xs text-amber-200/50">
                  Add secret <code className="text-amber-300 bg-amber-900/30 px-1 rounded">{form.smtpVaultKey}</code> with SMTP JSON
                </span>
              </div>
            </div>
          )}
          {smtpConfigured === true && (
            <div className="p-3 bg-emerald-900/20 border border-emerald-800 rounded-lg flex items-center gap-2">
              <span className="text-emerald-400">✓</span>
              <span className="text-xs text-emerald-300">SMTP credentials found in vault ({form.smtpVaultKey})</span>
            </div>
          )}

          {/* Step 1: Campaign Info */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
            <h2 className="text-base font-semibold text-white mb-1">1. Campaign Info</h2>
            <p className="text-xs text-zinc-500 mb-4">Basic campaign details and sender information</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Campaign Name *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className={inputClass} placeholder="Q2 Product Launch" />
              </div>
              <div>
                <label className={labelClass}>Subject Line *</label>
                <input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                  className={inputClass} placeholder="Hello {{name}}, check this out" />
                <p className="text-xs text-zinc-600 mt-1">Use {'{{name}}'}, {'{{email}}'}, {'{{company}}'} for personalization</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
              <div>
                <label className={labelClass}>From Name *</label>
                <input value={form.fromName} onChange={e => setForm(f => ({ ...f, fromName: e.target.value }))}
                  className={inputClass} placeholder="Daniel at Deega Labs" />
              </div>
              <div>
                <label className={labelClass}>From Email *</label>
                <input value={form.fromEmail} onChange={e => setForm(f => ({ ...f, fromEmail: e.target.value }))}
                  className={inputClass} placeholder="hello@deegalabs.com" type="email" />
              </div>
              <div>
                <label className={labelClass}>Reply-To <span className="text-zinc-600">(optional)</span></label>
                <input value={form.replyTo} onChange={e => setForm(f => ({ ...f, replyTo: e.target.value }))}
                  className={inputClass} placeholder="reply@deegalabs.com" type="email" />
              </div>
            </div>

            <div className="mt-4">
              <label className={labelClass}>SMTP Vault Key</label>
              <div className="flex gap-2">
                <input value={form.smtpVaultKey} onChange={e => setForm(f => ({ ...f, smtpVaultKey: e.target.value }))}
                  className={inputClass} placeholder="SMTP_CONNECTION" />
                <Link href="/settings" className="px-3 py-2 bg-zinc-700 text-zinc-300 rounded text-sm hover:bg-zinc-600 whitespace-nowrap flex items-center gap-1">
                  🔑 Vault
                </Link>
              </div>
              <p className="text-xs text-zinc-600 mt-1">
                Vault secret must contain JSON: <code className="text-zinc-400">{`{"host":"...","port":587,"user":"...","pass":"..."}`}</code>
              </p>
            </div>
          </div>

          {/* Step 2: Email Template */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
            <h2 className="text-base font-semibold text-white mb-1">2. Email Template</h2>
            <p className="text-xs text-zinc-500 mb-4">
              Write your email HTML. Variables: <code className="text-zinc-400">{'{{name}}'}</code>, <code className="text-zinc-400">{'{{email}}'}</code>, plus any CSV column.
            </p>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>HTML Template *</label>
                <textarea value={form.templateHtml} onChange={e => setForm(f => ({ ...f, templateHtml: e.target.value }))}
                  className={`${inputClass} font-mono h-64 resize-y`}
                  placeholder={`<!DOCTYPE html>\n<html>\n<body>\n  <h1>Hello {{name}}</h1>\n  <p>We'd love to share...</p>\n</body>\n</html>`} />
              </div>
              <div>
                <label className={labelClass}>Preview</label>
                <div className="bg-white rounded border border-zinc-700 h-64 overflow-hidden">
                  {form.templateHtml ? (
                    <SandboxPreview html={form.templateHtml} className="w-full h-full border-0" />
                  ) : (
                    <p className="text-zinc-400 text-sm italic p-4">Write HTML on the left to see a preview...</p>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-4">
              <label className={labelClass}>Plain Text Fallback <span className="text-zinc-600">(optional)</span></label>
              <textarea value={form.templateText} onChange={e => setForm(f => ({ ...f, templateText: e.target.value }))}
                className={`${inputClass} font-mono h-24 resize-y`}
                placeholder={`Hello {{name}},\n\nWe'd love to share...\n\nBest,\nDaniel`} />
            </div>
          </div>

          {/* Step 3: Anti-Spam Settings */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
            <h2 className="text-base font-semibold text-white mb-1">3. Anti-Spam Settings</h2>
            <p className="text-xs text-zinc-500 mb-4">Human-like delays to avoid spam filters. Defaults work well for most cases.</p>

            <AntiSpamSettings settings={form.settings} onChange={s => setForm(f => ({ ...f, settings: s }))} />
          </div>

          {/* Create button */}
          <div className="flex justify-end gap-3">
            <button onClick={() => { setView('list'); setForm({ ...EMPTY_FORM }); }}
              className="px-5 py-2 bg-zinc-800 text-zinc-400 rounded text-sm hover:bg-zinc-700">
              Cancel
            </button>
            <button onClick={handleCreate}
              className="px-5 py-2 bg-amber-600 text-white rounded text-sm hover:bg-amber-500 font-medium disabled:opacity-50"
              disabled={!form.name || !form.subject || !form.fromName || !form.fromEmail || !form.templateHtml}>
              Create Campaign
            </button>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* DETAIL VIEW                                                    */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {view === 'detail' && selected && (
        <div className="space-y-4">
          {/* Campaign header card */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xl">{statusIcon(selected.status)}</span>
                  <h2 className="text-xl font-bold text-white">{selected.name}</h2>
                  {statusBadge(selected.status)}
                </div>
                <p className="text-sm text-zinc-400">{selected.subject}</p>
                <p className="text-xs text-zinc-600 mt-1">
                  From: {selected.fromName} &lt;{selected.fromEmail}&gt;
                  {selected.replyTo && <> · Reply-To: {selected.replyTo}</>}
                  {' · '}SMTP: <code className="text-zinc-500">{selected.smtpVaultKey}</code>
                </p>
              </div>
            </div>

            {selected.error && (
              <div className="mb-4 p-3 bg-red-900/20 border border-red-900 rounded text-red-300 text-sm flex items-start gap-2">
                <span>❌</span>
                <span>{selected.error}</span>
              </div>
            )}

            {/* SMTP warning */}
            {smtpConfigured === false && (
              <div className="mb-4 p-3 bg-amber-900/20 border border-amber-800 rounded text-amber-300 text-sm flex items-center justify-between">
                <span>⚠️ SMTP credentials not found in vault ({selected.smtpVaultKey})</span>
                <Link href="/settings" className="text-amber-400 hover:text-amber-300 underline text-xs">Configure in Vault</Link>
              </div>
            )}

            {/* Stats cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              {[
                { label: 'Total', value: selected.stats?.total || selected.totalContacts, color: 'text-zinc-200', bg: 'bg-zinc-800' },
                { label: 'Sent', value: selected.stats?.sent || selected.sentCount, color: 'text-emerald-400', bg: 'bg-emerald-900/20' },
                { label: 'Pending', value: selected.stats?.pending || 0, color: 'text-amber-400', bg: 'bg-amber-900/20' },
                { label: 'Failed', value: selected.stats?.failed || selected.failedCount, color: 'text-red-400', bg: 'bg-red-900/20' },
              ].map(s => (
                <div key={s.label} className={`${s.bg} rounded-lg p-4 text-center border border-zinc-800`}>
                  <div className={`text-3xl font-bold ${s.color} font-mono`}>{s.value}</div>
                  <div className="text-xs text-zinc-500 mt-1">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Progress bar */}
            {(selected.stats?.total || selected.totalContacts) > 0 && (
              <div className="mb-4">
                <div className="flex justify-between text-xs text-zinc-500 mb-1">
                  <span>Progress</span>
                  <span>{Math.round(((selected.stats?.sent || selected.sentCount) / (selected.stats?.total || selected.totalContacts || 1)) * 100)}%</span>
                </div>
                <div className="bg-zinc-800 rounded-full h-2.5 overflow-hidden">
                  <div className="flex h-full">
                    <div className="bg-emerald-500 transition-all duration-500"
                      style={{ width: `${Math.round(((selected.stats?.sent || selected.sentCount) / (selected.stats?.total || selected.totalContacts || 1)) * 100)}%` }} />
                    <div className="bg-red-500 transition-all duration-500"
                      style={{ width: `${Math.round(((selected.stats?.failed || selected.failedCount) / (selected.stats?.total || selected.totalContacts || 1)) * 100)}%` }} />
                  </div>
                </div>
              </div>
            )}

            {/* Timestamps */}
            <div className="flex gap-6 text-xs text-zinc-600 mb-4">
              <span>Created: {fmtDate(selected.createdAt)}</span>
              {selected.startedAt && <span>Started: {fmtDate(selected.startedAt)}</span>}
              {selected.completedAt && <span>Completed: {fmtDate(selected.completedAt)}</span>}
            </div>

            {/* Actions */}
            <div className="flex gap-2 flex-wrap border-t border-zinc-800 pt-4">
              {(selected.status === 'draft' || selected.status === 'paused' || selected.status === 'failed') && (
                <button onClick={() => campaignAction(selected.id, 'send')}
                  className="px-4 py-2 bg-emerald-600 text-white rounded text-sm hover:bg-emerald-500 font-medium disabled:opacity-50"
                  disabled={(selected.stats?.total || selected.totalContacts) === 0 || smtpConfigured === false}>
                  ▶ {selected.status === 'paused' ? 'Resume' : 'Start Sending'}
                </button>
              )}
              {selected.status === 'sending' && (
                <button onClick={() => campaignAction(selected.id, 'pause')}
                  className="px-4 py-2 bg-amber-600 text-white rounded text-sm hover:bg-amber-500 font-medium">
                  ⏸ Pause
                </button>
              )}
              {(selected.stats?.failed || selected.failedCount) > 0 && selected.status !== 'sending' && (
                <button onClick={() => campaignAction(selected.id, 'reset-failed')}
                  className="px-4 py-2 bg-zinc-700 text-zinc-300 rounded text-sm hover:bg-zinc-600">
                  ↻ Retry Failed
                </button>
              )}
              {selected.status !== 'sending' && (
                <button onClick={startEditing}
                  className="px-4 py-2 bg-zinc-700 text-zinc-300 rounded text-sm hover:bg-zinc-600">
                  ✏️ Edit
                </button>
              )}
              <button onClick={() => deleteCampaign(selected.id)}
                className="px-4 py-2 bg-red-900/30 text-red-400 rounded text-sm hover:bg-red-900/50 ml-auto">
                🗑 Delete
              </button>
            </div>
          </div>

          {/* Detail tabs */}
          <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-1">
            {(['overview', 'contacts', 'template', 'settings'] as DetailTab[]).map(t => (
              <button key={t} onClick={() => setDetailTab(t)}
                className={`flex-1 px-4 py-2 rounded text-sm font-medium transition-colors ${detailTab === t ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>
                {t === 'overview' ? '📊 Overview' : t === 'contacts' ? '👥 Contacts' : t === 'template' ? '📝 Template' : '⚙️ Settings'}
              </button>
            ))}
          </div>

          {/* Overview tab */}
          {detailTab === 'overview' && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
              <h3 className="text-sm font-semibold text-white mb-4">Campaign Overview</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-zinc-500">Campaign:</span> <span className="text-white ml-2">{selected.name}</span></div>
                <div><span className="text-zinc-500">Status:</span> <span className="ml-2">{statusBadge(selected.status)}</span></div>
                <div><span className="text-zinc-500">Subject:</span> <span className="text-white ml-2">{selected.subject}</span></div>
                <div><span className="text-zinc-500">From:</span> <span className="text-white ml-2">{selected.fromName} &lt;{selected.fromEmail}&gt;</span></div>
                <div><span className="text-zinc-500">SMTP Key:</span> <code className="text-amber-400 ml-2">{selected.smtpVaultKey}</code></div>
                <div><span className="text-zinc-500">Timezone:</span> <span className="text-white ml-2">{selected.settings?.timezone || 'America/Sao_Paulo'}</span></div>
              </div>
              {selected.status === 'sending' && (
                <div className="mt-4 p-3 bg-amber-900/10 border border-amber-900/30 rounded text-xs text-amber-300/80">
                  📨 Campaign is actively sending. Emails are dispatched with human-like delays to avoid spam filters.
                  Stats refresh every 5 seconds.
                </div>
              )}
            </div>
          )}

          {/* Contacts tab */}
          {detailTab === 'contacts' && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-white">Contacts ({selected.stats?.total || selected.totalContacts})</h3>
                <div className="flex items-center gap-2">
                  <input ref={fileInputRef} type="file" accept=".csv" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleCSVImport(f); e.target.value = ''; }} />
                  <button onClick={() => fileInputRef.current?.click()}
                    disabled={importing || selected.status === 'sending'}
                    className="px-3 py-1.5 bg-zinc-700 text-zinc-300 rounded text-xs hover:bg-zinc-600 disabled:opacity-50">
                    {importing ? 'Importing...' : '📎 Upload CSV'}
                  </button>
                </div>
              </div>

              <div className="mb-3 p-3 bg-zinc-800/50 rounded text-xs text-zinc-500">
                CSV format: <code className="text-zinc-400">email,name,company,role,...</code> — the <code className="text-zinc-400">email</code> column is required.
                Extra columns become template variables (e.g. <code className="text-zinc-400">{'{{company}}'}</code>).
              </div>

              {contacts.length === 0 ? (
                <div className="text-center py-10 text-zinc-600">
                  <p>No contacts imported yet</p>
                  <p className="text-xs mt-1">Upload a CSV file to add contacts to this campaign</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-zinc-500 border-b border-zinc-800">
                        <th className="pb-2 font-medium">Email</th>
                        <th className="pb-2 font-medium">Name</th>
                        <th className="pb-2 font-medium">Status</th>
                        <th className="pb-2 font-medium">Sent At</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contacts.slice(0, 100).map(c => (
                        <tr key={c.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                          <td className="py-2 text-zinc-300">{c.email}</td>
                          <td className="py-2 text-zinc-400">{c.name || '-'}</td>
                          <td className="py-2">{statusBadge(c.status)}</td>
                          <td className="py-2 text-zinc-500 text-xs">{fmtDate(c.sentAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {contacts.length > 100 && (
                    <p className="text-xs text-zinc-600 mt-2 text-center">Showing first 100 of {contacts.length} contacts</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Template tab */}
          {detailTab === 'template' && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
              <h3 className="text-sm font-semibold text-white mb-4">Email Template</h3>
              {editing ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>HTML</label>
                      <textarea value={form.templateHtml} onChange={e => setForm(f => ({ ...f, templateHtml: e.target.value }))}
                        className={`${inputClass} font-mono h-80 resize-y`} />
                    </div>
                    <div>
                      <label className={labelClass}>Preview</label>
                      <div className="bg-white rounded border border-zinc-700 h-80 overflow-hidden">
                        <SandboxPreview html={form.templateHtml} className="w-full h-full border-0" />
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>Plain Text</label>
                    <textarea value={form.templateText} onChange={e => setForm(f => ({ ...f, templateText: e.target.value }))}
                      className={`${inputClass} font-mono h-24 resize-y`} />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handleUpdate} className="px-4 py-2 bg-amber-600 text-white rounded text-sm hover:bg-amber-500 font-medium">Save</button>
                    <button onClick={() => setEditing(false)} className="px-4 py-2 bg-zinc-700 text-zinc-400 rounded text-sm hover:bg-zinc-600">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>HTML Source</label>
                    <pre className="bg-zinc-800 rounded p-4 text-xs text-zinc-300 font-mono h-80 overflow-auto whitespace-pre-wrap">{selected.templateHtml}</pre>
                  </div>
                  <div>
                    <label className={labelClass}>Rendered Preview</label>
                    <div className="bg-white rounded h-80 overflow-hidden border border-zinc-700">
                      <SandboxPreview html={selected.templateHtml} className="w-full h-full border-0" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Settings tab */}
          {detailTab === 'settings' && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
              <h3 className="text-sm font-semibold text-white mb-4">Anti-Spam Settings</h3>
              {editing ? (
                <div className="space-y-4">
                  <AntiSpamSettings settings={form.settings} onChange={s => setForm(f => ({ ...f, settings: s }))} />
                  <div className="flex gap-2 pt-2">
                    <button onClick={handleUpdate} className="px-4 py-2 bg-amber-600 text-white rounded text-sm hover:bg-amber-500 font-medium">Save</button>
                    <button onClick={() => setEditing(false)} className="px-4 py-2 bg-zinc-700 text-zinc-400 rounded text-sm hover:bg-zinc-600">Cancel</button>
                  </div>
                </div>
              ) : (
                <AntiSpamDisplay settings={selected.settings || DEFAULT_SETTINGS} />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Anti-Spam Settings Editor
// ---------------------------------------------------------------------------

function AntiSpamSettings({ settings, onChange }: { settings: SendSettings; onChange: (s: SendSettings) => void }) {
  const update = (key: keyof SendSettings, value: string | number) => {
    onChange({ ...settings, [key]: value });
  };

  const inputClass = 'w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-white focus:border-amber-600 focus:outline-none';
  const labelClass = 'block text-xs text-zinc-400 mb-1 font-medium';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <label className={labelClass}>Day Delay Min</label>
          <input type="number" value={settings.delayMinDay / 1000} onChange={e => update('delayMinDay', Number(e.target.value) * 1000)}
            className={inputClass} />
          <p className="text-xs text-zinc-600 mt-0.5">seconds ({fmtMs(settings.delayMinDay)})</p>
        </div>
        <div>
          <label className={labelClass}>Day Delay Max</label>
          <input type="number" value={settings.delayMaxDay / 1000} onChange={e => update('delayMaxDay', Number(e.target.value) * 1000)}
            className={inputClass} />
          <p className="text-xs text-zinc-600 mt-0.5">seconds ({fmtMs(settings.delayMaxDay)})</p>
        </div>
        <div>
          <label className={labelClass}>Night Delay Min</label>
          <input type="number" value={settings.delayMinNight / 1000} onChange={e => update('delayMinNight', Number(e.target.value) * 1000)}
            className={inputClass} />
          <p className="text-xs text-zinc-600 mt-0.5">seconds ({fmtMs(settings.delayMinNight)})</p>
        </div>
        <div>
          <label className={labelClass}>Night Delay Max</label>
          <input type="number" value={settings.delayMaxNight / 1000} onChange={e => update('delayMaxNight', Number(e.target.value) * 1000)}
            className={inputClass} />
          <p className="text-xs text-zinc-600 mt-0.5">seconds ({fmtMs(settings.delayMaxNight)})</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className={labelClass}>Pause Windows</label>
          <input value={settings.pauseWindows} onChange={e => update('pauseWindows', e.target.value)}
            className={inputClass} placeholder="23:00-08:00,12:00-13:30" />
          <p className="text-xs text-zinc-600 mt-0.5">No emails sent during these hours</p>
        </div>
        <div>
          <label className={labelClass}>Break Every N Emails</label>
          <input type="number" value={settings.breakEvery} onChange={e => update('breakEvery', Number(e.target.value))}
            className={inputClass} />
          <p className="text-xs text-zinc-600 mt-0.5">Take a longer pause every N emails</p>
        </div>
        <div>
          <label className={labelClass}>Timezone</label>
          <input value={settings.timezone} onChange={e => update('timezone', e.target.value)}
            className={inputClass} placeholder="America/Sao_Paulo" />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div>
          <label className={labelClass}>Break Min Duration</label>
          <input type="number" value={settings.breakMinMs / 60000} onChange={e => update('breakMinMs', Number(e.target.value) * 60000)}
            className={inputClass} />
          <p className="text-xs text-zinc-600 mt-0.5">minutes</p>
        </div>
        <div>
          <label className={labelClass}>Break Max Duration</label>
          <input type="number" value={settings.breakMaxMs / 60000} onChange={e => update('breakMaxMs', Number(e.target.value) * 60000)}
            className={inputClass} />
          <p className="text-xs text-zinc-600 mt-0.5">minutes</p>
        </div>
        <div>
          <label className={labelClass}>Max Consecutive Fails</label>
          <input type="number" value={settings.maxConsecutiveFails} onChange={e => update('maxConsecutiveFails', Number(e.target.value))}
            className={inputClass} />
          <p className="text-xs text-zinc-600 mt-0.5">Stop after N consecutive errors</p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Anti-Spam Settings Display (read-only)
// ---------------------------------------------------------------------------

function AntiSpamDisplay({ settings }: { settings: SendSettings }) {
  const rows = [
    { label: 'Day Delay', value: `${fmtMs(settings.delayMinDay)} – ${fmtMs(settings.delayMaxDay)}`, desc: 'Between emails during daytime (08:00-22:00)' },
    { label: 'Night Delay', value: `${fmtMs(settings.delayMinNight)} – ${fmtMs(settings.delayMaxNight)}`, desc: 'Between emails during nighttime (22:00-08:00)' },
    { label: 'Pause Windows', value: settings.pauseWindows || 'None', desc: 'No emails sent during these hours' },
    { label: 'Human Break', value: `Every ${settings.breakEvery} emails, pause ${fmtMs(settings.breakMinMs)}–${fmtMs(settings.breakMaxMs)}`, desc: 'Simulates breaks a human would take' },
    { label: 'Timezone', value: settings.timezone, desc: 'Used for day/night detection and pause windows' },
    { label: 'Max Consecutive Fails', value: `${settings.maxConsecutiveFails}`, desc: 'Campaign stops after this many consecutive send failures' },
  ];

  return (
    <div className="space-y-3">
      {rows.map(r => (
        <div key={r.label} className="flex items-start gap-4 py-2 border-b border-zinc-800 last:border-0">
          <div className="w-44 shrink-0">
            <div className="text-sm text-zinc-300 font-medium">{r.label}</div>
            <div className="text-xs text-zinc-600">{r.desc}</div>
          </div>
          <div className="text-sm text-amber-400 font-mono">{r.value}</div>
        </div>
      ))}
      <div className="mt-4 p-3 bg-zinc-800/50 rounded text-xs text-zinc-500">
        These settings mimic human email behavior: random delays between sends, longer waits at night,
        periodic breaks, and no sending during sleep hours. This significantly reduces the chance of
        being flagged as spam.
      </div>
    </div>
  );
}
