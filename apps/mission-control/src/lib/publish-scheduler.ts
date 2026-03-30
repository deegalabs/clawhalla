/**
 * Publish Scheduler — in-memory timer-based scheduler for content drafts.
 *
 * Uses setTimeout to fire publish at the scheduled time.
 * On module load, restores any 'scheduled' drafts from the database.
 *
 * Edge cases handled:
 * - Past dates: publish immediately
 * - Draft deleted before timer fires: handled gracefully in publishDraft
 * - MC restart: restoreScheduledDrafts runs on module load
 * - Cancel: removes pending timer and reverts status
 */

import { db } from './db';
import { contentDrafts, activities } from './schema';
import { eq, and, isNotNull } from 'drizzle-orm';
import { notify } from './notify';
import { syncDraftStatus } from './board-sync';

/* ------------------------------------------------------------------ */
/*  Timer registry                                                     */
/* ------------------------------------------------------------------ */

const timers = new Map<string, NodeJS.Timeout>();

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Schedule a draft for future publishing.
 * If a timer already exists for this draft, it is replaced.
 * If scheduledAt is in the past, publishes immediately.
 */
export function schedulePublish(draftId: string, scheduledAt: Date): void {
  // Cancel any existing timer for this draft
  cancelScheduled(draftId);

  const delayMs = scheduledAt.getTime() - Date.now();

  if (delayMs <= 0) {
    // Already past — publish immediately
    console.log(`[scheduler] Draft ${draftId} scheduled time is in the past — publishing now`);
    publishDraft(draftId);
    return;
  }

  const timer = setTimeout(() => {
    timers.delete(draftId);
    publishDraft(draftId);
  }, delayMs);

  // Prevent the timer from keeping the process alive
  if (timer.unref) timer.unref();

  timers.set(draftId, timer);
  console.log(
    `[scheduler] Draft ${draftId} scheduled for ${scheduledAt.toISOString()} (${Math.round(delayMs / 60000)}min from now)`
  );
}

/**
 * Cancel a pending scheduled publish.
 * Does NOT change the draft status — caller is responsible for that.
 */
export function cancelScheduled(draftId: string): boolean {
  const existing = timers.get(draftId);
  if (existing) {
    clearTimeout(existing);
    timers.delete(draftId);
    console.log(`[scheduler] Cancelled timer for draft ${draftId}`);
    return true;
  }
  return false;
}

/**
 * Returns the number of drafts with active timers.
 */
export function getScheduledCount(): number {
  return timers.size;
}

/**
 * Returns the set of draft IDs with active timers.
 */
export function getScheduledIds(): string[] {
  return Array.from(timers.keys());
}

/* ------------------------------------------------------------------ */
/*  Publish execution                                                  */
/* ------------------------------------------------------------------ */

async function publishDraft(draftId: string): Promise<void> {
  try {
    // Re-fetch draft to ensure it still exists and is still scheduled
    const draft = db
      .select()
      .from(contentDrafts)
      .where(eq(contentDrafts.id, draftId))
      .get();

    if (!draft) {
      console.log(`[scheduler] Draft ${draftId} no longer exists — skipping`);
      return;
    }

    if (draft.status !== 'scheduled') {
      console.log(
        `[scheduler] Draft ${draftId} status is '${draft.status}', not 'scheduled' — skipping`
      );
      return;
    }

    // Set status to approved so the publish endpoint accepts it
    db.update(contentDrafts)
      .set({ status: 'approved', updatedAt: new Date() })
      .where(eq(contentDrafts.id, draftId))
      .run();

    // Call the publish endpoint
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const res = await fetch(`${baseUrl}/api/content/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draftId }),
    });

    const data = await res.json();

    if (data.ok) {
      console.log(
        `[scheduler] Draft ${draftId} published successfully to ${draft.platform}. URL: ${data.postUrl || 'N/A'}`
      );

      // Log activity
      db.insert(activities)
        .values({
          id: `act_${crypto.randomUUID()}`,
          agentId: 'scheduler',
          action: 'content_scheduled_published',
          target: `Scheduled publish: ${draft.platform} — ${draft.title}`,
          details: `Published at scheduled time. Post URL: ${data.postUrl || 'N/A'}`,
          timestamp: new Date(),
        })
        .run();

      // Notify
      notify({
        type: 'agent',
        title: `Scheduled publish: ${draft.platform}`,
        body: `"${draft.title}" published on schedule. ${data.postUrl || ''}`,
        icon: '📣',
        agentId: 'saga',
        priority: 'normal',
        href: '/content',
      });

      // Send Telegram notification
      await sendScheduledPublishTelegram(draft, data.postUrl);
    } else {
      console.error(
        `[scheduler] Draft ${draftId} publish failed: ${data.error}`
      );

      // Revert to scheduled so user can retry
      db.update(contentDrafts)
        .set({
          status: 'approved',
          publishResult: JSON.stringify({ ok: false, error: data.error, scheduledPublishFailed: true }),
          updatedAt: new Date(),
        })
        .where(eq(contentDrafts.id, draftId))
        .run();

      notify({
        type: 'system',
        title: `Scheduled publish failed: ${draft.platform}`,
        body: `"${draft.title}" failed to publish: ${data.error}`,
        icon: '❌',
        agentId: 'saga',
        priority: 'high',
        href: '/content',
      });
    }
  } catch (error) {
    console.error(`[scheduler] Error publishing draft ${draftId}:`, error);

    // Try to revert status
    try {
      db.update(contentDrafts)
        .set({
          status: 'approved',
          publishResult: JSON.stringify({ ok: false, error: String(error), scheduledPublishFailed: true }),
          updatedAt: new Date(),
        })
        .where(eq(contentDrafts.id, draftId))
        .run();
    } catch { /* best effort */ }
  }
}

/* ------------------------------------------------------------------ */
/*  Restore on startup                                                 */
/* ------------------------------------------------------------------ */

/**
 * Query the database for drafts with status='scheduled' and scheduledAt set,
 * then re-register timers for each. Called automatically on module load.
 */
export function restoreScheduledDrafts(): void {
  try {
    const scheduled = db
      .select()
      .from(contentDrafts)
      .where(
        and(
          eq(contentDrafts.status, 'scheduled'),
          isNotNull(contentDrafts.scheduledAt)
        )
      )
      .all();

    if (scheduled.length === 0) {
      console.log('[scheduler] No scheduled drafts to restore');
      return;
    }

    console.log(`[scheduler] Restoring ${scheduled.length} scheduled draft(s)`);

    for (const draft of scheduled) {
      if (draft.scheduledAt) {
        const scheduledDate =
          draft.scheduledAt instanceof Date
            ? draft.scheduledAt
            : new Date(draft.scheduledAt);
        schedulePublish(draft.id, scheduledDate);
      }
    }
  } catch (error) {
    console.error('[scheduler] Failed to restore scheduled drafts:', error);
  }
}

// Auto-restore on module load
restoreScheduledDrafts();

/* ------------------------------------------------------------------ */
/*  Telegram notification for scheduled publish                        */
/* ------------------------------------------------------------------ */

async function sendScheduledPublishTelegram(
  draft: { id: string; title: string; platform: string },
  postUrl?: string
): Promise<void> {
  try {
    const { vault } = await import('./vault');
    const secret = await vault.get('TELEGRAM_BOT_TOKEN');
    const chatIdSecret = await vault.get('TELEGRAM_CHAT_ID');
    if (!secret?.value || !chatIdSecret?.value) return;

    const token = secret.value;
    const chatId = chatIdSecret.value;

    const message = [
      `📣 *PUBLICADO (AGENDADO)* -- ${draft.platform.toUpperCase()}`,
      '',
      `${draft.title}`,
      '',
      postUrl ? `Link: ${postUrl}` : 'Published successfully',
    ].join('\n');

    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'Markdown',
      }),
    });
  } catch { /* best effort */ }
}
