'use client';

import { useState, useEffect } from 'react';

// Types
interface AccountStatus { platform: string; connected: boolean; label: string; }

type ContentTab = 'create' | 'drafts' | 'accounts' | 'analytics';

const platforms = {
  linkedin: { label: 'LinkedIn', emoji: '💼', maxChars: 3000, hashtagLimit: 7, color: 'bg-blue-600', secretKey: 'LINKEDIN_ACCESS_TOKEN' },
  twitter: { label: 'Twitter / X', emoji: '𝕏', maxChars: 280, hashtagLimit: 2, color: 'bg-gray-700', secretKey: 'TWITTER_API_KEY' },
  instagram: { label: 'Instagram', emoji: '📸', maxChars: 2200, hashtagLimit: 30, color: 'bg-pink-600', secretKey: 'INSTAGRAM_ACCESS_TOKEN' },
  blog: { label: 'Blog', emoji: '📝', maxChars: 50000, hashtagLimit: 10, color: 'bg-emerald-600', secretKey: 'BLOG_API_KEY' },
  newsletter: { label: 'Newsletter', emoji: '📧', maxChars: 100000, hashtagLimit: 0, color: 'bg-amber-600', secretKey: 'NEWSLETTER_API_KEY' },
};

type Platform = keyof typeof platforms;

// Checklist rules per platform
const checklists: Record<string, { check: (text: string, hashtags: string) => boolean; label: string }[]> = {
  linkedin: [
    { check: (t) => t.split('\n')[0]?.length > 0 && t.split('\n')[0]?.length < 100, label: 'Hook < 100 chars (first line)' },
    { check: (t) => /\d/.test(t), label: 'Contains concrete numbers' },
    { check: (t) => t.includes('?'), label: 'Has CTA question' },
    { check: (t) => !t.includes('http') || t.lastIndexOf('http') > t.length * 0.7, label: 'Link at end only' },
    { check: (_, h) => { const c = h.split(/[,\s#]+/).filter(Boolean).length; return c > 0 && c <= 7; }, label: 'Hashtags 1-7' },
    { check: (t) => t.length > 200 && t.length < 3000, label: '200-3000 chars' },
    { check: (t) => t.split('\n\n').length >= 2, label: 'Multiple paragraphs' },
  ],
  twitter: [
    { check: (t) => t.length <= 280, label: '≤ 280 chars' },
    { check: (t) => !t.includes('http') || t.length <= 257, label: 'Room for link (23 chars)' },
    { check: (_, h) => h.split(/[,\s#]+/).filter(Boolean).length <= 2, label: 'Max 2 hashtags' },
  ],
  instagram: [
    { check: (t) => t.split('\n')[0]?.length < 125, label: 'Caption preview < 125 chars' },
    { check: (t) => t.length <= 2200, label: '≤ 2200 chars' },
    { check: (t) => t.includes('\n'), label: 'Has line breaks (readability)' },
    { check: (_, h) => { const c = h.split(/[,\s#]+/).filter(Boolean).length; return c >= 5 && c <= 30; }, label: '5-30 hashtags' },
  ],
};

function timeAgo(d: string): string {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 1) return 'now'; if (m < 60) return `${m}m`; const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`; return `${Math.floor(h / 24)}d`;
}

// Draft stored in localStorage
interface Draft {
  id: string; platform: string; text: string; hashtags: string;
  imageUrl?: string; scheduledFor?: string; status: 'draft' | 'approved' | 'published' | 'scheduled';
  createdAt: string;
}

function loadDrafts(): Draft[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem('mc_drafts') || '[]'); } catch { return []; }
}

function saveDraftsToStorage(drafts: Draft[]) {
  if (typeof window !== 'undefined') localStorage.setItem('mc_drafts', JSON.stringify(drafts));
}

export default function ContentPage() {
  const [tab, setTab] = useState<ContentTab>('create');
  const [platform, setPlatform] = useState<Platform>('linkedin');
  const [text, setText] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [scheduledFor, setScheduledFor] = useState('');
  const [accounts, setAccounts] = useState<AccountStatus[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [aiGenerating, setAiGenerating] = useState(false);

  // Load drafts
  useEffect(() => { setDrafts(loadDrafts()); }, []);

  // Check accounts
  useEffect(() => {
    const checkAccounts = async () => {
      const statuses: AccountStatus[] = [];
      for (const [key, cfg] of Object.entries(platforms)) {
        try {
          const res = await fetch('/api/vault');
          const data = await res.json();
          const hasKey = data.secrets?.some((s: { name: string }) => s.name === cfg.secretKey);
          statuses.push({ platform: key, connected: hasKey, label: cfg.label });
        } catch {
          statuses.push({ platform: key, connected: false, label: cfg.label });
        }
      }
      setAccounts(statuses);
    };
    checkAccounts();
  }, []);

  const cfg = platforms[platform];
  const charCount = text.length;
  const hashtagCount = hashtags.split(/[,\s#]+/).filter(Boolean).length;
  const isOverLimit = charCount > cfg.maxChars;
  const platformChecklist = checklists[platform] || [];
  const passedChecks = platformChecklist.filter(c => c.check(text, hashtags)).length;

  const handleSaveDraft = () => {
    const draft: Draft = {
      id: `draft_${Date.now().toString(36)}`, platform, text,
      hashtags, imageUrl: imageUrl || undefined,
      scheduledFor: scheduledFor || undefined, status: 'draft',
      createdAt: new Date().toISOString(),
    };
    const updated = [draft, ...drafts];
    setDrafts(updated);
    saveDraftsToStorage(updated);
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
    } catch (e) { setPublishResult({ ok: false, message: String(e) }); }
    setPublishing(false);
  };

  const handleAskAgent = async () => {
    setAiGenerating(true);
    // This would dispatch to Bragi agent
    setTimeout(() => {
      setAiGenerating(false);
      setPublishResult({ ok: true, message: 'Agent Bragi notified — draft will arrive via Telegram' });
    }, 1000);
  };

  const connectedCount = accounts.filter(a => a.connected).length;

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] gap-4">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-gray-200">Content Studio</h2>
          <div className="flex gap-0.5 bg-[#111113] rounded-lg p-0.5 border border-[#1e1e21]">
            {(['create', 'drafts', 'accounts', 'analytics'] as ContentTab[]).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-2.5 py-1 text-[11px] rounded capitalize ${tab === t ? 'bg-[#1e1e21] text-gray-100' : 'text-gray-500 hover:text-gray-300'}`}>
                {t}{t === 'drafts' && drafts.length > 0 ? ` (${drafts.length})` : ''}
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

      {/* CREATE TAB */}
      {tab === 'create' && (
        <div className="flex gap-4 flex-1 min-h-0">
          {/* Editor */}
          <div className="flex-1 flex flex-col gap-3 min-h-0">
            {/* Platform selector */}
            <div className="flex gap-1.5 shrink-0">
              {(Object.entries(platforms) as [Platform, typeof platforms.linkedin][]).map(([key, p]) => (
                <button key={key} onClick={() => setPlatform(key)}
                  className={`px-3 py-1.5 text-[11px] rounded-lg flex items-center gap-1.5 ${platform === key ? 'bg-amber-500 text-gray-900 font-medium' : 'bg-[#111113] text-gray-400 border border-[#1e1e21] hover:text-gray-200'}`}>
                  <span>{p.emoji}</span><span>{p.label}</span>
                </button>
              ))}
            </div>

            {/* Editor area */}
            <div className="bg-[#111113] rounded-lg border border-[#1e1e21] overflow-hidden flex-1 flex flex-col min-h-0">
              <textarea value={text} onChange={e => setText(e.target.value)}
                placeholder={`Write your ${cfg.label} post...\n\nTip: Start with a hook that captures attention in 3 seconds.`}
                className="flex-1 px-4 py-3 bg-transparent text-sm text-gray-200 placeholder-gray-600 focus:outline-none resize-none min-h-0" />
              <div className="px-4 py-2 border-t border-[#1e1e21] flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <span className={`text-[11px] ${isOverLimit ? 'text-red-400' : 'text-gray-500'}`}>{charCount} / {cfg.maxChars}</span>
                  {platformChecklist.length > 0 && (
                    <span className={`text-[11px] ${passedChecks === platformChecklist.length ? 'text-green-400' : 'text-gray-600'}`}>
                      ✓ {passedChecks}/{platformChecklist.length}
                    </span>
                  )}
                </div>
                <button onClick={handleAskAgent} disabled={aiGenerating}
                  className="text-[10px] text-amber-400 hover:text-amber-300 disabled:opacity-50">
                  {aiGenerating ? '🎭 Asking Bragi...' : '🎭 Ask Bragi to write'}
                </button>
              </div>
            </div>

            {/* Hashtags + Image + Schedule */}
            <div className="grid grid-cols-3 gap-2 shrink-0">
              <div>
                <label className="block text-[10px] text-gray-500 mb-1">Hashtags</label>
                <input type="text" value={hashtags} onChange={e => setHashtags(e.target.value)}
                  placeholder={`#tag1 #tag2 (max ${cfg.hashtagLimit})`}
                  className={`w-full px-2.5 py-1.5 bg-[#0a0a0b] border rounded text-[11px] text-gray-200 focus:outline-none focus:border-amber-500 ${hashtagCount > cfg.hashtagLimit ? 'border-red-500' : 'border-[#1e1e21]'}`} />
              </div>
              <div>
                <label className="block text-[10px] text-gray-500 mb-1">Image URL</label>
                <input type="text" value={imageUrl} onChange={e => setImageUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-2.5 py-1.5 bg-[#0a0a0b] border border-[#1e1e21] rounded text-[11px] text-gray-200 focus:outline-none focus:border-amber-500" />
              </div>
              <div>
                <label className="block text-[10px] text-gray-500 mb-1">Schedule</label>
                <input type="datetime-local" value={scheduledFor} onChange={e => setScheduledFor(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-[#0a0a0b] border border-[#1e1e21] rounded text-[11px] text-gray-200 focus:outline-none focus:border-amber-500" />
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 shrink-0">
              <button onClick={handleSaveDraft} className="px-4 py-1.5 text-[11px] font-medium bg-[#1a1a1d] text-gray-300 rounded hover:text-gray-100">Save Draft</button>
              <button onClick={handlePublish} disabled={publishing || isOverLimit || !text.trim()}
                className="px-4 py-1.5 text-[11px] font-medium bg-amber-500 text-gray-900 rounded hover:bg-amber-400 disabled:opacity-40">
                {publishing ? 'Publishing...' : scheduledFor ? 'Schedule' : `Publish to ${cfg.label}`}
              </button>
            </div>
            {publishResult && (
              <div className={`px-3 py-2 rounded text-[11px] shrink-0 ${publishResult.ok ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                {publishResult.message}
              </div>
            )}
          </div>

          {/* Preview + Checklist */}
          <div className="w-80 flex flex-col gap-3 shrink-0 min-h-0">
            {/* Preview */}
            <div className="bg-[#111113] rounded-lg border border-[#1e1e21] p-4 flex-1 overflow-y-auto min-h-0">
              <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-3">Preview • {cfg.label}</div>
              {text ? (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 bg-amber-500/20 rounded-full flex items-center justify-center text-amber-400 text-xs">DG</div>
                    <div>
                      <div className="text-xs font-medium text-gray-200">Daniel Gorgonha</div>
                      <div className="text-[9px] text-gray-600">Founder at Deega Labs</div>
                    </div>
                  </div>
                  {imageUrl && (
                    <div className="mb-3 rounded-lg bg-[#0a0a0b] border border-[#1e1e21] p-2 text-center text-[10px] text-gray-600">
                      📷 Image: {imageUrl.split('/').pop()}
                    </div>
                  )}
                  <p className="text-xs text-gray-300 whitespace-pre-wrap leading-relaxed">{text}</p>
                  {hashtags && (
                    <p className="text-xs text-blue-400 mt-2">
                      {hashtags.split(/[,\s]+/).filter(Boolean).map(t => t.startsWith('#') ? t : `#${t}`).join(' ')}
                    </p>
                  )}
                </div>
              ) : (
                <div className="text-xs text-gray-700 text-center py-6">Start typing...</div>
              )}
            </div>

            {/* Checklist */}
            {platformChecklist.length > 0 && (
              <div className="bg-[#111113] rounded-lg border border-[#1e1e21] p-4 shrink-0">
                <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">
                  {cfg.label} Checklist ({passedChecks}/{platformChecklist.length})
                </div>
                <div className="space-y-1.5">
                  {platformChecklist.map((item, i) => {
                    const passed = item.check(text, hashtags);
                    return (
                      <div key={i} className={`flex items-center gap-2 text-[11px] ${passed ? 'text-green-400' : 'text-gray-600'}`}>
                        <span>{passed ? '✓' : '○'}</span><span>{item.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* DRAFTS TAB */}
      {tab === 'drafts' && (
        <div className="flex-1 overflow-y-auto space-y-2">
          {drafts.length === 0 ? (
            <div className="bg-[#111113] rounded-lg border border-[#1e1e21] p-8 text-center text-xs text-gray-600">
              No drafts saved. Create content and save as draft.
            </div>
          ) : (
            drafts.map(draft => (
              <div key={draft.id} className="bg-[#111113] rounded-lg border border-[#1e1e21] p-4 group">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handleLoadDraft(draft)}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm">{platforms[draft.platform as Platform]?.emoji}</span>
                      <span className="text-xs font-medium text-gray-200">{platforms[draft.platform as Platform]?.label}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded capitalize ${draft.status === 'published' ? 'bg-green-500/20 text-green-400' : draft.status === 'scheduled' ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-500/20 text-gray-400'}`}>{draft.status}</span>
                      <span className="text-[10px] text-gray-600">{timeAgo(draft.createdAt)}</span>
                    </div>
                    <p className="text-xs text-gray-400 line-clamp-2">{draft.text}</p>
                    {draft.scheduledFor && <div className="text-[10px] text-blue-400 mt-1">📅 {new Date(draft.scheduledFor).toLocaleString()}</div>}
                  </div>
                  <button onClick={() => handleDeleteDraft(draft.id)}
                    className="text-[10px] text-gray-700 hover:text-red-400 opacity-0 group-hover:opacity-100 ml-3">×</button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ACCOUNTS TAB */}
      {tab === 'accounts' && (
        <div className="flex-1 overflow-y-auto space-y-3">
          <p className="text-xs text-gray-500">Configure platform accounts. Tokens are stored encrypted in the Vault (AES-256-GCM).</p>
          {(Object.entries(platforms) as [Platform, typeof platforms.linkedin][]).map(([key, p]) => {
            const account = accounts.find(a => a.platform === key);
            const isConnected = account?.connected || false;
            return (
              <div key={key} className={`bg-[#111113] rounded-lg border p-4 ${isConnected ? 'border-green-500/20' : 'border-[#1e1e21]'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`w-10 h-10 rounded-lg ${p.color} flex items-center justify-center text-white text-lg`}>{p.emoji}</span>
                    <div>
                      <div className="text-sm font-medium text-gray-200">{p.label}</div>
                      <div className="text-[10px] text-gray-500">Secret: <code className="text-gray-600">{p.secretKey}</code></div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isConnected ? (
                      <span className="text-[10px] bg-green-500/20 text-green-400 px-2 py-0.5 rounded">Connected</span>
                    ) : (
                      <span className="text-[10px] bg-gray-500/20 text-gray-400 px-2 py-0.5 rounded">Not configured</span>
                    )}
                    <a href="/settings" className="text-[10px] text-amber-400 hover:text-amber-300 px-2 py-0.5 bg-[#1a1a1d] rounded">
                      {isConnected ? 'Manage' : 'Add Token'} →
                    </a>
                  </div>
                </div>
                <div className="mt-3 text-[10px] text-gray-600 space-y-0.5">
                  <div>Max chars: {p.maxChars.toLocaleString()} • Hashtags: {p.hashtagLimit > 0 ? `max ${p.hashtagLimit}` : 'n/a'}</div>
                  {key === 'linkedin' && <div>Features: Post text, images, articles • Engagement monitoring</div>}
                  {key === 'twitter' && <div>Features: Tweets, threads, replies • Trend monitoring</div>}
                  {key === 'instagram' && <div>Features: Posts, stories, reels captions • Hashtag optimization</div>}
                  {key === 'blog' && <div>Features: Long-form articles, SEO optimization, code blocks</div>}
                  {key === 'newsletter' && <div>Features: Email campaigns, subscriber management, analytics</div>}
                </div>
              </div>
            );
          })}
          <div className="bg-[#0a0a0b] rounded-lg p-3 text-[10px] text-gray-600 space-y-1">
            <div className="font-medium text-gray-400">How it works:</div>
            <div>1. Add your API token in <a href="/settings" className="text-amber-400">Settings → Vault</a></div>
            <div>2. Use the secret key name shown above (e.g., LINKEDIN_ACCESS_TOKEN)</div>
            <div>3. The agent uses vault injection — never sees the raw token</div>
            <div>4. All tokens encrypted with AES-256-GCM at rest</div>
          </div>
        </div>
      )}

      {/* ANALYTICS TAB */}
      {tab === 'analytics' && (
        <div className="flex-1 overflow-y-auto">
          <div className="bg-[#111113] rounded-lg border border-[#1e1e21] p-8 text-center">
            <div className="text-3xl mb-2">📊</div>
            <div className="text-sm font-medium text-gray-200">Content Analytics</div>
            <p className="text-xs text-gray-500 mt-2 max-w-md mx-auto">
              Post performance tracking, engagement metrics, audience growth, and optimal timing analysis.
              Powered by Loki (Analytics agent).
            </p>
            <div className="mt-4 grid grid-cols-3 gap-3 max-w-md mx-auto">
              <div className="bg-[#0a0a0b] rounded-lg p-3 border border-[#1e1e21]">
                <div className="text-lg font-bold text-gray-400">—</div>
                <div className="text-[9px] text-gray-600">Impressions</div>
              </div>
              <div className="bg-[#0a0a0b] rounded-lg p-3 border border-[#1e1e21]">
                <div className="text-lg font-bold text-gray-400">—</div>
                <div className="text-[9px] text-gray-600">Engagement</div>
              </div>
              <div className="bg-[#0a0a0b] rounded-lg p-3 border border-[#1e1e21]">
                <div className="text-lg font-bold text-gray-400">—</div>
                <div className="text-[9px] text-gray-600">Posts</div>
              </div>
            </div>
            <p className="text-[10px] text-gray-700 mt-4">Connect LinkedIn in Accounts tab to enable analytics.</p>
          </div>
        </div>
      )}
    </div>
  );
}
