'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { MarkdownView } from '@/components/ui/markdown-view';
import { autoTask } from '@/lib/tasks';
import { SQUADS_BY_ID } from '@/lib/squads';

// ─── Types ──────────────────────────────────────────────────────
interface AccountStatus { platform: string; connected: boolean; label: string; }

type ContentTab = 'studio' | 'create' | 'drafts' | 'scheduled' | 'accounts';

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
  options?: string[];
  selectedOption?: string;
}

interface Campaign {
  id: string;
  topic: string;
  platforms: Platform[];
  steps: PipelineStep[];
  currentStep: number;
  createdAt: string;
  status: 'active' | 'paused' | 'done' | 'cancelled';
  variants: Record<string, CampaignVariant>;
}

interface CampaignVariant {
  platform: Platform;
  text: string;
  hashtags: string;
  imagePrompt?: string;
  imageUrl?: string;
  status: 'pending' | 'draft' | 'approved' | 'published';
}

// Content Squad — derived from squad registry (social squad)
const socialSquad = SQUADS_BY_ID['social'];
const squadLead = socialSquad?.agents.find(a => a.tier === 1);
const squadCreator = socialSquad?.agents.find(a => a.tier === 2);

const leadId = squadLead?.name.toLowerCase() || 'saga';
const leadEmoji = squadLead?.emoji || '🔮';
const creatorId = squadCreator?.name.toLowerCase() || 'bragi';
const creatorEmoji = squadCreator?.emoji || '🎭';

const CONTENT_SQUAD = (socialSquad?.agents || []).map(a => ({
  id: a.name.toLowerCase(),
  name: a.name,
  role: a.role,
  emoji: a.emoji,
  desc: a.role,
}));

function createCampaignSteps(): PipelineStep[] {
  return [
    { id: 'research', label: 'Research & Strategy', agent: leadId, agentEmoji: leadEmoji, description: 'Scan trends, news, competitors — identify angles and audience hooks', status: 'pending' },
    { id: 'topics', label: 'Topic Selection', agent: 'human', agentEmoji: '👤', description: 'Choose from candidate topics', status: 'pending', isGate: true },
    { id: 'draft', label: 'Write Variants', agent: creatorId, agentEmoji: creatorEmoji, description: 'Generate platform-specific copy for each selected platform', status: 'pending' },
    { id: 'media', label: 'Generate Visuals', agent: creatorId, agentEmoji: creatorEmoji, description: 'Create image prompts and carousel layouts per platform', status: 'pending' },
    { id: 'hashtags', label: 'Hashtags & SEO', agent: creatorId, agentEmoji: creatorEmoji, description: 'Optimize hashtags and keywords per platform', status: 'pending' },
    { id: 'review', label: 'Editorial Review', agent: 'human', agentEmoji: '👤', description: 'Review all variants, edit, and approve', status: 'pending', isGate: true },
    { id: 'schedule', label: 'Schedule / Publish', agent: leadId, agentEmoji: leadEmoji, description: 'Set timing and cross-publish to all platforms', status: 'pending' },
    { id: 'report', label: 'Report', agent: leadId, agentEmoji: leadEmoji, description: 'Log campaign and track performance across platforms', status: 'pending' },
  ];
}

// ─── Platform Config ────────────────────────────────────────────
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

// ─── Draft type ─────────────────────────────────────────────────
interface Draft {
  id: string; platform: string; text: string; hashtags: string;
  imageUrl?: string; scheduledFor?: string; status: 'draft' | 'review' | 'approved' | 'published' | 'scheduled' | 'rejected';
  createdAt: string; taskId?: string; campaignId?: string;
}

// ─── Data helpers ───────────────────────────────────────────────
async function fetchCampaigns(): Promise<Campaign[]> {
  try {
    const res = await fetch('/api/content/pipelines');
    const data = await res.json();
    if (data.ok && data.pipelines) {
      return data.pipelines.map((p: Record<string, unknown>) => ({
        id: p.id,
        topic: p.topic,
        platforms: p.platform ? (p.platform as string).split(',') : ['linkedin'],
        steps: Array.isArray(p.steps) ? p.steps : [],
        currentStep: p.currentStep || 0,
        createdAt: p.createdAt ? new Date(p.createdAt as number).toISOString() : new Date().toISOString(),
        status: p.status || 'active',
        variants: p.finalText ? parseVariants(p.finalText as string, p.finalHashtags as string, p.platform as string) : {},
      }));
    }
  } catch { /* fallback */ }
  return [];
}

function parseVariants(text: string, hashtags: string, platformStr: string): Record<string, CampaignVariant> {
  const plats = platformStr?.split(',') || ['linkedin'];
  const variants: Record<string, CampaignVariant> = {};
  // Try to parse as JSON first (new format)
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch { /* legacy single-text */ }
  // Legacy: single text applies to first platform
  for (const p of plats) {
    variants[p] = { platform: p as Platform, text: p === plats[0] ? text : '', hashtags: p === plats[0] ? (hashtags || '') : '', status: 'draft' };
  }
  return variants;
}

async function saveCampaignToDB(c: Campaign) {
  try {
    await fetch('/api/content/pipelines', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: c.id, platform: c.platforms.join(','), topic: c.topic,
        status: c.status, currentStep: c.currentStep,
        steps: c.steps,
        finalText: JSON.stringify(c.variants),
        finalHashtags: Object.values(c.variants).map(v => v.hashtags).filter(Boolean).join('|'),
      }),
    });
  } catch { /* ignore */ }
}

async function fetchDrafts(): Promise<Draft[]> {
  try {
    const res = await fetch('/api/content/drafts');
    const data = await res.json();
    if (data.ok && data.drafts) {
      return data.drafts.map((d: Record<string, unknown>) => ({
        id: d.id, platform: d.platform, text: d.content || '', hashtags: d.hashtags || '',
        imageUrl: d.mediaUrl || undefined,
        scheduledFor: d.scheduledAt ? new Date(d.scheduledAt as number).toISOString() : undefined,
        status: d.status || 'draft',
        createdAt: d.createdAt ? new Date(d.createdAt as number).toISOString() : new Date().toISOString(),
        campaignId: d.pipelineId || undefined,
      }));
    }
  } catch { /* fallback */ }
  return [];
}

async function saveDraftToDB(draft: Draft): Promise<string> {
  try {
    const res = await fetch('/api/content/drafts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: draft.id, platform: draft.platform, text: draft.text,
        hashtags: draft.hashtags, imageUrl: draft.imageUrl,
        scheduledFor: draft.scheduledFor, status: draft.status,
        pipelineId: draft.campaignId,
      }),
    });
    const data = await res.json();
    return data.id || draft.id;
  } catch { return draft.id; }
}

async function deleteDraftFromDB(id: string) {
  try { await fetch(`/api/content/drafts?id=${id}`, { method: 'DELETE' }); } catch { /* ignore */ }
}

// ─── Agent Actions ──────────────────────────────────────────────
const AGENT_ACTIONS = [
  { id: 'generate', label: 'Generate post', desc: 'Create content from topic', icon: '✨' },
  { id: 'rewrite', label: 'Improve text', desc: 'Rewrite current draft', icon: '🔄' },
  { id: 'hashtags', label: 'Suggest hashtags', desc: 'Best hashtags for reach', icon: '#️⃣' },
  { id: 'translate', label: 'Translate', desc: 'pt-BR ↔ en-US', icon: '🌐' },
  { id: 'timing', label: 'Best time to post', desc: 'Optimal schedule', icon: '⏰' },
  { id: 'thread', label: 'Make thread', desc: 'Split into thread/carousel', icon: '🧵' },
  { id: 'seo', label: 'SEO optimize', desc: 'Keywords & meta', icon: '🔍' },
  { id: 'tone', label: 'Adjust tone', desc: 'Formal/casual/bold', icon: '🎭' },
  { id: 'image', label: 'Image prompt', desc: 'Generate visual description', icon: '🖼️' },
  { id: 'adapt', label: 'Adapt platform', desc: 'Rewrite for another platform', icon: '📱' },
];

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════
function ContentPageInner() {
  const [tab, setTab] = useState<ContentTab>('studio');
  const [platform, setPlatform] = useState<Platform>('linkedin');
  const [text, setText] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [imagePrompt, setImagePrompt] = useState('');
  const [scheduledFor, setScheduledFor] = useState('');
  const [accounts, setAccounts] = useState<AccountStatus[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [agentWorking, setAgentWorking] = useState<string | null>(null);
  const [agentTopic, setAgentTopic] = useState('');

  // Campaign state
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [activeCampaign, setActiveCampaign] = useState<Campaign | null>(null);
  const [campaignTopic, setCampaignTopic] = useState('');
  const [campaignPlatforms, setCampaignPlatforms] = useState<Platform[]>(['linkedin', 'twitter', 'instagram']);
  const [campaignRunning, setCampaignRunning] = useState(false);
  const [reviewingVariant, setReviewingVariant] = useState<Platform | null>(null);

  // Cross-publish state
  const [crossPublishPlatforms, setCrossPublishPlatforms] = useState<Platform[]>([]);

  // Media state
  const [mediaItems, setMediaItems] = useState<Array<{ id: string; url: string; type: string; alt?: string; credit?: string; source: string }>>([]);
  const [imageSearchQuery, setImageSearchQuery] = useState('');
  const [imageSearchResults, setImageSearchResults] = useState<Array<{ id: string; url: string; thumbnailUrl: string; alt: string; credit: string; source: string }>>([]);
  const [searchingImages, setSearchingImages] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);

  useEffect(() => {
    fetchDrafts().then(setDrafts);
    fetchCampaigns().then(setCampaigns);
  }, []);

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
  const connectedCount = accounts.filter(a => a.connected).length;

  // ─── Agent call ───────────────────────────────────────────────
  const callAgent = async (agent: string, prompt: string): Promise<string> => {
    const res = await fetch('/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId: agent, message: prompt }),
    });
    const data = await res.json();
    if (data.ok && data.response) return data.response;
    throw new Error(data.error || 'Agent failed');
  };

  // ─── CAMPAIGN HANDLERS ───────────────────────────────────────
  const startCampaign = () => {
    if (!campaignTopic.trim() || campaignPlatforms.length === 0) return;
    const campaign: Campaign = {
      id: `camp_${Date.now().toString(36)}`,
      topic: campaignTopic,
      platforms: [...campaignPlatforms],
      steps: createCampaignSteps(),
      currentStep: 0,
      createdAt: new Date().toISOString(),
      status: 'active',
      variants: Object.fromEntries(campaignPlatforms.map(p => [p, { platform: p, text: '', hashtags: '', status: 'pending' as const }])),
    };
    setActiveCampaign(campaign);
    setCampaigns(prev => [campaign, ...prev]);
    saveCampaignToDB(campaign);
    setCampaignTopic('');
    runCampaignStep(campaign, 0);
  };

  const updateCampaign = (campaign: Campaign) => {
    setActiveCampaign({ ...campaign });
    setCampaigns(prev => prev.map(c => c.id === campaign.id ? campaign : c));
    saveCampaignToDB(campaign);
  };

  const toggleCampaignPlatform = (p: Platform) => {
    setCampaignPlatforms(prev =>
      prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]
    );
  };

  const runCampaignStep = async (campaign: Campaign, stepIndex: number) => {
    if (stepIndex >= campaign.steps.length) {
      campaign.status = 'done';
      updateCampaign(campaign);
      return;
    }

    const step = campaign.steps[stepIndex];
    if (step.isGate) {
      step.status = 'gate';
      campaign.currentStep = stepIndex;
      updateCampaign(campaign);
      return;
    }

    step.status = 'running';
    campaign.currentStep = stepIndex;
    setCampaignRunning(true);
    updateCampaign(campaign);

    try {
      let output = '';
      const platLabels = campaign.platforms.map(p => platforms[p].label).join(', ');

      switch (step.id) {
        case 'research': {
          output = await callAgent(leadId, `Research the latest trends, news and opportunities about: "${campaign.topic}". Focus on what's relevant for audiences on ${platLabels} in tech/AI/blockchain. Return 5 candidate topics, each with a one-line description and why it would make a good multi-platform campaign. Number them 1-5.`);
          const topics = output.split(/\n/).filter(l => /^\d/.test(l.trim())).map(l => l.trim());
          const topicOptions = topics.length > 0 ? topics : output.split(/\n\n/).filter(Boolean).slice(0, 5);
          const topicsGate = campaign.steps.find(s => s.id === 'topics');
          if (topicsGate) topicsGate.options = topicOptions;
          break;
        }
        case 'draft': {
          const selectedTopic = campaign.steps.find(s => s.id === 'topics')?.selectedOption || campaign.topic;
          const allVariants: string[] = [];
          for (const p of campaign.platforms) {
            const pcfg = platforms[p];
            const variantText = await callAgent(creatorId, `Write a ${pcfg.label} post about: "${selectedTopic}". Follow best practices for ${pcfg.label}. Max ${pcfg.maxChars} chars. Make it engaging with a strong hook. The tone should match ${pcfg.label}'s audience expectations. Return ONLY the post text, no explanation or prefix.`);
            campaign.variants[p] = { ...campaign.variants[p], text: variantText.trim(), status: 'draft' };
            allVariants.push(`[${pcfg.label}] ${variantText.trim().slice(0, 80)}...`);
          }
          output = `Generated ${campaign.platforms.length} platform variants:\n${allVariants.join('\n')}`;
          break;
        }
        case 'media': {
          for (const p of campaign.platforms) {
            const pcfg = platforms[p];
            const variantText = campaign.variants[p]?.text || '';
            if (!variantText) continue;
            const mediaOutput = await callAgent(creatorId, `For this ${pcfg.label} post, create:\n1. A detailed image description (prompt for AI image generation, include style, composition, colors)\n2. If ${pcfg.label === 'Instagram' ? 'carousel: describe 3-5 slides with title + visual each' : 'a single image is best, describe it in detail'}\n3. Alt text for accessibility\n\nPost:\n${variantText}\n\nReturn the image prompt on the FIRST line.`);
            const imgPrompt = mediaOutput.split('\n')[0]?.trim() || '';
            campaign.variants[p] = { ...campaign.variants[p], imagePrompt: imgPrompt };
          }
          output = `Generated visual descriptions for ${campaign.platforms.length} platforms`;
          break;
        }
        case 'hashtags': {
          for (const p of campaign.platforms) {
            const pcfg = platforms[p];
            const variantText = campaign.variants[p]?.text || '';
            if (!variantText) continue;
            const hashOutput = await callAgent(creatorId, `For this ${pcfg.label} post, provide the best ${pcfg.hashtagLimit} hashtags. Return ONLY hashtags space-separated on the first line:\n\n${variantText}`);
            const firstLine = hashOutput.split('\n')[0]?.trim() || '';
            campaign.variants[p] = { ...campaign.variants[p], hashtags: firstLine };
          }
          output = `Optimized hashtags for ${campaign.platforms.length} platforms`;
          break;
        }
        case 'schedule': {
          const summaries = campaign.platforms.map(p => {
            const v = campaign.variants[p];
            return `${platforms[p].emoji} ${platforms[p].label}: ${v?.text?.length || 0} chars, ${v?.hashtags?.split(/\s+/).filter(Boolean).length || 0} hashtags`;
          });
          output = `Campaign ready for cross-publishing:\n${summaries.join('\n')}\nStatus: All variants ready`;
          break;
        }
        case 'report': {
          await autoTask.contentPipeline(campaign.topic, platLabels);
          output = `Campaign "${campaign.topic}" logged across ${campaign.platforms.length} platforms.`;
          break;
        }
        default:
          output = 'Step completed.';
      }

      step.output = output;
      step.status = 'done';
      updateCampaign(campaign);
      setTimeout(() => runCampaignStep(campaign, stepIndex + 1), 500);
    } catch (err) {
      step.status = 'error';
      step.output = String(err);
      updateCampaign(campaign);
    }
    setCampaignRunning(false);
  };

  const approveCampaignGate = (option?: string) => {
    if (!activeCampaign) return;
    const step = activeCampaign.steps[activeCampaign.currentStep];
    if (option) step.selectedOption = option;
    step.status = 'done';
    step.output = option || 'Approved';
    updateCampaign(activeCampaign);
    runCampaignStep(activeCampaign, activeCampaign.currentStep + 1);
  };

  const loadVariantToEditor = (p: Platform) => {
    if (!activeCampaign) return;
    const v = activeCampaign.variants[p];
    if (v) {
      setPlatform(p);
      setText(v.text || '');
      setHashtags(v.hashtags || '');
      if (v.imagePrompt) setImagePrompt(v.imagePrompt);
      if (v.imageUrl) setImageUrl(v.imageUrl);
    }
    setTab('create');
  };

  // ─── DRAFT / PUBLISH HANDLERS ─────────────────────────────────
  const handleSaveDraft = async () => {
    const draft: Draft = {
      id: `draft_${Date.now().toString(36)}`, platform, text, hashtags,
      imageUrl: imageUrl || undefined, scheduledFor: scheduledFor || undefined,
      status: scheduledFor ? 'scheduled' : 'draft', createdAt: new Date().toISOString(),
      campaignId: activeCampaign?.id,
    };
    setDrafts(prev => [draft, ...prev]);
    await saveDraftToDB(draft);
    setPublishResult({ ok: true, message: scheduledFor ? `Scheduled for ${new Date(scheduledFor).toLocaleString()}` : 'Draft saved' });
  };

  const handleDeleteDraft = async (id: string) => {
    setDrafts(prev => prev.filter(d => d.id !== id));
    await deleteDraftFromDB(id);
  };

  const handleLoadDraft = (draft: Draft) => {
    setPlatform(draft.platform as Platform);
    setText(draft.text);
    setHashtags(draft.hashtags);
    if (draft.imageUrl) setImageUrl(draft.imageUrl);
    if (draft.scheduledFor) setScheduledFor(draft.scheduledFor);
    setTab('create');
  };

  const handlePublish = async (targetPlatform?: Platform) => {
    const pub = targetPlatform || platform;
    if (pub !== 'linkedin') {
      setPublishResult({ ok: false, message: `${platforms[pub].label} publishing coming soon` });
      return;
    }
    const fullText = text + (hashtags ? '\n\n' + hashtags.split(/[,\s]+/).filter(Boolean).map(t => t.startsWith('#') ? t : `#${t}`).join(' ') : '');
    setPublishing(true); setPublishResult(null);
    try {
      const res = await fetch('/api/linkedin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: fullText }) });
      const data = await res.json();
      setPublishResult({ ok: data.ok, message: data.ok ? `Published to ${platforms[pub].label}! ID: ${data.postId}` : data.error });
      if (data.ok) await autoTask.contentPublish(platforms[pub].label, text);
    } catch (e) { setPublishResult({ ok: false, message: String(e) }); }
    setPublishing(false);
  };

  const handleCrossPublish = async () => {
    if (crossPublishPlatforms.length === 0) return;
    setPublishing(true); setPublishResult(null);
    const results: string[] = [];
    for (const p of crossPublishPlatforms) {
      try {
        if (p === 'linkedin') {
          const fullText = text + (hashtags ? '\n\n' + hashtags.split(/[,\s]+/).filter(Boolean).map(t => t.startsWith('#') ? t : `#${t}`).join(' ') : '');
          const res = await fetch('/api/linkedin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: fullText }) });
          const data = await res.json();
          results.push(`${platforms[p].emoji} ${data.ok ? '✓' : '✗'} ${platforms[p].label}`);
          if (data.ok) await autoTask.contentPublish(platforms[p].label, text);
        } else {
          results.push(`${platforms[p].emoji} ⏳ ${platforms[p].label} (coming soon)`);
        }
      } catch {
        results.push(`${platforms[p].emoji} ✗ ${platforms[p].label} (error)`);
      }
    }
    setPublishResult({ ok: true, message: results.join('\n') });
    setPublishing(false);
  };

  // ─── Agent action handler ─────────────────────────────────────
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
      image: `Generate a detailed image prompt for AI image generation based on this ${cfg.label} post. Include style (photography/illustration/3D), composition, color palette, mood. Return ONLY the image prompt:\n\n${text}`,
      adapt: `Adapt this content for ${platform === 'linkedin' ? 'Twitter/X (max 280 chars)' : platform === 'twitter' ? 'LinkedIn (max 3000 chars, professional tone)' : 'LinkedIn (max 3000 chars)'}. Return ONLY the adapted text:\n\n${text}`,
    };

    try {
      const res = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: creatorId, message: prompts[actionId] || prompts.generate }),
      });
      const data = await res.json();

      if (data.ok && data.response) {
        if (actionId === 'hashtags') {
          setHashtags(data.response.replace(/\n/g, ' ').trim());
        } else if (actionId === 'timing') {
          setPublishResult({ ok: true, message: data.response.slice(0, 300) });
        } else if (actionId === 'image') {
          setImagePrompt(data.response.trim());
          setPublishResult({ ok: true, message: '🖼️ Image prompt generated — use it with your preferred image AI' });
        } else if (['generate', 'rewrite', 'translate', 'thread', 'seo', 'tone', 'adapt'].includes(actionId)) {
          setText(data.response.trim());
        }
        await autoTask.agentAction(creatorId, `${squadCreator?.name || 'Content'}: ${AGENT_ACTIONS.find(a => a.id === actionId)?.label} for ${cfg.label}`);
      } else {
        setPublishResult({ ok: false, message: data.error || 'Agent failed' });
      }
    } catch (e) {
      setPublishResult({ ok: false, message: `Agent error: ${String(e)}` });
    }
    setAgentWorking(null);
  };

  // ─── Media handlers ──────────────────────────────────────────
  const handleImageSearch = async () => {
    if (!imageSearchQuery.trim()) return;
    setSearchingImages(true);
    try {
      const res = await fetch(`/api/content/media/search?q=${encodeURIComponent(imageSearchQuery)}&perPage=8`);
      const data = await res.json();
      if (data.ok) setImageSearchResults(data.results || []);
    } catch { /* ignore */ }
    setSearchingImages(false);
  };

  const handleSelectSearchImage = (img: typeof imageSearchResults[0]) => {
    setMediaItems(prev => [...prev, { id: img.id, url: img.url, type: 'image', alt: img.alt, credit: img.credit, source: img.source }]);
    setImageUrl(img.url);
    setImageSearchResults([]);
    setImageSearchQuery('');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingMedia(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', file.type.startsWith('video') ? 'video' : 'image');
      const res = await fetch('/api/content/media/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.ok) {
        setMediaItems(prev => [...prev, { id: data.media.id, url: data.media.url, type: data.media.type, source: 'upload' }]);
        setImageUrl(data.media.url);
      }
    } catch { /* ignore */ }
    setUploadingMedia(false);
    e.target.value = '';
  };

  const handleRemoveMedia = (id: string) => {
    setMediaItems(prev => prev.filter(m => m.id !== id));
    if (mediaItems.length <= 1) setImageUrl('');
  };

  const handleApprove = async (draftId: string) => {
    try {
      const res = await fetch('/api/content/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftId, action: 'approve', approveMedia: true }),
      });
      const data = await res.json();
      if (data.ok) {
        setPublishResult({ ok: true, message: 'Approved! Ready to publish.' });
        setDrafts(prev => prev.map(d => d.id === draftId ? { ...d, status: 'approved' as const } : d));
      }
    } catch { /* ignore */ }
  };

  const handleReject = async (draftId: string, note: string) => {
    try {
      await fetch('/api/content/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftId, action: 'correct', note }),
      });
      setDrafts(prev => prev.map(d => d.id === draftId ? { ...d, status: 'draft' as const } : d));
    } catch { /* ignore */ }
  };

  const handlePublishDraft = async (draftId: string) => {
    setPublishing(true);
    try {
      const res = await fetch('/api/content/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftId }),
      });
      const data = await res.json();
      setPublishResult({ ok: data.ok, message: data.ok ? `Published! ${data.postUrl || ''}` : data.error });
      if (data.ok) {
        setDrafts(prev => prev.map(d => d.id === draftId ? { ...d, status: 'published' as const } : d));
      }
    } catch (e) {
      setPublishResult({ ok: false, message: String(e) });
    }
    setPublishing(false);
  };

  const handleSendForReview = async () => {
    // Save draft with 'review' status and send to Telegram
    const draft: Draft = {
      id: `draft_${Date.now().toString(36)}`, platform, text, hashtags,
      imageUrl: imageUrl || undefined, status: 'review' as Draft['status'],
      createdAt: new Date().toISOString(), campaignId: activeCampaign?.id,
    };
    setDrafts(prev => [draft, ...prev]);
    await saveDraftToDB({ ...draft, status: 'review' as Draft['status'] });

    // Trigger Telegram notification
    try {
      await fetch('/api/content/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftId: draft.id, action: 'approve' }),
      });
    } catch { /* best effort */ }

    setPublishResult({ ok: true, message: 'Sent for review. Check Telegram for approval.' });
  };

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════
  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] gap-3">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-gray-200">Content Studio</h2>
          <div className="flex gap-0.5 bg-[#111113] rounded-lg p-0.5 border border-[#1e1e21]">
            {(['studio', 'create', 'drafts', 'scheduled', 'accounts'] as ContentTab[]).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-2.5 py-1 text-[11px] rounded capitalize ${tab === t ? 'bg-[#1e1e21] text-gray-100' : 'text-gray-500 hover:text-gray-300'}`}>
                {t === 'studio' ? '🚀 Studio' : t}
                {t === 'studio' && campaigns.filter(c => c.status === 'active').length > 0 ? ` (${campaigns.filter(c => c.status === 'active').length})` : ''}
                {t === 'drafts' && draftCount > 0 ? ` (${draftCount})` : ''}
                {t === 'scheduled' && scheduledDrafts.length > 0 ? ` (${scheduledDrafts.length})` : ''}
                {t === 'accounts' ? ` (${connectedCount}/${Object.keys(platforms).length})` : ''}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Content squad mini */}
          <div className="flex items-center gap-1 mr-2">
            {CONTENT_SQUAD.map(a => (
              <span key={a.id + a.role} className="text-sm cursor-default" title={`${a.name} — ${a.role}`}>{a.emoji}</span>
            ))}
            <span className="text-[9px] text-gray-600 ml-0.5">squad</span>
          </div>
          {accounts.filter(a => a.connected).map(a => (
            <span key={a.platform} className="text-[10px] bg-green-500/10 text-green-400 px-1.5 py-0.5 rounded">
              {platforms[a.platform as Platform]?.emoji} ✓
            </span>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════ */}
      {/* CAMPAIGNS TAB */}
      {/* ══════════════════════════════════════════════════════════ */}
      {tab === 'studio' && (
        <div className="flex gap-3 flex-1 min-h-0">
          {/* Left: New campaign + History */}
          <div className="w-72 flex flex-col gap-2.5 shrink-0 min-h-0">
            {/* New campaign */}
            <div className="bg-[#111113] rounded-lg border border-[#1e1e21] p-3 shrink-0">
              <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">New Campaign</div>
              {/* Multi-platform selector */}
              <div className="flex gap-1 mb-2 flex-wrap">
                {(Object.entries(platforms) as [Platform, typeof platforms.linkedin][]).map(([key, p]) => (
                  <button key={key} onClick={() => toggleCampaignPlatform(key)}
                    className={`px-2 py-0.5 text-[9px] rounded transition-colors ${
                      campaignPlatforms.includes(key)
                        ? 'bg-amber-500 text-gray-900 font-medium'
                        : 'bg-[#0a0a0b] text-gray-500 border border-[#1e1e21] hover:border-[#333]'
                    }`}>
                    {p.emoji} {p.label}
                  </button>
                ))}
              </div>
              <div className="text-[9px] text-gray-600 mb-2">
                {campaignPlatforms.length} platform{campaignPlatforms.length !== 1 ? 's' : ''} selected — one topic, tailored variants
              </div>
              <input value={campaignTopic} onChange={e => setCampaignTopic(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') startCampaign(); }}
                placeholder="Topic: e.g. 'AI agents replacing marketing teams'"
                className="w-full px-2.5 py-2 bg-[#0a0a0b] border border-[#1e1e21] rounded text-[11px] text-gray-200 placeholder-gray-600 focus:outline-none focus:border-amber-500 mb-2" />
              <button onClick={startCampaign} disabled={!campaignTopic.trim() || campaignPlatforms.length === 0 || campaignRunning}
                className="w-full py-1.5 text-[10px] font-medium bg-amber-500 text-gray-900 rounded hover:bg-amber-400 disabled:opacity-40">
                Launch Campaign →
              </button>
            </div>

            {/* Content Squad */}
            <div className="bg-[#111113] rounded-lg border border-[#1e1e21] p-3 shrink-0">
              <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Content Squad</div>
              <div className="space-y-1.5">
                {CONTENT_SQUAD.map(agent => (
                  <div key={agent.id + agent.role} className="flex items-center gap-2 px-2 py-1.5 bg-[#0a0a0b] rounded border border-[#1e1e21]">
                    <span className="text-base">{agent.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] font-medium text-gray-200">{agent.name}</div>
                      <div className="text-[8px] text-gray-600">{agent.role} — {agent.desc}</div>
                    </div>
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" title="Online" />
                  </div>
                ))}
              </div>
            </div>

            {/* Campaign history */}
            <div className="bg-[#111113] rounded-lg border border-[#1e1e21] p-3 flex-1 overflow-y-auto min-h-0">
              <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Campaigns ({campaigns.length})</div>
              {campaigns.length === 0 ? (
                <div className="text-[10px] text-gray-700 text-center py-4">No campaigns yet</div>
              ) : (
                <div className="space-y-1.5">
                  {campaigns.map(c => {
                    const doneSteps = c.steps.filter(s => s.status === 'done').length;
                    const progress = Math.round((doneSteps / c.steps.length) * 100);
                    return (
                      <button key={c.id} onClick={() => { setActiveCampaign(c); setReviewingVariant(null); }}
                        className={`w-full text-left p-2 rounded border transition-colors ${
                          activeCampaign?.id === c.id ? 'bg-[#1e1e21] border-amber-500/30' : 'bg-[#0a0a0b] border-[#1e1e21] hover:border-[#333]'
                        }`}>
                        <div className="flex items-center gap-1.5 mb-1">
                          <div className="flex gap-0.5">
                            {c.platforms.map(p => <span key={p} className="text-[10px]">{platforms[p]?.emoji}</span>)}
                          </div>
                          <span className={`text-[8px] px-1 py-0.5 rounded ${
                            c.status === 'active' ? 'bg-green-500/20 text-green-400' :
                            c.status === 'done' ? 'bg-blue-500/20 text-blue-400' :
                            'bg-gray-500/20 text-gray-400'
                          }`}>{c.status}</span>
                          <span className="text-[8px] text-gray-600 ml-auto">{progress}%</span>
                        </div>
                        <div className="text-[10px] text-gray-300 truncate">{c.topic}</div>
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

          {/* Center: Campaign steps */}
          <div className="flex-1 flex flex-col min-h-0 min-w-0">
            {!activeCampaign ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center max-w-sm">
                  <div className="text-3xl mb-3">🚀</div>
                  <div className="text-sm text-gray-400">Multi-Platform Campaigns</div>
                  <div className="text-[10px] text-gray-600 mt-1">
                    One topic → platform-tailored variants → cross-publish everywhere
                  </div>
                  <div className="flex justify-center gap-2 mt-3">
                    {CONTENT_SQUAD.map(a => (
                      <div key={a.id + a.role} className="text-center">
                        <div className="text-lg">{a.emoji}</div>
                        <div className="text-[8px] text-gray-600">{a.role}</div>
                      </div>
                    ))}
                  </div>
                  <div className="text-[9px] text-gray-700 mt-3">
                    Research → Topics → Write Variants → Visuals → Hashtags → Review → Publish → Report
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                {/* Campaign header */}
                <div className="bg-[#111113] rounded-lg border border-[#1e1e21] p-3 flex items-center justify-between shrink-0">
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="flex gap-0.5">{activeCampaign.platforms.map(p => <span key={p}>{platforms[p]?.emoji}</span>)}</div>
                      <span className="text-xs font-medium text-gray-200">{activeCampaign.topic}</span>
                    </div>
                    <div className="text-[9px] text-gray-600 mt-0.5">
                      {activeCampaign.steps.filter(s => s.status === 'done').length}/{activeCampaign.steps.length} steps • {activeCampaign.platforms.length} platforms • {activeCampaign.status}
                    </div>
                  </div>
                  {activeCampaign.status === 'done' && (
                    <div className="flex gap-1.5">
                      {activeCampaign.platforms.map(p => (
                        <button key={p} onClick={() => loadVariantToEditor(p)}
                          className="px-2 py-1 text-[9px] font-medium bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded hover:bg-amber-500/30">
                          {platforms[p].emoji} Edit
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Progress bar */}
                <div className="w-full h-1 bg-[#1e1e21] rounded-full shrink-0">
                  <div className="h-full bg-gradient-to-r from-amber-500 to-amber-400 rounded-full transition-all duration-500"
                    style={{ width: `${Math.round((activeCampaign.steps.filter(s => s.status === 'done').length / activeCampaign.steps.length) * 100)}%` }} />
                </div>

                {/* Steps */}
                {activeCampaign.steps.map((step, i) => (
                  <div key={step.id} className={`bg-[#111113] rounded-lg border p-3 transition-colors ${
                    step.status === 'running' ? 'border-amber-500/40 bg-amber-500/5' :
                    step.status === 'gate' ? 'border-purple-500/40 bg-purple-500/5' :
                    step.status === 'done' ? 'border-green-500/20' :
                    step.status === 'error' ? 'border-red-500/30' :
                    'border-[#1e1e21]'
                  }`}>
                    <div className="flex items-center gap-2.5">
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
                        {(step.options.length > 0 ? step.options : ['Option 1', 'Option 2', 'Option 3']).map((opt, oi) => (
                          <button key={oi} onClick={() => approveCampaignGate(opt)}
                            className="w-full text-left px-3 py-2 bg-[#0a0a0b] border border-[#1e1e21] rounded text-[10px] text-gray-300 hover:border-purple-500/40 hover:text-gray-100 transition-colors">
                            {opt}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Gate: Editorial review — show all variants */}
                    {step.status === 'gate' && step.id === 'review' && (
                      <div className="mt-2">
                        <div className="text-[9px] text-purple-400 mb-1.5">Review all platform variants:</div>
                        {/* Variant tabs */}
                        <div className="flex gap-1 mb-2">
                          {activeCampaign.platforms.map(p => (
                            <button key={p} onClick={() => setReviewingVariant(p)}
                              className={`px-2 py-1 text-[9px] rounded ${
                                reviewingVariant === p ? 'bg-amber-500 text-gray-900' : 'bg-[#0a0a0b] text-gray-400 border border-[#1e1e21]'
                              }`}>
                              {platforms[p].emoji} {platforms[p].label}
                            </button>
                          ))}
                        </div>
                        {/* Show selected variant */}
                        {reviewingVariant && activeCampaign.variants[reviewingVariant] && (
                          <div className="bg-[#0a0a0b] border border-[#1e1e21] rounded p-2.5 mb-2">
                            <MarkdownView content={activeCampaign.variants[reviewingVariant].text} showToggle={true} maxHeight="max-h-32" />
                            {activeCampaign.variants[reviewingVariant].hashtags && (
                              <p className="text-[10px] text-blue-400 mt-1">{activeCampaign.variants[reviewingVariant].hashtags}</p>
                            )}
                            {activeCampaign.variants[reviewingVariant].imagePrompt && (
                              <p className="text-[9px] text-gray-500 mt-1">🖼️ {activeCampaign.variants[reviewingVariant].imagePrompt?.slice(0, 80)}...</p>
                            )}
                            <button onClick={() => loadVariantToEditor(reviewingVariant)}
                              className="mt-1.5 px-2 py-0.5 text-[9px] text-amber-400 bg-amber-500/10 rounded hover:bg-amber-500/20">
                              ✎ Edit in Editor
                            </button>
                          </div>
                        )}
                        {!reviewingVariant && (
                          <div className="text-[9px] text-gray-600 py-2 text-center">Click a platform tab above to review each variant</div>
                        )}
                        <div className="flex gap-2">
                          <button onClick={() => approveCampaignGate('Approved')}
                            className="px-3 py-1.5 text-[10px] font-medium bg-green-500/20 text-green-400 border border-green-500/30 rounded hover:bg-green-500/30">
                            ✓ Approve All
                          </button>
                          <button onClick={() => { activeCampaign.status = 'cancelled'; updateCampaign(activeCampaign); }}
                            className="px-3 py-1.5 text-[10px] font-medium bg-red-500/10 text-red-400 border border-red-500/20 rounded hover:bg-red-500/20">
                            ✕ Cancel
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

                    {step.status === 'error' && (
                      <div className="mt-2 text-[9px] text-red-400 bg-red-500/10 rounded px-2 py-1">{step.output}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: Variants overview */}
          {activeCampaign && (
            <div className="w-64 flex flex-col gap-2.5 shrink-0 min-h-0">
              {/* Variant cards */}
              <div className="bg-[#111113] rounded-lg border border-[#1e1e21] p-3 flex-1 overflow-y-auto min-h-0">
                <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-2">
                  Platform Variants ({activeCampaign.platforms.length})
                </div>
                <div className="space-y-2">
                  {activeCampaign.platforms.map(p => {
                    const v = activeCampaign.variants[p];
                    return (
                      <div key={p} className="bg-[#0a0a0b] rounded border border-[#1e1e21] p-2.5">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className={`w-6 h-6 rounded ${platforms[p].color} flex items-center justify-center text-white text-[10px]`}>
                            {platforms[p].emoji}
                          </span>
                          <div className="flex-1">
                            <div className="text-[10px] font-medium text-gray-200">{platforms[p].label}</div>
                            <div className="text-[8px] text-gray-600">
                              {v?.text ? `${v.text.length} chars` : 'Pending'}
                            </div>
                          </div>
                          <span className={`text-[8px] px-1 py-0.5 rounded ${
                            v?.status === 'published' ? 'bg-green-500/20 text-green-400' :
                            v?.status === 'approved' ? 'bg-blue-500/20 text-blue-400' :
                            v?.text ? 'bg-amber-500/20 text-amber-400' :
                            'bg-gray-500/20 text-gray-500'
                          }`}>
                            {v?.status === 'published' ? '✓ live' : v?.status === 'approved' ? 'approved' : v?.text ? 'draft' : 'pending'}
                          </span>
                        </div>
                        {v?.text && (
                          <>
                            <p className="text-[9px] text-gray-400 line-clamp-3 mb-1">{v.text}</p>
                            {v.hashtags && <p className="text-[8px] text-blue-400 truncate">{v.hashtags}</p>}
                            {v.imagePrompt && <p className="text-[8px] text-gray-600 mt-0.5">🖼️ Image ready</p>}
                            <button onClick={() => loadVariantToEditor(p)}
                              className="mt-1.5 w-full py-1 text-[9px] text-amber-400 bg-amber-500/10 rounded hover:bg-amber-500/20 text-center">
                              Open in Editor
                            </button>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Agents used */}
              <div className="bg-[#111113] rounded-lg border border-[#1e1e21] p-3 shrink-0">
                <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-1.5">Agents Active</div>
                <div className="flex flex-wrap gap-1">
                  {[...new Set(activeCampaign.steps.filter(s => s.status === 'done' && s.agent !== 'human').map(s => s.agent))].map(a => (
                    <span key={a} className="text-[9px] px-1.5 py-0.5 bg-[#0a0a0b] border border-[#1e1e21] rounded text-gray-400">
                      {activeCampaign.steps.find(s => s.agent === a)?.agentEmoji} {a}
                    </span>
                  ))}
                  {activeCampaign.steps.every(s => s.status === 'pending') && (
                    <span className="text-[9px] text-gray-700">Waiting to start...</span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════ */}
      {/* CREATE TAB — 3 columns */}
      {/* ══════════════════════════════════════════════════════════ */}
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
                  {imagePrompt && <span>🖼️</span>}
                  {scheduledFor && <span>📅</span>}
                </div>
              </div>
            </div>

            {/* Inputs row */}
            <div className="grid grid-cols-2 gap-2 shrink-0">
              <div>
                <label className="block text-[9px] text-gray-500 mb-0.5">Hashtags</label>
                <input type="text" value={hashtags} onChange={e => setHashtags(e.target.value)}
                  placeholder={`#tag1 #tag2 (max ${cfg.hashtagLimit})`}
                  className={`w-full px-2 py-1.5 bg-[#0a0a0b] border rounded text-[10px] text-gray-200 focus:outline-none focus:border-amber-500 ${hashtagCount > cfg.hashtagLimit ? 'border-red-500' : 'border-[#1e1e21]'}`} />
              </div>
              <div>
                <label className="block text-[9px] text-gray-500 mb-0.5">Schedule</label>
                <input type="datetime-local" value={scheduledFor} onChange={e => setScheduledFor(e.target.value)}
                  className="w-full px-2 py-1.5 bg-[#0a0a0b] border border-[#1e1e21] rounded text-[10px] text-gray-200 focus:outline-none focus:border-amber-500" />
              </div>
            </div>

            {/* Media Section */}
            <div className="bg-[#111113] rounded-lg border border-[#1e1e21] p-2.5 shrink-0">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[9px] text-gray-500 uppercase tracking-wider">Media ({mediaItems.length})</span>
                <div className="flex gap-1.5">
                  <label className="text-[9px] text-amber-400 hover:text-amber-300 cursor-pointer px-1.5 py-0.5 bg-amber-500/10 rounded">
                    {uploadingMedia ? '...' : '📎 Upload'}
                    <input type="file" accept="image/*,video/*" onChange={handleFileUpload} className="hidden" />
                  </label>
                </div>
              </div>

              {/* Attached media thumbnails */}
              {mediaItems.length > 0 && (
                <div className="flex gap-1.5 flex-wrap mb-2">
                  {mediaItems.map((m, i) => (
                    <div key={m.id} className="relative group/media">
                      <div className="w-16 h-16 bg-[#0a0a0b] border border-[#1e1e21] rounded overflow-hidden">
                        {m.type === 'video' ? (
                          <div className="w-full h-full flex items-center justify-center text-gray-600 text-lg">🎬</div>
                        ) : (
                          <img src={m.url} alt={m.alt || ''} className="w-full h-full object-cover" />
                        )}
                      </div>
                      <button onClick={() => handleRemoveMedia(m.id)}
                        className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-[8px] hidden group-hover/media:flex items-center justify-center">×</button>
                      <div className="text-[7px] text-gray-600 text-center mt-0.5">{i + 1}</div>
                      {m.credit && <div className="text-[6px] text-gray-700 text-center truncate w-16">{m.credit}</div>}
                    </div>
                  ))}
                </div>
              )}

              {/* Image search */}
              <div className="flex gap-1.5">
                <input value={imageSearchQuery} onChange={e => setImageSearchQuery(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleImageSearch(); }}
                  placeholder="Search images (Unsplash/Pexels)..."
                  className="flex-1 px-2 py-1 bg-[#0a0a0b] border border-[#1e1e21] rounded text-[10px] text-gray-200 placeholder-gray-600 focus:outline-none focus:border-amber-500" />
                <button onClick={handleImageSearch} disabled={searchingImages || !imageSearchQuery.trim()}
                  className="px-2 py-1 text-[9px] bg-[#0a0a0b] border border-[#1e1e21] rounded text-gray-400 hover:text-gray-200 disabled:opacity-30">
                  {searchingImages ? '...' : '🔍'}
                </button>
                <input value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="or paste URL"
                  className="flex-1 px-2 py-1 bg-[#0a0a0b] border border-[#1e1e21] rounded text-[10px] text-gray-200 placeholder-gray-600 focus:outline-none focus:border-amber-500" />
              </div>

              {/* Search results grid */}
              {imageSearchResults.length > 0 && (
                <div className="grid grid-cols-4 gap-1.5 mt-2 max-h-32 overflow-y-auto">
                  {imageSearchResults.map(img => (
                    <button key={img.id} onClick={() => handleSelectSearchImage(img)}
                      className="relative group/img rounded overflow-hidden border border-[#1e1e21] hover:border-amber-500/50 transition-colors">
                      <img src={img.thumbnailUrl || img.url} alt={img.alt} className="w-full h-16 object-cover" />
                      <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-1 py-0.5 text-[7px] text-gray-300 truncate opacity-0 group-hover/img:opacity-100">
                        {img.credit}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Image prompt (if generated) */}
            {imagePrompt && (
              <div className="bg-[#111113] rounded-lg border border-[#1e1e21] p-2.5 shrink-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[9px] text-gray-500 uppercase tracking-wider">Image Prompt</span>
                  <button onClick={() => { navigator.clipboard.writeText(imagePrompt); setPublishResult({ ok: true, message: 'Copied image prompt!' }); }}
                    className="text-[9px] text-amber-400 hover:text-amber-300">Copy</button>
                </div>
                <p className="text-[10px] text-gray-400 leading-relaxed">{imagePrompt}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 shrink-0 flex-wrap">
              <button onClick={handleSaveDraft} className="px-3 py-1.5 text-[10px] font-medium bg-[#1a1a1d] text-gray-300 rounded hover:text-gray-100 border border-[#1e1e21]">
                {scheduledFor ? '📅 Schedule' : '💾 Save Draft'}
              </button>
              <button onClick={handleSendForReview} disabled={!text.trim()}
                className="px-3 py-1.5 text-[10px] font-medium bg-purple-500/20 text-purple-400 border border-purple-500/30 rounded hover:bg-purple-500/30 disabled:opacity-40">
                📋 Send for Review
              </button>
              <button onClick={() => handlePublish()} disabled={publishing || isOverLimit || !text.trim()}
                className="px-3 py-1.5 text-[10px] font-medium bg-amber-500 text-gray-900 rounded hover:bg-amber-400 disabled:opacity-40">
                {publishing ? '...' : `Publish → ${cfg.label}`}
              </button>
              {/* Cross-publish dropdown */}
              <div className="relative group">
                <button disabled={!text.trim() || publishing}
                  className="px-3 py-1.5 text-[10px] font-medium bg-purple-500/20 text-purple-400 border border-purple-500/30 rounded hover:bg-purple-500/30 disabled:opacity-40">
                  Cross-Publish ▾
                </button>
                <div className="absolute bottom-full left-0 mb-1 bg-[#111113] border border-[#1e1e21] rounded-lg p-2 hidden group-hover:block min-w-[200px] z-10 shadow-xl">
                  <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-1.5">Publish to multiple</div>
                  {(Object.entries(platforms) as [Platform, typeof platforms.linkedin][]).map(([key, p]) => (
                    <label key={key} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-[#1e1e21] cursor-pointer">
                      <input type="checkbox" checked={crossPublishPlatforms.includes(key)}
                        onChange={() => setCrossPublishPlatforms(prev =>
                          prev.includes(key) ? prev.filter(x => x !== key) : [...prev, key]
                        )}
                        className="rounded border-gray-600" />
                      <span className="text-[10px] text-gray-300">{p.emoji} {p.label}</span>
                    </label>
                  ))}
                  <button onClick={handleCrossPublish}
                    disabled={crossPublishPlatforms.length === 0 || publishing}
                    className="w-full mt-1.5 py-1 text-[9px] font-medium bg-purple-500 text-white rounded hover:bg-purple-400 disabled:opacity-40">
                    Publish to {crossPublishPlatforms.length} platform{crossPublishPlatforms.length !== 1 ? 's' : ''}
                  </button>
                </div>
              </div>
            </div>
            {publishResult && (
              <div className={`px-3 py-2 rounded text-[10px] shrink-0 whitespace-pre-line ${publishResult.ok ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                {publishResult.message}
              </div>
            )}
          </div>

          {/* Col 2: Preview + Checklist */}
          <div className="w-72 flex flex-col gap-2.5 shrink-0 min-h-0">
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
                  {(mediaItems.length > 0 || imageUrl) && (
                    <div className="mb-2 rounded bg-[#0a0a0b] border border-[#1e1e21] overflow-hidden">
                      {mediaItems.length > 1 ? (
                        <div className={`grid ${mediaItems.length === 2 ? 'grid-cols-2' : mediaItems.length >= 3 ? 'grid-cols-2' : ''} gap-0.5`}>
                          {mediaItems.slice(0, 4).map((m, i) => (
                            <div key={m.id} className={`${i === 0 && mediaItems.length === 3 ? 'col-span-2' : ''} bg-[#0a0a0b]`}>
                              {m.type === 'video' ? (
                                <div className="h-20 flex items-center justify-center text-gray-600">🎬</div>
                              ) : (
                                <img src={m.url} alt={m.alt || ''} className="w-full h-20 object-cover" />
                              )}
                            </div>
                          ))}
                          {mediaItems.length > 4 && (
                            <div className="h-20 flex items-center justify-center text-[10px] text-gray-500 bg-[#0a0a0b]">+{mediaItems.length - 4}</div>
                          )}
                        </div>
                      ) : imageUrl ? (
                        <img src={imageUrl} alt="" className="w-full h-32 object-cover"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      ) : null}
                    </div>
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
            <div className="bg-[#111113] rounded-lg border border-[#1e1e21] p-3 shrink-0">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm">🎭</span>
                <div>
                  <div className="text-[11px] font-medium text-gray-200">Bragi</div>
                  <div className="text-[8px] text-gray-600">Content Creator Agent</div>
                </div>
              </div>
              <input value={agentTopic} onChange={e => setAgentTopic(e.target.value)}
                placeholder="Topic for new post..."
                className="w-full px-2 py-1.5 bg-[#0a0a0b] border border-[#1e1e21] rounded text-[10px] text-gray-200 placeholder-gray-600 focus:outline-none focus:border-amber-500 mb-2" />
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

      {/* ══════════════════════════════════════════════════════════ */}
      {/* DRAFTS TAB */}
      {/* ══════════════════════════════════════════════════════════ */}
      {tab === 'drafts' && (
        <div className="flex-1 overflow-y-auto space-y-2">
          {drafts.filter(d => ['draft', 'review', 'approved'].includes(d.status)).length === 0 ? (
            <div className="bg-[#111113] rounded-lg border border-[#1e1e21] p-8 text-center text-xs text-gray-600">
              No drafts saved. Create content and save as draft.
            </div>
          ) : (
            drafts.filter(d => ['draft', 'review', 'approved'].includes(d.status)).map(draft => (
              <div key={draft.id} className={`bg-[#111113] rounded-lg border p-3 group ${
                draft.status === 'review' ? 'border-purple-500/30' :
                draft.status === 'approved' ? 'border-green-500/30' :
                'border-[#1e1e21]'
              }`}>
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handleLoadDraft(draft)}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm">{platforms[draft.platform as Platform]?.emoji}</span>
                      <span className="text-[11px] font-medium text-gray-200">{platforms[draft.platform as Platform]?.label}</span>
                      <span className={`text-[8px] px-1.5 py-0.5 rounded font-medium ${
                        draft.status === 'review' ? 'bg-purple-500/20 text-purple-400' :
                        draft.status === 'approved' ? 'bg-green-500/20 text-green-400' :
                        'bg-gray-500/20 text-gray-500'
                      }`}>
                        {draft.status === 'review' ? '📋 review' : draft.status === 'approved' ? '✅ approved' : 'draft'}
                      </span>
                      <span className="text-[9px] text-gray-600">{new Date(draft.createdAt).toLocaleDateString()}</span>
                      {draft.campaignId && <span className="text-[8px] px-1 py-0.5 bg-purple-500/20 text-purple-400 rounded">campaign</span>}
                    </div>
                    <p className="text-[11px] text-gray-400 line-clamp-2">{draft.text}</p>
                    {draft.imageUrl && (
                      <div className="flex items-center gap-1 mt-1">
                        <span className="text-[8px] text-gray-600">📎</span>
                        <span className="text-[8px] text-gray-600 truncate">{draft.imageUrl.split('/').pop()}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 ml-2 shrink-0">
                    {(draft.status === 'draft' || draft.status === 'review') && (
                      <>
                        <button onClick={() => handleApprove(draft.id)}
                          className="text-[9px] px-2 py-1 bg-green-500/10 text-green-400 border border-green-500/20 rounded hover:bg-green-500/20">
                          ✅ Approve
                        </button>
                        <button onClick={() => { const note = prompt('Correction note:'); if (note) handleReject(draft.id, note); }}
                          className="text-[9px] px-2 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded hover:bg-amber-500/20">
                          🔄 Correct
                        </button>
                      </>
                    )}
                    {draft.status === 'approved' && (
                      <button onClick={() => handlePublishDraft(draft.id)} disabled={publishing}
                        className="text-[9px] px-2 py-1 bg-amber-500 text-gray-900 font-medium rounded hover:bg-amber-400 disabled:opacity-40">
                        {publishing ? '...' : '📣 Publish'}
                      </button>
                    )}
                    <button onClick={() => handleDeleteDraft(draft.id)}
                      className="text-[10px] text-gray-700 hover:text-red-400 opacity-0 group-hover:opacity-100">×</button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════ */}
      {/* SCHEDULED TAB */}
      {/* ══════════════════════════════════════════════════════════ */}
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

      {/* ══════════════════════════════════════════════════════════ */}
      {/* ACCOUNTS TAB */}
      {/* ══════════════════════════════════════════════════════════ */}
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
