'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';

interface TerminalLine {
  type: 'input' | 'output' | 'error' | 'system';
  content: string;
}

interface TerminalTab {
  id: string;
  name: string;
  cwd: string;
  lines: TerminalLine[];
  history: string[];
  historyIndex: number;
}

const WELCOME = `\x1b[0m╔══════════════════════════════════════════════╗
║  🦞 ClawHalla Terminal                       ║
║  Type commands • "help" for built-in commands ║
╚══════════════════════════════════════════════╝
`;

// Parse ANSI color codes to spans
function ansiToHtml(text: string): string {
  const map: Record<string, string> = {
    '30': 'color:#1e1e21', '31': 'color:#f87171', '32': 'color:#4ade80',
    '33': 'color:#fbbf24', '34': 'color:#60a5fa', '35': 'color:#c084fc',
    '36': 'color:#22d3ee', '37': 'color:#d4d4d4', '90': 'color:#666',
    '91': 'color:#fca5a5', '92': 'color:#86efac', '93': 'color:#fde68a',
    '94': 'color:#93c5fd', '95': 'color:#d8b4fe', '96': 'color:#67e8f9',
    '97': 'color:#fff', '1': 'font-weight:bold',
  };
  return text
    .replace(/</g, '&lt;')
    .replace(/\x1b\[([0-9;]+)m/g, (_, codes) => {
      if (codes === '0') return '</span>';
      const styles = codes.split(';').map((c: string) => map[c] || '').filter(Boolean).join(';');
      return styles ? `<span style="${styles}">` : '';
    })
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, ''); // strip other ANSI sequences
}

function TerminalPageInner() {
  const [tabs, setTabs] = useState<TerminalTab[]>([{
    id: 'tab_1', name: 'Terminal', cwd: '~',
    lines: [{ type: 'system', content: WELCOME }],
    history: [], historyIndex: -1,
  }]);
  const [activeTab, setActiveTab] = useState('tab_1');
  const [input, setInput] = useState('');
  const [running, setRunning] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const tab = tabs.find(t => t.id === activeTab)!;

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => { outputRef.current?.scrollTo(0, outputRef.current.scrollHeight); });
  }, []);

  useEffect(() => { scrollToBottom(); }, [tab?.lines.length, scrollToBottom]);
  useEffect(() => { inputRef.current?.focus(); }, [activeTab]);

  const addLine = (tabId: string, type: TerminalLine['type'], content: string) => {
    setTabs(prev => prev.map(t => t.id === tabId
      ? { ...t, lines: [...t.lines, { type, content }].slice(-500) }
      : t
    ));
  };

  const updateTab = (id: string, updates: Partial<TerminalTab>) => {
    setTabs(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  };

  const executeCommand = async (cmd: string) => {
    if (!cmd.trim()) return;
    const tabId = activeTab;
    const currentTab = tabs.find(t => t.id === tabId)!;

    // History
    const newHistory = [cmd, ...currentTab.history.filter(h => h !== cmd)].slice(0, 100);
    updateTab(tabId, { history: newHistory, historyIndex: -1 });

    addLine(tabId, 'input', `${currentTab.cwd}$ ${cmd}`);
    setInput('');

    // Built-in commands
    if (cmd.trim() === 'clear') { updateTab(tabId, { lines: [] }); return; }
    if (cmd.trim() === 'exit') {
      if (tabs.length > 1) { const rest = tabs.filter(t => t.id !== tabId); setTabs(rest); setActiveTab(rest[0].id); }
      return;
    }
    if (cmd.trim() === 'help') {
      addLine(tabId, 'system',
        '\x1b[33mBuilt-in:\x1b[0m\n' +
        '  clear       Clear screen\n' +
        '  help        This help\n' +
        '  cd <dir>    Change directory\n' +
        '  exit        Close tab\n\n' +
        '\x1b[90mKeyboard: ↑↓ history • Ctrl+L clear • Tab complete\x1b[0m'
      );
      return;
    }

    setRunning(true);
    try {
      const isCD = cmd.trim().startsWith('cd ') || cmd.trim() === 'cd';
      const apiCmd = isCD ? `${cmd.trim()} && pwd` : cmd;

      const res = await fetch('/api/terminal', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: apiCmd, cwd: currentTab.cwd }),
      });
      const data = await res.json();

      if (!data.ok && data.error) {
        addLine(tabId, 'error', data.error);
      } else if (data.output) {
        if (isCD && data.exitCode === 0) {
          const lines = data.output.trim().split('\n');
          const newCwd = lines[lines.length - 1].trim();
          updateTab(tabId, { cwd: newCwd });
        } else {
          addLine(tabId, data.exitCode === 0 ? 'output' : 'error', data.output);
        }
      }
    } catch {
      addLine(tabId, 'error', 'Failed to connect to terminal API');
    }
    setRunning(false);
    scrollToBottom();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !running) {
      executeCommand(input);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const idx = Math.min(tab.historyIndex + 1, tab.history.length - 1);
      if (tab.history[idx]) { updateTab(activeTab, { historyIndex: idx }); setInput(tab.history[idx]); }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const idx = tab.historyIndex - 1;
      if (idx < 0) { updateTab(activeTab, { historyIndex: -1 }); setInput(''); }
      else { updateTab(activeTab, { historyIndex: idx }); setInput(tab.history[idx] || ''); }
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault();
      updateTab(activeTab, { lines: [] });
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const match = tab.history.find(h => h.startsWith(input) && h !== input);
      if (match) setInput(match);
    }
  };

  const addTab = () => {
    const id = `tab_${Date.now().toString(36)}`;
    setTabs(prev => [...prev, { id, name: `Term ${prev.length + 1}`, cwd: '~', lines: [{ type: 'system', content: 'New session\n' }], history: [], historyIndex: -1 }]);
    setActiveTab(id);
  };

  const closeTab = (id: string) => {
    if (tabs.length <= 1) return;
    const rest = tabs.filter(t => t.id !== id);
    setTabs(rest);
    if (activeTab === id) setActiveTab(rest[0].id);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] bg-[#0a0a0b] rounded-lg border border-[#1e1e21] overflow-hidden"
      onClick={() => inputRef.current?.focus()}>
      {/* Tab bar */}
      <div className="flex items-center bg-[#111113] border-b border-[#1e1e21] shrink-0">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] border-r border-[#1e1e21] transition-colors ${
              activeTab === t.id ? 'bg-[#0a0a0b] text-gray-200' : 'text-gray-500 hover:text-gray-300'
            }`}>
            <span className="text-[10px]">{'>'}_</span>
            {t.name}
            {tabs.length > 1 && (
              <span onClick={e => { e.stopPropagation(); closeTab(t.id); }}
                className="text-gray-600 hover:text-red-400 ml-1 text-[10px]">×</span>
            )}
          </button>
        ))}
        <button onClick={addTab} className="px-2.5 py-1.5 text-gray-600 hover:text-gray-300 text-[11px]">+</button>
        <div className="flex-1" />
        <div className="px-3 text-[9px] text-gray-600 font-mono">{tab.cwd}</div>
        <div className="flex items-center gap-1.5 px-2">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
          <span className="text-[9px] text-gray-600">local</span>
        </div>
      </div>

      {/* Output */}
      <div ref={outputRef}
        className="flex-1 overflow-y-auto p-3 font-mono text-[13px] leading-[1.5] select-text cursor-text"
        onClick={() => inputRef.current?.focus()}>
        {tab.lines.map((line, i) => (
          <div key={i} className={
            line.type === 'input' ? 'text-green-400' :
            line.type === 'error' ? 'text-red-400' :
            line.type === 'system' ? 'text-amber-400/80' :
            'text-gray-300'
          }>
            <pre className="whitespace-pre-wrap break-words m-0 font-[inherit] text-[inherit] leading-[inherit]"
              dangerouslySetInnerHTML={{ __html: ansiToHtml(line.content) }} />
          </div>
        ))}

        {/* Input prompt */}
        <div className="flex items-center">
          <span className="text-green-400 shrink-0 select-none">{tab.cwd}<span className="text-amber-500">$</span> </span>
          <input ref={inputRef} value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={running}
            spellCheck={false} autoComplete="off" autoCorrect="off" autoFocus
            className="flex-1 bg-transparent text-gray-200 font-mono text-[13px] focus:outline-none focus-visible:outline-none caret-amber-500 disabled:opacity-50 border-none p-0 m-0" />
          {running && <span className="text-amber-500 animate-pulse text-[10px] ml-2 select-none">running...</span>}
        </div>
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between px-3 py-1 bg-[#111113] border-t border-[#1e1e21] text-[9px] text-gray-600 shrink-0 select-none">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-500" />Connected</span>
          <span>bash</span>
        </div>
        <div className="flex items-center gap-3">
          <span>Ctrl+L clear</span>
          <span>↑↓ history</span>
          <span>Tab complete</span>
        </div>
      </div>
    </div>
  );
}

export default dynamic(() => Promise.resolve(TerminalPageInner), { ssr: false });
