import { db } from '@/lib/db';
import { activities } from '@/lib/schema';
import { desc, eq, lt, and, sql } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth';
import { getSetting } from '@/lib/settings';

// Lazy auto-cleanup: prune old activities once per hour
let lastCleanup = 0;
function autoCleanup() {
  const now = Date.now();
  if (now - lastCleanup < 3600000) return; // 1 hour
  lastCleanup = now;
  const retentionDays = parseInt(getSetting('activity_retention_days', '30'));
  const cutoff = new Date(now - retentionDays * 86400000);
  try {
    const result = db.delete(activities).where(lt(activities.timestamp, cutoff)).run();
    if (result.changes > 0) console.log(`[activities] auto-cleanup: removed ${result.changes} entries older than ${retentionDays}d`);
  } catch {}
}

/**
 * GET /api/activities — list activities with filtering and pagination
 *
 * Query params:
 *   limit     — max results (default 20, max 100)
 *   offset    — skip N results for pagination
 *   agent_id  — filter by agent
 *   action    — filter by action type
 *   before    — ISO date, only activities before this date
 *   after     — ISO date, only activities after this date
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
  const offset = parseInt(url.searchParams.get('offset') || '0');
  const agentId = url.searchParams.get('agent_id');
  const action = url.searchParams.get('action');
  const before = url.searchParams.get('before');
  const after = url.searchParams.get('after');

  try {
    autoCleanup();

    const conditions = [];
    if (agentId) conditions.push(eq(activities.agentId, agentId));
    if (action) conditions.push(eq(activities.action, action));
    if (before) conditions.push(lt(activities.timestamp, new Date(before)));
    if (after) conditions.push(sql`${activities.timestamp} >= ${new Date(after)}`);

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const result = db.select().from(activities)
      .where(where)
      .orderBy(desc(activities.timestamp))
      .limit(limit)
      .offset(offset)
      .all();

    const total = db.select({ count: sql<number>`count(*)` }).from(activities).where(where).get()?.count || 0;

    return NextResponse.json({ ok: true, activities: result, total, limit, offset });
  } catch (error) {
    console.error('Activities error:', error);
    return NextResponse.json({ ok: false, error: 'Failed' }, { status: 500 });
  }
}

/**
 * POST /api/activities — create a new activity
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { agent_id, action, target, details } = body;

    if (!agent_id || !action) {
      return NextResponse.json({ ok: false, error: 'agent_id and action required' }, { status: 400 });
    }

    const validActions = [
      'task_started', 'task_completed', 'task_updated',
      'heartbeat_check',
      'approval_requested', 'approval_resolved',
      'file_created', 'file_updated',
      'session_started', 'session_ended',
      'chat_response', 'chat_error',
      'content_published', 'content_drafted',
    ];

    if (!validActions.includes(action)) {
      return NextResponse.json(
        { ok: false, error: `Invalid action. Valid: ${validActions.join(', ')}` },
        { status: 400 },
      );
    }

    const id = `act_${crypto.randomUUID()}`;

    await db.insert(activities).values({
      id,
      agentId: agent_id,
      action,
      target: target || null,
      details: details || null,
      timestamp: new Date(),
    });

    return NextResponse.json({ ok: true, id });
  } catch (error) {
    console.error('Activities POST error:', error);
    return NextResponse.json({ ok: false, error: 'Failed to log activity' }, { status: 500 });
  }
}

/**
 * DELETE /api/activities — cleanup activities
 *
 * Query params:
 *   before   — ISO date, delete activities older than this (required)
 *   agent_id — optional, only delete for this agent
 *   all      — if "true", delete ALL activities (ignores before/agent_id)
 *
 * Requires auth.
 */
export async function DELETE(req: NextRequest) {
  const auth = requireAuth(req);
  if (isAuthError(auth)) return auth;

  const url = new URL(req.url);
  const deleteAll = url.searchParams.get('all') === 'true';
  const before = url.searchParams.get('before');
  const agentId = url.searchParams.get('agent_id');

  if (!deleteAll && !before) {
    return NextResponse.json({ ok: false, error: 'Provide "before" date or "all=true"' }, { status: 400 });
  }

  try {
    let result;
    if (deleteAll) {
      result = db.delete(activities).run();
    } else {
      const conditions = [lt(activities.timestamp, new Date(before!))];
      if (agentId) conditions.push(eq(activities.agentId, agentId));
      result = db.delete(activities).where(and(...conditions)).run();
    }

    return NextResponse.json({ ok: true, deleted: result.changes });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
