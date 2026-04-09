'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { SQUADS } from '@/lib/squads';
import type { SquadDefinition } from '@/lib/squads';
import { ConnectivityBanner } from '@/components/connectivity-banner';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type Provider = 'anthropic' | 'google' | 'ollama' | 'skip';
type Channel = 'mc' | 'telegram';

interface TestResult {
  ok: boolean;
  status?: string;
  error?: string;
  model?: string;
}

const TOTAL_STEPS = 10;

/* ------------------------------------------------------------------ */
/*  Onboarding Wizard                                                  */
/* ------------------------------------------------------------------ */

function OnboardingWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);

  // Provider state
  const [provider, setProvider] = useState<Provider>('anthropic');
  const [apiKey, setApiKey] = useState('');
  const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434');

  // Test state
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  // Gateway (auto-detected from openclaw.json when possible)
  const [gatewayUrl, setGatewayUrl] = useState('');
  const [gatewayToken, setGatewayToken] = useState('');
  const [gatewayOnline, setGatewayOnline] = useState(false);
  const [tokenConfigured, setTokenConfigured] = useState(false);
  const [detected, setDetected] = useState(false);

  // Channel
  const [channel, setChannel] = useState<Channel>('mc');
  const [telegramToken, setTelegramToken] = useState('');

  // Squad
  const [selectedSquad, setSelectedSquad] = useState<string>('personal');

  // Agent customization (per agent in squad)
  const [agentCustomizations, setAgentCustomizations] = useState<Record<string, { language: string; focus: string }>>({});

  // Create state
  const [creating, setCreating] = useState(false);
  const [createProgress, setCreateProgress] = useState<string[]>([]);
  const [createDone, setCreateDone] = useState(false);

  // Profile state
  const [profileName, setProfileName] = useState('');
  const [profileCallName, setProfileCallName] = useState('');
  const [profileTimezone, setProfileTimezone] = useState('');
  const [profileContext, setProfileContext] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);

  // Save state
  const [saving, setSaving] = useState(false);

  // Auto-detect from openclaw.json (install.sh already created it)
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/connection/detect');
        const data = await res.json();
        if (data.detected) {
          setDetected(true);
          if (data.gateway?.url) setGatewayUrl(data.gateway.url);
          if (data.gateway?.token) {
            setGatewayToken(data.gateway.token);
            setTokenConfigured(true);
          }
          if (data.gateway?.online) setGatewayOnline(data.gateway.online);
          // Auto-select provider if already configured
          if (data.configuredProviders?.includes('anthropic')) setProvider('anthropic');
          else if (data.configuredProviders?.includes('google')) setProvider('google');
        }
      } catch { /* ignore — wizard still works manually */ }
    })();
  }, []);

  /* ---------- helpers ---------- */

  const generateToken = () => {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    const token = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    setGatewayToken(token);
  };

  const testLLM = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/connection/test-llm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          apiKey: provider === 'anthropic' || provider === 'google' ? apiKey : undefined,
          ollamaUrl: provider === 'ollama' ? ollamaUrl : undefined,
        }),
      });
      const data: TestResult = await res.json();
      setTestResult(data);
    } catch {
      setTestResult({ ok: false, error: 'Network error' });
    } finally {
      setTesting(false);
    }
  }, [provider, apiKey, ollamaUrl]);

  const selectedSquadDef = SQUADS.find(s => s.id === selectedSquad);
  const allAgents = selectedSquadDef?.agents || [];

  const createAgents = useCallback(async () => {
    setCreating(true);
    setCreateProgress(['Saving configuration...']);

    try {
      // 1. Save all config to vault + settings
      await fetch('/api/connection/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          apiKey: provider !== 'skip' && provider !== 'ollama' ? apiKey : undefined,
          ollamaUrl: provider === 'ollama' ? ollamaUrl : undefined,
          gatewayUrl: gatewayUrl || undefined,
          gatewayToken,
          channel,
          telegramToken: channel === 'telegram' ? telegramToken : undefined,
          squad: selectedSquad,
          agentCustomizations,
          connectedAt: new Date().toISOString(),
        }),
      });

      setCreateProgress(p => [...p, 'Configuration saved to vault']);

      // 2. Request Claw to create the squad
      setCreateProgress(p => [...p, `Creating ${selectedSquadDef?.name} Squad...`]);

      const res = await fetch('/api/squads/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          squadId: selectedSquad,
          customizations: agentCustomizations,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.agents) {
          for (const agent of data.agents) {
            setCreateProgress(p => [...p, `${agent.emoji} ${agent.name} — ${agent.role} ✓`]);
            await new Promise(r => setTimeout(r, 400)); // visual delay
          }
        }
      }

      setCreateProgress(p => [...p, '🦞 Claw is online and ready!']);
      setCreateDone(true);
    } catch (err) {
      setCreateProgress(p => [...p, `Error: ${String(err)}`]);
    } finally {
      setCreating(false);
    }
  }, [provider, apiKey, ollamaUrl, gatewayUrl, gatewayToken, channel, telegramToken, selectedSquad, agentCustomizations, selectedSquadDef]);

  const goToDashboard = useCallback(async () => {
    setSaving(true);
    router.push('/dashboard');
  }, [router]);

  /* ---------- progress indicator ---------- */

  const Progress = () => (
    <div className="flex items-center gap-1.5 mb-8 flex-wrap justify-center">
      {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((s) => (
        <div key={s} className="flex items-center gap-1.5">
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold transition-colors ${
              s === step
                ? 'bg-amber-500 text-black'
                : s < step
                  ? 'bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/40'
                  : 'bg-white/5 text-gray-500'
            }`}
          >
            {s < step ? (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              s
            )}
          </div>
          {s < TOTAL_STEPS && (
            <div className={`w-6 h-0.5 ${s < step ? 'bg-amber-500/40' : 'bg-white/5'}`} />
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
          <h1 className="text-2xl font-bold text-white text-center mb-2">Welcome to ClawHalla</h1>
          <p className="text-gray-400 text-center mb-8 max-w-sm">
            Let&apos;s set up your AI squad. We&apos;ll configure your LLM provider,
            gateway, and create your first agents.
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

  /* ---------- step 2: LLM provider ---------- */

  if (step === 2) {
    return (
      <Wrapper>
        <Progress />
        <Card>
          <h2 className="text-xl font-bold text-white mb-1">LLM Provider</h2>
          <p className="text-gray-400 text-sm mb-6">
            Which AI provider will power your agents?
          </p>

          <div className="grid gap-3 mb-5">
            <ModeCard
              selected={provider === 'anthropic'}
              onClick={() => setProvider('anthropic')}
              icon={<span className="text-lg">✦</span>}
              title="Anthropic Claude"
              desc="Opus, Sonnet, Haiku — best for coding & reasoning"
            />
            <ModeCard
              selected={provider === 'google'}
              onClick={() => setProvider('google')}
              icon={<span className="text-lg">◆</span>}
              title="Google Gemini"
              desc="Gemini Pro, Flash — multimodal & web search"
            />
            <ModeCard
              selected={provider === 'ollama'}
              onClick={() => setProvider('ollama')}
              icon={<span className="text-lg">🦙</span>}
              title="Ollama (Local)"
              desc="Free local models — Llama, DeepSeek, Qwen"
            />
            <ModeCard
              selected={provider === 'skip'}
              onClick={() => setProvider('skip')}
              icon={<span className="text-lg">⏭</span>}
              title="Skip for now"
              desc="Configure providers later in Settings"
            />
          </div>

          {(provider === 'anthropic' || provider === 'google') && (
            <div className="mb-5 p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-3">
              <label className="block">
                <span className="text-xs text-gray-500 font-medium">
                  {provider === 'anthropic' ? 'Anthropic API Key' : 'Google API Key'}
                </span>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={provider === 'anthropic' ? 'sk-ant-...' : 'AIzaSy...'}
                  className="mt-1 block w-full rounded-lg bg-white/[0.04] border border-white/10 px-3 py-2 text-sm text-gray-200 placeholder:text-gray-600 focus:border-amber-500/50 focus:ring-0 focus:outline-none transition-colors"
                />
              </label>
              <p className="text-xs text-gray-600">
                Stored encrypted in your local vault. Never leaves your machine.
              </p>
            </div>
          )}

          {provider === 'ollama' && (
            <div className="mb-5 p-4 rounded-xl bg-white/[0.02] border border-white/5">
              <Field label="Ollama URL" value={ollamaUrl} onChange={setOllamaUrl} placeholder="http://localhost:11434" />
              <p className="mt-2 text-xs text-gray-600">
                Run: <code className="text-gray-500">ollama pull llama3.2</code>
              </p>
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={() => setStep(1)} className="rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-gray-300 hover:bg-white/10 transition-colors flex-1">
              Back
            </button>
            <button
              onClick={() => setStep(provider === 'skip' ? 4 : 3)}
              disabled={provider !== 'skip' && provider !== 'ollama' && !apiKey}
              className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-black hover:bg-amber-400 transition-colors flex-1 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {provider === 'skip' ? 'Skip' : 'Next'}
            </button>
          </div>
        </Card>
      </Wrapper>
    );
  }

  /* ---------- step 3: test LLM ---------- */

  if (step === 3) {
    return (
      <Wrapper>
        <Progress />
        <Card>
          <h2 className="text-xl font-bold text-white mb-1">Test LLM Connection</h2>
          <p className="text-gray-400 text-sm mb-6">
            Let&apos;s verify your {provider === 'anthropic' ? 'Anthropic' : provider === 'google' ? 'Google' : 'Ollama'} connection works.
          </p>

          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5 mb-6 min-h-[80px] flex items-center justify-center">
            {testing && (
              <div className="flex items-center gap-3 text-gray-400">
                <Spinner />
                <span>Testing connection...</span>
              </div>
            )}
            {!testing && testResult === null && (
              <p className="text-gray-500 text-sm">Click &quot;Test&quot; to verify your API key.</p>
            )}
            {!testing && testResult?.ok && (
              <div className="flex items-center gap-3 text-emerald-400">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="font-semibold">Connected</p>
                  <p className="text-xs text-emerald-400/60">
                    {testResult.model ? `Model: ${testResult.model}` : 'LLM is reachable'}
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
                  <p className="text-xs text-red-400/60">{testResult.error || 'Check your API key'}</p>
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
                onClick={testLLM}
                disabled={testing}
                className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-black hover:bg-amber-400 transition-colors flex-1 disabled:opacity-60"
              >
                {testing ? 'Testing...' : testResult ? 'Retry' : 'Test'}
              </button>
            )}
            {testResult?.ok && (
              <button onClick={() => setStep(4)} className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-black hover:bg-amber-400 transition-colors flex-1">
                Next
              </button>
            )}
          </div>
          {!testResult?.ok && (
            <button onClick={() => setStep(4)} className="mt-3 w-full text-center text-xs text-gray-600 hover:text-gray-400 transition-colors">
              Skip — configure later
            </button>
          )}
        </Card>
      </Wrapper>
    );
  }

  /* ---------- step 4: gateway connection ---------- */

  if (step === 4) {
    const hasToken = !!gatewayToken || tokenConfigured;
    return (
      <Wrapper>
        <Progress />
        <Card>
          <h2 className="text-xl font-bold text-white mb-1">Gateway Connection</h2>
          <p className="text-gray-400 text-sm mb-6">
            {detected
              ? 'We detected your OpenClaw gateway configuration automatically.'
              : 'Configure the connection to your OpenClaw gateway.'}
          </p>

          <div className="mb-5 space-y-4">
            {/* Gateway status */}
            <div className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-xs font-medium ${
              detected && gatewayOnline
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : detected
                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                  : 'bg-red-500/10 text-red-400 border border-red-500/20'
            }`}>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${
                  detected && gatewayOnline ? 'bg-emerald-400' : detected ? 'bg-amber-400 animate-pulse' : 'bg-red-400'
                }`} />
                {detected && gatewayOnline
                  ? `Gateway online at ${gatewayUrl}`
                  : detected
                    ? `Gateway not responding at ${gatewayUrl} — start it with: openclaw gateway`
                    : 'OpenClaw not detected — run install.sh first or configure manually below'}
              </div>
              <button
                onClick={async () => {
                  try {
                    const res = await fetch('/api/connection/detect');
                    const data = await res.json();
                    if (data.detected) {
                      setDetected(true);
                      if (data.gateway?.url) setGatewayUrl(data.gateway.url);
                      if (data.gateway?.token) { setGatewayToken(data.gateway.token); setTokenConfigured(true); }
                      setGatewayOnline(!!data.gateway?.online);
                    }
                  } catch { /* ignore */ }
                }}
                className="shrink-0 text-[10px] px-2 py-1 rounded border border-white/10 hover:bg-white/10 transition-colors"
              >
                Retry
              </button>
            </div>

            {/* Gateway URL (read-only when detected) */}
            <label className="block">
              <span className="text-xs text-gray-500 font-medium">Gateway URL</span>
              {detected && <span className="ml-2 text-[10px] text-emerald-400 font-medium">auto-detected</span>}
              <input
                type="text"
                value={gatewayUrl}
                onChange={(e) => setGatewayUrl(e.target.value)}
                placeholder="http://127.0.0.1:18789"
                className="mt-1 block w-full rounded-lg bg-white/[0.04] border border-white/10 px-3 py-2 text-sm text-gray-200 font-mono placeholder:text-gray-600 focus:border-amber-500/50 focus:ring-0 focus:outline-none transition-colors"
              />
            </label>

            {/* Gateway token */}
            <label className="block">
              <span className="text-xs text-gray-500 font-medium">Token</span>
              {detected && gatewayToken && (
                <span className="ml-2 text-[10px] text-emerald-400 font-medium">auto-detected</span>
              )}
              <div className="flex gap-2 mt-1">
                <input
                  type="password"
                  value={gatewayToken}
                  onChange={(e) => setGatewayToken(e.target.value)}
                  placeholder={tokenConfigured ? 'Leave empty to keep existing' : 'Paste or generate a token'}
                  className="block flex-1 rounded-lg bg-white/[0.04] border border-white/10 px-3 py-2 text-sm text-gray-200 font-mono placeholder:text-gray-600 focus:border-amber-500/50 focus:ring-0 focus:outline-none transition-colors"
                />
                {!detected && (
                  <button
                    onClick={generateToken}
                    className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-gray-300 hover:bg-white/10 transition-colors"
                    title="Generate random token"
                  >
                    Generate
                  </button>
                )}
              </div>
              <p className="text-xs text-gray-600 mt-1">
                Stored encrypted in the vault. Used for gateway ↔ MC communication.
              </p>
            </label>
          </div>

          {!hasToken && (
            <p className="text-xs text-amber-400/80 mb-3">
              A token is required. Click &quot;Generate&quot; or paste your own.
            </p>
          )}

          <div className="flex gap-3">
            <button onClick={() => setStep(provider === 'skip' ? 2 : 3)} className="rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-gray-300 hover:bg-white/10 transition-colors flex-1">
              Back
            </button>
            <button
              onClick={() => {
                if (!hasToken) {
                  generateToken();
                  return;
                }
                setStep(5);
              }}
              className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-black hover:bg-amber-400 transition-colors flex-1"
            >
              {!hasToken ? 'Generate & Continue' : 'Next'}
            </button>
          </div>
        </Card>
      </Wrapper>
    );
  }

  /* ---------- step 5: channel ---------- */

  if (step === 5) {
    return (
      <Wrapper>
        <Progress />
        <Card>
          <h2 className="text-xl font-bold text-white mb-1">Primary Channel</h2>
          <p className="text-gray-400 text-sm mb-6">
            How do you want to talk to your agents?
          </p>

          <div className="grid gap-3 mb-5">
            <ModeCard
              selected={channel === 'mc'}
              onClick={() => setChannel('mc')}
              icon={<span className="text-lg">💬</span>}
              title="Mission Control Chat"
              desc="Built-in chat right here in the dashboard"
            />
            <ModeCard
              selected={channel === 'telegram'}
              onClick={() => setChannel('telegram')}
              icon={<span className="text-lg">📱</span>}
              title="Telegram"
              desc="Chat with agents via Telegram bot"
            />
          </div>

          {channel === 'telegram' && (
            <div className="mb-5 p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-3">
              <label className="block">
                <span className="text-xs text-gray-500 font-medium">Telegram Bot Token</span>
                <input
                  type="password"
                  value={telegramToken}
                  onChange={(e) => setTelegramToken(e.target.value)}
                  placeholder="123456789:ABCdefGHI-jklMNOpqrSTUvwx"
                  className={`mt-1 block w-full rounded-lg bg-white/[0.04] border px-3 py-2 text-sm text-gray-200 placeholder:text-gray-600 focus:ring-0 focus:outline-none transition-colors ${
                    telegramToken && !/^\d{8,}:[A-Za-z0-9_-]{35,}$/.test(telegramToken)
                      ? 'border-red-500/50 focus:border-red-500/50'
                      : 'border-white/10 focus:border-amber-500/50'
                  }`}
                />
              </label>
              {telegramToken && !/^\d{8,}:[A-Za-z0-9_-]{35,}$/.test(telegramToken) && (
                <p className="text-xs text-red-400">
                  Invalid format. Token should be like: 123456789:ABCdefGHI-jklMNOpqrSTUvwx
                </p>
              )}
              <p className="text-xs text-gray-600">
                Create a bot via @BotFather on Telegram, then paste the token here.
              </p>
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={() => setStep(4)} className="rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-gray-300 hover:bg-white/10 transition-colors flex-1">
              Back
            </button>
            <button
              onClick={() => setStep(6)}
              disabled={channel === 'telegram' && (!telegramToken || !/^\d{8,}:[A-Za-z0-9_-]{35,}$/.test(telegramToken))}
              className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-black hover:bg-amber-400 transition-colors flex-1 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </Card>
      </Wrapper>
    );
  }

  /* ---------- step 6: squad selection ---------- */

  if (step === 6) {
    return (
      <Wrapper>
        <Progress />
        <Card wide>
          <h2 className="text-xl font-bold text-white mb-1">Choose Your Squad</h2>
          <p className="text-gray-400 text-sm mb-6">
            Each squad has a lead + specialized agents. Claw orchestrates all squads. Free tier includes 3 templates.
          </p>

          <div className="grid gap-3 mb-6">
            {SQUADS.filter(s => s.tier === 'free').map((squad) => (
              <button
                key={squad.id}
                onClick={() => setSelectedSquad(squad.id)}
                className={`w-full text-left rounded-xl border p-4 transition-colors ${
                  selectedSquad === squad.id
                    ? 'border-amber-500/50 bg-amber-500/[0.06]'
                    : 'border-white/5 bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.04]'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{squad.emoji}</span>
                    <span className={`font-semibold ${selectedSquad === squad.id ? 'text-amber-400' : 'text-gray-200'}`}>
                      {squad.name}
                    </span>
                  </div>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    Free
                  </span>
                </div>
                <p className="text-xs text-gray-500 mb-2">{squad.description}</p>
                <div className="flex flex-wrap gap-2">
                  {squad.agents.map((a, i) => (
                    <span key={a.name} className={`text-[10px] px-2 py-0.5 rounded-full ${
                      i === 0 ? 'bg-amber-500/10 text-amber-400' : 'bg-white/5 text-gray-400'
                    }`}>
                      {a.emoji} {a.name}{i === 0 ? ' (Lead)' : ''}
                    </span>
                  ))}
                </div>
              </button>
            ))}

            {/* Pro squads teaser */}
            <div className="rounded-xl border border-white/5 bg-white/[0.01] p-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm">🔒</span>
                <span className="text-xs font-semibold text-gray-400">Pro Squads</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">Coming Soon</span>
              </div>
              <p className="text-[11px] text-gray-600 mb-2">
                Larger specialized squads for development teams and customer support. Available in a future release.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {SQUADS.filter(s => s.tier === 'pro').map(s => (
                  <span key={s.id} className="text-[10px] text-gray-600 bg-white/[0.03] px-2 py-0.5 rounded-full">
                    {s.emoji} {s.name}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStep(5)} className="rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-gray-300 hover:bg-white/10 transition-colors flex-1">
              Back
            </button>
            <button
              onClick={() => setStep(7)}
              className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-black hover:bg-amber-400 transition-colors flex-1"
            >
              Next
            </button>
          </div>
        </Card>
      </Wrapper>
    );
  }

  /* ---------- step 7: agent customization ---------- */

  if (step === 7) {
    return (
      <Wrapper>
        <Progress />
        <Card wide>
          <h2 className="text-xl font-bold text-white mb-1">Customize Agents</h2>
          <p className="text-gray-400 text-sm mb-6">
            Optional — personalize each agent or keep defaults.
          </p>

          <div className="space-y-3 mb-6">
            {allAgents.map((agent) => {
              const custom = agentCustomizations[agent.name] || { language: 'pt-BR', focus: '' };
              return (
                <div key={agent.name} className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-lg">{agent.emoji}</span>
                    <span className="font-medium text-gray-200">{agent.name}</span>
                    <span className="text-xs text-gray-500">— {agent.role}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">Language</span>
                      <select
                        value={custom.language}
                        onChange={(e) => setAgentCustomizations(prev => ({
                          ...prev,
                          [agent.name]: { ...custom, language: e.target.value },
                        }))}
                        className="mt-1 block w-full rounded-lg bg-white/[0.04] border border-white/10 px-3 py-2 text-sm text-gray-200 focus:border-amber-500/50 focus:ring-0 focus:outline-none"
                      >
                        <option value="pt-BR">Português (BR)</option>
                        <option value="en">English</option>
                        <option value="es">Español</option>
                      </select>
                    </label>
                    <Field
                      label="Focus area (optional)"
                      value={custom.focus}
                      onChange={(v) => setAgentCustomizations(prev => ({
                        ...prev,
                        [agent.name]: { ...custom, focus: v },
                      }))}
                      placeholder="e.g., React, Solidity, content strategy"
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStep(6)} className="rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-gray-300 hover:bg-white/10 transition-colors flex-1">
              Back
            </button>
            <button
              onClick={() => setStep(8)}
              className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-black hover:bg-amber-400 transition-colors flex-1"
            >
              Create Agents
            </button>
          </div>
        </Card>
      </Wrapper>
    );
  }

  /* ---------- step 8: creating agents ---------- */

  if (step === 8) {
    if (!creating && !createDone) {
      // Auto-start creation
      createAgents();
    }

    return (
      <Wrapper>
        <Progress />
        <Card>
          <h2 className="text-xl font-bold text-white mb-1">
            {createDone ? 'Squad Created!' : 'Creating Your Squad'}
          </h2>
          <p className="text-gray-400 text-sm mb-6">
            {createDone
              ? 'All agents are configured and ready.'
              : 'Setting up your squad...'}
          </p>

          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 mb-6 space-y-2 max-h-60 overflow-y-auto font-mono text-xs">
            {createProgress.map((msg, i) => (
              <div key={i} className={`flex items-start gap-2 ${i === createProgress.length - 1 && !createDone ? 'text-amber-400' : 'text-gray-400'}`}>
                <span className="text-gray-600 select-none">&gt;</span>
                <span>{msg}</span>
              </div>
            ))}
            {creating && (
              <div className="flex items-center gap-2 text-amber-400">
                <Spinner />
              </div>
            )}
          </div>

          {createDone && (
            <button
              onClick={() => setStep(9)}
              className="w-full rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-black hover:bg-amber-400 transition-colors"
            >
              Next
            </button>
          )}
        </Card>
      </Wrapper>
    );
  }

  /* ---------- step 9: profile ---------- */

  if (step === 9) {
    const handleSaveProfile = async () => {
      setProfileSaving(true);
      try {
        await fetch('/api/settings/user-profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: profileName,
            callName: profileCallName || profileName,
            timezone: profileTimezone,
            notes: '',
            context: profileContext,
          }),
        });
      } catch {}
      setProfileSaving(false);
      setStep(10);
    };

    return (
      <Wrapper>
        <Progress />
        <Card>
          <h2 className="text-xl font-bold text-white mb-1">About You</h2>
          <p className="text-gray-400 text-sm mb-6">
            Help your agents understand who they&apos;re working for. You can update this later in Settings.
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Your name</label>
              <input type="text" value={profileName} onChange={e => setProfileName(e.target.value)}
                placeholder="e.g. Daniel"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-amber-500/50" />
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">What should agents call you?</label>
              <input type="text" value={profileCallName} onChange={e => setProfileCallName(e.target.value)}
                placeholder="e.g. Daniel, Boss, Chief (optional)"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-amber-500/50" />
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">Timezone</label>
              <input type="text" value={profileTimezone} onChange={e => setProfileTimezone(e.target.value)}
                placeholder="e.g. UTC-3, America/Sao_Paulo"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-amber-500/50" />
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">Tell your agents about yourself</label>
              <textarea value={profileContext} onChange={e => setProfileContext(e.target.value)}
                placeholder="What do you do? What are you building? What should agents know about you?"
                rows={4}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-amber-500/50 resize-none" />
              <p className="text-[10px] text-gray-600 mt-1">This helps agents adapt tone, language, and context to your needs.</p>
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <button onClick={() => setStep(10)}
              className="flex-1 rounded-lg border border-white/10 px-4 py-2.5 text-sm text-gray-400 hover:text-white transition-colors">
              Skip for now
            </button>
            <button onClick={handleSaveProfile} disabled={profileSaving || !profileName.trim()}
              className="flex-1 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-black hover:bg-amber-400 transition-colors disabled:opacity-60">
              {profileSaving ? 'Saving...' : 'Save & Continue'}
            </button>
          </div>
        </Card>
      </Wrapper>
    );
  }

  /* ---------- step 10: done ---------- */

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
        <p className="text-gray-400 text-center mb-6 max-w-sm">
          Your {selectedSquadDef?.name} Squad is online. Open the dashboard to start working with your agents.
        </p>

        <div className="rounded-xl bg-white/[0.02] border border-white/5 p-4 mb-8 space-y-2 text-sm">
          <SummaryRow label="Provider" value={
            provider === 'anthropic' ? 'Anthropic Claude' :
            provider === 'google' ? 'Google Gemini' :
            provider === 'ollama' ? 'Ollama (local)' : 'Not configured'
          } />
          <SummaryRow label="Channel" value={channel === 'mc' ? 'Mission Control Chat' : 'Telegram'} />
          <SummaryRow label="Squad" value={`${selectedSquadDef?.emoji} ${selectedSquadDef?.name}`} />
          <SummaryRow label="Agents" value={allAgents.map(a => a.name).join(', ')} />
          <SummaryRow label="Gateway" value={gatewayUrl || 'http://127.0.0.1:18789'} />
          <SummaryRow label="Gateway Token" value={gatewayToken ? '✓ configured' : tokenConfigured ? '✓ existing' : '— not set'} />
        </div>

        <button
          onClick={goToDashboard}
          disabled={saving}
          className="w-full rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-black hover:bg-amber-400 transition-colors disabled:opacity-60"
        >
          {saving ? 'Loading...' : 'Open Dashboard'}
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
      <ConnectivityBanner />
      {children}
    </div>
  );
}

function Card({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`w-full ${wide ? 'max-w-lg' : 'max-w-md'} rounded-2xl border border-white/[0.06] bg-[#111113] p-8 shadow-2xl shadow-black/40`}>
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
      <span className="text-gray-300 text-xs font-mono truncate max-w-[240px]">{value}</span>
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

/* ------------------------------------------------------------------ */
/*  Dynamic export (SSR disabled)                                      */
/* ------------------------------------------------------------------ */

const OnboardingPage = dynamic(() => Promise.resolve(OnboardingWizard), {
  ssr: false,
});

export default function Page() {
  return <OnboardingPage />;
}
