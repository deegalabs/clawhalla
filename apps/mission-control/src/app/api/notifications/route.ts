import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { notifications } from '@/lib/schema';
import { eq, desc, and, sql } from 'drizzle-orm';
import { notify } from '@/lib/notify';

function ensureTable() {
  const sqlite = (db as unknown as { $client: { exec: (s: string) => void } }).$client;
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY, type TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL,
      icon TEXT, href TEXT, agent_id TEXT, priority TEXT NOT NULL DEFAULT 'normal',
      read INTEGER NOT NULL DEFAULT 0, dismissed INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
  `);
}

// GET /api/notifications — list notifications (newest first)
export async function GET(req: NextRequest) {
  try {
    ensureTable();
    const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') || '50'), 100);
    const unreadOnly = req.nextUrl.searchParams.get('unread') === 'true';

    const where = unreadOnly
      ? and(eq(notifications.read, 0), eq(notifications.dismissed, 0))
      : eq(notifications.dismissed, 0);

    const items = await db.select().from(notifications)
      .where(where)
      .orderBy(desc(notifications.createdAt))
      .limit(limit);

    const unreadCount = db.select({ count: sql<number>`count(*)` })
      .from(notifications)
      .where(and(eq(notifications.read, 0), eq(notifications.dismissed, 0)))
      .get();

    return NextResponse.json({
      ok: true,
      notifications: items,
      unreadCount: unreadCount?.count || 0,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}

// POST /api/notifications — create a notification, persist to DB, and broadcast via SSE
export async function POST(req: NextRequest) {
  try {
    ensureTable();
    const body = await req.json();
    const { type, title, body: notifBody, icon, href, agentId, priority } = body;

    if (!type || !title || !notifBody) {
      return NextResponse.json({ ok: false, error: 'type, title, body required' }, { status: 400 });
    }

    const event = notify({
      type, title, body: notifBody,
      icon, href, agentId,
      priority: priority || 'normal',
      sound: priority === 'high' || priority === 'urgent',
    });

    return NextResponse.json({ ok: true, id: event.id });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}

// PATCH /api/notifications — mark as read or dismiss
export async function PATCH(req: NextRequest) {
  try {
    ensureTable();
    const body = await req.json();
    const { id, ids, action } = body;

    if (action === 'read_all') {
      db.update(notifications).set({ read: 1 })
        .where(eq(notifications.read, 0)).run();
      return NextResponse.json({ ok: true });
    }

    if (action === 'dismiss_all') {
      db.update(notifications).set({ dismissed: 1 })
        .where(eq(notifications.dismissed, 0)).run();
      return NextResponse.json({ ok: true });
    }

    const targetIds: string[] = ids || (id ? [id] : []);
    if (targetIds.length === 0) {
      return NextResponse.json({ ok: false, error: 'id or ids required' }, { status: 400 });
    }

    for (const targetId of targetIds) {
      if (action === 'dismiss') {
        db.update(notifications).set({ dismissed: 1 }).where(eq(notifications.id, targetId)).run();
      } else {
        db.update(notifications).set({ read: 1 }).where(eq(notifications.id, targetId)).run();
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
