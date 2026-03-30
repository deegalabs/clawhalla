import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { contentDrafts, activities } from '@/lib/schema';
import { eq, and, isNotNull } from 'drizzle-orm';
import { schedulePublish, cancelScheduled, getScheduledCount, getScheduledIds } from '@/lib/publish-scheduler';
import { notify } from '@/lib/notify';
import { syncDraftStatus } from '@/lib/board-sync';

/**
 * POST /api/content/schedule — schedule a draft for future publishing
 *
 * Body:
 *   draftId: string (required)
 *   scheduledAt: string (ISO 8601 date, required)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { draftId, scheduledAt } = body;

    if (!draftId) {
      return NextResponse.json({ ok: false, error: 'draftId required' }, { status: 400 });
    }
    if (!scheduledAt) {
      return NextResponse.json({ ok: false, error: 'scheduledAt required (ISO 8601 date)' }, { status: 400 });
    }

    const scheduledDate = new Date(scheduledAt);
    if (isNaN(scheduledDate.getTime())) {
      return NextResponse.json({ ok: false, error: 'Invalid date format for scheduledAt' }, { status: 400 });
    }

    const draft = db.select().from(contentDrafts).where(eq(contentDrafts.id, draftId)).get();
    if (!draft) {
      return NextResponse.json({ ok: false, error: 'Draft not found' }, { status: 404 });
    }

    // Only allow scheduling from certain statuses
    if (!['draft', 'review', 'approved', 'scheduled'].includes(draft.status)) {
      return NextResponse.json({
        ok: false,
        error: `Cannot schedule a draft with status '${draft.status}'. Must be draft, review, approved, or scheduled.`,
      }, { status: 400 });
    }

    const now = new Date();

    // Update draft in DB
    db.update(contentDrafts).set({
      status: 'scheduled',
      scheduledAt: scheduledDate,
      approvedAt: draft.approvedAt || now,
      updatedAt: now,
    }).where(eq(contentDrafts.id, draftId)).run();

    // Register the timer
    schedulePublish(draftId, scheduledDate);

    // Sync board card
    syncDraftStatus(draftId, 'scheduled').catch(() => {});

    // Log activity
    db.insert(activities).values({
      id: `act_${crypto.randomUUID()}`,
      agentId: 'daniel',
      action: 'content_scheduled',
      target: `Scheduled: ${draft.platform} — ${draft.title}`,
      details: `Scheduled for ${scheduledDate.toISOString()}`,
      timestamp: now,
    }).run();

    // Notify
    notify({
      type: 'agent',
      title: `Content scheduled: ${draft.platform}`,
      body: `"${draft.title}" scheduled for ${scheduledDate.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
      icon: '🕐',
      agentId: 'saga',
      priority: 'normal',
      href: '/content',
    });

    return NextResponse.json({
      ok: true,
      status: 'scheduled',
      scheduledAt: scheduledDate.toISOString(),
      message: `Draft scheduled for ${scheduledDate.toISOString()}`,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}

/**
 * GET /api/content/schedule — list all scheduled drafts
 */
export async function GET() {
  try {
    const scheduled = db.select().from(contentDrafts)
      .where(
        and(
          eq(contentDrafts.status, 'scheduled'),
          isNotNull(contentDrafts.scheduledAt)
        )
      )
      .all();

    const activeTimerIds = getScheduledIds();

    const drafts = scheduled.map(d => ({
      id: d.id,
      title: d.title,
      platform: d.platform,
      format: d.format,
      scheduledAt: d.scheduledAt instanceof Date ? d.scheduledAt.toISOString() : d.scheduledAt,
      hasActiveTimer: activeTimerIds.includes(d.id),
      createdAt: d.createdAt,
    }));

    return NextResponse.json({
      ok: true,
      drafts,
      count: drafts.length,
      activeTimers: getScheduledCount(),
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}

/**
 * DELETE /api/content/schedule — cancel a scheduled publish
 *
 * Body:
 *   draftId: string (required)
 */
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { draftId } = body;

    if (!draftId) {
      return NextResponse.json({ ok: false, error: 'draftId required' }, { status: 400 });
    }

    const draft = db.select().from(contentDrafts).where(eq(contentDrafts.id, draftId)).get();
    if (!draft) {
      return NextResponse.json({ ok: false, error: 'Draft not found' }, { status: 404 });
    }

    if (draft.status !== 'scheduled') {
      return NextResponse.json({
        ok: false,
        error: `Draft status is '${draft.status}', not 'scheduled'. Nothing to cancel.`,
      }, { status: 400 });
    }

    // Cancel the timer
    cancelScheduled(draftId);

    // Revert status to approved
    const now = new Date();
    db.update(contentDrafts).set({
      status: 'approved',
      scheduledAt: null,
      updatedAt: now,
    }).where(eq(contentDrafts.id, draftId)).run();

    // Sync board card
    syncDraftStatus(draftId, 'approved').catch(() => {});

    // Log activity
    db.insert(activities).values({
      id: `act_${crypto.randomUUID()}`,
      agentId: 'daniel',
      action: 'content_schedule_cancelled',
      target: `Cancelled schedule: ${draft.platform} — ${draft.title}`,
      details: null,
      timestamp: now,
    }).run();

    notify({
      type: 'system',
      title: `Schedule cancelled: ${draft.platform}`,
      body: `"${draft.title}" schedule cancelled. Status reverted to approved.`,
      icon: '🚫',
      agentId: 'saga',
      priority: 'normal',
      href: '/content',
    });

    return NextResponse.json({
      ok: true,
      status: 'approved',
      message: 'Scheduled publish cancelled. Draft reverted to approved.',
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
