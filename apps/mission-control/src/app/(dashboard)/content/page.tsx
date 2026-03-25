'use client';

import { useState, useEffect } from 'react';

interface Draft {
  platform: string;
  text: string;
  hashtags: string;
  status: 'draft' | 'approved' | 'published';
  createdAt: string;
}

const platformConfig = {
  linkedin: { label: 'LinkedIn', emoji: '💼', maxChars: 3000, hashtagLimit: 7 },
  twitter: { label: 'Twitter / X', emoji: '𝕏', maxChars: 280, hashtagLimit: 2 },
  blog: { label: 'Blog', emoji: '📝', maxChars: 50000, hashtagLimit: 10 },
};

type Platform = keyof typeof platformConfig;

export default function ContentPage() {
  const [platform, setPlatform] = useState<Platform>('linkedin');
  const [text, setText] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [linkedinConnected, setLinkedinConnected] = useState<boolean | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [showChecklist, setShowChecklist] = useState(false);

  // Check LinkedIn connection
  useEffect(() => {
    fetch('/api/linkedin')
      .then(r => r.json())
      .then(data => setLinkedinConnected(data.connected))
      .catch(() => setLinkedinConnected(false));
  }, []);

  const config = platformConfig[platform];
  const charCount = text.length;
  const hashtagCount = hashtags.split(/[,\s#]+/).filter(Boolean).length;
  const isOverLimit = charCount > config.maxChars;
  const isHashtagOver = hashtagCount > config.hashtagLimit;

  const saveDraft = () => {
    const draft: Draft = {
      platform,
      text: text + (hashtags ? '\n\n' + hashtags.split(/[,\s]+/).filter(Boolean).map(t => t.startsWith('#') ? t : `#${t}`).join(' ') : ''),
      hashtags,
      status: 'draft',
      createdAt: new Date().toISOString(),
    };
    setDrafts([draft, ...drafts]);
  };

  const handlePublish = async () => {
    if (platform !== 'linkedin') {
      setPublishResult({ ok: false, message: `${config.label} publishing not yet implemented` });
      return;
    }

    const fullText = text + (hashtags ? '\n\n' + hashtags.split(/[,\s]+/).filter(Boolean).map(t => t.startsWith('#') ? t : `#${t}`).join(' ') : '');

    setPublishing(true);
    setPublishResult(null);
    try {
      const res = await fetch('/api/linkedin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: fullText }),
      });
      const data = await res.json();
      setPublishResult({
        ok: data.ok,
        message: data.ok ? `Published! Post ID: ${data.postId}` : data.error,
      });
    } catch (e) {
      setPublishResult({ ok: false, message: e instanceof Error ? e.message : 'Publish failed' });
    }
    setPublishing(false);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-100">Content Creator</h2>
          <p className="text-sm text-gray-500 mt-1">Draft, preview, and publish social media content</p>
        </div>
        <div className="flex items-center gap-2">
          {linkedinConnected !== null && (
            <span className={`text-xs px-2 py-1 rounded ${linkedinConnected ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
              LinkedIn {linkedinConnected ? 'connected' : 'not connected'}
            </span>
          )}
        </div>
      </div>

      {/* Platform selector */}
      <div className="flex gap-2">
        {(Object.entries(platformConfig) as [Platform, typeof platformConfig.linkedin][]).map(([key, cfg]) => (
          <button
            key={key}
            onClick={() => setPlatform(key)}
            className={`px-4 py-2 text-sm rounded-lg ${
              platform === key
                ? 'bg-amber-500 text-gray-900 font-medium'
                : 'bg-[#111113] text-gray-400 border border-[#1e1e21] hover:text-gray-200'
            }`}
          >
            {cfg.emoji} {cfg.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Editor */}
        <div className="space-y-4">
          <div className="bg-[#111113] rounded-lg border border-[#1e1e21] overflow-hidden">
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder={`Write your ${config.label} post...`}
              rows={12}
              className="w-full px-4 py-3 bg-transparent text-sm text-gray-200 placeholder-gray-600 focus:outline-none resize-none"
            />
            <div className="px-4 py-2 border-t border-[#1e1e21] flex items-center justify-between">
              <span className={`text-xs ${isOverLimit ? 'text-red-400' : 'text-gray-500'}`}>
                {charCount} / {config.maxChars}
              </span>
              <button
                onClick={() => setShowChecklist(!showChecklist)}
                className="text-xs text-gray-500 hover:text-amber-400"
              >
                Checklist
              </button>
            </div>
          </div>

          {/* Hashtags */}
          <div>
            <label className="block text-[11px] text-gray-500 mb-1">
              Hashtags (max {config.hashtagLimit})
            </label>
            <input
              type="text"
              value={hashtags}
              onChange={e => setHashtags(e.target.value)}
              placeholder="#AI #OpenSource #DevTools"
              className={`w-full px-3 py-2 bg-[#111113] border rounded text-xs text-gray-200 focus:outline-none focus:border-amber-500 ${
                isHashtagOver ? 'border-red-500' : 'border-[#1e1e21]'
              }`}
            />
            {isHashtagOver && (
              <p className="text-[10px] text-red-400 mt-1">Too many hashtags — algorithm considers spam</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={saveDraft}
              className="px-4 py-2 text-xs font-medium bg-[#1a1a1d] text-gray-300 rounded border border-[#1e1e21] hover:text-gray-100"
            >
              Save Draft
            </button>
            <button
              onClick={handlePublish}
              disabled={publishing || isOverLimit || !text.trim()}
              className="px-4 py-2 text-xs font-medium bg-amber-500 text-gray-900 rounded hover:bg-amber-400 disabled:opacity-40"
            >
              {publishing ? 'Publishing...' : `Publish to ${config.label}`}
            </button>
          </div>

          {publishResult && (
            <div className={`px-4 py-2 rounded text-xs ${publishResult.ok ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
              {publishResult.message}
            </div>
          )}
        </div>

        {/* Preview + Checklist */}
        <div className="space-y-4">
          {/* Preview */}
          <div className="bg-[#111113] rounded-lg border border-[#1e1e21] p-5">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Preview</div>
            {text ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-10 h-10 bg-amber-500/20 rounded-full flex items-center justify-center text-amber-400">DG</div>
                  <div>
                    <div className="text-sm font-medium text-gray-200">Daniel Gorgonha</div>
                    <div className="text-[10px] text-gray-500">Founder at Deega Labs</div>
                  </div>
                </div>
                <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">{text}</p>
                {hashtags && (
                  <p className="text-sm text-blue-400">
                    {hashtags.split(/[,\s]+/).filter(Boolean).map(t => t.startsWith('#') ? t : `#${t}`).join(' ')}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-600">Start typing to see preview...</p>
            )}
          </div>

          {/* Checklist */}
          {showChecklist && platform === 'linkedin' && (
            <div className="bg-[#111113] rounded-lg border border-[#1e1e21] p-5">
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">LinkedIn Checklist</div>
              <div className="space-y-2 text-xs">
                {[
                  { check: text.split('\n')[0]?.length > 0 && text.split('\n')[0]?.length < 100, label: 'Hook in first line (< 100 chars)' },
                  { check: /\d/.test(text), label: 'Contains concrete data/numbers' },
                  { check: text.includes('?'), label: 'Ends with question (CTA)' },
                  { check: !text.includes('http') || text.lastIndexOf('http') > text.length * 0.7, label: 'Link at end only (not mid-text)' },
                  { check: hashtagCount <= 7 && hashtagCount > 0, label: `Hashtags: ${hashtagCount}/7` },
                  { check: charCount > 200 && charCount < 3000, label: 'Good length (200-3000 chars)' },
                  { check: text.split('\n\n').length >= 2, label: 'Multiple paragraphs (scannable)' },
                ].map((item, i) => (
                  <div key={i} className={`flex items-center gap-2 ${item.check ? 'text-green-400' : 'text-gray-500'}`}>
                    <span>{item.check ? '✓' : '○'}</span>
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent Drafts */}
          {drafts.length > 0 && (
            <div className="bg-[#111113] rounded-lg border border-[#1e1e21] p-5">
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Recent Drafts</div>
              <div className="space-y-2">
                {drafts.slice(0, 5).map((draft, i) => (
                  <button
                    key={i}
                    onClick={() => { setPlatform(draft.platform as Platform); setText(draft.text); }}
                    className="w-full text-left px-3 py-2 bg-[#0a0a0b] rounded border border-[#1e1e21] hover:border-[#333]"
                  >
                    <div className="text-xs text-gray-300 truncate">{draft.text.slice(0, 80)}...</div>
                    <div className="text-[10px] text-gray-600 mt-1">{draft.platform} • {draft.status}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
