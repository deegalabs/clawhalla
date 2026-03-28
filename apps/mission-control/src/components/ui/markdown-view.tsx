'use client';

import { useState } from 'react';

// Escape HTML special characters to prevent XSS
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Validate URL — block javascript: and data: protocols
function sanitizeUrl(url: string): string {
  const trimmed = url.trim().toLowerCase();
  if (trimmed.startsWith('javascript:') || trimmed.startsWith('data:') || trimmed.startsWith('vbscript:')) {
    return '#';
  }
  return url;
}

// Parse markdown table block into HTML
function renderTable(block: string): string {
  const lines = block.trim().split('\n');
  if (lines.length < 2) return block;

  const parseRow = (line: string) =>
    line.split('|').map(c => c.trim()).filter((_, i, arr) => i > 0 && i < arr.length);

  const headers = parseRow(lines[0]);
  // Skip separator line (|---|---|)
  const dataLines = lines.slice(2);

  let html = '<div class="overflow-x-auto my-2"><table class="w-full text-[10px] border-collapse">';
  html += '<thead><tr>';
  for (const h of headers) {
    html += `<th class="text-left px-2.5 py-1.5 text-gray-400 font-semibold border-b border-[#2a2a2d] bg-[#111113]">${escapeHtml(h)}</th>`;
  }
  html += '</tr></thead><tbody>';
  for (const line of dataLines) {
    if (!line.includes('|')) continue;
    const cells = parseRow(line);
    html += '<tr>';
    for (let i = 0; i < headers.length; i++) {
      html += `<td class="px-2.5 py-1.5 text-gray-300 border-b border-[#1e1e21]">${escapeHtml(cells[i] || '')}</td>`;
    }
    html += '</tr>';
  }
  html += '</tbody></table></div>';
  return html;
}

// Render markdown to HTML (lightweight, no deps)
function renderMarkdown(text: string): string {
  // First pass: extract code blocks and tables to protect them
  const codeBlocks: string[] = [];
  let processed = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push(
      `<pre class="bg-[#0a0a0b] border border-[#1e1e21] rounded-lg p-3 my-2 overflow-x-auto text-[11px] text-green-400 font-mono relative"><div class="absolute top-1.5 right-2 text-[8px] text-gray-600 uppercase">${escapeHtml(lang)}</div>${escapeHtml(code)}</pre>`
    );
    return `%%CODEBLOCK_${idx}%%`;
  });

  // Extract inline code before escaping (preserve content)
  const inlineCodes: string[] = [];
  processed = processed.replace(/`([^`]+)`/g, (_, code) => {
    const idx = inlineCodes.length;
    inlineCodes.push(`<code class="bg-[#1a1a1d] text-amber-400 px-1 py-0.5 rounded text-[11px] font-mono">${escapeHtml(code)}</code>`);
    return `%%INLINECODE_${idx}%%`;
  });

  // Extract tables (lines starting with |, at least 2 lines with | separator)
  processed = processed.replace(/(^\|.+\|$\n^\|[-| :]+\|$\n(?:^\|.+\|$\n?)+)/gm, (match) => {
    const idx = codeBlocks.length;
    codeBlocks.push(renderTable(match));
    return `%%CODEBLOCK_${idx}%%`;
  });

  // Escape all remaining HTML to prevent XSS
  processed = escapeHtml(processed);

  // Apply inline formatting (on escaped content — safe to inject trusted HTML)
  processed = processed
    // Headers
    .replace(/^### (.+)$/gm, '<h3 class="text-xs font-semibold text-gray-200 mt-3 mb-1">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-sm font-semibold text-gray-200 mt-3 mb-1">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-base font-bold text-gray-100 mt-3 mb-1.5">$1</h1>')
    // Bold + Italic
    .replace(/\*\*\*([^*]+)\*\*\*/g, '<strong class="text-gray-100 font-semibold italic">$1</strong>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong class="text-gray-100 font-semibold">$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em class="text-gray-300 italic">$1</em>')
    // Strikethrough
    .replace(/~~([^~]+)~~/g, '<del class="text-gray-500 line-through">$1</del>')
    // Links (sanitize URL to block javascript: protocol)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) =>
      `<a href="${sanitizeUrl(url)}" target="_blank" rel="noopener noreferrer" class="text-amber-400 underline hover:text-amber-300">${label}</a>`)
    // Checkboxes
    .replace(/^- \[x\] (.+)$/gm, '<div class="flex items-center gap-1.5 ml-2 text-[11px] text-green-400"><span>✅</span><span>$1</span></div>')
    .replace(/^- \[ \] (.+)$/gm, '<div class="flex items-center gap-1.5 ml-2 text-[11px] text-gray-500"><span>☐</span><span>$1</span></div>')
    // Unordered lists
    .replace(/^[-*] (.+)$/gm, '<li class="text-gray-300 ml-4 list-disc text-[11px] leading-relaxed">$1</li>')
    // Ordered lists
    .replace(/^\d+\. (.+)$/gm, '<li class="text-gray-300 ml-4 list-decimal text-[11px] leading-relaxed">$1</li>')
    // Blockquotes
    .replace(/^&gt; (.+)$/gm, '<blockquote class="border-l-2 border-amber-500/40 pl-3 text-gray-400 italic text-[11px] my-1">$1</blockquote>')
    // Horizontal rules
    .replace(/^---$/gm, '<hr class="border-[#1e1e21] my-3" />')
    // Line breaks
    .replace(/\n\n/g, '<div class="h-2"></div>')
    .replace(/\n/g, '<br/>');

  // Restore inline code
  for (let i = 0; i < inlineCodes.length; i++) {
    processed = processed.replace(`%%INLINECODE_${i}%%`, inlineCodes[i]);
  }

  // Restore code blocks and tables
  for (let i = 0; i < codeBlocks.length; i++) {
    processed = processed.replace(`%%CODEBLOCK_${i}%%`, codeBlocks[i]);
  }

  return processed;
}

interface MarkdownViewProps {
  content: string;
  className?: string;
  maxHeight?: string;
  showToggle?: boolean;
  defaultView?: 'rendered' | 'source';
  onCopy?: () => void;
}

export function MarkdownView({
  content,
  className = '',
  maxHeight = 'max-h-none',
  showToggle = true,
  defaultView = 'rendered',
  onCopy,
}: MarkdownViewProps) {
  const [view, setView] = useState<'rendered' | 'source'>(defaultView);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    onCopy?.();
  };

  return (
    <div className={`relative group ${className}`}>
      {/* Toolbar */}
      {showToggle && (
        <div className="flex items-center gap-1 mb-1.5">
          <div className="flex gap-0.5 bg-[#0a0a0b] rounded p-0.5 border border-[#1e1e21]">
            <button onClick={() => setView('rendered')}
              className={`px-2 py-0.5 text-[9px] rounded transition-colors ${view === 'rendered' ? 'bg-[#1e1e21] text-gray-100' : 'text-gray-600 hover:text-gray-400'}`}>
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="inline mr-1"><path d="M2 4h12M2 8h8M2 12h10" /></svg>
              Markdown
            </button>
            <button onClick={() => setView('source')}
              className={`px-2 py-0.5 text-[9px] rounded transition-colors ${view === 'source' ? 'bg-[#1e1e21] text-gray-100' : 'text-gray-600 hover:text-gray-400'}`}>
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="inline mr-1"><path d="M5 4L1 8l4 4M11 4l4 4-4 4M9 2l-2 12" /></svg>
              Source
            </button>
          </div>
          <button onClick={handleCopy}
            className="ml-auto px-1.5 py-0.5 text-[9px] text-gray-600 hover:text-gray-300 transition-colors">
            {copied ? '✓ Copied' : '📋 Copy'}
          </button>
        </div>
      )}

      {/* Content */}
      {view === 'rendered' ? (
        <div className={`text-[11px] text-gray-300 leading-relaxed overflow-y-auto ${maxHeight} [&_pre]:my-2 [&_code]:text-[11px] [&_li]:py-0.5 [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-xs`}
          dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }} />
      ) : (
        <pre className={`text-[10px] text-gray-400 font-mono bg-[#0a0a0b] border border-[#1e1e21] rounded-lg p-3 overflow-auto whitespace-pre-wrap ${maxHeight}`}>
          {content}
        </pre>
      )}
    </div>
  );
}

// Compact inline version (for chat messages, small cards)
export function MarkdownInline({ content, className = '' }: { content: string; className?: string }) {
  return (
    <div className={`text-[11px] text-gray-300 leading-relaxed [&_pre]:my-2 [&_code]:text-[11px] ${className}`}
      dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }} />
  );
}
