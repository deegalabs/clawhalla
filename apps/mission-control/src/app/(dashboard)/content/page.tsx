'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { MarkdownView } from '@/components/ui/markdown-view';
import { autoTask } from '@/lib/tasks';

// Types
interface AccountStatus { platform: string; connected: boolean; label: string; }

type ContentTab = 'pipeline' | 'create' | 'drafts' | 'scheduled' | 'accounts';

// Pipeline types
type PipelineStepStatus = 'pending' | 'running' | 'done' | 'gate' | 'skipped' | 'error';

interface PipelineStep {
  id: string;
  label: string;
  agent: string;
  agentEmoji: string;
  description: string;
  status: PipelineStepStatus;
  output?: string;
  isGate?: boolean;
  options?: string[]; // for gates with choices
  selectedOption?: string;
}

interface Pipeline {
  id: string;
  platform: string;
  topic: string;
  steps: PipelineStep[];
  currentStep: number;
  createdAt: string;
  status: 'active' | 'paused' | 'done' | 'cancelled';
  finalText?: string;
  finalHashtags?: string;
  finalImageUrl?: string;
}

function createPipelineSteps(): PipelineStep[] {
  return [
    { id: 'research', label: 'Research', agent: 'mimir', agentEmoji: '🧠', description: 'Scan trends, news, and competitors for content ideas', status: 'pending' },
    { id: 'topics', label: 'Topic Selection', agent: 'human', agentEmoji: '👤', description: 'Pick from 5 candidate topics', status: 'pending', isGate: true },
    { id: 'draft', label: 'Write Draft', agent: 'bragi', agentEmoji: '🎭', description: 'Write engaging post from selected topic', status: 'pending' },
    { id: 'media', label: 'Media', agent: 'bragi', agentEmoji: '🎭', description: 'Generate image description or carousel slides', status: 'pending' },
    { id: 'hashtags', label: 'Hashtags & SEO', agent: 'bragi', agentEmoji: '🎭', description: 'Optimize hashtags and keywords', status: 'pending' },
    { id: 'review', label: 'Editorial Review', agent: 'human', agentEmoji: '👤', description: 'Review, edit, and approve final content', status: 'pending', isGate: true },
    { id: 'schedule', label: 'Schedule / Publish', agent: 'bragi', agentEmoji: '🎭', description: 'Set timing and publish', status: 'pending' },
    { id: 'report', label: 'Report', agent: 'loki', agentEmoji: '🦊', description: 'Log task and track performance', status: 'pending' },
  ];
}

function loadPipelines(): Pipeline[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem('mc_pipelines') || '[]'); } catch { return []; }
}
function savePipelines(p: Pipeline[]) {
  if (typeof window !== 'undefined') localStorage.setItem('mc_pipelines', JSON.stringify(p.slice(0, 20)));
}

const platforms = {
  linkedin: { label: 'LinkedIn', emoji: '💼', maxChars: 3000, hashtagLimit: 7, color: 'bg-blue-600', secretKey: 'LINKEDIN_ACCESS_TOKEN' },
  twitter: { label: 'Twitter / X', emoji: '𝕏', maxChars: 280, hashtagLimit: 2, color: 'bg-gray-700', secretKey: 'TWITTER_API_KEY' },
  instagram: { label: 'Instagram', emoji: '📸', maxChars: 2200, hashtagLimit: 30, color: 'bg-pink-600', secretKey: 'INSTAGRAM_ACCESS_TOKEN' },
  blog: { label: 'Blog', emoji: '📝', maxChars: 50000, hashtagLimit: 10, color: 'bg-emerald-600', secretKey: 'BLOG_API_KEY' },
  newsletter: { label: 'Newsletter', emoji: '📧', maxChars: 100000, hashtagLimit: 0, color: 'bg-amber-600', secretKey: 'NEWSLETTER_API_KEY' },
};

type Platform = keyof typeof platforms;

const checklists: Record<string, { check: (text: string, hashtags: string) => boolean; label: string }[]> = {
  linkedin: [
    { check: (t) => t.split('\n')[0]?.length > 0 && t.split('\n')[0]?.length < 100, label: 'Hook < 100 chars' },
    { check: (t) => /\d/.test(t), label: 'Has numbers' },
    { check: (t) => t.includes('?'), label: 'Has CTA question' },
    { check: (t) => !t.includes('http') || t.lastIndexOf('http') > t.length * 0.7, label: 'Link at end' },
    { check: (_, h) => { const c = h.split(/[,\s#]+/).filter(Boolean).length; return c > 0 && c <= 7; }, label: '1-7 hashtags' },
    { check: (t) => t.length > 200 && t.length < 3000, label: '200-3000 chars' },
  ],
  twitter: [
    { check: (t) => t.length <= 280, label: '≤ 280 chars' },
    { check: (t) => !t.includes('http') || t.length <= 257, label: 'Room for link' },
    { check: (_, h) => h.split(/[,\s#]+/).filter(Boolean).length <= 2, label: 'Max 2 hashtags' },
  ],
  instagram: [
    { check: (t) => t.split('\n')[0]?.length < 125, label: 'Caption < 125 chars' },
    { check: (t) => t.length <= 2200, label: '≤ 2200 chars' },
    { check: (_, h) => { const c = h.split(/[,\s#]+/).filter(Boolean).length; return c >= 5 && c <= 30; }, label: '5-30 hashtags' },
  ],
};

interface Draft {
  id: string; platform: string; text: string; hashtags: string;
  imageUrl?: string; scheduledFor?: string; status: 'draft' | 'approved' | 'published' | 'scheduled';
  createdAt: string; taskId?: string;
}

function loadDrafts(): Draft[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem('mc_drafts') || '[]'); } catch { return []; }
}
function saveDraftsToStorage(drafts: Draft[]) {
  if (typeof window !== 'undefined') localStorage.setItem('mc_drafts', JSON.stringify(drafts));
}

// Agent actions Bragi can perform
const AGENT_ACTIONS = [
  { id: 'generate', label: 'Generate post', desc: 'Create content from topic', icon: '✨' },
  { id: 'rewrite', label: 'Improve text', desc: 'Rewrite current draft', icon: '🔄' },
  { id: 'hashtags', label: 'Suggest hashtags', desc: 'Best hashtags for reach', icon: '#️⃣' },
  { id: 'translate', label: 'Translate', desc: 'pt-BR ↔ en-US', icon: '🌐' },
  { id: 'timing', label: 'Best time to post', desc: 'Optimal schedule', icon: '⏰' },
  { id: 'thread', label: 'Make thread', desc: 'Split into thread/carousel', icon: '🧵' },
  { id: 'seo', label: 'SEO optimize', desc: 'Keywords & meta', icon: '🔍' },
  { id: 'tone', label: 'Adjust tone', desc: 'Formal/casual/bold', icon: '🎭' },
];

function ContentPageInner() {
  const [tab, setTab] = useState<ContentTab>('pipeline');
  const [platform, setPlatform] = useState<Platform>('linkedin');
  const [text, setText] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [scheduledFor, setScheduledFor] = useState('');
  const [accounts, setAccounts] = useState<AccountStatus[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [agentWorking, setAgentWorking] = useState<string | null>(null);
  const [agentTopic, setAgentTopic] = useState('');
  // Pipeline state
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [activePipeline, setActivePipeline] = useState<Pipeline | null>(null);
  const [pipelineTopic, setPipelineTopic] = useState('');
  const [pipelinePlatform, setPipelinePlatform] = useState<Platform>('linkedin');
  const [pipelineRunning, setPipelineRunning] = useState(false);

  useEffect(() => { setDrafts(loadDrafts()); setPipelines(loadPipelines()); }, []);

  useEffect(() => {
    const checkAccounts = async () => {
      try {
        const res = await fetch('/api/vault');
        const data = await res.json();
        const statuses: AccountStatus[] = Object.entries(platforms).map(([key, cfg]) => ({
          platform: key, label: cfg.label,
          connected: data.secrets?.some((s: { name: string }) => s.name === cfg.secretKey) || false,
        }));
        setAccounts(statuses);
      } catch {
        setAccounts(Object.entries(platforms).map(([key, cfg]) => ({ platform: key, connected: false, label: cfg.label })));
      }
    };
    checkAccounts();
  }, []);

  const cfg = platforms[platform];
  const charCount = text.length;
  const hashtagCount = hashtags.split(/[,\s#]+/).filter(Boolean).length;
  const isOverLimit = charCount > cfg.maxChars;
  const platformChecklist = checklists[platform] || [];
  const passedChecks = platformChecklist.filter(c => c.check(text, hashtags)).length;

  const scheduledDrafts = drafts.filter(d => d.scheduledFor && d.status === 'scheduled');
  const draftCount = drafts.filter(d => d.status === 'draft').length;

  // ---- PIPELINE HANDLERS ----
  const startPipeline = () => {
    if (!pipelineTopic.trim()) return;
    const pipeline: Pipeline = {
      id: `pipe_${Date.now().toString(36)}`,
      platform: pipelinePlatform,
      topic: pipelineTopic,
      steps: createPipelineSteps(),
      currentStep: 0,
      createdAt: new Date().toISOString(),
      status: 'active',
    };
    setActivePipeline(pipeline);
    const updated = [pipeline, ...pipelines];
    setPipelines(updated);
    savePipelines(updated);
    setPipelineTopic('');
    // Auto-run first step
    runPipelineStep(pipeline, 0);
  };

  const updatePipeline = (pipeline: Pipeline) => {
    setActivePipeline({ ...pipeline });
    const updated = pipelines.map(p => p.id === pipeline.id ? pipeline : p);
    setPipelines(updated);
    savePipelines(updated);
  };

  const callAgent = async (agent: string, prompt: string): Promise<string> => {
    const res = await fetch('/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId: agent, message: prompt }),
    });
    const data = await res.json();
    if (data.ok && data.response) return data.response;
    throw new Error(data.error || 'Agent failed');
  };

  const runPipelineStep = async (pipeline: Pipeline, stepIndex: number) => {
    if (stepIndex >= pipeline.steps.length) {
      pipeline.status = 'done';
      updatePipeline(pipeline);
      return;
    }

    const step = pipeline.steps[stepIndex];
    const platCfg = platforms[pipeline.platform as Platform];

    // If gate, pause for human
    if (step.isGate) {
      step.status = 'gate';
      pipeline.currentStep = stepIndex;
      updatePipeline(pipeline);
      return;
    }

    step.status = 'running';
    pipeline.currentStep = stepIndex;
    setPipelineRunning(true);
    updatePipeline(pipeline);

    try {
      let output = '';
      const prevDraft = pipeline.finalText || '';
      const prevHashtags = pipeline.finalHashtags || '';

      switch (step.id) {
        case 'research': {
          output = await callAgent('mimir', `Research the latest trends, news and opportunities about: "${pipeline.topic}". Focus on what's relevant for a ${platCfg.label} audience in tech/AI/blockchain. Return 5 candidate topics, each with a one-line description and why it would make a good post. Number them 1-5.`);
          const topics = output.split(/\n/).filter(l => /^\d/.test(l.trim())).map(l => l.trim());
          const topicOptions = topics.length > 0 ? topics : output.split(/\n\n/).filter(Boolean).slice(0, 5);
          // Pass options to the next gate step (topics)
          const topicsGate = pipeline.steps.find(s => s.id === 'topics');
          if (topicsGate) topicsGate.options = topicOptions;
          break;
        }
        case 'draft': {
          const selectedTopic = pipeline.steps.find(s => s.id === 'topics')?.selectedOption || pipeline.topic;
          output = await callAgent('bragi', `Write a ${platCfg.label} post about: "${selectedTopic}". Follow best practices for ${platCfg.label}. Max ${platCfg.maxChars} chars. Make it engaging with a strong hook. Return ONLY the post text.`);
          pipeline.finalText = output.trim();
          break;
        }
        case 'media': {
          output = await callAgent('bragi', `For this ${platCfg.label} post, suggest:\n1. An image description (detailed prompt for AI image generation)\n2. If carousel: describe 3-5 slides with title and visual for each\n3. Alt text for accessibility\n\nPost:\n${prevDraft}`);
          break;
        }
        case 'hashtags': {
          output = await callAgent('bragi', `For this ${platCfg.label} post, provide:\n1. Best ${platCfg.hashtagLimit} hashtags (space-separated)\n2. SEO keywords\n3. Best posting time for Brazil (UTC-3) tech audience\n\nPost:\n${prevDraft}\n\nReturn hashtags on the FIRST line, then details below.`);
          const firstLine = output.split('\n')[0]?.trim() || '';
          pipeline.finalHashtags = firstLine;
          break;
        }
        case 'schedule': {
          output = `Content ready for ${platCfg.label}.\nText: ${(prevDraft).length} chars\nHashtags: ${prevHashtags}\nStatus: Ready to publish`;
          break;
        }
        case 'report': {
          await autoTask.contentPipeline(pipeline.topic, platCfg.label);
          output = 'Task created and logged.';
          break;
        }
        default:
          output = 'Step completed.';
      }

      step.output = output;
      step.status = 'done';
      updatePipeline(pipeline);

      // Auto-advance to next step (with small delay for UX)
      setTimeout(() => {
        runPipelineStep(pipeline, stepIndex + 1);
      }, 500);
    } catch (err) {
      step.status = 'error';
      step.output = String(err);
      updatePipeline(pipeline);
    }
    setPipelineRunning(false);
  };

  const approveGate = (option?: string) => {
    if (!activePipeline) return;
    const step = activePipeline.steps[activePipeline.currentStep];
    if (option) step.selectedOption = option;
    step.status = 'done';
    step.output = option || 'Approved';
    updatePipeline(activePipeline);
    // Continue to next step
    runPipelineStep(activePipeline, activePipeline.currentStep + 1);
  };

  const loadPipelineToEditor = () => {
    if (!activePipeline) return;
    setPlatform(activePipeline.platform as Platform);
    if (activePipeline.finalText) setText(activePipeline.finalText);
    if (activePipeline.finalHashtags) setHashtags(activePipeline.finalHashtags);
    if (activePipeline.finalImageUrl) setImageUrl(activePipeline.finalImageUrl);
    setTab('create');
  };

  const handleSaveDraft = () => {
    const draft: Draft = {
      id: `draft_${Date.now().toString(36)}`, platform, text, hashtags,
      imageUrl: imageUrl || undefined, scheduledFor: scheduledFor || undefined,
      status: scheduledFor ? 'scheduled' : 'draft', createdAt: new Date().toISOString(),
    };
    const updated = [draft, ...drafts];
    setDrafts(updated);
    saveDraftsToStorage(updated);
    setPublishResult({ ok: true, message: scheduledFor ? `Scheduled for ${new Date(scheduledFor).toLocaleString()}` : 'Draft saved' });
  };

  const handleDeleteDraft = (id: string) => {
    const updated = drafts.filter(d => d.id !== id);
    setDrafts(updated);
    saveDraftsToStorage(updated);
  };

  const handleLoadDraft = (draft: Draft) => {
    setPlatform(draft.platform as Platform);
    setText(draft.text);
    setHashtags(draft.hashtags);
    if (draft.imageUrl) setImageUrl(draft.imageUrl);
    if (draft.scheduledFor) setScheduledFor(draft.scheduledFor);
    setTab('create');
  };

  const handlePublish = async () => {
    if (platform !== 'linkedin') {
      setPublishResult({ ok: false, message: `${cfg.label} publishing coming soon` });
      return;
    }
    const fullText = text + (hashtags ? '\n\n' + hashtags.split(/[,\s]+/).filter(Boolean).map(t => t.startsWith('#') ? t : `#${t}`).join(' ') : '');
    setPublishing(true); setPublishResult(null);
    try {
      const res = await fetch('/api/linkedin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: fullText }) });
      const data = await res.json();
      setPublishResult({ ok: data.ok, message: data.ok ? `Published! ID: ${data.postId}` : data.error });
      if (data.ok) {
        await autoTask.contentPublish(cfg.label, text);
      }
    } catch (e) { setPublishResult({ ok: false, message: String(e) }); }
    setPublishing(false);
  };

  // Real agent call via /api/chat with Bragi
  const handleAgentAction = async (actionId: string) => {
    setAgentWorking(actionId);
    setPublishResult(null);

    const prompts: Record<string, string> = {
      generate: `Write a ${cfg.label} post about: "${agentTopic || 'ClawHalla AI agent platform'}". Follow best practices for ${cfg.label}. Max ${cfg.maxChars} chars. Return ONLY the post text, no explanation.`,
      rewrite: `Improve this ${cfg.label} post. Make it more engaging, keep the message. Max ${cfg.maxChars} chars. Return ONLY the improved text:\n\n${text}`,
      hashtags: `Suggest the best ${cfg.hashtagLimit} hashtags for this ${cfg.label} post. Return ONLY hashtags space-separated:\n\n${text}`,
      translate: `Translate this to ${/[àáâãçéêíóôõúü]/i.test(text) ? 'English' : 'Brazilian Portuguese'}. Keep the tone. Return ONLY the translation:\n\n${text}`,
      timing: `What are the best times to post on ${cfg.label} for a tech/AI audience in Brazil (UTC-3)? Be specific with days and hours.`,
      thread: `Convert this into a ${platform === 'twitter' ? 'Twitter thread (max 280 chars each tweet, number them)' : 'carousel format (slide 1, slide 2, etc.)'}:\n\n${text}`,
      seo: `Optimize this text for SEO. Add keywords naturally, suggest a meta description. Return the optimized text:\n\n${text}`,
      tone: `Rewrite this in a more bold/confident tone, suitable for ${cfg.label}. Return ONLY the rewritten text:\n\n${text}`,
    };

    try {
      const res = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: 'bragi', message: prompts[actionId] || prompts.generate }),
      });
      const data = await res.json();

      if (data.ok && data.response) {
        if (actionId === 'hashtags') {
          setHashtags(data.response.replace(/\n/g, ' ').trim());
        } else if (actionId === 'timing') {
          setPublishResult({ ok: true, message: data.response.slice(0, 300) });
        } else if (['generate', 'rewrite', 'translate', 'thread', 'seo', 'tone'].includes(actionId)) {
          setText(data.response.trim());
        }
        await autoTask.agentAction('bragi', `Bragi: ${AGENT_ACTIONS.find(a => a.id === actionId)?.label} for ${cfg.label}`);
      } else {
        setPublishResult({ ok: false, message: data.error || 'Agent failed' });
      }
    } catch (e) {
      setPublishResult({ ok: false, message: `Agent error: ${String(e)}` });
    }
    setAgentWorking(null);
  };

  const connectedCount = accounts.filter(a => a.connected).length;

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] gap-3">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-gray-200">Content Studio</h2>
          <div className="flex gap-0.5 bg-[#111113] rounded-lg p-0.5 border border-[#1e1e21]">
            {(['pipeline', 'create', 'drafts', 'scheduled', 'accounts'] as ContentTab[]).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-2.5 py-1 text-[11px] rounded capitalize ${tab === t ? 'bg-[#1e1e21] text-gray-100' : 'text-gray-500 hover:text-gray-300'}`}>
                {t === 'pipeline' ? '🔄 Pipeline' : t}
                {t === 'pipeline' && pipelines.filter(p => p.status === 'active').length > 0 ? ` (${pipelines.filter(p => p.status === 'active').length})` : ''}
                {t === 'drafts' && draftCount > 0 ? ` (${draftCount})` : ''}
                {t === 'scheduled' && scheduledDrafts.length > 0 ? ` (${scheduledDrafts.length})` : ''}
                {t === 'accounts' ? ` (${connectedCount}/${Object.keys(platforms).length})` : ''}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {accounts.filter(a => a.connected).map(a => (
            <span key={a.platform} className="text-[10px] bg-green-500/10 text-green-400 px-1.5 py-0.5 rounded">
              {platforms[a.platform as Platform]?.emoji} ✓
            </span>
          ))}
        </div>
      </div>

      {/* PIPELINE TAB */}
      {tab === 'pipeline' && (
        <div className="flex gap-3 flex-1 min-h-0">
          {/* Left: Start new + History */}
          <div className="w-72 flex flex-col gap-2.5 shrink-0 min-h-0">
            {/* New pipeline */}
            <div className="bg-[#111113] rounded-lg border border-[#1e1e21] p-3 shrink-0">
              <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">New Pipeline</div>
              <div className="flex gap-1 mb-2 flex-wrap">
                {(Object.entries(platforms) as [Platform, typeof platforms.linkedin][]).map(([key, p]) => (
                  <button key={key} onClick={() => setPipelinePlatform(key)}
                    className={`px-2 py-0.5 text-[9px] rounded ${pipelinePlatform === key ? 'bg-amber-500 text-gray-900' : 'bg-[#0a0a0b] text-gray-500 border border-[#1e1e21]'}`}>
                    {p.emoji} {p.label}
                  </button>
                ))}
              </div>
              <input value={pipelineTopic} onChange={e => setPipelineTopic(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') startPipeline(); }}
                placeholder="Topic: e.g. 'AI agents for business automation'"
                className="w-full px-2.5 py-2 bg-[#0a0a0b] border border-[#1e1e21] rounded text-[11px] text-gray-200 placeholder-gray-600 focus:outline-none focus:border-amber-500 mb-2" />
              <button onClick={startPipeline} disabled={!pipelineTopic.trim() || pipelineRunning}
                className="w-full py-1.5 text-[10px] font-medium bg-amber-500 text-gray-900 rounded hover:bg-amber-400 disabled:opacity-40">
                Start Pipeline →
              </button>
            </div>

            {/* Pipeline history */}
            <div className="bg-[#111113] rounded-lg border border-[#1e1e21] p-3 flex-1 overflow-y-auto min-h-0">
              <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">History ({pipelines.length})</div>
              {pipelines.length === 0 ? (
                <div className="text-[10px] text-gray-700 text-center py-4">No pipelines yet</div>
              ) : (
                <div className="space-y-1.5">
                  {pipelines.map(p => {
                    const doneSteps = p.steps.filter(s => s.status === 'done').length;
                    const progress = Math.round((doneSteps / p.steps.length) * 100);
                    return (
                      <button key={p.id} onClick={() => setActivePipeline(p)}
                        className={`w-full text-left p-2 rounded border transition-colors ${activePipeline?.id === p.id ? 'bg-[#1e1e21] border-amber-500/30' : 'bg-[#0a0a0b] border-[#1e1e21] hover:border-[#333]'}`}>
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="text-[10px]">{platforms[p.platform as Platform]?.emoji}</span>
                          <span className={`text-[8px] px-1 py-0.5 rounded ${p.status === 'active' ? 'bg-green-500/20 text-green-400' : p.status === 'done' ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-500/20 text-gray-400'}`}>
                            {p.status}
                          </span>
                          <span className="text-[8px] text-gray-600 ml-auto">{progress}%</span>
                        </div>
                        <div className="text-[10px] text-gray-300 truncate">{p.topic}</div>
                        <div className="w-full h-0.5 bg-[#1e1e21] rounded mt-1.5">
                          <div className="h-full bg-amber-500 rounded transition-all" style={{ width: `${progress}%` }} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Center: Pipeline steps */}
          <div className="flex-1 flex flex-col min-h-0 min-w-0">
            {!activePipeline ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <div className="text-3xl mb-3">🔄</div>
                  <div className="text-sm text-gray-400">Content Pipeline</div>
                  <div className="text-[10px] text-gray-600 mt-1 max-w-xs">
                    Automated content creation: Research → Topic Selection → Draft → Media → Hashtags → Review → Publish → Report
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                {/* Pipeline header */}
                <div className="bg-[#111113] rounded-lg border border-[#1e1e21] p-3 flex items-center justify-between shrink-0">
                  <div>
                    <div className="flex items-center gap-2">
                      <span>{platforms[activePipeline.platform as Platform]?.emoji}</span>
                      <span className="text-xs font-medium text-gray-200">{activePipeline.topic}</span>
                    </div>
                    <div className="text-[9px] text-gray-600 mt-0.5">
                      {activePipeline.steps.filter(s => s.status === 'done').length}/{activePipeline.steps.length} steps • {activePipeline.status}
                    </div>
                  </div>
                  {activePipeline.status === 'done' && (
                    <button onClick={loadPipelineToEditor}
                      className="px-3 py-1 text-[10px] font-medium bg-amber-500 text-gray-900 rounded hover:bg-amber-400">
                      Open in Editor →
                    </button>
                  )}
                </div>

                {/* Progress bar */}
                <div className="w-full h-1 bg-[#1e1e21] rounded-full shrink-0">
                  <div className="h-full bg-gradient-to-r from-amber-500 to-amber-400 rounded-full transition-all duration-500"
                    style={{ width: `${Math.round((activePipeline.steps.filter(s => s.status === 'done').length / activePipeline.steps.length) * 100)}%` }} />
                </div>

                {/* Steps */}
                {activePipeline.steps.map((step, i) => (
                  <div key={step.id} className={`bg-[#111113] rounded-lg border p-3 transition-colors ${
                    step.status === 'running' ? 'border-amber-500/40 bg-amber-500/5' :
                    step.status === 'gate' ? 'border-purple-500/40 bg-purple-500/5' :
                    step.status === 'done' ? 'border-green-500/20' :
                    step.status === 'error' ? 'border-red-500/30' :
                    'border-[#1e1e21]'
                  }`}>
                    {/* Step header */}
                    <div className="flex items-center gap-2.5">
                      {/* Step number/status */}
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                        step.status === 'done' ? 'bg-green-500/20 text-green-400' :
                        step.status === 'running' ? 'bg-amber-500/20 text-amber-400 animate-pulse' :
                        step.status === 'gate' ? 'bg-purple-500/20 text-purple-400' :
                        step.status === 'error' ? 'bg-red-500/20 text-red-400' :
                        'bg-[#0a0a0b] text-gray-600'
                      }`}>
                        {step.status === 'done' ? '✓' : step.status === 'running' ? '⟳' : step.status === 'gate' ? '⏸' : step.status === 'error' ? '!' : i}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-medium text-gray-200">{step.label}</span>
                          {step.isGate && <span className="text-[8px] px-1 py-0.5 rounded bg-purple-500/20 text-purple-400">GATE</span>}
                        </div>
                        <div className="text-[9px] text-gray-600">{step.description}</div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-sm">{step.agentEmoji}</span>
                        <span className="text-[9px] text-gray-500">{step.agent}</span>
                      </div>
                    </div>

                    {/* Running indicator */}
                    {step.status === 'running' && (
                      <div className="mt-2 flex items-center gap-2">
                        <div className="flex-1 h-1 bg-[#1e1e21] rounded-full overflow-hidden">
                          <div className="h-full bg-amber-500 rounded-full animate-[progress_2s_ease-in-out_infinite]" style={{ width: '60%' }} />
                        </div>
                        <span className="text-[9px] text-amber-400">{step.agent} working...</span>
                      </div>
                    )}

                    {/* Gate: Topic selection */}
                    {step.status === 'gate' && step.id === 'topics' && step.options && (
                      <div className="mt-2 space-y-1">
                        <div className="text-[9px] text-purple-400 mb-1.5">Select a topic to continue:</div>
                        {/* Use research output from previous step */}
                        {(step.options.length > 0 ? step.options : ['Option 1', 'Option 2', 'Option 3']).map((opt, oi) => (
                          <button key={oi} onClick={() => approveGate(opt)}
                            className="w-full text-left px-3 py-2 bg-[#0a0a0b] border border-[#1e1e21] rounded text-[10px] text-gray-300 hover:border-purple-500/40 hover:text-gray-100 transition-colors">
                            {opt}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Gate: Editorial review */}
                    {step.status === 'gate' && step.id === 'review' && (
                      <div className="mt-2">
                        <div className="text-[9px] text-purple-400 mb-1.5">Review the content and approve:</div>
                        {activePipeline.finalText && (
                          <div className="bg-[#0a0a0b] border border-[#1e1e21] rounded p-2.5 mb-2">
                            <MarkdownView content={activePipeline.finalText} showToggle={true} maxHeight="max-h-32" />
                            {activePipeline.finalHashtags && (
                              <p className="text-[10px] text-blue-400 mt-1">{activePipeline.finalHashtags}</p>
                            )}
                          </div>
                        )}
                        <div className="flex gap-2">
                          <button onClick={() => approveGate('Approved')}
                            className="px-3 py-1.5 text-[10px] font-medium bg-green-500/20 text-green-400 border border-green-500/30 rounded hover:bg-green-500/30">
                            ✓ Approve
                          </button>
                          <button onClick={loadPipelineToEditor}
                            className="px-3 py-1.5 text-[10px] font-medium bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded hover:bg-amber-500/30">
                            ✎ Edit in Editor
                          </button>
                          <button onClick={() => { activePipeline.status = 'cancelled'; updatePipeline(activePipeline); }}
                            className="px-3 py-1.5 text-[10px] font-medium bg-red-500/10 text-red-400 border border-red-500/20 rounded hover:bg-red-500/20">
                            ✕ Reject
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Output */}
                    {step.status === 'done' && step.output && (
                      <div className="mt-2 bg-[#0a0a0b] border border-[#1e1e21] rounded p-2">
                        <MarkdownView content={step.output.slice(0, 500) + (step.output.length > 500 ? '...' : '')} showToggle={false} maxHeight="max-h-24" />
                      </div>
                    )}

                    {/* Error */}
                    {step.status === 'error' && (
                      <div className="mt-2 text-[9px] text-red-400 bg-red-500/10 rounded px-2 py-1">
                        {step.output}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: Final output summary */}
          {activePipeline && (
            <div className="w-64 flex flex-col gap-2.5 shrink-0 min-h-0">
              <div className="bg-[#111113] rounded-lg border border-[#1e1e21] p-3 flex-1 overflow-y-auto min-h-0">
                <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-2">Output</div>
                {activePipeline.finalText ? (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-6 h-6 bg-amber-500/20 rounded-full flex items-center justify-center text-amber-400 text-[8px] font-bold">DG</div>
                      <div>
                        <div className="text-[10px] font-medium text-gray-200">Preview</div>
                        <div className="text-[8px] text-gray-600">{platforms[activePipeline.platform as Platform]?.label}</div>
                      </div>
                    </div>
                    <MarkdownView content={activePipeline.finalText} showToggle={true} maxHeight="max-h-none" />
                    {activePipeline.finalHashtags && (
                      <p className="text-[10px] text-blue-400 mt-2">{activePipeline.finalHashtags}</p>
                    )}
                  </div>
                ) : (
                  <div className="text-[10px] text-gray-700 text-center py-6">Pipeline output will appear here...</div>
                )}
              </div>

              {/* Media section */}
              <div className="bg-[#111113] rounded-lg border border-[#1e1e21] p-3 shrink-0">
                <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-1.5">Media</div>
                {activePipeline.steps.find(s => s.id === 'media')?.output ? (
                  <MarkdownView content={activePipeline.steps.find(s => s.id === 'media')?.output?.slice(0, 300) || ''} showToggle={false} maxHeight="max-h-20" />
                ) : (
                  <div className="text-[10px] text-gray-700 text-center py-3">
                    <div className="text-lg mb-1">🖼️</div>
                    Image/carousel suggestions will appear here
                  </div>
                )}
              </div>

              {/* Agent activity */}
              <div className="bg-[#111113] rounded-lg border border-[#1e1e21] p-3 shrink-0">
                <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-1.5">Agents Used</div>
                <div className="flex flex-wrap gap-1">
                  {[...new Set(activePipeline.steps.filter(s => s.status === 'done' && s.agent !== 'human').map(s => s.agent))].map(a => (
                    <span key={a} className="text-[9px] px-1.5 py-0.5 bg-[#0a0a0b] border border-[#1e1e21] rounded text-gray-400">
                      {activePipeline.steps.find(s => s.agent === a)?.agentEmoji} {a}
                    </span>
                  ))}
                  {activePipeline.steps.every(s => s.status === 'pending') && (
                    <span className="text-[9px] text-gray-700">Waiting to start...</span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* CREATE TAB — 3 columns */}
      {tab === 'create' && (
        <div className="flex gap-3 flex-1 min-h-0">
          {/* Col 1: Editor */}
          <div className="flex-1 flex flex-col gap-2.5 min-h-0 min-w-0">
            {/* Platform selector */}
            <div className="flex gap-1 shrink-0 flex-wrap">
              {(Object.entries(platforms) as [Platform, typeof platforms.linkedin][]).map(([key, p]) => (
                <button key={key} onClick={() => setPlatform(key)}
                  className={`px-2.5 py-1 text-[10px] rounded-lg flex items-center gap-1 ${platform === key ? 'bg-amber-500 text-gray-900 font-medium' : 'bg-[#111113] text-gray-400 border border-[#1e1e21] hover:text-gray-200'}`}>
                  <span>{p.emoji}</span><span>{p.label}</span>
                </button>
              ))}
            </div>

            {/* Editor */}
            <div className="bg-[#111113] rounded-lg border border-[#1e1e21] overflow-hidden flex-1 flex flex-col min-h-0">
              <textarea value={text} onChange={e => setText(e.target.value)}
                placeholder={`Write your ${cfg.label} post...\n\nTip: Start with a hook that captures attention.`}
                className="flex-1 px-4 py-3 bg-transparent text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus-visible:outline-none resize-none min-h-0" />
              <div className="px-4 py-2 border-t border-[#1e1e21] flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <span className={`text-[10px] ${isOverLimit ? 'text-red-400' : 'text-gray-500'}`}>{charCount}/{cfg.maxChars}</span>
                  {platformChecklist.length > 0 && (
                    <span className={`text-[10px] ${passedChecks === platformChecklist.length ? 'text-green-400' : 'text-gray-600'}`}>
                      ✓ {passedChecks}/{platformChecklist.length}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-[10px] text-gray-600">
                  {hashtagCount > 0 && <span>#{hashtagCount}</span>}
                  {imageUrl && <span>📷</span>}
                  {scheduledFor && <span>📅</span>}
                </div>
              </div>
            </div>

            {/* Inputs row */}
            <div className="grid grid-cols-3 gap-2 shrink-0">
              <div>
                <label className="block text-[9px] text-gray-500 mb-0.5">Hashtags</label>
                <input type="text" value={hashtags} onChange={e => setHashtags(e.target.value)}
                  placeholder={`#tag1 #tag2 (max ${cfg.hashtagLimit})`}
                  className={`w-full px-2 py-1.5 bg-[#0a0a0b] border rounded text-[10px] text-gray-200 focus:outline-none focus:border-amber-500 ${hashtagCount > cfg.hashtagLimit ? 'border-red-500' : 'border-[#1e1e21]'}`} />
              </div>
              <div>
                <label className="block text-[9px] text-gray-500 mb-0.5">Image URL</label>
                <input type="text" value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://..."
                  className="w-full px-2 py-1.5 bg-[#0a0a0b] border border-[#1e1e21] rounded text-[10px] text-gray-200 focus:outline-none focus:border-amber-500" />
              </div>
              <div>
                <label className="block text-[9px] text-gray-500 mb-0.5">Schedule</label>
                <input type="datetime-local" value={scheduledFor} onChange={e => setScheduledFor(e.target.value)}
                  className="w-full px-2 py-1.5 bg-[#0a0a0b] border border-[#1e1e21] rounded text-[10px] text-gray-200 focus:outline-none focus:border-amber-500" />
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 shrink-0">
              <button onClick={handleSaveDraft} className="px-3 py-1.5 text-[10px] font-medium bg-[#1a1a1d] text-gray-300 rounded hover:text-gray-100 border border-[#1e1e21]">
                {scheduledFor ? '📅 Schedule' : '💾 Save Draft'}
              </button>
              <button onClick={handlePublish} disabled={publishing || isOverLimit || !text.trim()}
                className="px-3 py-1.5 text-[10px] font-medium bg-amber-500 text-gray-900 rounded hover:bg-amber-400 disabled:opacity-40">
                {publishing ? '...' : `Publish → ${cfg.label}`}
              </button>
            </div>
            {publishResult && (
              <div className={`px-3 py-2 rounded text-[10px] shrink-0 ${publishResult.ok ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                {publishResult.message}
              </div>
            )}
          </div>

          {/* Col 2: Preview + Checklist */}
          <div className="w-72 flex flex-col gap-2.5 shrink-0 min-h-0">
            {/* Preview */}
            <div className="bg-[#111113] rounded-lg border border-[#1e1e21] p-3 flex-1 overflow-y-auto min-h-0">
              <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-2">Preview • {cfg.label}</div>
              {text ? (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-7 h-7 bg-amber-500/20 rounded-full flex items-center justify-center text-amber-400 text-[10px] font-bold">DG</div>
                    <div>
                      <div className="text-[11px] font-medium text-gray-200">Daniel Gorgonha</div>
                      <div className="text-[8px] text-gray-600">Founder at Deega Labs</div>
                    </div>
                  </div>
                  {imageUrl && (
                    <div className="mb-2 rounded bg-[#0a0a0b] border border-[#1e1e21] p-2 text-center text-[9px] text-gray-600">📷 {imageUrl.split('/').pop()}</div>
                  )}
                  <p className="text-[11px] text-gray-300 whitespace-pre-wrap leading-relaxed">{text}</p>
                  {hashtags && (
                    <p className="text-[11px] text-blue-400 mt-2">
                      {hashtags.split(/[,\s]+/).filter(Boolean).map(t => t.startsWith('#') ? t : `#${t}`).join(' ')}
                    </p>
                  )}
                </div>
              ) : (
                <div className="text-[11px] text-gray-700 text-center py-8">Start typing or ask Bragi...</div>
              )}
            </div>

            {/* Checklist */}
            {platformChecklist.length > 0 && (
              <div className="bg-[#111113] rounded-lg border border-[#1e1e21] p-3 shrink-0">
                <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-1.5">
                  Checklist ({passedChecks}/{platformChecklist.length})
                </div>
                <div className="space-y-1">
                  {platformChecklist.map((item, i) => {
                    const passed = item.check(text, hashtags);
                    return (
                      <div key={i} className={`flex items-center gap-1.5 text-[10px] ${passed ? 'text-green-400' : 'text-gray-600'}`}>
                        <span>{passed ? '✓' : '○'}</span><span>{item.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Col 3: Agent Actions + Scheduled */}
          <div className="w-64 flex flex-col gap-2.5 shrink-0 min-h-0">
            {/* Agent panel */}
            <div className="bg-[#111113] rounded-lg border border-[#1e1e21] p-3 shrink-0">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm">🎭</span>
                <div>
                  <div className="text-[11px] font-medium text-gray-200">Bragi</div>
                  <div className="text-[8px] text-gray-600">Content Creator Agent</div>
                </div>
              </div>
              {/* Topic input for generate */}
              <input value={agentTopic} onChange={e => setAgentTopic(e.target.value)}
                placeholder="Topic for new post..."
                className="w-full px-2 py-1.5 bg-[#0a0a0b] border border-[#1e1e21] rounded text-[10px] text-gray-200 placeholder-gray-600 focus:outline-none focus:border-amber-500 mb-2" />
              {/* Action buttons */}
              <div className="grid grid-cols-2 gap-1">
                {AGENT_ACTIONS.map(action => (
                  <button key={action.id}
                    onClick={() => handleAgentAction(action.id)}
                    disabled={agentWorking !== null || (action.id !== 'generate' && action.id !== 'timing' && !text.trim())}
                    className={`text-left px-2 py-1.5 rounded text-[9px] border transition-colors ${
                      agentWorking === action.id
                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 animate-pulse'
                        : 'bg-[#0a0a0b] border-[#1e1e21] text-gray-400 hover:text-gray-200 hover:border-[#333] disabled:opacity-30 disabled:cursor-default'
                    }`}>
                    <div className="flex items-center gap-1">
                      <span>{action.icon}</span>
                      <span className="font-medium">{action.label}</span>
                    </div>
                  </button>
                ))}
              </div>
              {agentWorking && (
                <div className="mt-2 text-[9px] text-amber-400 flex items-center gap-1.5">
                  <span className="flex gap-0.5">
                    <span className="w-1 h-1 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1 h-1 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '100ms' }} />
                    <span className="w-1 h-1 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '200ms' }} />
                  </span>
                  Bragi working...
                </div>
              )}
            </div>

            {/* Upcoming scheduled */}
            <div className="bg-[#111113] rounded-lg border border-[#1e1e21] p-3 flex-1 overflow-y-auto min-h-0">
              <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-2">
                Scheduled ({scheduledDrafts.length})
              </div>
              {scheduledDrafts.length === 0 ? (
                <div className="text-[10px] text-gray-700 text-center py-4">No scheduled posts</div>
              ) : (
                <div className="space-y-1.5">
                  {scheduledDrafts.sort((a, b) => new Date(a.scheduledFor!).getTime() - new Date(b.scheduledFor!).getTime()).map(d => (
                    <div key={d.id} className="p-2 bg-[#0a0a0b] rounded border border-[#1e1e21] cursor-pointer hover:border-[#333]"
                      onClick={() => handleLoadDraft(d)}>
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-[10px]">{platforms[d.platform as Platform]?.emoji}</span>
                        <span className="text-[9px] text-blue-400">{new Date(d.scheduledFor!).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                        <span className="text-[9px] text-gray-600">{new Date(d.scheduledFor!).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <div className="text-[9px] text-gray-400 line-clamp-2">{d.text}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent activity */}
            <div className="bg-[#111113] rounded-lg border border-[#1e1e21] p-3 shrink-0">
              <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-1.5">Recent</div>
              <div className="space-y-1">
                {drafts.slice(0, 4).map(d => (
                  <div key={d.id} className="flex items-center gap-1.5 text-[9px] cursor-pointer hover:text-gray-200"
                    onClick={() => handleLoadDraft(d)}>
                    <span>{platforms[d.platform as Platform]?.emoji}</span>
                    <span className={d.status === 'published' ? 'text-green-400' : d.status === 'scheduled' ? 'text-blue-400' : 'text-gray-500'}>
                      {d.status === 'published' ? '✓' : d.status === 'scheduled' ? '📅' : '○'}
                    </span>
                    <span className="text-gray-400 truncate flex-1">{d.text.slice(0, 40)}</span>
                  </div>
                ))}
                {drafts.length === 0 && <div className="text-[9px] text-gray-700">No activity yet</div>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DRAFTS TAB */}
      {tab === 'drafts' && (
        <div className="flex-1 overflow-y-auto space-y-2">
          {drafts.filter(d => d.status === 'draft').length === 0 ? (
            <div className="bg-[#111113] rounded-lg border border-[#1e1e21] p-8 text-center text-xs text-gray-600">
              No drafts saved. Create content and save as draft.
            </div>
          ) : (
            drafts.filter(d => d.status === 'draft').map(draft => (
              <div key={draft.id} className="bg-[#111113] rounded-lg border border-[#1e1e21] p-3 group">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handleLoadDraft(draft)}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm">{platforms[draft.platform as Platform]?.emoji}</span>
                      <span className="text-[11px] font-medium text-gray-200">{platforms[draft.platform as Platform]?.label}</span>
                      <span className="text-[9px] text-gray-600">{new Date(draft.createdAt).toLocaleDateString()}</span>
                    </div>
                    <p className="text-[11px] text-gray-400 line-clamp-2">{draft.text}</p>
                  </div>
                  <button onClick={() => handleDeleteDraft(draft.id)}
                    className="text-[10px] text-gray-700 hover:text-red-400 opacity-0 group-hover:opacity-100 ml-3">×</button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* SCHEDULED TAB */}
      {tab === 'scheduled' && (
        <div className="flex-1 overflow-y-auto">
          {scheduledDrafts.length === 0 ? (
            <div className="bg-[#111113] rounded-lg border border-[#1e1e21] p-8 text-center text-xs text-gray-600">
              No scheduled posts. Set a date when creating content.
            </div>
          ) : (
            <div className="space-y-2">
              {scheduledDrafts.sort((a, b) => new Date(a.scheduledFor!).getTime() - new Date(b.scheduledFor!).getTime()).map(draft => (
                <div key={draft.id} className="bg-[#111113] rounded-lg border border-blue-500/20 p-3 group">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handleLoadDraft(draft)}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm">{platforms[draft.platform as Platform]?.emoji}</span>
                        <span className="text-[11px] font-medium text-gray-200">{platforms[draft.platform as Platform]?.label}</span>
                        <span className="text-[10px] text-blue-400">📅 {new Date(draft.scheduledFor!).toLocaleString()}</span>
                      </div>
                      <p className="text-[11px] text-gray-400 line-clamp-2">{draft.text}</p>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                      <button onClick={() => handleLoadDraft(draft)} className="text-[9px] text-amber-400 px-1.5 py-0.5 bg-amber-500/10 rounded">Edit</button>
                      <button onClick={() => handleDeleteDraft(draft.id)} className="text-[9px] text-red-400 px-1.5 py-0.5 bg-red-500/10 rounded">×</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ACCOUNTS TAB */}
      {tab === 'accounts' && (
        <div className="flex-1 overflow-y-auto space-y-3">
          <p className="text-xs text-gray-500">Platform accounts. Tokens stored encrypted in Vault (AES-256-GCM).</p>
          {(Object.entries(platforms) as [Platform, typeof platforms.linkedin][]).map(([key, p]) => {
            const isConnected = accounts.find(a => a.platform === key)?.connected || false;
            return (
              <div key={key} className={`bg-[#111113] rounded-lg border p-3 ${isConnected ? 'border-green-500/20' : 'border-[#1e1e21]'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`w-9 h-9 rounded-lg ${p.color} flex items-center justify-center text-white text-base`}>{p.emoji}</span>
                    <div>
                      <div className="text-xs font-medium text-gray-200">{p.label}</div>
                      <div className="text-[9px] text-gray-500">Secret: <code className="text-gray-600">{p.secretKey}</code></div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[9px] px-1.5 py-0.5 rounded ${isConnected ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}`}>
                      {isConnected ? 'Connected' : 'Not configured'}
                    </span>
                    <a href="/settings" className="text-[9px] text-amber-400 hover:text-amber-300 px-2 py-0.5 bg-[#1a1a1d] rounded">
                      {isConnected ? 'Manage' : 'Add Token'} →
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}

export default dynamic(() => Promise.resolve(ContentPageInner), { ssr: false });
