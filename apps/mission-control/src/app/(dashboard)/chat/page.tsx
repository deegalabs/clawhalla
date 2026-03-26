'use client';

import { useState, useRef, useEffect } from 'react';

interface Message {
  id: string;
  role: 'user' | 'agent' | 'system';
  agentId?: string;
  content: string;
  timestamp: string;
  mode?: 'single' | 'party';
  participants?: string[];
}

interface ChatSession {
  id: string;
  title: string;
  agentId: string;
  mode: 'single' | 'party';
  messages: Message[];
  createdAt: string;
}

const AGENTS = [
  { id: 'main', name: 'Claw', emoji: '🦞', role: 'System Controller', color: 'bg-red-500/10' },
  { id: 'odin', name: 'Odin', emoji: '👁️', role: 'CTO', color: 'bg-blue-500/10' },
  { id: 'vidar', name: 'Vidar', emoji: '⚔️', role: 'Blockchain', color: 'bg-purple-500/10' },
  { id: 'saga', name: 'Saga', emoji: '🔮', role: 'CPO', color: 'bg-amber-500/10' },
  { id: 'thor', name: 'Thor', emoji: '⚡', role: 'Tech Lead', color: 'bg-yellow-500/10' },
  { id: 'frigg', name: 'Frigg', emoji: '👑', role: 'PA', color: 'bg-green-500/10' },
  { id: 'tyr', name: 'Tyr', emoji: '⚖️', role: 'Auditor', color: 'bg-red-500/10' },
  { id: 'freya', name: 'Freya', emoji: '✨', role: 'Developer', color: 'bg-pink-500/10' },
  { id: 'heimdall', name: 'Heimdall', emoji: '👁️‍🗨️', role: 'QA', color: 'bg-cyan-500/10' },
  { id: 'volund', name: 'Volund', emoji: '🔧', role: 'DevOps', color: 'bg-gray-500/10' },
  { id: 'sindri', name: 'Sindri', emoji: '🔥', role: 'Solidity', color: 'bg-orange-500/10' },
  { id: 'skadi', name: 'Skadi', emoji: '❄️', role: 'Cairo', color: 'bg-sky-500/10' },
  { id: 'mimir', name: 'Mimir', emoji: '🧠', role: 'Research', color: 'bg-teal-500/10' },
  { id: 'bragi', name: 'Bragi', emoji: '🎭', role: 'Content', color: 'bg-violet-500/10' },
  { id: 'loki', name: 'Loki', emoji: '🦊', role: 'Analytics', color: 'bg-amber-500/10' },
];

const QUICK_PROMPTS: Record<string, string[]> = {
  default: ['What are you working on?', 'Summarize recent activity', 'What needs my attention?'],
  mimir: ['Research DeFi trends in Brazil', 'Analyze our competitors', 'What happened in AI this week?'],
  bragi: ['Draft a LinkedIn post about ClawHalla', 'What content should we post this week?', 'Review our content strategy'],
  loki: ['Weekly opportunity brief', 'Pre-mortem: should we launch the marketplace?', 'What are we missing?'],
  freya: ['Status of current tasks', 'What bugs need fixing?', 'Review the MC codebase'],
  saga: ['Product roadmap review', 'What should we build next?', 'Start a party mode discussion'],
  odin: ['Architecture review', 'Technical debt assessment', 'Sprint planning'],
  tyr: ['Audit the smart contracts', 'Security review of MC', 'What vulnerabilities should we worry about?'],
  party: ['Brainstorm new hackathon project', 'Should we pivot the marketplace strategy?', 'Review Q2 roadmap', 'Discuss new product ideas'],
};

type ChatMode = 'single' | 'party';

function loadSessions(): ChatSession[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem('mc_chat_sessions') || '[]'); } catch { return []; }
}
function saveSessions(s: ChatSession[]) {
  if (typeof window !== 'undefined') localStorage.setItem('mc_chat_sessions', JSON.stringify(s.slice(0, 20)));
}

function renderContent(text: string): string {
  // Basic markdown: **bold**, `code`, ```code blocks```, links
  return text
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="bg-[#0a0a0b] border border-[#1e1e21] rounded p-3 my-2 overflow-x-auto text-[11px] text-green-400 font-mono">$2</pre>')
    .replace(/`([^`]+)`/g, '<code class="bg-[#1a1a1d] text-amber-400 px-1 py-0.5 rounded text-[11px]">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong class="text-gray-100 font-semibold">$1</strong>')
    .replace(/\n/g, '<br/>');
}

export default function ChatPage() {
  const [mode, setMode] = useState<ChatMode>('single');
  const [selectedAgent, setSelectedAgent] = useState('main');
  const [partyAgents, setPartyAgents] = useState<string[]>(['saga', 'mimir', 'loki']);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [sending, setSending] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { setSessions(loadSessions()); }, []);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // Auto-resize textarea
  const adjustTextarea = () => {
    const ta = textareaRef.current;
    if (ta) { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'; }
  };

  const togglePartyAgent = (id: string) => {
    setPartyAgents(prev => prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]);
  };

  // Voice input (Web Speech API)
  const startRecording = () => {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      alert('Speech recognition not supported in this browser');
      return;
    }
    const SR = (window as unknown as Record<string, unknown>).webkitSpeechRecognition || (window as unknown as Record<string, unknown>).SpeechRecognition;
    const recognition = new (SR as new () => { lang: string; continuous: boolean; interimResults: boolean; onresult: (e: unknown) => void; onerror: () => void; onend: () => void; start: () => void })();
    // Auto-detect: use browser language (pt-BR or en-US typically)
    // Web Speech API works best when lang matches spoken language
    // Setting to empty string lets Chrome auto-detect
    recognition.lang = '';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = (event: unknown) => {
      const e = event as { results: { 0: { 0: { transcript: string } } } };
      const transcript = e.results[0][0].transcript;
      setInput(prev => prev + (prev ? ' ' : '') + transcript);
      setIsRecording(false);
      adjustTextarea();
    };
    recognition.onerror = () => { setIsRecording(false); };
    recognition.onend = () => { setIsRecording(false); };

    setIsRecording(true);
    recognition.start();
  };

  // Voice output (Web Speech API TTS)
  const speakText = (text: string) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const clean = text.replace(/[#*`_\[\]()]/g, '').replace(/<[^>]+>/g, '');
    const utterance = new SpeechSynthesisUtterance(clean);
    // Auto-detect language: if text has Portuguese characters/words, use pt-BR
    const hasPt = /[àáâãçéêíóôõúü]|oque|como|para|isso|mais|voce/i.test(clean);
    utterance.lang = hasPt ? 'pt-BR' : 'en-US';
    utterance.rate = 1.1;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  };

  const stopSpeaking = () => {
    window.speechSynthesis?.cancel();
    setIsSpeaking(false);
  };

  const copyMessage = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const sendMessage = async () => {
    if (!input.trim() || sending) return;
    const userMsg: Message = { id: `msg_${Date.now()}`, role: 'user', content: input, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    const msg = input;
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setSending(true);

    try {
      const body = mode === 'party'
        ? { mode: 'party', agents: partyAgents, topic: msg }
        : { agentId: selectedAgent, message: msg };

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      const agentMsg: Message = {
        id: `msg_${Date.now()}_resp`, role: data.ok ? 'agent' : 'system',
        agentId: data.ok ? (data.moderator || data.agentId) : undefined,
        content: data.ok ? data.response : `Error: ${data.error}`,
        timestamp: new Date().toISOString(), mode: data.mode, participants: data.participants,
      };
      setMessages(prev => [...prev, agentMsg]);

      // Save session
      const updated = [...messages, userMsg, agentMsg];
      const session: ChatSession = {
        id: `chat_${Date.now().toString(36)}`,
        title: msg.slice(0, 50),
        agentId: mode === 'party' ? 'party' : selectedAgent,
        mode, messages: updated,
        createdAt: new Date().toISOString(),
      };
      const newSessions = [session, ...sessions.filter(s => s.id !== session.id)].slice(0, 20);
      setSessions(newSessions);
      saveSessions(newSessions);
    } catch (e) {
      setMessages(prev => [...prev, {
        id: `msg_${Date.now()}_err`, role: 'system',
        content: `Failed: ${String(e)}`, timestamp: new Date().toISOString(),
      }]);
    }
    setSending(false);
  };

  const loadSession = (session: ChatSession) => {
    setMessages(session.messages);
    setMode(session.mode);
    if (session.mode === 'single') setSelectedAgent(session.agentId);
    setShowHistory(false);
  };

  const agent = AGENTS.find(a => a.id === selectedAgent);
  const prompts = mode === 'party' ? QUICK_PROMPTS.party : (QUICK_PROMPTS[selectedAgent] || QUICK_PROMPTS.default);

  return (
    <div className="flex h-[calc(100vh-7rem)] gap-3">
      {/* Sidebar: History + Agent picker */}
      <div className="w-56 bg-[#111113] rounded-lg border border-[#1e1e21] flex flex-col overflow-hidden shrink-0">
        {/* Mode toggle */}
        <div className="p-2 border-b border-[#1e1e21]">
          <div className="flex gap-0.5 bg-[#0a0a0b] rounded p-0.5">
            <button onClick={() => setMode('single')}
              className={`flex-1 py-1 text-[10px] rounded ${mode === 'single' ? 'bg-[#1e1e21] text-gray-100' : 'text-gray-500'}`}>1:1</button>
            <button onClick={() => setMode('party')}
              className={`flex-1 py-1 text-[10px] rounded ${mode === 'party' ? 'bg-purple-500/20 text-purple-400' : 'text-gray-500'}`}>🎉 Party</button>
          </div>
        </div>

        {/* Agent list */}
        <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
          <button onClick={() => { setMessages([]); }} className="w-full text-left px-2.5 py-1.5 text-[10px] text-gray-500 hover:text-amber-400 mb-1">+ New Chat</button>
          {AGENTS.map(a => {
            const isSelected = mode === 'single' ? selectedAgent === a.id : partyAgents.includes(a.id);
            return (
              <button key={a.id}
                onClick={() => mode === 'single' ? setSelectedAgent(a.id) : togglePartyAgent(a.id)}
                className={`w-full text-left px-2.5 py-1.5 rounded flex items-center gap-2 ${
                  isSelected
                    ? mode === 'party' ? 'bg-purple-500/10 text-purple-300' : 'bg-[#1e1e21] text-gray-100'
                    : 'text-gray-500 hover:bg-[#1a1a1d] hover:text-gray-300'
                }`}>
                <span className="text-sm">{a.emoji}</span>
                <div className="min-w-0">
                  <div className="text-[11px] font-medium truncate">{a.name}</div>
                  <div className="text-[9px] text-gray-600">{a.role}</div>
                </div>
                {mode === 'party' && isSelected && <span className="text-[9px] text-purple-400 ml-auto">✓</span>}
              </button>
            );
          })}
        </div>

        {/* History */}
        <div className="border-t border-[#1e1e21]">
          <button onClick={() => setShowHistory(!showHistory)}
            className="w-full px-3 py-2 text-[10px] text-gray-500 hover:text-gray-300 flex items-center justify-between">
            <span>History ({sessions.length})</span>
            <span>{showHistory ? '▼' : '▶'}</span>
          </button>
          {showHistory && (
            <div className="max-h-[150px] overflow-y-auto border-t border-[#1e1e21]">
              {sessions.map(s => (
                <button key={s.id} onClick={() => loadSession(s)}
                  className="w-full text-left px-3 py-1.5 text-[10px] hover:bg-[#1a1a1d] border-b border-[#1e1e21] last:border-0">
                  <div className="text-gray-300 truncate">{s.title}</div>
                  <div className="text-gray-600">{s.mode === 'party' ? '🎉' : AGENTS.find(a => a.id === s.agentId)?.emoji} • {s.messages.length} msgs</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 bg-[#0a0a0b] rounded-lg border border-[#1e1e21] flex flex-col overflow-hidden min-h-0">
        {/* Chat header */}
        <div className="px-4 py-2.5 border-b border-[#1e1e21] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            {mode === 'single' ? (
              <>
                <span className="text-lg">{agent?.emoji}</span>
                <div>
                  <span className="text-xs font-medium text-gray-200">{agent?.name}</span>
                  <span className="text-[10px] text-gray-600 ml-2">{agent?.role}</span>
                </div>
              </>
            ) : (
              <>
                <span className="text-lg">🎉</span>
                <span className="text-xs font-medium text-purple-300">Party Mode</span>
                <span className="text-[10px] text-gray-600">{partyAgents.length} agents</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isSpeaking && (
              <button onClick={stopSpeaking} className="text-[10px] text-red-400 bg-red-500/10 px-2 py-0.5 rounded animate-pulse">⏹ Stop</button>
            )}
            {messages.length > 0 && (
              <button onClick={() => setMessages([])} className="text-[10px] text-gray-600 hover:text-gray-400">Clear</button>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full">
              <span className="text-4xl mb-3">{mode === 'party' ? '🎉' : agent?.emoji}</span>
              <span className="text-sm text-gray-400">{mode === 'party' ? 'Start a group discussion' : `Chat with ${agent?.name}`}</span>
              <span className="text-[10px] text-gray-600 mt-1">{mode === 'party' ? 'All selected agents will contribute' : agent?.role}</span>
              {/* Quick prompts */}
              <div className="flex flex-wrap gap-2 mt-4 max-w-md justify-center">
                {prompts.map(p => (
                  <button key={p} onClick={() => { setInput(p); textareaRef.current?.focus(); }}
                    className="px-3 py-1.5 text-[11px] text-gray-400 bg-[#111113] border border-[#1e1e21] rounded-lg hover:text-gray-200 hover:border-amber-500/30">
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map(msg => {
            const msgAgent = AGENTS.find(a => a.id === msg.agentId);
            return (
              <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                {msg.role !== 'user' && (
                  <div className={`shrink-0 w-8 h-8 rounded-lg ${msgAgent?.color || 'bg-[#111113]'} flex items-center justify-center text-base`}>
                    {msg.role === 'system' ? '⚠️' : msgAgent?.emoji || '🤖'}
                  </div>
                )}
                <div className={`max-w-[75%] rounded-lg border p-3 group relative ${
                  msg.role === 'user' ? 'bg-amber-500/5 border-amber-500/20' :
                  msg.role === 'system' ? 'bg-red-500/5 border-red-500/20' :
                  'bg-[#111113] border-[#1e1e21]'
                }`}>
                  {msg.role === 'agent' && (
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-[11px] font-medium text-gray-200">{msgAgent?.name || msg.agentId}</span>
                      {msg.mode === 'party' && <span className="text-[9px] bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded">Party</span>}
                    </div>
                  )}
                  <div className="text-xs text-gray-300 leading-relaxed [&_pre]:my-2 [&_code]:text-[11px]"
                    dangerouslySetInnerHTML={{ __html: renderContent(msg.content) }} />
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-[9px] text-gray-700">{new Date(msg.timestamp).toLocaleTimeString()}</span>
                    {msg.role === 'agent' && (
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                        <button onClick={() => copyMessage(msg.content)} className="text-[9px] text-gray-600 hover:text-gray-300 px-1">📋</button>
                        <button onClick={() => speakText(msg.content)} className="text-[9px] text-gray-600 hover:text-gray-300 px-1">🔊</button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {sending && (
            <div className="flex gap-3">
              <div className={`w-8 h-8 rounded-lg ${agent?.color || 'bg-[#111113]'} flex items-center justify-center text-base animate-pulse`}>
                {mode === 'party' ? '🎉' : agent?.emoji}
              </div>
              <div className="bg-[#111113] border border-[#1e1e21] rounded-lg px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </span>
                  <span className="text-[11px] text-gray-500">{mode === 'party' ? 'Agents discussing...' : `${agent?.name} thinking...`}</span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="px-4 py-3 border-t border-[#1e1e21] shrink-0">
          <div className="flex gap-2 items-end">
            <div className="flex-1 relative">
              <textarea ref={textareaRef} value={input}
                onChange={e => { setInput(e.target.value); adjustTextarea(); }}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder={mode === 'party' ? 'Describe a topic for discussion...' : `Message @${agent?.name}... (Shift+Enter for new line)`}
                disabled={sending} rows={1}
                className="w-full px-3 py-2.5 bg-[#111113] border border-[#1e1e21] rounded-lg text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-amber-500 disabled:opacity-50 resize-none leading-relaxed" />
            </div>
            <button onClick={startRecording} disabled={sending || isRecording}
              className={`px-3 py-2.5 rounded-lg text-sm shrink-0 ${isRecording ? 'bg-red-500/20 text-red-400 animate-pulse' : 'bg-[#111113] border border-[#1e1e21] text-gray-500 hover:text-gray-300'} disabled:opacity-40`}
              title="Voice input (pt-BR)">
              {isRecording ? '⏹' : '🎤'}
            </button>
            <button onClick={sendMessage} disabled={sending || !input.trim()}
              className="px-4 py-2.5 text-xs font-medium bg-amber-500 text-gray-900 rounded-lg hover:bg-amber-400 disabled:opacity-40 shrink-0">
              {sending ? '...' : '↑'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
