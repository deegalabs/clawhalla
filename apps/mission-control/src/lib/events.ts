// Real-time event bus for SSE broadcasting
type Listener = (event: BoardEvent) => void;

export interface BoardEvent {
  type: string;
  boardId?: string;
  cardId?: string;
  by: string;
  data?: Record<string, unknown>;
  timestamp: number;
}

const listeners = new Set<Listener>();

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
