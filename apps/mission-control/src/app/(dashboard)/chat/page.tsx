'use client';

import { useState } from 'react';

interface Message {
  id: string;
  role: 'user' | 'agent' | 'system';
  agentId?: string;
  content: string;
  timestamp: string;
  mode?: 'single' | 'party';
  participants?: string[];
}

const AGENTS = [
  { id: 'main', name: 'Claw', emoji: '🦞', role: 'System Controller' },
  { id: 'odin', name: 'Odin', emoji: '👁️', role: 'CTO' },
  { id: 'vidar', name: 'Vidar', emoji: '⚔️', role: 'Blockchain Architect' },
  { id: 'saga', name: 'Saga', emoji: '🔮', role: 'CPO' },
  { id: 'thor', name: 'Thor', emoji: '⚡', role: 'Tech Lead' },
  { id: 'frigg', name: 'Frigg', emoji: '👑', role: 'Coordinator' },
  { id: 'tyr', name: 'Tyr', emoji: '⚖️', role: 'Security Auditor' },
  { id: 'freya', name: 'Freya', emoji: '✨', role: 'Senior Developer' },
  { id: 'heimdall', name: 'Heimdall', emoji: '👁️‍🗨️', role: 'QA' },
  { id: 'volund', name: 'Volund', emoji: '🔧', role: 'DevOps' },
  { id: 'sindri', name: 'Sindri', emoji: '🔥', role: 'Solidity Dev' },
  { id: 'skadi', name: 'Skadi', emoji: '❄️', role: 'Cairo Dev' },
  { id: 'mimir', name: 'Mimir', emoji: '🧠', role: 'Research' },
  { id: 'bragi', name: 'Bragi', emoji: '🎭', role: 'Content' },
  { id: 'loki', name: 'Loki', emoji: '🦊', role: 'Analytics' },
];

type ChatMode = 'single' | 'party';

export default function ChatPage() {
  const [mode, setMode] = useState<ChatMode>('single');
  const [selectedAgent, setSelectedAgent] = useState('main');
  const [partyAgents, setPartyAgents] = useState<string[]>(['saga', 'mimir', 'loki']);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [sending, setSending] = useState(false);

  const togglePartyAgent = (id: string) => {
    setPartyAgents(prev => prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]);
  };

  const sendMessage = async () => {
    if (!input.trim() || sending) return;
    const userMsg: Message = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: input,
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg]);
    const msg = input;
    setInput('');
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

      if (data.ok) {
        const agentMsg: Message = {
          id: `msg_${Date.now()}_resp`,
          role: 'agent',
          agentId: mode === 'party' ? data.moderator : data.agentId,
          content: data.response,
          timestamp: new Date().toISOString(),
          mode: data.mode,
          participants: data.participants,
        };
        setMessages(prev => [...prev, agentMsg]);
      } else {
        setMessages(prev => [...prev, {
          id: `msg_${Date.now()}_err`, role: 'system',
          content: `Error: ${data.error}`, timestamp: new Date().toISOString(),
        }]);
      }
    } catch (e) {
      setMessages(prev => [...prev, {
        id: `msg_${Date.now()}_err`, role: 'system',
        content: `Failed: ${String(e)}`, timestamp: new Date().toISOString(),
      }]);
    }
    setSending(false);
  };

  const agent = AGENTS.find(a => a.id === selectedAgent);

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] gap-3">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-gray-200">Chat</h2>
          <div className="flex gap-0.5 bg-[#111113] rounded-lg p-0.5 border border-[#1e1e21]">
            <button onClick={() => setMode('single')}
              className={`px-3 py-1 text-[11px] rounded ${mode === 'single' ? 'bg-[#1e1e21] text-gray-100' : 'text-gray-500 hover:text-gray-300'}`}>
              1:1 Chat
            </button>
            <button onClick={() => setMode('party')}
              className={`px-3 py-1 text-[11px] rounded ${mode === 'party' ? 'bg-purple-500/20 text-purple-400' : 'text-gray-500 hover:text-gray-300'}`}>
              🎉 Party Mode
            </button>
          </div>
        </div>
        {messages.length > 0 && (
          <button onClick={() => setMessages([])} className="text-[10px] text-gray-600 hover:text-gray-400">Clear</button>
        )}
      </div>

      {/* Agent selector */}
      <div className="shrink-0">
        {mode === 'single' ? (
          <div className="flex gap-1.5 flex-wrap">
            {AGENTS.map(a => (
              <button key={a.id} onClick={() => setSelectedAgent(a.id)}
                className={`px-2.5 py-1 text-[11px] rounded-lg flex items-center gap-1.5 ${selectedAgent === a.id ? 'bg-amber-500 text-gray-900 font-medium' : 'bg-[#111113] text-gray-500 border border-[#1e1e21] hover:text-gray-300'}`}>
                <span>{a.emoji}</span><span>{a.name}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-[10px] text-gray-500">Select agents for the discussion:</div>
            <div className="flex gap-1.5 flex-wrap">
              {AGENTS.map(a => (
                <button key={a.id} onClick={() => togglePartyAgent(a.id)}
                  className={`px-2.5 py-1 text-[11px] rounded-lg flex items-center gap-1.5 ${partyAgents.includes(a.id) ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' : 'bg-[#111113] text-gray-600 border border-[#1e1e21] hover:text-gray-400'}`}>
                  <span>{a.emoji}</span><span>{a.name}</span>
                </button>
              ))}
            </div>
            <div className="text-[10px] text-gray-600">{partyAgents.length} agents selected • Moderator: {AGENTS.find(a => a.id === partyAgents[0])?.name || '—'}</div>
          </div>
        )}
      </div>

      {/* Chat area */}
      <div className="flex-1 bg-[#0a0a0b] rounded-lg border border-[#1e1e21] overflow-hidden flex flex-col min-h-0">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-gray-700">
              <span className="text-3xl mb-2">{mode === 'party' ? '🎉' : agent?.emoji || '🤖'}</span>
              <span className="text-xs">{mode === 'party' ? `Start a discussion with ${partyAgents.length} agents` : `Chat with ${agent?.name || 'an agent'}`}</span>
              <span className="text-[10px] text-gray-800 mt-1">{mode === 'party' ? 'Topics: new project ideas, hackathons, strategy, architecture...' : agent?.role}</span>
            </div>
          )}
          {messages.map(msg => (
            <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
              {msg.role !== 'user' && (
                <div className="shrink-0 w-8 h-8 rounded-lg bg-[#111113] flex items-center justify-center text-base">
                  {msg.role === 'system' ? '⚠️' : AGENTS.find(a => a.id === msg.agentId)?.emoji || '🤖'}
                </div>
              )}
              <div className={`max-w-[80%] ${msg.role === 'user' ? 'bg-amber-500/10 border-amber-500/20' : msg.role === 'system' ? 'bg-red-500/10 border-red-500/20' : 'bg-[#111113] border-[#1e1e21]'} rounded-lg border p-3`}>
                {msg.role === 'agent' && (
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-xs font-medium text-gray-200 capitalize">{msg.agentId}</span>
                    {msg.mode === 'party' && msg.participants && (
                      <span className="text-[9px] bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded">Party • {msg.participants.length} agents</span>
                    )}
                  </div>
                )}
                <pre className="whitespace-pre-wrap text-xs text-gray-300 leading-relaxed font-sans">{msg.content}</pre>
                <div className="text-[9px] text-gray-700 mt-1.5">{new Date(msg.timestamp).toLocaleTimeString()}</div>
              </div>
            </div>
          ))}
          {sending && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#111113] flex items-center justify-center text-base animate-pulse">
                {mode === 'party' ? '🎉' : AGENTS.find(a => a.id === selectedAgent)?.emoji || '🤖'}
              </div>
              <div className="bg-[#111113] border border-[#1e1e21] rounded-lg p-3">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />
                  <span className="text-xs text-gray-500">{mode === 'party' ? 'Agents discussing...' : `${agent?.name} is thinking...`}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="px-4 py-3 border-t border-[#1e1e21] shrink-0">
          <div className="flex gap-2">
            <input type="text" value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              placeholder={mode === 'party' ? 'Describe a topic for discussion...' : `Message @${agent?.name || 'agent'}...`}
              disabled={sending}
              className="flex-1 px-3 py-2 bg-[#111113] border border-[#1e1e21] rounded-lg text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-amber-500 disabled:opacity-50" />
            <button onClick={sendMessage} disabled={sending || !input.trim()}
              className="px-4 py-2 text-xs font-medium bg-amber-500 text-gray-900 rounded-lg hover:bg-amber-400 disabled:opacity-40">
              {sending ? '...' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
