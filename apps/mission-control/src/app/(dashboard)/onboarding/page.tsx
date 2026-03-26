'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type ConnectionMode = 'local' | 'ssh' | 'cloud';

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

/* ------------------------------------------------------------------ */
/*  Onboarding Wizard (inner, CSR-only)                                */
/* ------------------------------------------------------------------ */

function OnboardingWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [mode, setMode] = useState<ConnectionMode>('local');
  const [gatewayUrl, setGatewayUrl] = useState('ws://127.0.0.1:18789');
  const [sshConfig, setSSHConfig] = useState<SSHConfig>({
    host: '',
    port: '22',
    user: '',
    keyPath: '~/.ssh/id_rsa',
  });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [saving, setSaving] = useState(false);

  /* ---------- helpers ---------- */

  const selectMode = (m: ConnectionMode) => {
    setMode(m);
    if (m === 'local') setGatewayUrl('ws://127.0.0.1:18789');
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
        body: JSON.stringify({ url: gatewayUrl }),
      });
      const data: TestResult = await res.json();
      setTestResult(data);
    } catch {
      setTestResult({ ok: false, error: 'Network error' });
    } finally {
      setTesting(false);
    }
  }, [gatewayUrl]);

  const saveAndFinish = useCallback(async () => {
    setSaving(true);
    try {
      await fetch('/api/connection/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          gatewayUrl,
          ...(mode === 'ssh' ? { ssh: sshConfig } : {}),
          connectedAt: new Date().toISOString(),
        }),
      });
      router.push('/dashboard');
    } catch {
      setSaving(false);
    }
  }, [mode, gatewayUrl, sshConfig, router]);

  /* ---------- progress indicator ---------- */

  const Progress = () => (
    <div className="flex items-center gap-2 mb-8">
      {[1, 2, 3, 4].map((s) => (
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
          {s < 4 && (
            <div
              className={`w-12 h-0.5 ${s < step ? 'bg-amber-500/40' : 'bg-white/5'}`}
            />
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
          {/* Logo */}
          <div className="flex items-center justify-center mb-6">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
              <svg className="w-9 h-9 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white text-center mb-2">
            Welcome to Mission Control
          </h1>
          <p className="text-gray-400 text-center mb-8 max-w-sm">
            Let&apos;s connect to your ClawHalla instance and get everything set up.
          </p>
          <button onClick={() => setStep(2)} className="w-full rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-black hover:bg-amber-400 transition-colors">
            Get Started
          </button>
        </Card>
      </Wrapper>
    );
  }

  /* ---------- step 2: connection mode ---------- */

  if (step === 2) {
    return (
      <Wrapper>
        <Progress />
        <Card>
          <h2 className="text-xl font-bold text-white mb-1">Connection Mode</h2>
          <p className="text-gray-400 text-sm mb-6">
            How should Mission Control reach your gateway?
          </p>

          <div className="grid gap-3">
            {/* Local */}
            <ModeCard
              selected={mode === 'local'}
              onClick={() => selectMode('local')}
              icon={
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              }
              title="Local"
              desc="Gateway running on this machine"
            />

            {/* SSH Remote */}
            <ModeCard
              selected={mode === 'ssh'}
              onClick={() => selectMode('ssh')}
              icon={
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              }
              title="SSH Remote"
              desc="Gateway on a remote server via SSH"
            />

            {/* Cloud (disabled) */}
            <div className="relative rounded-xl border border-white/5 bg-white/[0.02] p-4 opacity-40 cursor-not-allowed">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center text-gray-500 shrink-0">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                  </svg>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-400">Cloud</span>
                    <span className="text-[10px] font-semibold bg-white/10 text-gray-500 px-1.5 py-0.5 rounded uppercase tracking-wider">
                      Coming Soon
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 mt-0.5">ClawHalla Cloud managed instance</p>
                </div>
              </div>
            </div>
          </div>

          {/* SSH fields */}
          {mode === 'ssh' && (
            <div className="mt-4 space-y-3 p-4 rounded-xl bg-white/[0.02] border border-white/5">
              <div className="grid grid-cols-2 gap-3">
                <Field
                  label="Host"
                  value={sshConfig.host}
                  onChange={(v) => setSSHConfig({ ...sshConfig, host: v })}
                  placeholder="192.168.1.100"
                />
                <Field
                  label="Port"
                  value={sshConfig.port}
                  onChange={(v) => setSSHConfig({ ...sshConfig, port: v })}
                  placeholder="22"
                />
              </div>
              <Field
                label="User"
                value={sshConfig.user}
                onChange={(v) => setSSHConfig({ ...sshConfig, user: v })}
                placeholder="clawdbot"
              />
              <Field
                label="Key Path"
                value={sshConfig.keyPath}
                onChange={(v) => setSSHConfig({ ...sshConfig, keyPath: v })}
                placeholder="~/.ssh/id_rsa"
              />
              <Field
                label="Gateway URL"
                value={gatewayUrl}
                onChange={setGatewayUrl}
                placeholder="ws://192.168.1.100:18789"
              />
            </div>
          )}

          <div className="flex gap-3 mt-6">
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
          <p className="text-gray-400 text-sm mb-6">
            Verifying connectivity to your gateway.
          </p>

          {/* URL display */}
          <div className="rounded-lg bg-white/[0.03] border border-white/5 px-4 py-3 mb-5">
            <div className="text-[11px] text-gray-500 uppercase tracking-wider font-medium mb-1">
              Gateway URL
            </div>
            <code className="text-sm text-amber-400 font-mono">{gatewayUrl}</code>
          </div>

          {/* Test status */}
          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5 mb-6 min-h-[80px] flex items-center justify-center">
            {testing && (
              <div className="flex items-center gap-3 text-gray-400">
                <Spinner />
                <span>Testing connection...</span>
              </div>
            )}

            {!testing && testResult === null && (
              <p className="text-gray-500 text-sm">
                Click &quot;Test&quot; to check connectivity.
              </p>
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
                  <p className="text-xs text-red-400/60">
                    {testResult.error || 'Unable to reach gateway'}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStep(2)} className="rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-gray-300 hover:bg-white/10 transition-colors flex-1">
              Back
            </button>
            {(!testResult || !testResult.ok) && (
              <button onClick={testConnection} disabled={testing} className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-black hover:bg-amber-400 transition-colors flex-1 disabled:opacity-60">
                {testing ? 'Testing...' : testResult ? 'Retry' : 'Test'}
              </button>
            )}
            {testResult?.ok && (
              <button onClick={() => setStep(4)} className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-black hover:bg-amber-400 transition-colors flex-1">
                Next
              </button>
            )}
          </div>
        </Card>
      </Wrapper>
    );
  }

  /* ---------- step 4: done ---------- */

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
        <h2 className="text-2xl font-bold text-white text-center mb-2">
          You&apos;re All Set!
        </h2>
        <p className="text-gray-400 text-center mb-8 max-w-sm">
          Mission Control is connected to your ClawHalla gateway. You can change these settings later.
        </p>
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
          <span className={`font-medium ${selected ? 'text-amber-400' : 'text-gray-200'}`}>
            {title}
          </span>
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

function Spinner() {
  return (
    <svg className="w-5 h-5 animate-spin text-amber-500" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
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
