import { db } from '@/lib/db';
import { notifications } from '@/lib/schema';
import { broadcastNotification, type NotificationEvent } from '@/lib/events';

type NotifyParams = Omit<NotificationEvent, 'id' | 'timestamp'>;

/**
 * Send a notification: persists to DB + broadcasts via SSE to all clients.
 * Use this from any API route to notify the user.
 */
export function notify(params: NotifyParams): NotificationEvent {
  // Ensure table exists
  try {
    const sqlite = (db as unknown as { $client: { exec: (s: string) => void } }).$client;
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY, type TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL,
        icon TEXT, href TEXT, agent_id TEXT, priority TEXT NOT NULL DEFAULT 'normal',
        read INTEGER NOT NULL DEFAULT 0, dismissed INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );
    `);
  } catch { /* ignore */ }

  // Broadcast via SSE (returns the full event with id + timestamp)
  const event = broadcastNotification(params);

  // Persist to DB
  try {
    db.insert(notifications).values({
      id: event.id,
      type: event.type,
      title: event.title,
      body: event.body,
      icon: event.icon || null,
      href: event.href || null,
      agentId: event.agentId || null,
      priority: event.priority || 'normal',
      read: 0,
      dismissed: 0,
      createdAt: new Date(event.timestamp),
    }).run();
  } catch { /* ignore duplicates */ }

  return event;
}
