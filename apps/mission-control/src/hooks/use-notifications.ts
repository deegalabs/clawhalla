'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

export interface Notification {
  id: string;
  type: 'chat' | 'approval' | 'task' | 'agent' | 'system' | 'autopilot';
  title: string;
  body: string;
  icon?: string;
  href?: string;
  agentId?: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  read?: number;
  dismissed?: number;
  createdAt: string | number;
}

export interface Toast {
  id: string;
  type: Notification['type'];
  title: string;
  body: string;
  icon?: string;
  href?: string;
  priority?: string;
  expiresAt: number;
}

const TOAST_DURATION = 5000;
const TOAST_DURATION_URGENT = 8000;

// Notification sound — simple Web Audio API beep
function playNotificationSound(priority?: string) {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (priority === 'urgent' || priority === 'high') {
      // Double beep for urgent
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.frequency.value = 1100;
      gain2.gain.setValueAtTime(0.15, ctx.currentTime + 0.2);
      gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
      osc2.start(ctx.currentTime + 0.2);
      osc2.stop(ctx.currentTime + 0.5);
    } else {
      // Single soft beep
      osc.frequency.value = 660;
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.25);
    }
  } catch { /* audio not available */ }
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const eventSourceRef = useRef<EventSource | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch notifications from DB
  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications?limit=30');
      const data = await res.json();
      if (data.ok) {
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
      }
    } catch { /* ignore */ }
  }, []);

  // Add a toast (auto-expires)
  const addToast = useCallback((notif: {
    id: string; type: Notification['type']; title: string; body: string;
    icon?: string; href?: string; priority?: string;
  }) => {
    const duration = notif.priority === 'urgent' || notif.priority === 'high'
      ? TOAST_DURATION_URGENT : TOAST_DURATION;

    const toast: Toast = {
      ...notif,
      expiresAt: Date.now() + duration,
    };

    setToasts(prev => {
      // Max 5 toasts at once
      const updated = [toast, ...prev].slice(0, 5);
      return updated;
    });
  }, []);

  // Remove expired toasts
  useEffect(() => {
    toastTimerRef.current = setInterval(() => {
      setToasts(prev => {
        const now = Date.now();
        const filtered = prev.filter(t => t.expiresAt > now);
        return filtered.length !== prev.length ? filtered : prev;
      });
    }, 500);
    return () => { if (toastTimerRef.current) clearInterval(toastTimerRef.current); };
  }, []);

  // Dismiss a toast manually
  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Mark notification as read
  const markRead = useCallback(async (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: 1 } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: 'read' }),
    }).catch(() => {});
  }, []);

  // Mark all as read
  const markAllRead = useCallback(async () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: 1 })));
    setUnreadCount(0);
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'read_all' }),
    }).catch(() => {});
  }, []);

  // Dismiss notification
  const dismiss = useCallback(async (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
    setUnreadCount(prev => Math.max(0, prev - 1));
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: 'dismiss' }),
    }).catch(() => {});
  }, []);

  // Clear all
  const clearAll = useCallback(async () => {
    setNotifications([]);
    setUnreadCount(0);
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'dismiss_all' }),
    }).catch(() => {});
  }, []);

  // SSE listener for real-time notifications
  useEffect(() => {
    fetchNotifications();

    // Close any previous EventSource before creating a new one (prevents leak on remount)
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    try {
      const es = new EventSource('/api/sse');
      eventSourceRef.current = es;

      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type === 'notification' && data.event) {
            const ev = data.event;
            // Add to local state
            const notif: Notification = {
              id: ev.id,
              type: ev.type,
              title: ev.title,
              body: ev.body,
              icon: ev.icon,
              href: ev.href,
              agentId: ev.agentId,
              priority: ev.priority,
              read: 0,
              createdAt: ev.timestamp,
            };
            setNotifications(prev => [notif, ...prev].slice(0, 50));
            setUnreadCount(prev => prev + 1);

            // Show toast
            addToast({
              id: ev.id,
              type: ev.type,
              title: ev.title,
              body: ev.body,
              icon: ev.icon,
              href: ev.href,
              priority: ev.priority,
            });

            // Play sound
            if (soundEnabled && ev.sound !== false) {
              playNotificationSound(ev.priority);
            }
          }
        } catch { /* ignore parse errors */ }
      };

      es.onerror = () => { es.close(); };
    } catch { /* SSE not available */ }

    return () => {
      if (eventSourceRef.current) eventSourceRef.current.close();
    };
  }, [fetchNotifications, addToast, soundEnabled]);

  return {
    notifications,
    unreadCount,
    toasts,
    soundEnabled,
    setSoundEnabled,
    markRead,
    markAllRead,
    dismiss,
    dismissToast,
    clearAll,
    fetchNotifications,
  };
}
