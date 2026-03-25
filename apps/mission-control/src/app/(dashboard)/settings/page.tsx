'use client';

import { useState, useEffect, useCallback } from 'react';

interface SecretEntry {
  id: string;
  name: string;
  description: string | null;
  category: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  lastAccessedAt: string | null;
}

const categoryOptions = ['api_key', 'token', 'password', 'certificate', 'other'];

const categoryLabels: Record<string, { label: string; color: string }> = {
  api_key: { label: 'API Key', color: 'bg-blue-500/20 text-blue-400' },
  token: { label: 'Token', color: 'bg-amber-500/20 text-amber-400' },
  password: { label: 'Password', color: 'bg-red-500/20 text-red-400' },
  certificate: { label: 'Certificate', color: 'bg-green-500/20 text-green-400' },
  other: { label: 'Other', color: 'bg-gray-500/20 text-gray-400' },
};

function daysAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return `${diff}d ago`;
}

export default function SettingsPage() {
  const [secrets, setSecrets] = useState<SecretEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', value: '', description: '', category: 'api_key' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [revealedValues, setRevealedValues] = useState<Record<string, string>>({});
  const [deletingName, setDeletingName] = useState<string | null>(null);

  const fetchSecrets = useCallback(async () => {
    try {
      const res = await fetch('/api/vault');
      const data = await res.json();
      if (data.ok) setSecrets(data.secrets);
    } catch {
      // Silent fail
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchSecrets(); }, [fetchSecrets]);

  const handleSave = async () => {
    if (!form.name || !form.value) {
      setError('Name and value are required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/vault', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.ok) {
        setForm({ name: '', value: '', description: '', category: 'api_key' });
        setShowAdd(false);
        fetchSecrets();
      } else {
        setError(data.error || 'Failed to save');
      }
    } catch {
      setError('Failed to save secret');
    }
    setSaving(false);
  };

  const handleReveal = async (name: string) => {
    if (revealedValues[name]) {
      // Toggle off
      setRevealedValues(prev => { const next = { ...prev }; delete next[name]; return next; });
      return;
    }
    try {
      const res = await fetch('/api/vault/reveal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, full: false }),
      });
      const data = await res.json();
      if (data.ok) {
        setRevealedValues(prev => ({ ...prev, [name]: data.value }));
      }
    } catch {
      // Silent fail
    }
  };

  const handleDelete = async (name: string) => {
    try {
      const res = await fetch(`/api/vault?name=${encodeURIComponent(name)}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.ok) {
        setDeletingName(null);
        fetchSecrets();
      }
    } catch {
      // Silent fail
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-100">Secret Vault</h2>
          <p className="text-sm text-gray-500 mt-1">
            Encrypted storage for API keys, tokens, and credentials. AES-256-GCM.
          </p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="px-4 py-2 text-sm font-medium bg-amber-500 text-gray-900 rounded-lg hover:bg-amber-400"
        >
          {showAdd ? 'Cancel' : 'Add Secret'}
        </button>
      </div>

      {/* Add Form */}
      {showAdd && (
        <div className="bg-[#111113] rounded-lg border border-[#1e1e21] p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Name</label>
              <input
                type="text"
                placeholder="GITHUB_PAT"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '') })}
                className="w-full px-3 py-2 bg-[#0a0a0b] border border-[#1e1e21] rounded-md text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Category</label>
              <select
                value={form.category}
                onChange={e => setForm({ ...form, category: e.target.value })}
                className="w-full px-3 py-2 bg-[#0a0a0b] border border-[#1e1e21] rounded-md text-sm text-gray-200 focus:outline-none focus:border-amber-500"
              >
                {categoryOptions.map(cat => (
                  <option key={cat} value={cat}>{categoryLabels[cat].label}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Value</label>
            <input
              type="password"
              placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
              value={form.value}
              onChange={e => setForm({ ...form, value: e.target.value })}
              className="w-full px-3 py-2 bg-[#0a0a0b] border border-[#1e1e21] rounded-md text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-amber-500 font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Description (optional)</label>
            <input
              type="text"
              placeholder="GitHub Personal Access Token for clawhalla repo"
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              className="w-full px-3 py-2 bg-[#0a0a0b] border border-[#1e1e21] rounded-md text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-amber-500"
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium bg-amber-500 text-gray-900 rounded-lg hover:bg-amber-400 disabled:opacity-50"
          >
            {saving ? 'Encrypting...' : 'Save Secret'}
          </button>
        </div>
      )}

      {/* Secrets List */}
      <div className="bg-[#111113] rounded-lg border border-[#1e1e21] overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading vault...</div>
        ) : secrets.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <div className="text-3xl mb-2">🔒</div>
            <p>No secrets stored yet</p>
            <p className="text-xs mt-1">Click &quot;Add Secret&quot; to store your first credential</p>
          </div>
        ) : (
          <div className="divide-y divide-[#1e1e21]">
            {secrets.map(secret => {
              const cat = categoryLabels[secret.category] || categoryLabels.other;
              const isDeleting = deletingName === secret.name;

              return (
                <div key={secret.id} className="px-5 py-4 hover:bg-[#1a1a1d]">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2.5">
                        <span className="font-mono text-sm font-medium text-gray-200">{secret.name}</span>
                        <span className={`px-2 py-0.5 text-[10px] rounded ${cat.color}`}>
                          {cat.label}
                        </span>
                      </div>
                      {secret.description && (
                        <p className="text-xs text-gray-500 mt-1">{secret.description}</p>
                      )}
                      <div className="flex gap-4 text-[11px] text-gray-600 mt-2">
                        <span>Created {daysAgo(secret.createdAt)}</span>
                        <span>Updated {daysAgo(secret.updatedAt)}</span>
                        {secret.lastAccessedAt && <span>Accessed {daysAgo(secret.lastAccessedAt)}</span>}
                      </div>
                      {revealedValues[secret.name] && (
                        <div className="mt-2 px-3 py-1.5 bg-[#0a0a0b] rounded border border-[#1e1e21] font-mono text-xs text-gray-400">
                          {revealedValues[secret.name]}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <button
                        onClick={() => handleReveal(secret.name)}
                        className="px-2.5 py-1 text-xs text-gray-400 bg-[#1a1a1d] rounded border border-[#1e1e21] hover:text-gray-200 hover:border-[#333]"
                      >
                        {revealedValues[secret.name] ? 'Hide' : 'Peek'}
                      </button>
                      {isDeleting ? (
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleDelete(secret.name)}
                            className="px-2.5 py-1 text-xs text-red-400 bg-red-500/10 rounded border border-red-500/30 hover:bg-red-500/20"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setDeletingName(null)}
                            className="px-2.5 py-1 text-xs text-gray-400 bg-[#1a1a1d] rounded border border-[#1e1e21]"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeletingName(secret.name)}
                          className="px-2.5 py-1 text-xs text-gray-500 bg-[#1a1a1d] rounded border border-[#1e1e21] hover:text-red-400 hover:border-red-500/30"
                        >
                          Delete
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

      {/* Info */}
      <div className="text-xs text-gray-600 space-y-1">
        <p>Secrets are encrypted with AES-256-GCM before storage in SQLite.</p>
        <p>Encryption key derived from VAULT_KEY env var (or GATEWAY_TOKEN as fallback).</p>
        <p>Set a strong VAULT_KEY in your .env for production use.</p>
      </div>
    </div>
  );
}
