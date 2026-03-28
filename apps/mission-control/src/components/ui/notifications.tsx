'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { Notification, Toast } from '@/hooks/use-notifications';

// --- Toast Stack (bottom-right corner) ---

const typeStyles: Record<string, { border: string; accent: string }> = {
  chat: { border: 'border-blue-500/30', accent: 'text-blue-400' },
  approval: { border: 'border-amber-500/30', accent: 'text-amber-400' },
  task: { border: 'border-green-500/30', accent: 'text-green-400' },
  agent: { border: 'border-purple-500/30', accent: 'text-purple-400' },
  system: { border: 'border-gray-500/30', accent: 'text-gray-400' },
  autopilot: { border: 'border-teal-500/30', accent: 'text-teal-400' },
};

const typeIcons: Record<string, string> = {
  chat: '💬',
  approval: '⭐',
  task: '✓',
  agent: '🤖',
  system: '⚙',
  autopilot: '🚀',
};

function timeAgo(ts: string | number): string {
  const diff = Date.now() - (typeof ts === 'number' ? ts : new Date(ts).getTime());
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function ToastStack({
  toasts,
  onDismiss,
  onNavigate,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
  onNavigate?: (href: string) => void;
}) {
  const router = useRouter();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none" style={{ maxWidth: '380px' }}>
      {toasts.map((toast, i) => {
        const style = typeStyles[toast.type] || typeStyles.system;
        return (
          <div
            key={toast.id}
            className={`pointer-events-auto bg-[#1a1a1d] border ${style.border} rounded-xl shadow-2xl shadow-black/40 p-3.5 flex gap-3 items-start animate-slide-in cursor-pointer hover:bg-[#1e1e21] transition-colors`}
            style={{ animationDelay: `${i * 50}ms` }}
            onClick={() => {
              if (toast.href) {
                onNavigate ? onNavigate(toast.href) : router.push(toast.href);
              }
              onDismiss(toast.id);
            }}
          >
            <span className="text-lg shrink-0 mt-0.5">{toast.icon || typeIcons[toast.type] || '🔔'}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={`text-[11px] font-semibold ${style.accent}`}>{toast.title}</span>
                {(toast.priority === 'urgent' || toast.priority === 'high') && (
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                )}
              </div>
              <p className="text-[11px] text-gray-400 mt-0.5 line-clamp-2 leading-relaxed">{toast.body}</p>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); onDismiss(toast.id); }}
              className="text-gray-600 hover:text-gray-300 shrink-0 mt-0.5"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}

// --- Bell Button + Dropdown ---

export function NotificationBell({
  notifications,
  unreadCount,
  soundEnabled,
  onToggleSound,
  onMarkRead,
  onMarkAllRead,
  onDismiss,
  onClearAll,
}: {
  notifications: Notification[];
  unreadCount: number;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onDismiss: (id: string) => void;
  onClearAll: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(!open)}
        className={`relative w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
          open ? 'bg-[#1e1e21] text-gray-200' : 'text-gray-500 hover:text-gray-300 hover:bg-[#1a1a1d]'
        }`}
        title="Notifications"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-amber-500 text-[9px] font-bold text-gray-900 flex items-center justify-center leading-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-[380px] max-h-[480px] bg-[#141416] border border-[#2a2a2d] rounded-xl shadow-2xl shadow-black/50 z-50 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b border-[#1e1e21] flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold text-gray-200">Notifications</span>
              {unreadCount > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-medium">
                  {unreadCount} new
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {/* Sound toggle */}
              <button
                onClick={onToggleSound}
                className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors ${
                  soundEnabled ? 'text-gray-400 hover:text-gray-200' : 'text-gray-600'
                }`}
                title={soundEnabled ? 'Mute sounds' : 'Enable sounds'}
              >
                {soundEnabled ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                    <line x1="23" y1="9" x2="17" y2="15"/>
                    <line x1="17" y1="9" x2="23" y2="15"/>
                  </svg>
                )}
              </button>
              {/* Mark all read */}
              {unreadCount > 0 && (
                <button
                  onClick={onMarkAllRead}
                  className="text-[10px] text-amber-400 hover:text-amber-300 px-2 py-1 rounded-md hover:bg-amber-500/10"
                >
                  Mark all read
                </button>
              )}
              {/* Clear all */}
              {notifications.length > 0 && (
                <button
                  onClick={() => { onClearAll(); setOpen(false); }}
                  className="text-[10px] text-gray-600 hover:text-gray-400 px-2 py-1 rounded-md hover:bg-[#1e1e21]"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Notification list */}
          <div className="flex-1 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="py-12 text-center">
                <div className="text-2xl mb-2 opacity-30">🔔</div>
                <div className="text-[11px] text-gray-600">No notifications yet</div>
              </div>
            ) : (
              <div className="py-1">
                {notifications.map((n) => {
                  const style = typeStyles[n.type] || typeStyles.system;
                  const isUnread = !n.read;
                  return (
                    <div
                      key={n.id}
                      className={`px-4 py-2.5 flex gap-3 items-start cursor-pointer transition-colors hover:bg-[#1a1a1d] ${
                        isUnread ? 'bg-[#161618]' : ''
                      }`}
                      onClick={() => {
                        if (isUnread) onMarkRead(n.id);
                        if (n.href) { router.push(n.href); setOpen(false); }
                      }}
                    >
                      {/* Unread dot */}
                      <div className="w-2 pt-1.5 shrink-0">
                        {isUnread && <span className="block w-2 h-2 rounded-full bg-amber-500" />}
                      </div>
                      {/* Icon */}
                      <span className="text-base shrink-0">{n.icon || typeIcons[n.type] || '🔔'}</span>
                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-[11px] font-medium ${isUnread ? 'text-gray-200' : 'text-gray-400'}`}>
                            {n.title}
                          </span>
                          <span className="text-[9px] text-gray-600 ml-auto shrink-0">
                            {timeAgo(n.createdAt)}
                          </span>
                        </div>
                        <p className={`text-[10px] mt-0.5 line-clamp-2 leading-relaxed ${isUnread ? 'text-gray-400' : 'text-gray-600'}`}>
                          {n.body}
                        </p>
                        {n.agentId && (
                          <span className={`text-[9px] ${style.accent} mt-0.5 inline-block`}>
                            @{n.agentId}
                          </span>
                        )}
                      </div>
                      {/* Dismiss */}
                      <button
                        onClick={(e) => { e.stopPropagation(); onDismiss(n.id); }}
                        className="text-gray-700 hover:text-gray-400 shrink-0 mt-1"
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
