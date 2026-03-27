'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type ConnectionMode = 'local' | 'ssh' | 'cloud';
type Provider = 'anthropic' | 'ollama' | 'skip';

interface SSHConfig {
  host: string;
  port: string;
  user: string;
  keyPath: string;
}

interface TestResult {
  ok: boolean;
  status?: string;
  error?: string;
}

const TOTAL_STEPS = 5;

/* ------------------------------------------------------------------ */
/*  Onboarding Wizard (inner, CSR-only)                                */
/* ------------------------------------------------------------------ */

function OnboardingWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);

  // Connection state
  const [mode, setMode] = useState<ConnectionMode>('local');
  const [gatewayUrl, setGatewayUrl] = useState('http://127.0.0.1:18789');
  const [gatewayToken, setGatewayToken] = useState('');
  const [tokenConfigured, setTokenConfigured] = useState(false);
  const [sshConfig, setSSHConfig] = useState<SSHConfig>({
    host: '',
    port: '22',
    user: '',
    keyPath: '~/.ssh/id_rsa',
  });

  // Connection test state
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  // Provider state
  const [provider, setProvider] = useState<Provider>('anthropic');
  const [anthropicKey, setAnthropicKey] = useState('');
  const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434');

  // Save state
  const [saving, setSaving] = useState(false);

  // Pre-fill from current server config
  useEffect(() => {
    (async () => {
      try {
        const [urlRes, tokenRes] = await Promise.all([
          fetch('/api/settings?key=gateway_url'),
          fetch('/api/settings?key=gateway_token'),
        ]);
        const urlData = await urlRes.json();
        const tokenData = await tokenRes.json();
        if (urlData.value) setGatewayUrl(urlData.value);
        if (tokenData.configured) setTokenConfigured(true);
      } catch {
        // ignore — use defaults
      }
    })();
  }, []);

  /* ---------- helpers ---------- */

  const selectMode = (m: ConnectionMode) => {
    setMode(m);
    if (m === 'local') setGatewayUrl('http://127.0.0.1:18789');
    if (m === 'ssh') setGatewayUrl('');
    setTestResult(null);
  };

  const testConnection = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/connection/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: gatewayUrl, token: gatewayToken }),
      });
      const data: TestResult = await res.json();
      setTestResult(data);
    } catch {
      setTestResult({ ok: false, error: 'Network error' });
    } finally {
      setTesting(false);
    }
  }, [gatewayUrl, gatewayToken]);

  const saveAndFinish = useCallback(async () => {
    setSaving(true);
    try {
      await fetch('/api/connection/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          gatewayUrl,
          gatewayToken,
          ...(mode === 'ssh' ? { ssh: sshConfig } : {}),
          ...(provider === 'anthropic' && anthropicKey ? { anthropicKey } : {}),
          ...(provider === 'ollama' ? { ollamaUrl } : {}),
          connectedAt: new Date().toISOString(),
        }),
      });
      router.push('/dashboard');
    } catch {
      setSaving(false);
    }
  }, [mode, gatewayUrl, gatewayToken, sshConfig, provider, anthropicKey, ollamaUrl, router]);

  /* ---------- progress indicator ---------- */

  const Progress = () => (
    <div className="flex items-center gap-2 mb-8">
      {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((s) => (
        <div key={s} className="flex items-center gap-2">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
              s === step
                ? 'bg-amber-500 text-black'
                : s < step
                  ? 'bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/40'
                  : 'bg-white/5 text-gray-500'
            }`}
          >
            {s < step ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              s
            )}
          </div>
          {s < TOTAL_STEPS && (
            <div className={`w-10 h-0.5 ${s < step ? 'bg-amber-500/40' : 'bg-white/5'}`} />
          )}
        </div>
      ))}
    </div>
  );

  /* ---------- step 1: welcome ---------- */

  if (step === 1) {
    return (
      <Wrapper>
        <Progress />
        <Card>
          <div className="flex items-center justify-center mb-6">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
              <span className="text-3xl">🦞</span>
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white text-center mb-2">Welcome to Mission Control</h1>
          <p className="text-gray-400 text-center mb-8 max-w-sm">
            Let&apos;s connect to your ClawHalla gateway and configure your AI providers.
          </p>
          <button
            onClick={() => setStep(2)}
            className="w-full rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-black hover:bg-amber-400 transition-colors"
          >
            Get Started
          </button>
        </Card>
      </Wrapper>
    );
  }

  /* ---------- step 2: connection ---------- */

  if (step === 2) {
    return (
      <Wrapper>
        <Progress />
        <Card>
          <h2 className="text-xl font-bold text-white mb-1">Gateway Connection</h2>
          <p className="text-gray-400 text-sm mb-6">How should Mission Control reach your OpenClaw gateway?</p>

          <div className="grid gap-3 mb-5">
            <ModeCard
              selected={mode === 'local'}
              onClick={() => selectMode('local')}
              icon={<MonitorIcon />}
              title="Local"
              desc="Gateway running on this machine"
            />
            <ModeCard
              selected={mode === 'ssh'}
              onClick={() => selectMode('ssh')}
              icon={<ServerIcon />}
              title="SSH Remote"
              desc="Gateway on a remote server via SSH"
            />
            <div className="relative rounded-xl border border-white/5 bg-white/[0.02] p-4 opacity-40 cursor-not-allowed">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center text-gray-500 shrink-0">
                  <CloudIcon />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-400">Cloud</span>
                    <span className="text-[10px] font-semibold bg-white/10 text-gray-500 px-1.5 py-0.5 rounded uppercase tracking-wider">
                      Coming Soon
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 mt-0.5">controls.clawhalla.xyz managed instance</p>
                </div>
              </div>
            </div>
          </div>

          {/* SSH fields */}
          {mode === 'ssh' && (
            <div className="mb-4 space-y-3 p-4 rounded-xl bg-white/[0.02] border border-white/5">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Host" value={sshConfig.host} onChange={(v) => setSSHConfig({ ...sshConfig, host: v })} placeholder="192.168.1.100" />
                <Field label="Port" value={sshConfig.port} onChange={(v) => setSSHConfig({ ...sshConfig, port: v })} placeholder="22" />
              </div>
              <Field label="User" value={sshConfig.user} onChange={(v) => setSSHConfig({ ...sshConfig, user: v })} placeholder="clawdbot" />
              <Field label="SSH Key Path" value={sshConfig.keyPath} onChange={(v) => setSSHConfig({ ...sshConfig, keyPath: v })} placeholder="~/.ssh/id_rsa" />
              <Field label="Gateway URL" value={gatewayUrl} onChange={setGatewayUrl} placeholder="http://192.168.1.100:18789" />
            </div>
          )}

          {/* Gateway URL (local mode) */}
          {mode === 'local' && (
            <div className="mb-4">
              <Field label="Gateway URL" value={gatewayUrl} onChange={setGatewayUrl} placeholder="http://127.0.0.1:18789" />
            </div>
          )}

          {/* Auth token */}
          <div className="mb-6">
            <label className="block">
              <span className="text-xs text-gray-500 font-medium">Gateway Token</span>
              {tokenConfigured && !gatewayToken && (
                <span className="ml-2 text-[10px] text-emerald-400 font-medium">✓ configured via environment</span>
              )}
              <input
                type="password"
                value={gatewayToken}
                onChange={(e) => setGatewayToken(e.target.value)}
                placeholder={tokenConfigured ? 'Leave empty to keep existing token' : 'Paste your gateway token'}
                className="mt-1 block w-full rounded-lg bg-white/[0.04] border border-white/10 px-3 py-2 text-sm text-gray-200 placeholder:text-gray-600 focus:border-amber-500/50 focus:ring-0 focus:outline-none transition-colors"
              />
            </label>
            <p className="mt-1.5 text-xs text-gray-600">
              Found in <code className="text-gray-500">~/.openclaw/openclaw.json</code> → gateway.auth.token
            </p>
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStep(1)} className="rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-gray-300 hover:bg-white/10 transition-colors flex-1">
              Back
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={mode === 'ssh' && (!sshConfig.host || !gatewayUrl)}
              className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-black hover:bg-amber-400 transition-colors flex-1 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </Card>
      </Wrapper>
    );
  }

  /* ---------- step 3: test connection ---------- */

  if (step === 3) {
    return (
      <Wrapper>
        <Progress />
        <Card>
          <h2 className="text-xl font-bold text-white mb-1">Test Connection</h2>
          <p className="text-gray-400 text-sm mb-6">Verifying connectivity to your gateway.</p>

          <div className="rounded-lg bg-white/[0.03] border border-white/5 px-4 py-3 mb-5">
            <div className="text-[11px] text-gray-500 uppercase tracking-wider font-medium mb-1">Gateway URL</div>
            <code className="text-sm text-amber-400 font-mono">{gatewayUrl}</code>
          </div>

          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5 mb-6 min-h-[80px] flex items-center justify-center">
            {testing && (
              <div className="flex items-center gap-3 text-gray-400">
                <Spinner />
                <span>Testing connection...</span>
              </div>
            )}
            {!testing && testResult === null && (
              <p className="text-gray-500 text-sm">Click &quot;Test&quot; to check connectivity.</p>
            )}
            {!testing && testResult?.ok && (
              <div className="flex items-center gap-3 text-emerald-400">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="font-semibold">Connected</p>
                  <p className="text-xs text-emerald-400/60">
                    Gateway is reachable{testResult.status ? ` — status: ${testResult.status}` : ''}
                  </p>
                </div>
              </div>
            )}
            {!testing && testResult && !testResult.ok && (
              <div className="flex items-center gap-3 text-red-400">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="font-semibold">Connection Failed</p>
                  <p className="text-xs text-red-400/60">{testResult.error || 'Unable to reach gateway'}</p>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStep(2)} className="rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-gray-300 hover:bg-white/10 transition-colors flex-1">
              Back
            </button>
            {(!testResult || !testResult.ok) && (
              <button
                onClick={testConnection}
                disabled={testing}
                className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-black hover:bg-amber-400 transition-colors flex-1 disabled:opacity-60"
              >
                {testing ? 'Testing...' : testResult ? 'Retry' : 'Test'}
              </button>
            )}
            {testResult?.ok && (
              <button
                onClick={() => setStep(4)}
                className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-black hover:bg-amber-400 transition-colors flex-1"
              >
                Next
              </button>
            )}
          </div>

          {/* Skip option */}
          {!testResult?.ok && (
            <button
              onClick={() => setStep(4)}
              className="mt-3 w-full text-center text-xs text-gray-600 hover:text-gray-400 transition-colors"
            >
              Skip — configure connection later
            </button>
          )}
        </Card>
      </Wrapper>
    );
  }

  /* ---------- step 4: provider & model ---------- */

  if (step === 4) {
    return (
      <Wrapper>
        <Progress />
        <Card>
          <h2 className="text-xl font-bold text-white mb-1">AI Provider</h2>
          <p className="text-gray-400 text-sm mb-6">
            Which AI provider will your agents use? You can change this later in Settings.
          </p>

          <div className="grid gap-3 mb-5">
            <ModeCard
              selected={provider === 'anthropic'}
              onClick={() => setProvider('anthropic')}
              icon={<span className="text-lg">✦</span>}
              title="Anthropic Claude"
              desc="Claude Opus, Sonnet, Haiku — best for coding & reasoning"
            />
            <ModeCard
              selected={provider === 'ollama'}
              onClick={() => setProvider('ollama')}
              icon={<span className="text-lg">🦙</span>}
              title="Ollama (Local Models)"
              desc="Free local models — Llama, Mistral, Qwen, DeepSeek"
            />
            <ModeCard
              selected={provider === 'skip'}
              onClick={() => setProvider('skip')}
              icon={<span className="text-lg">⏭</span>}
              title="Skip for now"
              desc="Configure providers later in Settings"
            />
          </div>

          {provider === 'anthropic' && (
            <div className="mb-5 p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-3">
              <label className="block">
                <span className="text-xs text-gray-500 font-medium">Anthropic API Key</span>
                <input
                  type="password"
                  value={anthropicKey}
                  onChange={(e) => setAnthropicKey(e.target.value)}
                  placeholder="sk-ant-..."
                  className="mt-1 block w-full rounded-lg bg-white/[0.04] border border-white/10 px-3 py-2 text-sm text-gray-200 placeholder:text-gray-600 focus:border-amber-500/50 focus:ring-0 focus:outline-none transition-colors"
                />
              </label>
              <p className="text-xs text-gray-600">
                Stored encrypted in your local vault.{' '}
                <a href="https://console.anthropic.com/keys" target="_blank" rel="noopener noreferrer" className="text-amber-500/70 hover:text-amber-400">
                  Get an API key →
                </a>
              </p>
            </div>
          )}

          {provider === 'ollama' && (
            <div className="mb-5 p-4 rounded-xl bg-white/[0.02] border border-white/5">
              <Field
                label="Ollama URL"
                value={ollamaUrl}
                onChange={setOllamaUrl}
                placeholder="http://localhost:11434"
              />
              <p className="mt-2 text-xs text-gray-600">
                Start Ollama then pull a model:{' '}
                <code className="text-gray-500">ollama pull llama3.2</code>
              </p>
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={() => setStep(3)} className="rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-gray-300 hover:bg-white/10 transition-colors flex-1">
              Back
            </button>
            <button
              onClick={() => setStep(5)}
              className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-black hover:bg-amber-400 transition-colors flex-1"
            >
              Next
            </button>
          </div>
        </Card>
      </Wrapper>
    );
  }

  /* ---------- step 5: done ---------- */

  return (
    <Wrapper>
      <Progress />
      <Card>
        <div className="flex items-center justify-center mb-6">
          <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center">
            <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
        <h2 className="text-2xl font-bold text-white text-center mb-2">You&apos;re All Set!</h2>
        <p className="text-gray-400 text-center mb-2 max-w-sm">
          Mission Control is connected to your ClawHalla gateway.
        </p>

        <div className="rounded-xl bg-white/[0.02] border border-white/5 p-4 mb-8 space-y-2 text-sm">
          <SummaryRow label="Gateway" value={gatewayUrl} />
          <SummaryRow label="Mode" value={mode === 'local' ? 'Local' : 'SSH Remote'} />
          <SummaryRow
            label="Provider"
            value={provider === 'anthropic' ? 'Anthropic Claude' : provider === 'ollama' ? 'Ollama (local)' : 'Not configured'}
          />
        </div>

        <button
          onClick={saveAndFinish}
          disabled={saving}
          className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-black hover:bg-amber-400 transition-colors w-full disabled:opacity-60"
        >
          {saving ? 'Saving...' : 'Open Dashboard'}
        </button>
      </Card>
    </Wrapper>
  );
}

/* ------------------------------------------------------------------ */
/*  Shared UI Components                                               */
/* ------------------------------------------------------------------ */

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0a0a0b] flex flex-col items-center justify-center p-4">
      {children}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full max-w-md rounded-2xl border border-white/[0.06] bg-[#111113] p-8 shadow-2xl shadow-black/40">
      {children}
    </div>
  );
}

function ModeCard({
  selected,
  onClick,
  icon,
  title,
  desc,
}: {
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-xl border p-4 transition-colors ${
        selected
          ? 'border-amber-500/50 bg-amber-500/[0.06]'
          : 'border-white/5 bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.04]'
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
            selected ? 'bg-amber-500/15 text-amber-400' : 'bg-white/5 text-gray-400'
          }`}
        >
          {icon}
        </div>
        <div>
          <span className={`font-medium ${selected ? 'text-amber-400' : 'text-gray-200'}`}>{title}</span>
          <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
        </div>
      </div>
    </button>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label className="block">
      <span className="text-xs text-gray-500 font-medium">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 block w-full rounded-lg bg-white/[0.04] border border-white/10 px-3 py-2 text-sm text-gray-200 placeholder:text-gray-600 focus:border-amber-500/50 focus:ring-0 focus:outline-none transition-colors"
      />
    </label>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-gray-500 text-xs">{label}</span>
      <span className="text-gray-300 text-xs font-mono truncate max-w-[200px]">{value}</span>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="w-5 h-5 animate-spin text-amber-500" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function MonitorIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  );
}

function ServerIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  );
}

function CloudIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Dynamic export (SSR disabled)                                      */
/* ------------------------------------------------------------------ */

const OnboardingPage = dynamic(() => Promise.resolve(OnboardingWizard), {
  ssr: false,
});

export default function Page() {
  return <OnboardingPage />;
}
