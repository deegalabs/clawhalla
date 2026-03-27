'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { randomBytes } from 'crypto';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type Provider = 'anthropic' | 'google' | 'ollama' | 'skip';
type Channel = 'mc' | 'telegram';

interface SquadTemplate {
  id: string;
  name: string;
  emoji: string;
  tier: 'free' | 'pro';
  description: string;
  agents: { name: string; role: string; emoji: string }[];
}

interface TestResult {
  ok: boolean;
  status?: string;
  error?: string;
  model?: string;
}

const TOTAL_STEPS = 9;

const SQUAD_TEMPLATES: SquadTemplate[] = [
  {
    id: 'personal',
    name: 'Personal',
    emoji: '🧘',
    tier: 'free',
    description: 'Personal assistant, research, and memory management',
    agents: [
      { name: 'Frigg', role: 'Personal Assistant', emoji: '👑' },
      { name: 'Mimir', role: 'Research Agent', emoji: '🧠' },
    ],
  },
  {
    id: 'hackathon',
    name: 'Hackathon',
    emoji: '⚡',
    tier: 'free',
    description: 'Fast prototyping with code and security review',
    agents: [
      { name: 'Thor', role: 'Tech Lead', emoji: '⚡' },
      { name: 'Tyr', role: 'Security Auditor', emoji: '⚖️' },
    ],
  },
  {
    id: 'social',
    name: 'Social',
    emoji: '📣',
    tier: 'free',
    description: 'Content creation, community, and brand presence',
    agents: [
      { name: 'Bragi', role: 'Content Creator', emoji: '🎭' },
      { name: 'Saga', role: 'Community Manager', emoji: '🔮' },
    ],
  },
  {
    id: 'dev',
    name: 'Dev',
    emoji: '🛠️',
    tier: 'pro',
    description: 'Full development squad with code, QA, and DevOps',
    agents: [
      { name: 'Vidar', role: 'Architect', emoji: '⚔️' },
      { name: 'Thor', role: 'Tech Lead', emoji: '⚡' },
      { name: 'Freya', role: 'Senior Dev', emoji: '✨' },
      { name: 'Tyr', role: 'Security Auditor', emoji: '⚖️' },
    ],
  },
  {
    id: 'support',
    name: 'Support',
    emoji: '🛡️',
    tier: 'pro',
    description: 'Customer support, monitoring, and issue resolution',
    agents: [
      { name: 'Heimdall', role: 'QA / Observer', emoji: '👁️' },
      { name: 'Freya', role: 'Support Engineer', emoji: '✨' },
      { name: 'Odin', role: 'Escalation Manager', emoji: '👁️' },
    ],
  },
];

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

  // Gateway token
  const [gatewayToken, setGatewayToken] = useState('');
  const [tokenConfigured, setTokenConfigured] = useState(false);

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

  // Save state
  const [saving, setSaving] = useState(false);

  // Pre-fill from server
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/settings?key=gateway_token');
        const data = await res.json();
        if (data.configured) setTokenConfigured(true);
      } catch { /* ignore */ }
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

  const selectedSquadTemplate = SQUAD_TEMPLATES.find(s => s.id === selectedSquad);
  const allAgents = selectedSquadTemplate
    ? [{ name: 'Claw', role: 'Chief Orchestrator', emoji: '🦞' }, ...selectedSquadTemplate.agents]
    : [];

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
      setCreateProgress(p => [...p, `Creating ${selectedSquadTemplate?.name} Squad...`]);

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
  }, [provider, apiKey, ollamaUrl, gatewayToken, channel, telegramToken, selectedSquad, agentCustomizations, selectedSquadTemplate]);

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

  /* ---------- step 4: gateway token ---------- */

  if (step === 4) {
    return (
      <Wrapper>
        <Progress />
        <Card>
          <h2 className="text-xl font-bold text-white mb-1">Gateway Token</h2>
          <p className="text-gray-400 text-sm mb-6">
            This token authenticates Mission Control with the OpenClaw gateway.
            You can set your own or generate one.
          </p>

          <div className="mb-5 space-y-3">
            <label className="block">
              <span className="text-xs text-gray-500 font-medium">Token</span>
              {tokenConfigured && !gatewayToken && (
                <span className="ml-2 text-[10px] text-emerald-400 font-medium">✓ already configured</span>
              )}
              <div className="flex gap-2 mt-1">
                <input
                  type="text"
                  value={gatewayToken}
                  onChange={(e) => setGatewayToken(e.target.value)}
                  placeholder={tokenConfigured ? 'Leave empty to keep existing' : 'Paste or generate a token'}
                  className="block flex-1 rounded-lg bg-white/[0.04] border border-white/10 px-3 py-2 text-sm text-gray-200 font-mono placeholder:text-gray-600 focus:border-amber-500/50 focus:ring-0 focus:outline-none transition-colors"
                />
                <button
                  onClick={generateToken}
                  className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-gray-300 hover:bg-white/10 transition-colors"
                  title="Generate random token"
                >
                  Generate
                </button>
              </div>
            </label>
            <p className="text-xs text-gray-600">
              Stored encrypted in the vault. Used for gateway ↔ MC communication.
            </p>
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStep(provider === 'skip' ? 2 : 3)} className="rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-gray-300 hover:bg-white/10 transition-colors flex-1">
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
                  placeholder="123456:ABC-DEF..."
                  className="mt-1 block w-full rounded-lg bg-white/[0.04] border border-white/10 px-3 py-2 text-sm text-gray-200 placeholder:text-gray-600 focus:border-amber-500/50 focus:ring-0 focus:outline-none transition-colors"
                />
              </label>
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
              disabled={channel === 'telegram' && !telegramToken}
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
            Each squad comes with Claw (Chief) + specialized agents. Free tier includes 3 templates.
          </p>

          <div className="grid gap-3 mb-6">
            {SQUAD_TEMPLATES.map((squad) => (
              <button
                key={squad.id}
                onClick={() => squad.tier === 'free' && setSelectedSquad(squad.id)}
                disabled={squad.tier === 'pro'}
                className={`w-full text-left rounded-xl border p-4 transition-colors ${
                  selectedSquad === squad.id
                    ? 'border-amber-500/50 bg-amber-500/[0.06]'
                    : squad.tier === 'pro'
                      ? 'border-white/5 bg-white/[0.01] opacity-50 cursor-not-allowed'
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
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                    squad.tier === 'free'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'bg-white/5 text-gray-500 border border-white/10'
                  }`}>
                    {squad.tier === 'free' ? 'Free' : 'Pro — Coming Soon'}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mb-2">{squad.description}</p>
                <div className="flex flex-wrap gap-2">
                  <span className="text-[10px] bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded-full">🦞 Claw</span>
                  {squad.agents.map(a => (
                    <span key={a.name} className="text-[10px] bg-white/5 text-gray-400 px-2 py-0.5 rounded-full">
                      {a.emoji} {a.name}
                    </span>
                  ))}
                </div>
              </button>
            ))}
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
            Optional — personalize each agent or keep defaults. Claw will create them with these settings.
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
                      placeholder={agent.name === 'Claw' ? 'e.g., startup ops' : 'e.g., React, Solidity'}
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
              : 'Claw is setting up your agents...'}
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

  /* ---------- step 9: done ---------- */

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
          Your {selectedSquadTemplate?.name} Squad is online. Open the dashboard to start working with your agents.
        </p>

        <div className="rounded-xl bg-white/[0.02] border border-white/5 p-4 mb-8 space-y-2 text-sm">
          <SummaryRow label="Provider" value={
            provider === 'anthropic' ? 'Anthropic Claude' :
            provider === 'google' ? 'Google Gemini' :
            provider === 'ollama' ? 'Ollama (local)' : 'Not configured'
          } />
          <SummaryRow label="Channel" value={channel === 'mc' ? 'Mission Control Chat' : 'Telegram'} />
          <SummaryRow label="Squad" value={`${selectedSquadTemplate?.emoji} ${selectedSquadTemplate?.name}`} />
          <SummaryRow label="Agents" value={allAgents.map(a => a.name).join(', ')} />
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
