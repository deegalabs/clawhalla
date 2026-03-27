'use client';

import { useState, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { MarkdownView } from '@/components/ui/markdown-view';
import { autoTask } from '@/lib/tasks';
import { AGENT_ROSTER } from '@/lib/agents';

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


type ModelTier = 'haiku' | 'sonnet' | 'opus';
type ResponseStyle = 'normal' | 'concise' | 'detailed' | 'formal' | 'technical';

const MODEL_TIERS: { id: ModelTier; label: string; desc: string; color: string }[] = [
  { id: 'haiku', label: 'Haiku 4.5', desc: 'Fast, lightweight', color: 'text-green-400' },
  { id: 'sonnet', label: 'Sonnet 4.6', desc: 'Balanced', color: 'text-blue-400' },
  { id: 'opus', label: 'Opus 4.6', desc: 'Deep reasoning', color: 'text-purple-400' },
];

const RESPONSE_STYLES: { id: ResponseStyle; label: string; icon: string }[] = [
  { id: 'normal', label: 'Normal', icon: '💬' },
  { id: 'concise', label: 'Concise', icon: '⚡' },
  { id: 'detailed', label: 'Detailed', icon: '📖' },
  { id: 'formal', label: 'Formal', icon: '🎩' },
  { id: 'technical', label: 'Technical', icon: '🔧' },
];

const AGENT_SKILLS: Record<string, string[]> = {
  main: ['orchestrate', 'delegate', 'monitor'],
  odin: ['architecture', 'code-review', 'sprint-planning'],
  vidar: ['smart-contracts', 'protocol-design', 'chain-analysis'],
  saga: ['product-roadmap', 'user-research', 'feature-spec'],
  thor: ['tech-lead', 'mentoring', 'system-design'],
  frigg: ['scheduling', 'coordination', 'reminders'],
  tyr: ['security-audit', 'vulnerability-scan', 'compliance'],
  freya: ['frontend', 'backend', 'full-stack'],
  heimdall: ['testing', 'qa-review', 'regression'],
  volund: ['devops', 'ci-cd', 'infrastructure'],
  sindri: ['solidity', 'evm', 'defi'],
  skadi: ['cairo', 'starknet', 'zk-proofs'],
  mimir: ['deep-research', 'transcription', 'analysis'],
  bragi: ['content-writing', 'social-media', 'copywriting'],
  loki: ['analytics', 'market-research', 'pre-mortem'],
};

function ChatPageInner() {
  const [mode, setMode] = useState<ChatMode>('single');
  const [selectedAgent, setSelectedAgent] = useState('main');
  const [partyAgents, setPartyAgents] = useState<string[]>(['saga', 'mimir', 'loki']);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [sending, setSending] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  // Tools state
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [showStyleMenu, setShowStyleMenu] = useState(false);
  const [showSkillsMenu, setShowSkillsMenu] = useState(false);
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [modelTier, setModelTier] = useState<ModelTier>('sonnet');
  const [responseStyle, setResponseStyle] = useState<ResponseStyle>('normal');
  const [webSearch, setWebSearch] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<{ name: string; type: string }[]>([]);
  const [taskTitle, setTaskTitle] = useState('');
  const [workspaceDocs, setWorkspaceDocs] = useState<string[]>([]);
  const [showDocsMenu, setShowDocsMenu] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const plusMenuRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<{ stop: () => void; abort: () => void } | null>(null);

  // Load sessions and restore last active session on mount
  useEffect(() => {
    const loaded = loadSessions();
    setSessions(loaded);
    // Restore last active session
    const lastId = typeof window !== 'undefined' ? localStorage.getItem('mc_chat_active') : null;
    if (lastId) {
      const session = loaded.find(s => s.id === lastId);
      if (session) {
        setMessages(session.messages);
        setMode(session.mode);
        setActiveSessionId(session.id);
        if (session.mode === 'single') setSelectedAgent(session.agentId);
      }
    }
  }, []);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // Auto-save current session when messages change
  useEffect(() => {
    if (messages.length === 0) return;
    const sessionId = activeSessionId || `chat_${Date.now().toString(36)}`;
    if (!activeSessionId) setActiveSessionId(sessionId);

    const session: ChatSession = {
      id: sessionId,
      title: messages.find(m => m.role === 'user')?.content.slice(0, 50) || 'New chat',
      agentId: mode === 'party' ? 'party' : selectedAgent,
      mode,
      messages,
      createdAt: sessions.find(s => s.id === sessionId)?.createdAt || new Date().toISOString(),
    };
    const updated = [session, ...sessions.filter(s => s.id !== sessionId)].slice(0, 30);
    setSessions(updated);
    saveSessions(updated);
    if (typeof window !== 'undefined') localStorage.setItem('mc_chat_active', sessionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  // Close menus on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (plusMenuRef.current && !plusMenuRef.current.contains(e.target as Node)) {
        setShowPlusMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Fetch workspace docs for "attach from docs"
  useEffect(() => {
    fetch('/api/docs').then(r => r.json()).then(d => {
      if (Array.isArray(d)) setWorkspaceDocs(d.map((f: { path?: string; name?: string }) => f.path || f.name || '').filter(Boolean).slice(0, 30));
    }).catch(() => {});
  }, []);

  // Handle @ mention detection in input
  useEffect(() => {
    const lastAt = input.lastIndexOf('@');
    if (lastAt >= 0 && lastAt === input.length - 1) {
      setShowMentionMenu(true);
    } else if (lastAt >= 0) {
      const afterAt = input.slice(lastAt + 1);
      setShowMentionMenu(afterAt.length < 10 && !afterAt.includes(' '));
    } else {
      setShowMentionMenu(false);
    }
  }, [input]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newFiles = Array.from(files).map(f => ({ name: f.name, type: f.type || 'file' }));
    setAttachedFiles(prev => [...prev, ...newFiles]);
    setShowPlusMenu(false);
  };

  const removeFile = (name: string) => setAttachedFiles(prev => prev.filter(f => f.name !== name));

  const insertMention = (agentName: string) => {
    const lastAt = input.lastIndexOf('@');
    setInput(input.slice(0, lastAt) + `@${agentName} `);
    setShowMentionMenu(false);
    textareaRef.current?.focus();
  };

  const insertSkill = (skill: string) => {
    setInput(prev => (prev ? prev + ' ' : '') + `/${skill} `);
    setShowSkillsMenu(false);
    setShowPlusMenu(false);
    textareaRef.current?.focus();
  };

  const attachDoc = (path: string) => {
    const name = path.split('/').pop() || path;
    setAttachedFiles(prev => [...prev, { name, type: 'workspace' }]);
    setShowDocsMenu(false);
    setShowPlusMenu(false);
  };

  const createTaskFromChat = () => {
    if (!taskTitle.trim()) return;
    fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: taskTitle, status: 'backlog', priority: 'medium', assignedTo: selectedAgent }),
    }).then(() => {
      const sysMsg: Message = { id: `msg_${Date.now()}`, role: 'system', content: `Task created: "${taskTitle}" (assigned to ${selectedAgent})`, timestamp: new Date().toISOString() };
      setMessages(prev => [...prev, sysMsg]);
      setTaskTitle('');
      setShowCreateTask(false);
      setShowPlusMenu(false);
    }).catch(() => {});
  };

  // Auto-resize textarea
  const adjustTextarea = () => {
    const ta = textareaRef.current;
    if (ta) { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'; }
  };

  const togglePartyAgent = (id: string) => {
    setPartyAgents(prev => prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]);
  };

  // Voice input (Web Speech API)
  const addSystemMsg = (text: string) => {
    setMessages(prev => [...prev, { id: `msg_${Date.now()}`, role: 'system', content: text, timestamp: new Date().toISOString() }]);
  };

  const stopRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsRecording(false);
  };

  const startRecording = () => {
    // Check support
    const SRClass = (window as unknown as Record<string, unknown>).webkitSpeechRecognition || (window as unknown as Record<string, unknown>).SpeechRecognition;
    if (!SRClass) {
      addSystemMsg('Speech recognition not supported in this browser. Use Chrome or Edge.');
      return;
    }

    // Stop any existing recognition
    if (recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }

    // Store transcript outside of React state to avoid closure issues
    let finalTranscript = '';
    let noSpeechRetries = 0;
    const maxRetries = 3;

    const createRecognition = () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const recognition = new (SRClass as any)();
        // Try pt-BR first since user is Brazilian, falls back gracefully
        recognition.lang = 'pt-BR';
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;

        recognitionRef.current = recognition;

        recognition.onresult = (event: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>; resultIndex: number }) => {
          noSpeechRetries = 0; // Reset retries on any result
          let interim = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i];
            if (result.isFinal) {
              finalTranscript += result[0].transcript + ' ';
            } else {
              interim += result[0].transcript;
            }
          }
          // Show real-time transcription in the input field
          const text = (finalTranscript + interim).trim();
          if (text) {
            setInput(text);
            setTimeout(adjustTextarea, 30);
          }
        };

        recognition.onerror = (e: { error: string }) => {
          if (e.error === 'no-speech') {
            // Auto-retry: recognition stopped because silence was detected
            noSpeechRetries++;
            if (noSpeechRetries < maxRetries && recognitionRef.current) {
              // Restart silently — user is still in recording mode
              try { recognition.stop(); } catch { /* ignore */ }
              setTimeout(() => {
                if (recognitionRef.current) {
                  createRecognition();
                }
              }, 200);
              return;
            }
            // Max retries reached — stop and show what we have
            if (finalTranscript.trim()) {
              setInput(finalTranscript.trim());
              setTimeout(adjustTextarea, 30);
            } else {
              addSystemMsg('No speech detected after multiple attempts. Check your microphone.');
            }
            recognitionRef.current = null;
            setIsRecording(false);
            return;
          }

          recognitionRef.current = null;
          setIsRecording(false);
          const errorMap: Record<string, string> = {
            'not-allowed': 'Microphone permission denied. Allow mic access in browser settings.',
            'network': 'Network error — Speech API requires internet connection (Google servers).',
            'audio-capture': 'No microphone found. Check your audio input device.',
            'service-not-allowed': 'Speech service not available on HTTP. Try accessing via localhost:3000 instead of 127.0.0.1.',
            'aborted': 'Voice input cancelled.',
          };
          addSystemMsg(errorMap[e.error] || `Voice error: ${e.error}`);
        };

        recognition.onend = () => {
          // Only truly end if user stopped or we ran out of retries
          if (!recognitionRef.current) return;
          // Auto-restart if user hasn't stopped
          if (recognitionRef.current === recognition) {
            try {
              recognition.start();
            } catch {
              // Final — set whatever we have
              if (finalTranscript.trim()) {
                setInput(finalTranscript.trim());
                setTimeout(adjustTextarea, 30);
              }
              recognitionRef.current = null;
              setIsRecording(false);
            }
          }
        };

        recognition.start();
      } catch (err) {
        addSystemMsg(`Failed to start voice: ${String(err)}`);
        recognitionRef.current = null;
        setIsRecording(false);
      }
    };

    setIsRecording(true);
    createRecognition();

    // Safety timeout — stop after 2 minutes
    setTimeout(() => {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch { /* ignore */ }
        recognitionRef.current = null;
        setIsRecording(false);
        if (finalTranscript.trim()) {
          setInput(finalTranscript.trim());
        }
      }
    }, 120000);
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
    setAttachedFiles([]);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setSending(true);

    try {
      // Build context prefix from active tools
      let contextPrefix = '';
      if (responseStyle !== 'normal') contextPrefix += `[Style: ${responseStyle}] `;
      if (webSearch) contextPrefix += '[Web search enabled] ';
      if (thinking) contextPrefix += '[Extended thinking enabled] ';
      if (attachedFiles.length > 0) contextPrefix += `[Attached: ${attachedFiles.map(f => f.name).join(', ')}] `;

      const fullMessage = contextPrefix ? `${contextPrefix}\n\n${msg}` : msg;

      const body = mode === 'party'
        ? { mode: 'party', agents: partyAgents, topic: fullMessage, model: modelTier }
        : { agentId: selectedAgent, message: fullMessage, model: modelTier };

      // Create a placeholder message for streaming
      const streamMsgId = `msg_${Date.now()}_resp`;
      setMessages(prev => [...prev, {
        id: streamMsgId, role: 'agent',
        agentId: mode === 'party' ? partyAgents[0] : selectedAgent,
        content: '',
        timestamp: new Date().toISOString(), mode: mode as 'single' | 'party',
      }]);

      // Try streaming first
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify(body),
      });

      if (res.headers.get('content-type')?.includes('text/event-stream') && res.body) {
        // Streaming response
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullResponse = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === 'chunk') {
                fullResponse += data.text;
                setMessages(prev => prev.map(m =>
                  m.id === streamMsgId ? { ...m, content: fullResponse } : m
                ));
              } else if (data.type === 'done') {
                // Replace with final parsed response
                const finalContent = data.response || fullResponse;
                setMessages(prev => prev.map(m =>
                  m.id === streamMsgId ? {
                    ...m,
                    content: finalContent,
                    role: data.ok ? 'agent' : 'system',
                    agentId: data.ok ? (data.moderator || data.agent) : undefined,
                    participants: data.participants,
                  } : m
                ));
                if (data.ok) {
                  autoTask.agentChat(mode === 'party' ? 'party' : selectedAgent, msg);
                }
              } else if (data.type === 'error') {
                setMessages(prev => prev.map(m =>
                  m.id === streamMsgId ? { ...m, content: (m.content || '') + `\n\n_Error: ${data.text}_` } : m
                ));
              }
            } catch { /* skip malformed SSE */ }
          }
        }
      } else {
        // Non-streaming fallback
        const data = await res.json();
        setMessages(prev => prev.map(m =>
          m.id === streamMsgId ? {
            ...m,
            role: data.ok ? 'agent' : 'system',
            agentId: data.ok ? (data.moderator || data.agentId) : undefined,
            content: data.ok ? data.response : `Error: ${data.error}`,
            participants: data.participants,
          } : m
        ));
        if (data.ok) {
          autoTask.agentChat(mode === 'party' ? 'party' : selectedAgent, msg);
        }
      }
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

  const agent = AGENT_ROSTER.find(a => a.id === selectedAgent);
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
          {AGENT_ROSTER.map(a => {
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
                  <div className="text-gray-600">{s.mode === 'party' ? '🎉' : AGENT_ROSTER.find(a => a.id === s.agentId)?.emoji} • {s.messages.length} msgs</div>
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
        <div className="flex-1 overflow-y-auto min-h-0">
        <div className="px-4 py-4 space-y-4 max-w-3xl mx-auto w-full min-h-full flex flex-col">
          {messages.length === 0 && (
            <div className="flex-1 flex flex-col items-center justify-center">
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
            const msgAgent = AGENT_ROSTER.find(a => a.id === msg.agentId);
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
                  <MarkdownView content={msg.content} showToggle={msg.role === 'agent' && msg.content.length > 100}
                    defaultView="rendered" maxHeight="max-h-96" />
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
        </div>

        {/* Input area — inspired by ChatGPT & Claude */}
        <div className="px-4 py-3 shrink-0 max-w-3xl mx-auto w-full">
          {/* Active tools strip */}
          <div className="flex items-center gap-1.5 mb-2 flex-wrap">
            {/* Model selector */}
            <div className="relative">
              <button onClick={() => { setShowModelMenu(!showModelMenu); setShowStyleMenu(false); }}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-medium border transition-colors ${showModelMenu ? 'bg-[#1e1e21] border-[#333] text-gray-200' : 'bg-[#111113] border-[#1e1e21] text-gray-500 hover:text-gray-300 hover:border-[#333]'}`}>
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="8" cy="8" r="3" /><path d="M8 1v2M8 13v2M1 8h2M13 8h2" /></svg>
                <span className={MODEL_TIERS.find(m => m.id === modelTier)?.color}>{MODEL_TIERS.find(m => m.id === modelTier)?.label}</span>
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 3l2 2 2-2" /></svg>
              </button>
              {showModelMenu && (
                <div className="absolute bottom-full left-0 mb-1 bg-[#1a1a1d] border border-[#2a2a2d] rounded-lg shadow-xl py-1 min-w-[180px] z-50">
                  <div className="px-3 py-1.5 text-[9px] text-gray-600 uppercase tracking-wider font-semibold">Model</div>
                  {MODEL_TIERS.map(m => (
                    <button key={m.id} onClick={() => { setModelTier(m.id); setShowModelMenu(false); }}
                      className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-[#222] ${modelTier === m.id ? 'bg-[#1e1e21]' : ''}`}>
                      <div>
                        <div className={`text-[11px] font-medium ${m.color}`}>{m.label}</div>
                        <div className="text-[9px] text-gray-600">{m.desc}</div>
                      </div>
                      {modelTier === m.id && <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-500"><path d="M3 8l3.5 3.5L13 5" /></svg>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Style selector */}
            <div className="relative">
              <button onClick={() => { setShowStyleMenu(!showStyleMenu); setShowModelMenu(false); }}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-medium border transition-colors ${showStyleMenu ? 'bg-[#1e1e21] border-[#333] text-gray-200' : 'bg-[#111113] border-[#1e1e21] text-gray-500 hover:text-gray-300 hover:border-[#333]'}`}>
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 4h12M2 8h8M2 12h10" /></svg>
                <span>{responseStyle === 'normal' ? 'Style' : RESPONSE_STYLES.find(s => s.id === responseStyle)?.label}</span>
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 3l2 2 2-2" /></svg>
              </button>
              {showStyleMenu && (
                <div className="absolute bottom-full left-0 mb-1 bg-[#1a1a1d] border border-[#2a2a2d] rounded-lg shadow-xl py-1 min-w-[160px] z-50">
                  <div className="px-3 py-1.5 text-[9px] text-gray-600 uppercase tracking-wider font-semibold">Response Style</div>
                  {RESPONSE_STYLES.map(s => (
                    <button key={s.id} onClick={() => { setResponseStyle(s.id); setShowStyleMenu(false); }}
                      className={`w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-[#222] text-[11px] ${responseStyle === s.id ? 'bg-[#1e1e21] text-gray-200' : 'text-gray-400'}`}>
                      <span>{s.icon}</span>
                      <span>{s.label}</span>
                      {responseStyle === s.id && <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-500 ml-auto"><path d="M3 8l3.5 3.5L13 5" /></svg>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="w-px h-4 bg-[#1e1e21]" />

            {/* Web Search toggle */}
            <button onClick={() => setWebSearch(!webSearch)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-medium border transition-colors ${webSearch ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' : 'bg-[#111113] border-[#1e1e21] text-gray-500 hover:text-gray-300 hover:border-[#333]'}`}>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="8" cy="8" r="6" /><path d="M2 8h12M8 2c2 2 3 4 3 6s-1 4-3 6M8 2c-2 2-3 4-3 6s1 4 3 6" /></svg>
              Web Search
            </button>

            {/* Thinking toggle */}
            <button onClick={() => setThinking(!thinking)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-medium border transition-colors ${thinking ? 'bg-purple-500/10 border-purple-500/30 text-purple-400' : 'bg-[#111113] border-[#1e1e21] text-gray-500 hover:text-gray-300 hover:border-[#333]'}`}>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M4 8c0-3 2-5.5 4-5.5s4 2.5 4 5.5-2 5-4 5-4-2-4-5z" /><path d="M6 13.5v1M10 13.5v1M6 15h4" /></svg>
              Thinking
            </button>

            {/* Attached files */}
            {attachedFiles.map(f => (
              <div key={f.name} className="flex items-center gap-1 px-2 py-1 bg-amber-500/10 border border-amber-500/20 rounded-lg text-[10px] text-amber-400">
                <span>{f.type === 'workspace' ? '📁' : '📎'}</span>
                <span className="max-w-[80px] truncate">{f.name}</span>
                <button onClick={() => removeFile(f.name)} className="text-amber-500/60 hover:text-amber-300 ml-0.5">×</button>
              </div>
            ))}
          </div>

          {isRecording ? (
            /* Recording state — waveform with cancel/confirm */
            <div className="flex items-center gap-3 bg-[#1a1a1d] border border-[#2a2a2d] rounded-full px-4 py-2.5 h-12">
              <button onClick={stopRecording}
                className="w-8 h-8 rounded-full bg-[#111113] flex items-center justify-center text-gray-400 hover:text-red-400 hover:bg-red-500/10 shrink-0">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 4l8 8M12 4l-8 8" /></svg>
              </button>
              <div className="flex-1 flex items-center justify-center gap-[3px]">
                {Array.from({ length: 32 }).map((_, i) => (
                  <div key={i} className="w-[3px] bg-amber-500/70 rounded-full animate-pulse"
                    style={{ height: `${8 + Math.random() * 16}px`, animationDelay: `${i * 60}ms`, animationDuration: `${400 + Math.random() * 400}ms` }} />
                ))}
              </div>
              <button onClick={stopRecording}
                className="w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center text-gray-900 hover:bg-amber-400 shrink-0">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8.5l3.5 3.5L13 5" /></svg>
              </button>
            </div>
          ) : (
            /* Normal input state */
            <div className={`flex items-end gap-0 bg-[#1a1a1d] border rounded-2xl px-1.5 py-1.5 transition-colors ${input.trim() ? 'border-amber-500/40' : 'border-[#2a2a2d]'} focus-within:border-amber-500/50`}>
              {/* + Button with menu */}
              <div className="relative" ref={plusMenuRef}>
                <button onClick={() => { setShowPlusMenu(!showPlusMenu); setShowModelMenu(false); setShowStyleMenu(false); }}
                  className={`w-9 h-9 rounded-full border flex items-center justify-center shrink-0 transition-all ${showPlusMenu ? 'bg-amber-500/20 border-amber-500/40 text-amber-400 rotate-45' : 'bg-[#111113] border-[#2a2a2d] text-gray-500 hover:text-gray-300 hover:border-[#444]'}`}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M8 3v10M3 8h10" /></svg>
                </button>

                {/* + Menu popup */}
                {showPlusMenu && (
                  <div className="absolute bottom-full left-0 mb-2 bg-[#1a1a1d] border border-[#2a2a2d] rounded-xl shadow-2xl py-1 min-w-[220px] z-50">
                    {/* Upload files */}
                    <button onClick={() => fileInputRef.current?.click()}
                      className="w-full text-left px-3 py-2 flex items-center gap-3 hover:bg-[#222] text-[11px] text-gray-400 hover:text-gray-200">
                      <span className="w-7 h-7 rounded-lg bg-[#111113] flex items-center justify-center">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M14 10v3a1 1 0 01-1 1H3a1 1 0 01-1-1v-3M8 2v8M5 5l3-3 3 3" /></svg>
                      </span>
                      <div>
                        <div className="text-gray-300">Upload files</div>
                        <div className="text-[9px] text-gray-600">PDF, images, code, docs</div>
                      </div>
                    </button>

                    {/* Attach from workspace */}
                    <div className="relative">
                      <button onClick={() => setShowDocsMenu(!showDocsMenu)}
                        className="w-full text-left px-3 py-2 flex items-center gap-3 hover:bg-[#222] text-[11px] text-gray-400 hover:text-gray-200">
                        <span className="w-7 h-7 rounded-lg bg-[#111113] flex items-center justify-center">
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 1.5h7l4 4V14a1 1 0 01-1 1H3a1 1 0 01-1-1V2.5a1 1 0 011-1z" /><path d="M10 1.5v4h4" /></svg>
                        </span>
                        <div className="flex-1">
                          <div className="text-gray-300">Attach from workspace</div>
                          <div className="text-[9px] text-gray-600">Docs, memory, configs</div>
                        </div>
                        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 2l2 2-2 2" /></svg>
                      </button>
                      {showDocsMenu && (
                        <div className="absolute left-full top-0 ml-1 bg-[#1a1a1d] border border-[#2a2a2d] rounded-lg shadow-xl py-1 min-w-[200px] max-h-[200px] overflow-y-auto z-50">
                          {workspaceDocs.length === 0 && <div className="px-3 py-2 text-[10px] text-gray-600">No docs found</div>}
                          {workspaceDocs.map(d => (
                            <button key={d} onClick={() => attachDoc(d)} className="w-full text-left px-3 py-1.5 text-[10px] text-gray-400 hover:bg-[#222] hover:text-gray-200 truncate">
                              📄 {d.split('/').pop()}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="my-1 border-t border-[#222]" />

                    {/* @ Mention agent */}
                    <button onClick={() => { setInput(prev => prev + '@'); setShowPlusMenu(false); textareaRef.current?.focus(); }}
                      className="w-full text-left px-3 py-2 flex items-center gap-3 hover:bg-[#222] text-[11px] text-gray-400 hover:text-gray-200">
                      <span className="w-7 h-7 rounded-lg bg-[#111113] flex items-center justify-center">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="8" cy="6" r="3" /><path d="M2 14c0-3 2.5-5 6-5s6 2 6 5" /></svg>
                      </span>
                      <div>
                        <div className="text-gray-300">@Mention agent</div>
                        <div className="text-[9px] text-gray-600">Tag another agent in the chat</div>
                      </div>
                    </button>

                    {/* Skills */}
                    <div className="relative">
                      <button onClick={() => setShowSkillsMenu(!showSkillsMenu)}
                        className="w-full text-left px-3 py-2 flex items-center gap-3 hover:bg-[#222] text-[11px] text-gray-400 hover:text-gray-200">
                        <span className="w-7 h-7 rounded-lg bg-[#111113] flex items-center justify-center">
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M8 1.5l2 4 4.5.5-3.25 3 .75 4.5L8 11.5 3.95 13.5l.75-4.5L1.5 6l4.5-.5z" /></svg>
                        </span>
                        <div className="flex-1">
                          <div className="text-gray-300">Skills</div>
                          <div className="text-[9px] text-gray-600">Use an agent skill command</div>
                        </div>
                        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 2l2 2-2 2" /></svg>
                      </button>
                      {showSkillsMenu && (
                        <div className="absolute left-full top-0 ml-1 bg-[#1a1a1d] border border-[#2a2a2d] rounded-lg shadow-xl py-1 min-w-[180px] max-h-[200px] overflow-y-auto z-50">
                          <div className="px-3 py-1 text-[9px] text-gray-600 uppercase tracking-wider">{agent?.name} skills</div>
                          {(AGENT_SKILLS[selectedAgent] || AGENT_SKILLS.main).map(s => (
                            <button key={s} onClick={() => insertSkill(s)}
                              className="w-full text-left px-3 py-1.5 text-[10px] text-gray-400 hover:bg-[#222] hover:text-gray-200">
                              /{s}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="my-1 border-t border-[#222]" />

                    {/* Deep Research */}
                    <button onClick={() => { setInput('Deep research: '); setShowPlusMenu(false); textareaRef.current?.focus(); }}
                      className="w-full text-left px-3 py-2 flex items-center gap-3 hover:bg-[#222] text-[11px] text-gray-400 hover:text-gray-200">
                      <span className="w-7 h-7 rounded-lg bg-teal-500/10 flex items-center justify-center text-teal-400">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5L14 14" /><path d="M7 5v4M5 7h4" /></svg>
                      </span>
                      <div>
                        <div className="text-gray-300">Deep Research</div>
                        <div className="text-[9px] text-gray-600">Delegates to Mimir for analysis</div>
                      </div>
                    </button>

                    {/* Create Task */}
                    <button onClick={() => { setShowCreateTask(!showCreateTask); }}
                      className="w-full text-left px-3 py-2 flex items-center gap-3 hover:bg-[#222] text-[11px] text-gray-400 hover:text-gray-200">
                      <span className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 8l2.5 2.5L10 6" /><rect x="1" y="1" width="14" height="14" rx="2" /></svg>
                      </span>
                      <div>
                        <div className="text-gray-300">Create Task</div>
                        <div className="text-[9px] text-gray-600">Quick task from chat</div>
                      </div>
                    </button>

                    {/* Create task inline form */}
                    {showCreateTask && (
                      <div className="px-3 py-2 border-t border-[#222]">
                        <div className="flex gap-1.5">
                          <input value={taskTitle} onChange={e => setTaskTitle(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') createTaskFromChat(); }}
                            placeholder="Task title..."
                            className="flex-1 px-2 py-1 bg-[#111113] border border-[#2a2a2d] rounded text-[10px] text-gray-200 placeholder-gray-600 focus:outline-none focus:border-amber-500/50" />
                          <button onClick={createTaskFromChat} disabled={!taskTitle.trim()}
                            className="px-2 py-1 bg-amber-500 text-gray-900 rounded text-[10px] font-medium disabled:opacity-40">Add</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <input ref={fileInputRef} type="file" multiple onChange={handleFileUpload} className="hidden" />
              </div>

              {/* Textarea */}
              <div className="flex-1 relative">
                <textarea ref={textareaRef} value={input}
                  onChange={e => { setInput(e.target.value); adjustTextarea(); }}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                  placeholder={mode === 'party' ? 'Describe a topic for discussion...' : `Message @${agent?.name}...`}
                  disabled={sending} rows={1}
                  className="w-full px-3 py-2 bg-transparent text-sm text-gray-200 placeholder-gray-600 focus:outline-none disabled:opacity-50 resize-none leading-relaxed max-h-[120px]" />

                {/* @ Mention autocomplete popup */}
                {showMentionMenu && (
                  <div className="absolute bottom-full left-0 mb-1 bg-[#1a1a1d] border border-[#2a2a2d] rounded-lg shadow-xl py-1 min-w-[180px] max-h-[200px] overflow-y-auto z-50">
                    <div className="px-3 py-1 text-[9px] text-gray-600 uppercase tracking-wider">Mention an agent</div>
                    {AGENT_ROSTER.filter(a => {
                      const lastAt = input.lastIndexOf('@');
                      const query = input.slice(lastAt + 1).toLowerCase();
                      return !query || a.name.toLowerCase().startsWith(query) || a.id.startsWith(query);
                    }).map(a => (
                      <button key={a.id} onClick={() => insertMention(a.name)}
                        className="w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-[#222] text-[11px] text-gray-400 hover:text-gray-200">
                        <span className="text-sm">{a.emoji}</span>
                        <span className="text-gray-300">{a.name}</span>
                        <span className="text-[9px] text-gray-600 ml-auto">{a.role}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Right side buttons */}
              <div className="flex items-center gap-1 shrink-0">
                {/* Mic button */}
                <button onClick={startRecording} disabled={sending}
                  className="w-9 h-9 rounded-full flex items-center justify-center text-gray-500 hover:text-gray-300 hover:bg-[#111113] disabled:opacity-40 transition-colors"
                  title="Voice input">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="5.5" y="1" width="5" height="9" rx="2.5" /><path d="M3 7.5a5 5 0 0010 0" /><path d="M8 12.5v2.5" />
                  </svg>
                </button>
                {/* Send button */}
                <button onClick={sendMessage} disabled={sending || !input.trim()}
                  className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-all ${
                    input.trim() && !sending
                      ? 'bg-amber-500 text-gray-900 hover:bg-amber-400 scale-100'
                      : 'bg-[#111113] text-gray-600 scale-95'
                  } disabled:cursor-default`}>
                  {sending ? (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="animate-spin">
                      <rect x="7" y="1" width="2" height="4" rx="1" opacity="0.3" /><rect x="7" y="11" width="2" height="4" rx="1" opacity="0.7" />
                      <rect x="1" y="7" width="4" height="2" rx="1" opacity="0.5" /><rect x="11" y="7" width="4" height="2" rx="1" opacity="0.9" />
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M8 12V4M4 7l4-4 4 4" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          )}
          <div className="text-center mt-1.5">
            <span className="text-[9px] text-gray-700">Shift+Enter for new line • Type @ to mention</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Disable SSR to avoid hydration mismatch from browser extensions
export default dynamic(() => Promise.resolve(ChatPageInner), { ssr: false });
