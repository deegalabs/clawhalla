'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { MarkdownView } from '@/components/ui/markdown-view';
import { autoTask } from '@/lib/tasks';
import { useAgents } from '@/hooks/use-agents';
import { agentEmoji, type AgentInfo } from '@/lib/agents';

interface Message {
  id: string;
  role: 'user' | 'agent' | 'system';
  agentId?: string;
  content: string;
  timestamp: string;
  mode?: 'single' | 'party';
  thinkingContent?: string;
  toolCalls?: { name: string; input?: string; output?: string }[];
  artifacts?: { type: string; title: string; content: string }[];
}

interface ChatSession {
  id: string;
  title: string;
  agentId: string;
  mode: 'single' | 'party';
  participants?: string[];
  messageCount: number;
  createdAt: string;
  updatedAt: string;
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
type ResponseStyle = 'normal' | 'concise' | 'detailed' | 'formal' | 'technical';

interface ModelOption { id: string; fullId: string; name: string; provider: string; desc: string; color: string }

// Fallback models if API unavailable
const FALLBACK_MODELS: ModelOption[] = [
  { id: 'claude-sonnet-4-6', fullId: 'anthropic/claude-sonnet-4-6', name: 'Claude Sonnet 4.6', provider: 'anthropic', desc: 'Balanced', color: 'text-blue-400' },
  { id: 'claude-opus-4-6', fullId: 'anthropic/claude-opus-4-6', name: 'Claude Opus 4.6', provider: 'anthropic', desc: 'Deep reasoning', color: 'text-purple-400' },
];

const RESPONSE_STYLES: { id: ResponseStyle; label: string; icon: string }[] = [
  { id: 'normal', label: 'Normal', icon: '💬' },
  { id: 'concise', label: 'Concise', icon: '⚡' },
  { id: 'detailed', label: 'Detailed', icon: '📖' },
  { id: 'formal', label: 'Formal', icon: '🎩' },
  { id: 'technical', label: 'Technical', icon: '🔧' },
];

// Persist session + messages to DB (async, fire-and-forget)
function saveSessionToDB(sessionId: string, title: string, agentId: string, mode: string, participants: string[] | undefined, model: string, msgs: Message[]) {
  fetch('/api/chat/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId, title, agentId, mode, participants, model,
      messages: msgs.map(m => ({
        id: m.id, role: m.role, agentId: m.agentId, content: m.content,
        toolCalls: m.toolCalls, thinkingContent: m.thinkingContent,
        artifacts: m.artifacts, createdAt: m.timestamp,
      })),
    }),
  }).catch(err => console.warn('[chat] save failed:', err));
}

// --- Thinking Block Component ---
function ThinkingBlock({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="mb-2 border border-purple-500/20 rounded-lg overflow-hidden">
      <button onClick={() => setExpanded(!expanded)}
        className="w-full px-3 py-1.5 flex items-center gap-2 text-[10px] text-purple-400 bg-purple-500/5 hover:bg-purple-500/10">
        <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M4 8c0-3 2-5.5 4-5.5s4 2.5 4 5.5-2 5-4 5-4-2-4-5z" /><path d="M6 13.5v1M10 13.5v1M6 15h4" />
        </svg>
        <span>Thinking{expanded ? '' : '...'}</span>
        <span className="ml-auto">{expanded ? '▼' : '▶'}</span>
      </button>
      {expanded && (
        <div className="px-3 py-2 text-[11px] text-purple-300/70 bg-purple-500/5 border-t border-purple-500/10 max-h-48 overflow-y-auto whitespace-pre-wrap font-mono">
          {content}
        </div>
      )}
    </div>
  );
}

// --- Tool Call Component ---
function ToolCallBlock({ call }: { call: { name: string; input?: string; output?: string } }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="mb-2 border border-amber-500/20 rounded-lg overflow-hidden">
      <button onClick={() => setExpanded(!expanded)}
        className="w-full px-3 py-1.5 flex items-center gap-2 text-[10px] text-amber-400 bg-amber-500/5 hover:bg-amber-500/10">
        <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M4 12l-2 2M12 4l2-2M6 10l-4 4M10 6l4-4M7 9L5 7" />
        </svg>
        <span className="font-mono">{call.name}</span>
        <span className="ml-auto">{expanded ? '▼' : '▶'}</span>
      </button>
      {expanded && (
        <div className="border-t border-amber-500/10">
          {call.input && (
            <div className="px-3 py-2 bg-[#0a0a0b]">
              <div className="text-[9px] text-gray-600 mb-1">Input</div>
              <pre className="text-[10px] text-gray-400 font-mono whitespace-pre-wrap overflow-x-auto max-h-32">{call.input}</pre>
            </div>
          )}
          {call.output && (
            <div className="px-3 py-2 bg-[#0a0a0b] border-t border-[#1e1e21]">
              <div className="text-[9px] text-gray-600 mb-1">Output</div>
              <pre className="text-[10px] text-green-400/80 font-mono whitespace-pre-wrap overflow-x-auto max-h-32">{call.output}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- Artifact Component ---
function ArtifactBlock({ artifact }: { artifact: { type: string; title: string; content: string } }) {
  const [expanded, setExpanded] = useState(true);
  return (
    <div className="mb-2 border border-blue-500/20 rounded-lg overflow-hidden">
      <button onClick={() => setExpanded(!expanded)}
        className="w-full px-3 py-1.5 flex items-center gap-2 text-[10px] text-blue-400 bg-blue-500/5 hover:bg-blue-500/10">
        <span>{artifact.type === 'code' ? '📄' : artifact.type === 'html' ? '🌐' : '📝'}</span>
        <span className="font-medium">{artifact.title}</span>
        <span className="text-[9px] text-gray-600 ml-1">{artifact.type}</span>
        <span className="ml-auto">{expanded ? '▼' : '▶'}</span>
      </button>
      {expanded && (
        <div className="border-t border-blue-500/10 max-h-64 overflow-y-auto">
          <MarkdownView content={artifact.content} maxHeight="max-h-60" />
        </div>
      )}
    </div>
  );
}

function ChatPageInner() {
  const { agents } = useAgents();
  const [mode, setMode] = useState<ChatMode>('single');
  const [selectedAgent, setSelectedAgent] = useState('main');
  const [partyAgents, setPartyAgents] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  // Track which sessions are actively streaming (allows parallel chats with different agents)
  const [sendingSessions, setSendingSessions] = useState<Set<string>>(new Set());
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(() => {
    try { return sessionStorage.getItem('chat_active_session'); } catch { return null; }
  });
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [showStyleMenu, setShowStyleMenu] = useState(false);
  const [showSkillsMenu, setShowSkillsMenu] = useState(false);
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [availableModels, setAvailableModels] = useState<ModelOption[]>(FALLBACK_MODELS);
  const [selectedModelId, setSelectedModelId] = useState<string>('claude-sonnet-4-6');
  const [responseStyle, setResponseStyle] = useState<ResponseStyle>('normal');
  const [webSearch, setWebSearch] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<{ name: string; type: string }[]>([]);
  const [taskTitle, setTaskTitle] = useState('');
  const [currentPartyAgent, setCurrentPartyAgent] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const plusMenuRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<{ stop: () => void; abort: () => void } | null>(null);

  // Load available models from gateway config
  useEffect(() => {
    fetch('/api/models').then(r => r.json()).then(data => {
      if (data.ok && data.models?.length > 0) {
        setAvailableModels(data.models);
        // Set default model if current selection not in list
        const defaultId = data.defaultModel?.split('/')?.pop() || '';
        if (defaultId && data.models.some((m: ModelOption) => m.id === defaultId)) {
          setSelectedModelId(defaultId);
        } else if (!data.models.some((m: ModelOption) => m.id === selectedModelId)) {
          setSelectedModelId(data.models[0].id);
        }
      }
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Default party agents to first 3 non-main agents
  useEffect(() => {
    if (agents.length > 0 && partyAgents.length === 0) {
      const defaults = agents.filter(a => a.id !== 'main' && a.id !== 'claw').slice(0, 3).map(a => a.id);
      if (defaults.length > 0) setPartyAgents(defaults);
    }
  }, [agents, partyAgents.length]);

  // Persist active session to sessionStorage
  useEffect(() => {
    try {
      if (activeSessionId) sessionStorage.setItem('chat_active_session', activeSessionId);
      else sessionStorage.removeItem('chat_active_session');
    } catch {}
  }, [activeSessionId]);

  // Load sessions from DB on mount + auto-restore active session
  useEffect(() => {
    setSessionsLoading(true);
    fetch('/api/chat/sessions?limit=30').then(r => r.json()).then(async (data) => {
      if (data.ok && data.sessions) {
        const toIso = (v: unknown) => {
          if (!v) return new Date().toISOString();
          if (typeof v === 'number') return new Date(v).toISOString();
          return String(v);
        };
        const loaded: ChatSession[] = data.sessions.map((s: Record<string, unknown>) => ({
          id: s.id as string,
          title: (s.title || 'Chat') as string,
          agentId: (s.agentId || s.agent_id || 'main') as string,
          mode: (s.mode || 'single') as 'single' | 'party',
          participants: s.participants ? (typeof s.participants === 'string' ? JSON.parse(s.participants as string) : s.participants) : undefined,
          messageCount: (s.messageCount || s.message_count || 0) as number,
          createdAt: toIso(s.createdAt || s.created_at),
          updatedAt: toIso(s.updatedAt || s.updated_at),
        }));
        setSessions(loaded);

        // Auto-restore last active session
        const restoreId = activeSessionId;
        if (restoreId && loaded.find(s => s.id === restoreId) && messages.length === 0) {
          const session = loaded.find(s => s.id === restoreId)!;
          try {
            const res = await fetch(`/api/chat/sessions/${restoreId}`);
            const sData = await res.json();
            if (sData.ok && sData.messages?.length > 0) {
              const sessionMode = (sData.session?.mode || session.mode || 'single') as ChatMode;
              setMessages(sData.messages.map((m: Record<string, unknown>) => ({
                id: m.id, role: m.role, agentId: m.agentId || m.agent_id,
                content: m.content || '', timestamp: toIso(m.createdAt || m.created_at),
                mode: sessionMode === 'party' ? 'party' as const : undefined,
                toolCalls: m.toolCalls || undefined,
                thinkingContent: (m.thinkingContent || m.thinking_content || undefined) as string | undefined,
                artifacts: m.artifacts || undefined,
              })));
              setMode(sessionMode);
              if (sessionMode === 'single') {
                setSelectedAgent(session.agentId === 'party' ? 'main' : session.agentId);
              }
              if (sData.session?.participants) {
                const p = Array.isArray(sData.session.participants)
                  ? sData.session.participants : JSON.parse(sData.session.participants);
                setPartyAgents(p);
              }
            }
          } catch {}
        }
      }
    }).catch(err => console.warn('[chat] load sessions failed:', err))
      .finally(() => setSessionsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // Auto-save to DB when messages change (debounced to avoid saving during streaming)
  useEffect(() => {
    if (messages.length === 0) return;
    // Don't save while this session is streaming — content may be incomplete
    if (activeSessionId && sendingSessions.has(activeSessionId)) return;

    const sessionId = activeSessionId || `chat_${Date.now().toString(36)}`;
    if (!activeSessionId) setActiveSessionId(sessionId);

    const title = messages.find(m => m.role === 'user')?.content.slice(0, 50) || 'New chat';

    // Debounce: save after 500ms of no changes
    const timer = setTimeout(() => {
      // Save all messages with content (skip empty streaming placeholders)
      const msgsToSave = messages.filter(m => m.content && m.content.trim());
      saveSessionToDB(sessionId, title, mode === 'party' ? 'party' : selectedAgent, mode, mode === 'party' ? partyAgents : undefined, selectedModelId, msgsToSave);
    }, 500);

    // Update local sessions list immediately
    setSessions(prev => {
      const exists = prev.find(s => s.id === sessionId);
      if (exists) {
        return prev.map(s => s.id === sessionId ? { ...s, title, messageCount: messages.length, updatedAt: new Date().toISOString() } : s);
      }
      return [{ id: sessionId, title, agentId: mode === 'party' ? 'party' : selectedAgent, mode, messageCount: messages.length, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, ...prev].slice(0, 30);
    });

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, sendingSessions]);

  // Close menus on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (plusMenuRef.current && !plusMenuRef.current.contains(e.target as Node)) setShowPlusMenu(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // @ mention detection
  useEffect(() => {
    const lastAt = input.lastIndexOf('@');
    if (lastAt >= 0 && lastAt === input.length - 1) setShowMentionMenu(true);
    else if (lastAt >= 0) {
      const afterAt = input.slice(lastAt + 1);
      setShowMentionMenu(afterAt.length < 10 && !afterAt.includes(' '));
    } else setShowMentionMenu(false);
  }, [input]);

  const adjustTextarea = () => {
    const ta = textareaRef.current;
    if (ta) { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'; }
  };

  const togglePartyAgent = (id: string) => {
    setPartyAgents(prev => prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]);
  };

  const addSystemMsg = (text: string) => {
    setMessages(prev => [...prev, { id: `msg_${Date.now()}`, role: 'system', content: text, timestamp: new Date().toISOString() }]);
  };

  const insertMention = (agentName: string) => {
    const lastAt = input.lastIndexOf('@');
    setInput(input.slice(0, lastAt) + `@${agentName} `);
    setShowMentionMenu(false);
    textareaRef.current?.focus();
  };

  const insertSkill = (skill: string) => {
    setInput(prev => (prev ? prev + ' ' : '') + `/${skill} `);
    setShowSkillsMenu(false); setShowPlusMenu(false);
    textareaRef.current?.focus();
  };

  const createTaskFromChat = () => {
    if (!taskTitle.trim()) return;
    fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: taskTitle, status: 'backlog', priority: 'medium', assignedTo: selectedAgent }),
    }).then(() => {
      addSystemMsg(`Task created: "${taskTitle}" (assigned to ${selectedAgent})`);
      setTaskTitle(''); setShowCreateTask(false); setShowPlusMenu(false);
    }).catch(() => {});
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    setAttachedFiles(prev => [...prev, ...Array.from(files).map(f => ({ name: f.name, type: f.type || 'file' }))]);
    setShowPlusMenu(false);
  };

  const copyMessage = (text: string) => navigator.clipboard.writeText(text);

  const speakText = (text: string) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const clean = text.replace(/[#*`_\[\]()]/g, '').replace(/<[^>]+>/g, '');
    const utterance = new SpeechSynthesisUtterance(clean);
    const hasPt = /[àáâãçéêíóôõúü]|oque|como|para|isso|mais|voce/i.test(clean);
    utterance.lang = hasPt ? 'pt-BR' : 'en-US';
    utterance.rate = 1.1;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  };

  const stopSpeaking = () => { window.speechSynthesis?.cancel(); setIsSpeaking(false); };

  // Voice input
  const stopRecording = () => {
    if (recognitionRef.current) { recognitionRef.current.stop(); recognitionRef.current = null; }
    setIsRecording(false);
  };

  const startRecording = useCallback(() => {
    const SRClass = (window as unknown as Record<string, unknown>).webkitSpeechRecognition || (window as unknown as Record<string, unknown>).SpeechRecognition;
    if (!SRClass) { addSystemMsg('Speech recognition not supported. Use Chrome or Edge.'); return; }
    if (recognitionRef.current) { recognitionRef.current.abort(); recognitionRef.current = null; }

    let finalTranscript = '';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognition = new (SRClass as any)();
    recognition.lang = 'pt-BR'; recognition.continuous = true; recognition.interimResults = true;
    recognitionRef.current = recognition;

    recognition.onresult = (event: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>; resultIndex: number }) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript + ' ';
        else interim += event.results[i][0].transcript;
      }
      const text = (finalTranscript + interim).trim();
      if (text) { setInput(text); setTimeout(adjustTextarea, 30); }
    };

    recognition.onerror = (e: { error: string }) => {
      if (e.error === 'no-speech') return;
      recognitionRef.current = null; setIsRecording(false);
      const map: Record<string, string> = {
        'not-allowed': 'Microphone permission denied.',
        'network': 'Network error — Speech API requires internet.',
        'audio-capture': 'No microphone found.',
      };
      addSystemMsg(map[e.error] || `Voice error: ${e.error}`);
    };
    recognition.onend = () => { if (recognitionRef.current === recognition) try { recognition.start(); } catch { recognitionRef.current = null; setIsRecording(false); } };

    setIsRecording(true);
    recognition.start();
    setTimeout(() => { if (recognitionRef.current) { try { recognitionRef.current.stop(); } catch {} recognitionRef.current = null; setIsRecording(false); } }, 120000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Send Message ---
  // Track mount state so background streams can save to DB after unmount
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const sendMessage = async () => {
    if (!input.trim() || sending) return;
    if (mode === 'party' && partyAgents.length === 0) return;
    const userMsg: Message = { id: `msg_${Date.now()}`, role: 'user', content: input, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    const msg = input;
    setInput(''); setAttachedFiles([]);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    // Save user message immediately so it persists even if user navigates away
    const curSessionId = activeSessionId || `chat_${Date.now().toString(36)}`;
    if (!activeSessionId) setActiveSessionId(curSessionId);

    // Mark THIS session as sending (doesn't block other agents)
    setSendingSessions(prev => new Set(prev).add(curSessionId));
    const curAgent = selectedAgent;
    const curMode = mode;
    const curPartyAgents = [...partyAgents];
    const curModel = selectedModelId;
    saveSessionToDB(curSessionId, msg.slice(0, 50), curMode === 'party' ? 'party' : curAgent, curMode, curMode === 'party' ? curPartyAgents : undefined, curModel, [userMsg]);

    try {
      let contextPrefix = '';
      if (responseStyle !== 'normal') contextPrefix += `[Style: ${responseStyle}] `;
      if (webSearch) contextPrefix += '[Web search enabled] ';
      if (thinking) contextPrefix += '[Extended thinking enabled] ';
      if (attachedFiles.length > 0) contextPrefix += `[Attached: ${attachedFiles.map(f => f.name).join(', ')}] `;
      const fullMessage = contextPrefix ? `${contextPrefix}\n\n${msg}` : msg;

      const body = curMode === 'party'
        ? { mode: 'party', agents: curPartyAgents, topic: fullMessage, model: curModel }
        : { agentId: curAgent, message: fullMessage, model: curModel };

      // NO abort signal — let the stream run even if user navigates away
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
        body: JSON.stringify(body),
      });

      if (res.headers.get('content-type')?.includes('text/event-stream') && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        // Party mode: track per-agent messages
        const partyMsgIds = new Map<string, string>();

        // Helper: save a response message to DB directly (used when component unmounted)
        const saveResponseToDB = (agentResponseMsg: Message) => {
          saveSessionToDB(curSessionId, msg.slice(0, 50), curMode === 'party' ? 'party' : curAgent, curMode, curMode === 'party' ? curPartyAgents : undefined, curModel, [agentResponseMsg]);
        };

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

              if (curMode === 'party') {
                // Party mode SSE events
                if (data.type === 'agent_start') {
                  if (mountedRef.current) setCurrentPartyAgent(data.agent);
                  const msgId = `msg_${Date.now()}_${data.agent}`;
                  partyMsgIds.set(data.agent, msgId);
                  if (mountedRef.current) {
                    setMessages(prev => [...prev, {
                      id: msgId, role: 'agent', agentId: data.agent,
                      content: '', timestamp: new Date().toISOString(), mode: 'party',
                    }]);
                  }
                } else if (data.type === 'chunk' && data.agent) {
                  if (mountedRef.current) {
                    const msgId = partyMsgIds.get(data.agent);
                    if (msgId) {
                      setMessages(prev => prev.map(m =>
                        m.id === msgId ? { ...m, content: m.content + data.text } : m
                      ));
                    }
                  }
                } else if (data.type === 'agent_done' && data.agent) {
                  const msgId = partyMsgIds.get(data.agent);
                  if (msgId && data.response) {
                    const agentMsg: Message = {
                      id: msgId, role: 'agent', agentId: data.agent,
                      content: data.response, timestamp: new Date().toISOString(), mode: 'party',
                    };
                    if (mountedRef.current) {
                      setMessages(prev => prev.map(m => m.id === msgId ? agentMsg : m));
                    }
                    // Always save to DB — even if unmounted
                    saveResponseToDB(agentMsg);
                  }
                  if (mountedRef.current) setCurrentPartyAgent(null);
                } else if (data.type === 'done') {
                  autoTask.agentChat('party', msg);
                }
              } else {
                // Single agent SSE
                if (data.type === 'start') {
                  const streamMsgId = `msg_${Date.now()}_resp`;
                  partyMsgIds.set('_single', streamMsgId);
                  if (mountedRef.current) {
                    setMessages(prev => [...prev, {
                      id: streamMsgId, role: 'agent', agentId: curAgent,
                      content: '', timestamp: new Date().toISOString(),
                    }]);
                  }
                } else if (data.type === 'chunk') {
                  if (mountedRef.current) {
                    const msgId = partyMsgIds.get('_single');
                    if (msgId) {
                      const text = data.text || '';
                      const looksLikeJson = text.trimStart().startsWith('{') || text.trimStart().startsWith('"');
                      if (!looksLikeJson && text.trim()) {
                        setMessages(prev => prev.map(m =>
                          m.id === msgId ? { ...m, content: m.content + text } : m
                        ));
                      }
                    }
                  }
                } else if (data.type === 'done') {
                  const msgId = partyMsgIds.get('_single');
                  const finalContent = data.response || 'No response received.';
                  const agentMsg: Message = {
                    id: msgId || `msg_${Date.now()}_resp`,
                    role: data.ok ? 'agent' : 'system',
                    agentId: curAgent,
                    content: finalContent,
                    timestamp: new Date().toISOString(),
                  };

                  if (mountedRef.current && msgId) {
                    setMessages(prev => prev.map(m =>
                      m.id === msgId ? agentMsg : m
                    ));
                  }
                  // Always save to DB — critical for when user navigated away
                  saveResponseToDB(agentMsg);

                  if (data.ok) autoTask.agentChat(curAgent, msg);
                }
              }
            } catch { /* skip malformed SSE */ }
          }
        }
      } else {
        // Non-streaming fallback
        const data = await res.json();
        if (curMode === 'party' && data.responses) {
          for (const r of data.responses as { agentId: string; response: string }[]) {
            const agentMsg: Message = {
              id: `msg_${Date.now()}_${r.agentId}`, role: 'agent', agentId: r.agentId,
              content: r.response, timestamp: new Date().toISOString(), mode: 'party',
            };
            if (mountedRef.current) setMessages(prev => [...prev, agentMsg]);
            saveSessionToDB(curSessionId, msg.slice(0, 50), 'party', curMode, curPartyAgents, curModel, [agentMsg]);
          }
        } else {
          const agentMsg: Message = {
            id: `msg_${Date.now()}_resp`, role: data.ok ? 'agent' : 'system',
            agentId: data.ok ? data.agentId : undefined,
            content: data.ok ? data.response : `Error: ${data.error}`,
            timestamp: new Date().toISOString(),
          };
          if (mountedRef.current) setMessages(prev => [...prev, agentMsg]);
          saveSessionToDB(curSessionId, msg.slice(0, 50), curAgent, curMode, undefined, curModel, [agentMsg]);
        }
        if (data.ok) autoTask.agentChat(curMode === 'party' ? 'party' : curAgent, msg);
      }
    } catch (e) {
      if (mountedRef.current) addSystemMsg(`Failed: ${String(e)}`);
    }
    // Clear sending state for THIS session
    setSendingSessions(prev => {
      const next = new Set(prev);
      next.delete(curSessionId);
      return next;
    });
    if (mountedRef.current) {
      setCurrentPartyAgent(null);
    }
  };

  const loadSession = async (session: ChatSession) => {
    try {
      const res = await fetch(`/api/chat/sessions/${session.id}`);
      const data = await res.json();
      if (data.ok && data.messages) {
        const ts = (v: unknown) => {
          if (!v) return new Date().toISOString();
          if (typeof v === 'number') return new Date(v).toISOString();
          if (typeof v === 'string') return v;
          return String(v);
        };
        const sessionMode = (data.session?.mode || session.mode || 'single') as ChatMode;
        setMessages(data.messages.map((m: Record<string, unknown>) => ({
          id: m.id, role: m.role, agentId: m.agentId || m.agent_id,
          content: m.content || '', timestamp: ts(m.createdAt || m.created_at),
          mode: sessionMode === 'party' ? 'party' as const : undefined,
          toolCalls: m.toolCalls || undefined, thinkingContent: (m.thinkingContent || m.thinking_content || undefined) as string | undefined,
          artifacts: m.artifacts || undefined,
        })));
        setMode(sessionMode);
        if (sessionMode === 'single') {
          setSelectedAgent(session.agentId === 'party' ? 'main' : session.agentId);
        }
        if (data.session?.participants) {
          const participants = Array.isArray(data.session.participants)
            ? data.session.participants
            : JSON.parse(data.session.participants);
          setPartyAgents(participants);
        }
        setActiveSessionId(session.id);
      }
    } catch { /* fallback to empty */ }
  };

  const newChat = (newMode?: ChatMode) => {
    setMessages([]);
    setActiveSessionId(null);
    if (newMode) setMode(newMode);
  };

  const deleteSession = (id: string) => {
    fetch(`/api/chat/sessions?id=${id}`, { method: 'DELETE' }).catch(() => {});
    setSessions(prev => prev.filter(s => s.id !== id));
    if (activeSessionId === id) newChat();
  };

  const agent = agents.find(a => a.id === selectedAgent);
  const prompts = mode === 'party' ? QUICK_PROMPTS.party : (QUICK_PROMPTS[selectedAgent] || QUICK_PROMPTS.default);

  // Derived: is the CURRENT session sending? (other agents can send independently)
  const sending = activeSessionId ? sendingSessions.has(activeSessionId) : false;

  // Gateway sessions (live view)
  const [gatewaySessions, setGatewaySessions] = useState<Array<{ key: string; agentId: string; channel: string; updatedAt: number; model: string; totalTokens: number; status: string; messages?: Array<{ role: string; content: unknown }> }>>([]);
  const [viewingGatewaySession, setViewingGatewaySession] = useState<string | null>(null);

  // Load gateway sessions
  useEffect(() => {
    const loadGw = () => {
      fetch('/api/gateway/sessions').then(r => r.json()).then(data => {
        if (data.ok && data.sessions?.sessions) {
          const parsed = data.sessions.sessions.map((s: Record<string, unknown>) => {
            const parts = (s.key as string).split(':');
            const agentId = parts.length >= 2 ? parts[1] : 'unknown';
            const channel = parts.length >= 3 ? parts[2] : 'unknown';
            return { ...s, agentId, channel };
          });
          parsed.sort((a: { updatedAt: number }, b: { updatedAt: number }) => b.updatedAt - a.updatedAt);
          setGatewaySessions(parsed);
        }
      }).catch(() => {});
    };
    loadGw();
    const interval = setInterval(loadGw, 15000);
    return () => clearInterval(interval);
  }, []);

  const loadGatewaySession = async (key: string) => {
    try {
      const res = await fetch(`/api/gateway/sessions?key=${encodeURIComponent(key)}&messages=20`);
      const data = await res.json();
      if (data.ok && data.session) {
        const s = data.session;
        const parts = key.split(':');
        const agentId = parts[1] || 'main';
        const gwMsgs: Message[] = (s.messages || []).map((m: Record<string, unknown>, i: number) => {
          let content = '';
          if (typeof m.content === 'string') content = m.content;
          else if (Array.isArray(m.content)) content = (m.content as Array<{ type: string; text?: string }>).filter(c => c.type === 'text').map(c => c.text).join('\n');
          return {
            id: `gw_${i}`,
            role: m.role as string,
            agentId: m.role === 'assistant' ? agentId : undefined,
            content,
            timestamp: new Date(s.updatedAt).toISOString(),
          };
        });
        setMessages(gwMsgs);
        setSelectedAgent(agentId);
        setMode('single');
        setActiveSessionId(null);
        setViewingGatewaySession(key);
      }
    } catch {}
  };

  // Sidebar view: 'agents' shows agent picker, 'chats' shows conversation list, 'sessions' shows gateway sessions
  const [sidebarView, setSidebarView] = useState<'chats' | 'agents' | 'sessions'>('chats');

  return (
    <div className="flex h-[calc(100vh-7rem)] gap-3">
      {/* Sidebar — conversations + agents */}
      <div className="w-56 bg-[#111113] rounded-lg border border-[#1e1e21] flex flex-col overflow-hidden shrink-0">
        {/* Top: New Chat + Sidebar tabs */}
        <div className="p-2 border-b border-[#1e1e21] space-y-1.5">
          <button onClick={() => newChat()}
            className="w-full py-1.5 text-[10px] font-medium text-gray-300 bg-[#0a0a0b] hover:bg-[#1a1a1d] border border-[#1e1e21] rounded-lg flex items-center justify-center gap-1.5">
            + New Chat
          </button>
          <div className="flex gap-0.5 bg-[#0a0a0b] rounded p-0.5">
            <button onClick={() => setSidebarView('chats')}
              className={`flex-1 py-1 text-[10px] rounded ${sidebarView === 'chats' ? 'bg-[#1e1e21] text-gray-100' : 'text-gray-500'}`}>Chats</button>
            <button onClick={() => setSidebarView('sessions')}
              className={`flex-1 py-1 text-[10px] rounded ${sidebarView === 'sessions' ? 'bg-[#1e1e21] text-gray-100' : 'text-gray-500'}`}>Sessions</button>
            <button onClick={() => setSidebarView('agents')}
              className={`flex-1 py-1 text-[10px] rounded ${sidebarView === 'agents' ? 'bg-[#1e1e21] text-gray-100' : 'text-gray-500'}`}>Agents</button>
          </div>
        </div>

        {/* Conversations list (main view) */}
        {sidebarView === 'chats' && (
          <div className="flex-1 overflow-y-auto">
            {sessionsLoading ? (
              <div className="flex items-center justify-center py-6">
                <div className="w-4 h-4 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
              </div>
            ) : sessions.length === 0 ? (
              <div className="text-center py-6 text-[10px] text-gray-700">No conversations yet</div>
            ) : (
              sessions.map(s => (
                <div key={s.id} className={`flex items-center group border-b border-[#1e1e21] last:border-0 ${activeSessionId === s.id ? 'bg-[#1a1a1d]' : ''}`}>
                  <button onClick={() => loadSession(s)}
                    className="flex-1 text-left px-3 py-2 hover:bg-[#1a1a1d] min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[10px]">{s.mode === 'party' ? '🎉' : agentEmoji(s.agentId)}</span>
                      <span className={`text-[10px] truncate ${activeSessionId === s.id ? 'text-gray-100 font-medium' : 'text-gray-300'}`}>{s.title}</span>
                      {s.mode === 'party' && <span className="text-[8px] bg-purple-500/20 text-purple-400 px-1 rounded shrink-0">Party</span>}
                    </div>
                    <div className="text-[9px] text-gray-600 flex items-center gap-1.5">
                      {s.mode === 'party' && s.participants ? (
                        <span className="truncate">{(s.participants as string[]).map(p => agentEmoji(p)).join(' ')}</span>
                      ) : (
                        <span>{s.messageCount} msgs</span>
                      )}
                      <span>·</span>
                      <span>{new Date(s.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                    </div>
                  </button>
                  <button onClick={() => deleteSession(s.id)}
                    className="px-2 text-gray-700 hover:text-red-400 opacity-0 group-hover:opacity-100 text-[10px]">×</button>
                </div>
              ))
            )}
          </div>
        )}

        {/* Gateway sessions view */}
        {sidebarView === 'sessions' && (
          <div className="flex-1 overflow-y-auto">
            {gatewaySessions.length === 0 ? (
              <div className="text-center py-6 text-[10px] text-gray-700">No gateway sessions</div>
            ) : (
              gatewaySessions.map(s => {
                const channelIcon = s.channel === 'telegram' ? '\u{1F4F1}' : s.channel === 'cron' ? '\u23F0' : '\u{1F4AC}';
                const isActive = viewingGatewaySession === s.key;
                const timeAgo = (() => {
                  const diff = Date.now() - s.updatedAt;
                  const mins = Math.floor(diff / 60000);
                  if (mins < 1) return 'now';
                  if (mins < 60) return `${mins}m`;
                  return `${Math.floor(mins / 60)}h`;
                })();
                return (
                  <button key={s.key} onClick={() => loadGatewaySession(s.key)}
                    className={`w-full text-left px-3 py-2 border-b border-[#1e1e21] hover:bg-[#1a1a1d] ${isActive ? 'bg-[#1a1a1d]' : ''}`}>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[10px]">{channelIcon}</span>
                      <span className="text-[10px]">{agentEmoji(s.agentId)}</span>
                      <span className={`text-[10px] truncate ${isActive ? 'text-gray-100 font-medium' : 'text-gray-300'}`}>
                        {s.agentId}
                      </span>
                      <span className={`ml-auto text-[8px] px-1 py-px rounded ${s.status === 'running' ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/10 text-gray-600'}`}>
                        {s.status === 'running' ? 'live' : timeAgo}
                      </span>
                    </div>
                    <div className="text-[9px] text-gray-600 truncate">
                      {s.channel}{s.channel === 'telegram' ? '' : ''} · {s.model?.replace('claude-', '')} · {(s.totalTokens / 1000).toFixed(1)}k tok
                    </div>
                  </button>
                );
              })
            )}
          </div>
        )}

        {/* Agents picker view */}
        {sidebarView === 'agents' && (
          <div className="flex-1 overflow-y-auto">
            {/* Mode toggle */}
            <div className="px-2 py-1.5 border-b border-[#1e1e21]">
              <div className="flex gap-0.5 bg-[#0a0a0b] rounded p-0.5">
                <button onClick={() => { if (mode !== 'single') newChat('single'); }}
                  className={`flex-1 py-1 text-[10px] rounded ${mode === 'single' ? 'bg-[#1e1e21] text-gray-100' : 'text-gray-500'}`}>1:1</button>
                <button onClick={() => { if (mode !== 'party') newChat('party'); }}
                  className={`flex-1 py-1 text-[10px] rounded ${mode === 'party' ? 'bg-purple-500/20 text-purple-400' : 'text-gray-500'}`}>🎉 Party</button>
              </div>
            </div>
            <div className="p-1.5 space-y-0.5">
              {agents.map(a => {
                const isSelected = mode === 'single' ? selectedAgent === a.id : partyAgents.includes(a.id);
                return (
                  <button key={a.id}
                    onClick={() => {
                      if (mode === 'single') {
                        if (selectedAgent !== a.id) {
                          setSelectedAgent(a.id);
                          // Start fresh chat for the new agent
                          setMessages([]);
                          setActiveSessionId(null);
                        }
                      } else {
                        togglePartyAgent(a.id);
                      }
                    }}
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
          </div>
        )}
      </div>

      {/* Chat area */}
      <div className="flex-1 bg-[#0a0a0b] rounded-lg border border-[#1e1e21] flex flex-col overflow-hidden min-h-0">
        {/* Header */}
        <div className="px-4 py-2.5 border-b border-[#1e1e21] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            {mode === 'single' ? (
              <>
                <span className="text-lg">{agent?.emoji || '🤖'}</span>
                <div>
                  <span className="text-xs font-medium text-gray-200">{agent?.name || selectedAgent}</span>
                  <span className="text-[10px] text-gray-600 ml-2">{agent?.role}</span>
                </div>
              </>
            ) : (
              <>
                <span className="text-lg">🎉</span>
                <span className="text-xs font-medium text-purple-300">Party Mode</span>
                <span className="text-[10px] text-gray-600">{partyAgents.length} agents</span>
                {currentPartyAgent && (
                  <span className="text-[10px] text-amber-400 animate-pulse ml-2">
                    {agentEmoji(currentPartyAgent)} {currentPartyAgent} speaking...
                  </span>
                )}
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isSpeaking && <button onClick={stopSpeaking} className="text-[10px] text-red-400 bg-red-500/10 px-2 py-0.5 rounded animate-pulse">⏹ Stop</button>}
            {messages.length > 0 && <button onClick={() => newChat()} className="text-[10px] text-gray-600 hover:text-gray-400">Clear</button>}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="px-4 py-4 space-y-4 max-w-3xl mx-auto w-full min-h-full flex flex-col">
            {messages.length === 0 && (
              <div className="flex-1 flex flex-col items-center justify-center">
                <span className="text-4xl mb-3">{mode === 'party' ? '🎉' : agent?.emoji || '🤖'}</span>
                <span className="text-sm text-gray-400">{mode === 'party' ? 'Start a group discussion' : `Chat with ${agent?.name || selectedAgent}`}</span>
                <span className="text-[10px] text-gray-600 mt-1">{mode === 'party' ? 'Each agent will respond with their own perspective' : agent?.role}</span>
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
              const msgAgent = agents.find(a => a.id === msg.agentId);
              return (
                <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                  {msg.role !== 'user' && (
                    <div className={`shrink-0 w-8 h-8 rounded-lg ${msgAgent?.color || 'bg-[#111113]'} flex items-center justify-center text-base`}>
                      {msg.role === 'system' ? '⚠️' : msgAgent?.emoji || agentEmoji(msg.agentId || '')}
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

                    {/* Thinking block */}
                    {msg.thinkingContent && <ThinkingBlock content={msg.thinkingContent} />}

                    {/* Tool calls */}
                    {msg.toolCalls?.map((tc, i) => <ToolCallBlock key={i} call={tc} />)}

                    {/* Main content */}
                    {msg.role === 'user' ? (
                      <p className="text-[11px] text-gray-200 whitespace-pre-wrap">{msg.content}</p>
                    ) : (
                      <MarkdownView content={msg.content} showToggle={false}
                        defaultView="rendered" maxHeight="max-h-[500px]" />
                    )}

                    {/* Artifacts */}
                    {msg.artifacts?.map((art, i) => <ArtifactBlock key={i} artifact={art} />)}

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

            {sending && !currentPartyAgent && (
              <div className="flex gap-3">
                <div className={`w-8 h-8 rounded-lg ${agent?.color || 'bg-[#111113]'} flex items-center justify-center text-base animate-pulse`}>
                  {mode === 'party' ? '🎉' : agent?.emoji || '🤖'}
                </div>
                <div className="bg-[#111113] border border-[#1e1e21] rounded-lg px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="flex gap-1">
                      <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </span>
                    <span className="text-[11px] text-gray-500">{mode === 'party' ? 'Starting discussion...' : `${agent?.name || 'Agent'} thinking...`}</span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input area */}
        <div className="px-4 py-3 shrink-0 max-w-3xl mx-auto w-full">
          {/* Active tools strip */}
          <div className="flex items-center gap-1.5 mb-2 flex-wrap">
            {/* Model selector */}
            <div className="relative">
              <button onClick={() => { setShowModelMenu(!showModelMenu); setShowStyleMenu(false); }}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-medium border transition-colors ${showModelMenu ? 'bg-[#1e1e21] border-[#333] text-gray-200' : 'bg-[#111113] border-[#1e1e21] text-gray-500 hover:text-gray-300'}`}>
                <span className={availableModels.find(m => m.id === selectedModelId)?.color || 'text-gray-400'}>{availableModels.find(m => m.id === selectedModelId)?.name || selectedModelId}</span>
              </button>
              {showModelMenu && (
                <div className="absolute bottom-full left-0 mb-1 bg-[#1a1a1d] border border-[#2a2a2d] rounded-lg shadow-xl py-1 min-w-[220px] z-50 max-h-64 overflow-y-auto">
                  {availableModels.map(m => (
                    <button key={m.id} onClick={() => { setSelectedModelId(m.id); setShowModelMenu(false); }}
                      className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-[#222] ${selectedModelId === m.id ? 'bg-[#1e1e21]' : ''}`}>
                      <div><div className={`text-[11px] font-medium ${m.color}`}>{m.name}</div><div className="text-[9px] text-gray-600">{m.provider}{m.desc ? ` · ${m.desc}` : ''}</div></div>
                      {selectedModelId === m.id && <span className="text-amber-500 text-xs">✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Style selector */}
            <div className="relative">
              <button onClick={() => { setShowStyleMenu(!showStyleMenu); setShowModelMenu(false); }}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-medium border transition-colors ${showStyleMenu ? 'bg-[#1e1e21] border-[#333] text-gray-200' : 'bg-[#111113] border-[#1e1e21] text-gray-500 hover:text-gray-300'}`}>
                {responseStyle === 'normal' ? 'Style' : RESPONSE_STYLES.find(s => s.id === responseStyle)?.label}
              </button>
              {showStyleMenu && (
                <div className="absolute bottom-full left-0 mb-1 bg-[#1a1a1d] border border-[#2a2a2d] rounded-lg shadow-xl py-1 min-w-[160px] z-50">
                  {RESPONSE_STYLES.map(s => (
                    <button key={s.id} onClick={() => { setResponseStyle(s.id); setShowStyleMenu(false); }}
                      className={`w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-[#222] text-[11px] ${responseStyle === s.id ? 'bg-[#1e1e21] text-gray-200' : 'text-gray-400'}`}>
                      <span>{s.icon}</span><span>{s.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="w-px h-4 bg-[#1e1e21]" />

            <button onClick={() => setWebSearch(!webSearch)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-medium border ${webSearch ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' : 'bg-[#111113] border-[#1e1e21] text-gray-500 hover:text-gray-300'}`}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              Search
            </button>

            <button onClick={() => setThinking(!thinking)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-medium border ${thinking ? 'bg-purple-500/10 border-purple-500/30 text-purple-400' : 'bg-[#111113] border-[#1e1e21] text-gray-500 hover:text-gray-300'}`}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a8 8 0 0 0-8 8c0 3.4 2.1 6.3 5 7.4V19a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-1.6c2.9-1.1 5-4 5-7.4a8 8 0 0 0-8-8Z"/><line x1="9" y1="22" x2="15" y2="22"/></svg>
              Think
            </button>

            {attachedFiles.map(f => (
              <div key={f.name} className="flex items-center gap-1 px-2 py-1 bg-amber-500/10 border border-amber-500/20 rounded-lg text-[10px] text-amber-400">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg><span className="max-w-[80px] truncate">{f.name}</span>
                <button onClick={() => setAttachedFiles(prev => prev.filter(x => x.name !== f.name))} className="text-amber-500/60 hover:text-amber-300 ml-0.5">×</button>
              </div>
            ))}
          </div>

          {isRecording ? (
            <div className="flex items-center gap-3 bg-[#1a1a1d] border border-[#2a2a2d] rounded-full px-4 py-2.5 h-12">
              <button onClick={stopRecording} className="w-8 h-8 rounded-full bg-[#111113] flex items-center justify-center text-gray-400 hover:text-red-400">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
              <div className="flex-1 flex items-center justify-center gap-[3px]">
                {Array.from({ length: 32 }).map((_, i) => (
                  <div key={i} className="w-[3px] bg-amber-500/70 rounded-full animate-pulse"
                    style={{ height: `${8 + Math.random() * 16}px`, animationDelay: `${i * 60}ms` }} />
                ))}
              </div>
              <button onClick={stopRecording} className="w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center text-gray-900">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </button>
            </div>
          ) : (
            <div className={`flex items-end gap-0 bg-[#1a1a1d] border rounded-2xl px-1.5 py-1.5 transition-colors ${input.trim() ? 'border-amber-500/40' : 'border-[#2a2a2d]'} focus-within:border-amber-500/50`}>
              {/* + Button */}
              <div className="relative" ref={plusMenuRef}>
                <button onClick={() => { setShowPlusMenu(!showPlusMenu); setShowModelMenu(false); setShowStyleMenu(false); }}
                  className={`w-9 h-9 rounded-full border flex items-center justify-center shrink-0 transition-all ${showPlusMenu ? 'bg-amber-500/20 border-amber-500/40 text-amber-400 rotate-45' : 'bg-[#111113] border-[#2a2a2d] text-gray-500 hover:text-gray-300'}`}>
                  +
                </button>
                {showPlusMenu && (
                  <div className="absolute bottom-full left-0 mb-2 bg-[#1a1a1d] border border-[#2a2a2d] rounded-xl shadow-2xl py-1 min-w-[220px] z-50">
                    <button onClick={() => fileInputRef.current?.click()}
                      className="w-full text-left px-3 py-2 flex items-center gap-3 hover:bg-[#222] text-[11px] text-gray-400 hover:text-gray-200">
                      <span className="w-7 h-7 rounded-lg bg-[#111113] flex items-center justify-center text-gray-400">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                      </span>
                      <div><div className="text-gray-300">Upload files</div><div className="text-[9px] text-gray-600">PDF, images, code</div></div>
                    </button>
                    <button onClick={() => { setInput(prev => prev + '@'); setShowPlusMenu(false); textareaRef.current?.focus(); }}
                      className="w-full text-left px-3 py-2 flex items-center gap-3 hover:bg-[#222] text-[11px] text-gray-400 hover:text-gray-200">
                      <span className="w-7 h-7 rounded-lg bg-[#111113] flex items-center justify-center text-gray-400">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
                      </span>
                      <div><div className="text-gray-300">@Mention agent</div></div>
                    </button>
                    <div className="relative">
                      <button onClick={() => setShowSkillsMenu(!showSkillsMenu)}
                        className="w-full text-left px-3 py-2 flex items-center gap-3 hover:bg-[#222] text-[11px] text-gray-400 hover:text-gray-200">
                        <span className="w-7 h-7 rounded-lg bg-[#111113] flex items-center justify-center text-gray-400">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                        </span>
                        <div className="flex-1"><div className="text-gray-300">Skills</div></div>
                        <span className="text-[8px] text-gray-600">›</span>
                      </button>
                      {showSkillsMenu && (
                        <div className="absolute left-full top-0 ml-1 bg-[#1a1a1d] border border-[#2a2a2d] rounded-lg shadow-xl py-1 min-w-[180px] z-50">
                          <div className="px-3 py-1 text-[9px] text-gray-600 uppercase">{agent?.name} skills</div>
                          {['orchestrate', 'delegate', 'research', 'code-review', 'content-writing'].map(s => (
                            <button key={s} onClick={() => insertSkill(s)}
                              className="w-full text-left px-3 py-1.5 text-[10px] text-gray-400 hover:bg-[#222] hover:text-gray-200">/{s}</button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="my-1 border-t border-[#222]" />
                    <button onClick={() => { setInput('Deep research: '); setShowPlusMenu(false); textareaRef.current?.focus(); }}
                      className="w-full text-left px-3 py-2 flex items-center gap-3 hover:bg-[#222] text-[11px] text-gray-400 hover:text-gray-200">
                      <span className="w-7 h-7 rounded-lg bg-teal-500/10 flex items-center justify-center text-teal-400">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
                      </span>
                      <div><div className="text-gray-300">Deep Research</div></div>
                    </button>
                    <button onClick={() => setShowCreateTask(!showCreateTask)}
                      className="w-full text-left px-3 py-2 flex items-center gap-3 hover:bg-[#222] text-[11px] text-gray-400 hover:text-gray-200">
                      <span className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
                      </span>
                      <div><div className="text-gray-300">Create Task</div></div>
                    </button>
                    {showCreateTask && (
                      <div className="px-3 py-2 border-t border-[#222]">
                        <div className="flex gap-1.5">
                          <input value={taskTitle} onChange={e => setTaskTitle(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') createTaskFromChat(); }}
                            placeholder="Task title..." className="flex-1 px-2 py-1 bg-[#111113] border border-[#2a2a2d] rounded text-[10px] text-gray-200 focus:outline-none" />
                          <button onClick={createTaskFromChat} disabled={!taskTitle.trim()} className="px-2 py-1 bg-amber-500 text-gray-900 rounded text-[10px] font-medium disabled:opacity-40">Add</button>
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
                  placeholder={mode === 'party' ? 'Describe a topic for discussion...' : `Message @${agent?.name || 'agent'}...`}
                  disabled={sending} rows={1}
                  className="w-full px-3 py-2 bg-transparent text-sm text-gray-200 placeholder-gray-600 focus:outline-none disabled:opacity-50 resize-none leading-relaxed max-h-[120px]" />

                {showMentionMenu && (
                  <div className="absolute bottom-full left-0 mb-1 bg-[#1a1a1d] border border-[#2a2a2d] rounded-lg shadow-xl py-1 min-w-[180px] max-h-[200px] overflow-y-auto z-50">
                    <div className="px-3 py-1 text-[9px] text-gray-600 uppercase">Mention an agent</div>
                    {agents.filter(a => {
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

              {/* Buttons */}
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={startRecording} disabled={sending}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-gray-500 hover:text-gray-300 disabled:opacity-40" title="Voice input">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                    <line x1="12" x2="12" y1="19" y2="22"/>
                  </svg>
                </button>
                <button onClick={sendMessage} disabled={sending || !input.trim()}
                  className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all ${
                    input.trim() && !sending ? 'bg-amber-500 text-gray-900 hover:bg-amber-400' : 'bg-[#222] text-gray-600'
                  }`}>
                  {sending ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>
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

export default dynamic(() => Promise.resolve(ChatPageInner), { ssr: false });
