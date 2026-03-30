import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { contentDrafts, contentMedia, activities } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { notify } from '@/lib/notify';
import { getSetting } from '@/lib/settings';
import { syncDraftStatus } from '@/lib/board-sync';

/**
 * POST /api/content/approve — approve or correct a draft
 *
 * Body:
 *   draftId: string (required)
 *   action: 'approve' | 'correct' | 'reject'
 *   note?: string — correction feedback (required for 'correct')
 *   updatedText?: string — corrected text
 *   updatedHashtags?: string — corrected hashtags
 *   approveMedia?: boolean — also approve all media for this draft
 *
 * Flow:
 *   draft → review → [approve → approved] or [correct → back to agent → review]
 *   approved → ready to publish (via /api/content/publish)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { draftId, action, note, updatedText, updatedHashtags, approveMedia } = body;

    if (!draftId) {
      return NextResponse.json({ ok: false, error: 'draftId required' }, { status: 400 });
    }
    if (!['approve', 'correct', 'reject'].includes(action)) {
      return NextResponse.json({ ok: false, error: 'action must be approve, correct, or reject' }, { status: 400 });
    }

    const draft = db.select().from(contentDrafts).where(eq(contentDrafts.id, draftId)).get();
    if (!draft) {
      return NextResponse.json({ ok: false, error: 'Draft not found' }, { status: 404 });
    }

    const now = new Date();

    switch (action) {
      case 'approve': {
        const updates: Record<string, unknown> = {
          status: 'approved',
          approvedAt: now,
          updatedAt: now,
        };
        // Apply any last-minute corrections
        if (updatedText) updates.content = updatedText;
        if (updatedHashtags) updates.hashtags = updatedHashtags;

        db.update(contentDrafts).set(updates).where(eq(contentDrafts.id, draftId)).run();

        // Approve media if requested
        if (approveMedia) {
          db.update(contentMedia)
            .set({ approved: 1 })
            .where(eq(contentMedia.draftId, draftId))
            .run();
        }

        // Log
        db.insert(activities).values({
          id: `act_${crypto.randomUUID()}`,
          agentId: 'daniel',
          action: 'content_approved',
          target: `Approved: ${draft.platform} — ${draft.title}`,
          details: note || null,
          timestamp: now,
        }).run();

        // Notify agents
        notify({
          type: 'approval',
          title: `Content approved: ${draft.platform}`,
          body: `"${draft.title}" approved and ready to publish.${note ? ` Note: ${note}` : ''}`,
          icon: '✅',
          agentId: 'saga',
          priority: 'normal',
          href: '/content',
        });

        // Sync board card
        syncDraftStatus(draftId, 'approved').catch(() => {});

        // Send to Telegram
        await sendTelegramApprovalNotification(draft, 'approved', note);

        // Auto-publish if enabled
        const autoPublish = getSetting('auto_publish_on_approve', 'true');
        if (autoPublish === 'true') {
          try {
            const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
            const pubRes = await fetch(`${baseUrl}/api/content/publish`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ draftId }),
            });
            const pubData = await pubRes.json();

            if (pubData.ok) {
              return NextResponse.json({
                ok: true,
                status: 'published',
                message: `Draft approved and published to ${draft.platform}.`,
                postUrl: pubData.postUrl,
                postId: pubData.postId,
              });
            } else {
              // Approval succeeded but publish failed — report both
              return NextResponse.json({
                ok: true,
                status: 'approved',
                message: `Draft approved but auto-publish failed: ${pubData.error}`,
                publishError: pubData.error,
              });
            }
          } catch (pubError) {
            return NextResponse.json({
              ok: true,
              status: 'approved',
              message: `Draft approved but auto-publish error: ${String(pubError)}`,
              publishError: String(pubError),
            });
          }
        }

        return NextResponse.json({ ok: true, status: 'approved', message: 'Draft approved. Ready to publish.' });
      }

      case 'correct': {
        if (!note) {
          return NextResponse.json({ ok: false, error: 'note is required for corrections' }, { status: 400 });
        }

        const updates: Record<string, unknown> = {
          status: 'draft', // back to draft for agent to rework
          reviewNote: note,
          updatedAt: now,
        };
        if (updatedText) updates.content = updatedText;
        if (updatedHashtags) updates.hashtags = updatedHashtags;

        db.update(contentDrafts).set(updates).where(eq(contentDrafts.id, draftId)).run();

        // Log
        db.insert(activities).values({
          id: `act_${crypto.randomUUID()}`,
          agentId: 'daniel',
          action: 'content_corrected',
          target: `Correction: ${draft.platform} — ${draft.title}`,
          details: note,
          timestamp: now,
        }).run();

        // Notify agent to rework
        notify({
          type: 'task',
          title: `Correction requested: ${draft.platform}`,
          body: `Feedback: ${note}`,
          icon: '🔄',
          agentId: draft.agentId || 'bragi',
          priority: 'high',
          href: '/content',
        });

        // Sync board card (back to draft/ideas)
        syncDraftStatus(draftId, 'draft').catch(() => {});

        // Send to Telegram
        await sendTelegramApprovalNotification(draft, 'corrected', note);

        return NextResponse.json({ ok: true, status: 'draft', message: 'Correction sent. Agent will rework.' });
      }

      case 'reject': {
        db.update(contentDrafts).set({
          status: 'rejected' as string,
          reviewNote: note || 'Rejected',
          updatedAt: now,
        }).where(eq(contentDrafts.id, draftId)).run();

        db.insert(activities).values({
          id: `act_${crypto.randomUUID()}`,
          agentId: 'daniel',
          action: 'content_rejected',
          target: `Rejected: ${draft.platform} — ${draft.title}`,
          details: note || null,
          timestamp: now,
        }).run();

        notify({
          type: 'system',
          title: `Content rejected: ${draft.platform}`,
          body: note || 'Draft rejected.',
          icon: '❌',
          agentId: draft.agentId || 'bragi',
          priority: 'normal',
        });

        // Sync board card (rejected -> ideas)
        syncDraftStatus(draftId, 'rejected').catch(() => {});

        return NextResponse.json({ ok: true, status: 'rejected' });
      }
    }

    return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}

/**
 * GET /api/content/approve — list drafts pending review
 */
export async function GET() {
  try {
    const { inArray } = await import('drizzle-orm');
    const pending = db.select().from(contentDrafts)
      .where(inArray(contentDrafts.status, ['review', 'draft']))
      .all();

    return NextResponse.json({ ok: true, drafts: pending, count: pending.length });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}

/* ------------------------------------------------------------------ */
/*  Telegram notification for approval flow                            */
/* ------------------------------------------------------------------ */

async function sendTelegramApprovalNotification(
  draft: { id: string; title: string; content: string; platform: string; hashtags: string | null },
  action: 'approved' | 'corrected' | 'rejected',
  note?: string | null,
) {
  try {
    const { vault } = await import('@/lib/vault');
    const secret = await vault.get('TELEGRAM_BOT_TOKEN');
    const chatIdSecret = await vault.get('TELEGRAM_CHAT_ID');
    if (!secret?.value || !chatIdSecret?.value) return;

    const token = secret.value;
    const chatId = chatIdSecret.value;

    const statusEmoji = action === 'approved' ? '✅' : action === 'corrected' ? '🔄' : '❌';
    const statusLabel = action === 'approved' ? 'APROVADO' : action === 'corrected' ? 'CORREÇÃO' : 'REJEITADO';

    const message = [
      `${statusEmoji} *${statusLabel}* — ${draft.platform.toUpperCase()}`,
      '',
      `📝 ${escapeMarkdown(draft.title)}`,
      '',
      `${escapeMarkdown(draft.content.slice(0, 300))}${draft.content.length > 300 ? '...' : ''}`,
      draft.hashtags ? `\n🏷️ ${escapeMarkdown(draft.hashtags)}` : '',
      note ? `\n💬 Nota: _${escapeMarkdown(note)}_` : '',
    ].filter(Boolean).join('\n');

    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'Markdown',
      }),
    });
  } catch { /* Telegram notification is best-effort */ }
}

function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
}
