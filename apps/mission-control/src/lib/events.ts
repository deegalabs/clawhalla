// Real-time event bus for SSE broadcasting
type Listener = (event: BoardEvent) => void;
type NotifListener = (event: NotificationEvent) => void;

export interface BoardEvent {
  type: string;
  boardId?: string;
  cardId?: string;
  by: string;
  data?: Record<string, unknown>;
  timestamp: number;
}

export interface NotificationEvent {
  id: string;
  type: 'chat' | 'approval' | 'task' | 'agent' | 'system' | 'autopilot';
  title: string;
  body: string;
  icon?: string; // emoji
  href?: string; // link to navigate to
  agentId?: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  sound?: boolean;
  timestamp: number;
}

const listeners = new Set<Listener>();
const notifListeners = new Set<NotifListener>();

export function broadcastBoardEvent(event: Omit<BoardEvent, 'timestamp'>) {
  const full: BoardEvent = { ...event, timestamp: Date.now() };
  for (const listener of listeners) {
    try { listener(full); } catch { /* ignore closed listeners */ }
  }
}

export function subscribeBoardEvents(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function broadcastNotification(event: Omit<NotificationEvent, 'id' | 'timestamp'>) {
  const full: NotificationEvent = {
    ...event,
    id: `notif_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: Date.now(),
  };
  for (const listener of notifListeners) {
    try { listener(full); } catch { /* ignore closed listeners */ }
  }
  return full;
}

export function subscribeNotifications(listener: NotifListener): () => void {
  notifListeners.add(listener);
  return () => notifListeners.delete(listener);
}
