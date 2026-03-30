import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { contentDrafts, contentMedia, activities } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { vault } from '@/lib/vault';
import { notify } from '@/lib/notify';
import { getSetting } from '@/lib/settings';
import { syncDraftStatus } from '@/lib/board-sync';
import { schedulePublish, cancelScheduled, getScheduledCount } from '@/lib/publish-scheduler';

/**
 * POST /api/telegram/webhook — Telegram Bot webhook handler
 *
 * Handles:
 * - Callback queries (inline button clicks for approve/reject/correct)
 * - Messages with media (user uploads images/videos for content)
 * - Text commands (/approve, /reject, /status)
 *
 * Setup: Set webhook via Telegram API:
 * curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<YOUR_DOMAIN>/api/telegram/webhook"
 */
export async function POST(req: NextRequest) {
  try {
    const update = await req.json();

    // Handle callback queries (inline button clicks)
    if (update.callback_query) {
      return handleCallbackQuery(update.callback_query);
    }

    // Handle messages
    if (update.message) {
      return handleMessage(update.message);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[telegram-webhook] error:', error);
    return NextResponse.json({ ok: true }); // Always return 200 to Telegram
  }
}

/* ------------------------------------------------------------------ */
/*  Callback query handler — inline button clicks                      */
/* ------------------------------------------------------------------ */

async function handleCallbackQuery(query: {
  id: string;
  data: string;
  message: { chat: { id: number }; message_id: number };
  from: { id: number; first_name: string };
}) {
  const token = await getBotToken();
  if (!token) return NextResponse.json({ ok: true });

  const [action, draftId] = query.data.split(':');
  const chatId = query.message.chat.id;

  // Verify authorized user
  const authorizedChatId = await vault.get('TELEGRAM_CHAT_ID');
  if (authorizedChatId?.value && String(chatId) !== authorizedChatId.value) {
    await answerCallback(token, query.id, 'Not authorized');
    return NextResponse.json({ ok: true });
  }

  if (!draftId) {
    await answerCallback(token, query.id, 'Invalid action');
    return NextResponse.json({ ok: true });
  }

  const draft = db.select().from(contentDrafts).where(eq(contentDrafts.id, draftId)).get();
  if (!draft) {
    await answerCallback(token, query.id, 'Draft not found');
    return NextResponse.json({ ok: true });
  }

  const now = new Date();

  switch (action) {
    case 'approve': {
      db.update(contentDrafts).set({
        status: 'approved',
        approvedAt: now,
        updatedAt: now,
      }).where(eq(contentDrafts.id, draftId)).run();

      // Approve all media
      db.update(contentMedia)
        .set({ approved: 1 })
        .where(eq(contentMedia.draftId, draftId))
        .run();

      db.insert(activities).values({
        id: `act_${crypto.randomUUID()}`,
        agentId: 'daniel',
        action: 'content_approved',
        target: `Approved via Telegram: ${draft.platform} — ${draft.title}`,
        details: null,
        timestamp: now,
      }).run();

      notify({
        type: 'approval',
        title: `Content approved: ${draft.platform}`,
        body: `"${draft.title}" approved via Telegram. Ready to publish.`,
        icon: '✅',
        agentId: 'saga',
        priority: 'normal',
        href: '/content',
      });

      // Sync board card
      syncDraftStatus(draftId, 'approved').catch(() => {});

      // Auto-publish if enabled
      const autoPublish = getSetting('auto_publish_on_approve', 'true');
      if (autoPublish === 'true') {
        await answerCallback(token, query.id, '✅ Approved — publishing...');
        try {
          const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
          const pubRes = await fetch(`${baseUrl}/api/content/publish`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ draftId }),
          });
          const pubData = await pubRes.json();

          if (pubData.ok) {
            await editMessage(token, chatId, query.message.message_id,
              `📣 *APROVADO E PUBLICADO* — ${draft.platform.toUpperCase()}\n\n${draft.title}\n\n🔗 ${pubData.postUrl || 'Published successfully'}\n\n_Approved by ${query.from.first_name}_`
            );
          } else {
            await editMessage(token, chatId, query.message.message_id,
              `✅ *APROVADO* — ${draft.platform.toUpperCase()}\n\n${draft.title}\n\n⚠️ Auto-publish failed: ${pubData.error || 'Unknown error'}\n_Use the publish button to retry._\n\n_Approved by ${query.from.first_name}_`
            );
          }
        } catch (pubError) {
          await editMessage(token, chatId, query.message.message_id,
            `✅ *APROVADO* — ${draft.platform.toUpperCase()}\n\n${draft.title}\n\n⚠️ Auto-publish error: ${String(pubError)}\n_Use the publish button to retry._\n\n_Approved by ${query.from.first_name}_`
          );
        }
      } else {
        await answerCallback(token, query.id, '✅ Approved!');
        await editMessage(token, chatId, query.message.message_id,
          `✅ *APROVADO* — ${draft.platform.toUpperCase()}\n\n${draft.title}\n\n_Approved by ${query.from.first_name}_`
        );
      }
      break;
    }

    case 'reject': {
      db.update(contentDrafts).set({
        status: 'rejected' as string,
        reviewNote: 'Rejected via Telegram',
        updatedAt: now,
      }).where(eq(contentDrafts.id, draftId)).run();

      db.insert(activities).values({
        id: `act_${crypto.randomUUID()}`,
        agentId: 'daniel',
        action: 'content_rejected',
        target: `Rejected via Telegram: ${draft.platform} — ${draft.title}`,
        details: null,
        timestamp: now,
      }).run();

      // Sync board card
      syncDraftStatus(draftId, 'rejected').catch(() => {});

      await answerCallback(token, query.id, '❌ Rejected');
      await editMessage(token, chatId, query.message.message_id,
        `❌ *REJEITADO* — ${draft.platform.toUpperCase()}\n\n${draft.title}\n\n_Rejected by ${query.from.first_name}_`
      );
      break;
    }

    case 'correct': {
      db.update(contentDrafts).set({
        status: 'draft',
        reviewNote: 'Correction requested via Telegram — reply with feedback',
        updatedAt: now,
      }).where(eq(contentDrafts.id, draftId)).run();

      // Sync board card (back to draft/ideas)
      syncDraftStatus(draftId, 'draft').catch(() => {});

      // Store the draft ID so the next message is treated as correction feedback
      await vault.set(`_telegram_pending_correction`, draftId, { category: 'system', description: 'Pending correction draft ID' });

      await answerCallback(token, query.id, '🔄 Send your correction as next message');
      await sendMessage(token, chatId,
        `🔄 *CORREÇÃO* — ${draft.platform.toUpperCase()}\n\nEnvie sua correção como próxima mensagem.\nO agente ${draft.agentId || 'bragi'} vai refazer com base no seu feedback.`
      );
      break;
    }

    case 'publish': {
      if (draft.status !== 'approved') {
        await answerCallback(token, query.id, '⚠️ Approve first');
        return NextResponse.json({ ok: true });
      }

      // Trigger publish
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
      const pubRes = await fetch(`${baseUrl}/api/content/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftId }),
      });
      const pubData = await pubRes.json();

      if (pubData.ok) {
        await answerCallback(token, query.id, '📣 Published!');
        await editMessage(token, chatId, query.message.message_id,
          `📣 *PUBLICADO* — ${draft.platform.toUpperCase()}\n\n${draft.title}\n\n🔗 ${pubData.postUrl || 'Published successfully'}`
        );
      } else {
        await answerCallback(token, query.id, `❌ ${pubData.error?.slice(0, 40)}`);
        await sendMessage(token, chatId, `❌ Publish failed: ${pubData.error}`);
      }
      break;
    }

    case 'schedule': {
      // Schedule callback format: schedule:{draftId}:{minutesFromNow}
      // The third segment (after the second colon) is minutes from now
      const parts = query.data.split(':');
      const minutesStr = parts[2];
      const minutes = minutesStr ? parseInt(minutesStr, 10) : NaN;

      if (isNaN(minutes) || minutes <= 0) {
        await answerCallback(token, query.id, 'Invalid schedule time');
        return NextResponse.json({ ok: true });
      }

      const scheduledAt = new Date(Date.now() + minutes * 60 * 1000);

      // Update draft status to scheduled
      db.update(contentDrafts).set({
        status: 'scheduled',
        scheduledAt,
        approvedAt: draft.approvedAt || now,
        updatedAt: now,
      }).where(eq(contentDrafts.id, draftId)).run();

      // Approve all media
      db.update(contentMedia)
        .set({ approved: 1 })
        .where(eq(contentMedia.draftId, draftId))
        .run();

      // Register timer
      schedulePublish(draftId, scheduledAt);

      // Sync board
      syncDraftStatus(draftId, 'scheduled').catch(() => {});

      db.insert(activities).values({
        id: `act_${crypto.randomUUID()}`,
        agentId: 'daniel',
        action: 'content_scheduled',
        target: `Scheduled via Telegram: ${draft.platform} — ${draft.title}`,
        details: `Scheduled for ${scheduledAt.toISOString()}`,
        timestamp: now,
      }).run();

      const timeLabel = minutes >= 60
        ? `${Math.floor(minutes / 60)}h${minutes % 60 > 0 ? `${minutes % 60}min` : ''}`
        : `${minutes}min`;

      await answerCallback(token, query.id, `🕐 Scheduled in ${timeLabel}`);
      await editMessage(token, chatId, query.message.message_id,
        `🕐 *AGENDADO* -- ${draft.platform.toUpperCase()}\n\n${draft.title}\n\nPublicacao em ${timeLabel} (${scheduledAt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })})\n\n_Scheduled by ${query.from.first_name}_`
      );
      break;
    }

    default:
      await answerCallback(token, query.id, 'Unknown action');
  }

  return NextResponse.json({ ok: true });
}

/* ------------------------------------------------------------------ */
/*  Message handler — user uploads or correction feedback              */
/* ------------------------------------------------------------------ */

async function handleMessage(message: {
  chat: { id: number };
  from: { id: number; first_name: string };
  text?: string;
  photo?: Array<{ file_id: string; file_unique_id: string; width: number; height: number }>;
  video?: { file_id: string; file_unique_id: string; duration: number; width: number; height: number };
  document?: { file_id: string; file_name: string; mime_type: string };
  caption?: string;
}) {
  const token = await getBotToken();
  if (!token) return NextResponse.json({ ok: true });

  const chatId = message.chat.id;

  // Check if there's a pending correction
  const pendingCorrection = await vault.get('_telegram_pending_correction');
  if (pendingCorrection?.value && message.text) {
    const draftId = pendingCorrection.value;
    const draft = db.select().from(contentDrafts).where(eq(contentDrafts.id, draftId)).get();

    if (draft) {
      db.update(contentDrafts).set({
        reviewNote: message.text,
        updatedAt: new Date(),
      }).where(eq(contentDrafts.id, draftId)).run();

      db.insert(activities).values({
        id: `act_${crypto.randomUUID()}`,
        agentId: 'daniel',
        action: 'content_corrected',
        target: `Correction via Telegram: ${draft.platform} — ${draft.title}`,
        details: message.text,
        timestamp: new Date(),
      }).run();

      notify({
        type: 'task',
        title: `Correction: ${draft.platform}`,
        body: `Feedback via Telegram: ${message.text}`,
        icon: '🔄',
        agentId: draft.agentId || 'bragi',
        priority: 'high',
        href: '/content',
      });

      await vault.delete('_telegram_pending_correction');
      await sendMessage(token, chatId, `✅ Correção enviada para o agente ${draft.agentId || 'bragi'}.\n\n_"${message.text}"_`);
    }
    return NextResponse.json({ ok: true });
  }

  // Handle media uploads — user sending images/videos for content
  if (message.photo || message.video || message.document) {
    const fileId = message.photo
      ? message.photo[message.photo.length - 1].file_id  // largest resolution
      : message.video?.file_id || message.document?.file_id;

    if (!fileId) {
      await sendMessage(token, chatId, '⚠️ Could not process media');
      return NextResponse.json({ ok: true });
    }

    // Download file from Telegram
    const fileInfo = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
    const fileData = await fileInfo.json();
    if (!fileData.ok || !fileData.result?.file_path) {
      await sendMessage(token, chatId, '⚠️ Could not download file from Telegram');
      return NextResponse.json({ ok: true });
    }

    const fileUrl = `https://api.telegram.org/file/bot${token}/${fileData.result.file_path}`;

    // Upload to our media system
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const downloadRes = await fetch(fileUrl);
    const fileBuffer = Buffer.from(await downloadRes.arrayBuffer());
    const base64 = fileBuffer.toString('base64');

    const mimeType = message.video ? 'video/mp4'
      : message.document?.mime_type || 'image/jpeg';
    const filename = message.document?.file_name
      || `telegram_${Date.now()}.${mimeType.split('/')[1] || 'jpg'}`;

    const uploadRes = await fetch(`${baseUrl}/api/content/media/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file: base64,
        filename,
        mimeType,
        type: message.video ? 'video' : 'image',
      }),
    });
    const uploadData = await uploadRes.json();

    if (uploadData.ok) {
      const caption = message.caption || '';
      await sendMessage(token, chatId,
        `✅ Mídia recebida e salva!\n📎 ${filename}\n${caption ? `📝 "${caption}"` : ''}\n\nUse no Content Studio para criar posts.`
      );

      notify({
        type: 'agent',
        title: 'Media received via Telegram',
        body: `${filename} uploaded. ${caption || 'No caption.'}`,
        icon: message.video ? '🎬' : '🖼️',
        agentId: 'daniel',
        priority: 'normal',
        href: '/content',
      });
    } else {
      await sendMessage(token, chatId, `❌ Upload failed: ${uploadData.error}`);
    }

    return NextResponse.json({ ok: true });
  }

  // Handle text commands
  if (message.text?.startsWith('/')) {
    const [cmd] = message.text.split(' ');
    switch (cmd) {
      case '/status': {
        const { inArray } = await import('drizzle-orm');
        const pending = db.select().from(contentDrafts)
          .where(inArray(contentDrafts.status, ['review', 'draft']))
          .all();
        const approved = db.select().from(contentDrafts)
          .where(eq(contentDrafts.status, 'approved'))
          .all();
        const scheduled = db.select().from(contentDrafts)
          .where(eq(contentDrafts.status, 'scheduled'))
          .all();

        const scheduledLines = scheduled.slice(0, 5).map(d => {
          const when = d.scheduledAt
            ? (d.scheduledAt instanceof Date ? d.scheduledAt : new Date(d.scheduledAt as unknown as string))
                .toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
            : '?';
          return `• ${d.platform} — ${d.title?.slice(0, 40)} (${when})`;
        }).join('\n');

        await sendMessage(token, chatId,
          `*Content Status*\n\n` +
          `Pending review: ${pending.length}\n` +
          `Approved: ${approved.length}\n` +
          `Scheduled: ${scheduled.length} (${getScheduledCount()} timers)\n\n` +
          (pending.length > 0 ? `*Pending:*\n${pending.slice(0, 5).map(d => `• ${d.platform} — ${d.title?.slice(0, 50)}`).join('\n')}\n\n` : '') +
          (scheduled.length > 0 ? `*Scheduled:*\n${scheduledLines}` : '')
        );
        break;
      }
      default:
        await sendMessage(token, chatId, 'Commands: /status');
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true });
}

/* ------------------------------------------------------------------ */
/*  Send content preview to Telegram for approval                      */
/* ------------------------------------------------------------------ */

export async function sendContentForApproval(draftId: string) {
  const token = await getBotToken();
  const chatIdSecret = await vault.get('TELEGRAM_CHAT_ID');
  if (!token || !chatIdSecret?.value) return;

  const chatId = chatIdSecret.value;

  const draft = db.select().from(contentDrafts).where(eq(contentDrafts.id, draftId)).get();
  if (!draft) return;

  // Get media
  const media = db.select().from(contentMedia)
    .where(eq(contentMedia.draftId, draftId))
    .all();

  // Build preview message
  const platformEmoji: Record<string, string> = {
    linkedin: '💼', twitter: '𝕏', instagram: '📸', blog: '📝', newsletter: '📧',
  };

  const preview = [
    `${platformEmoji[draft.platform] || '📋'} *REVIEW* — ${draft.platform.toUpperCase()}`,
    draft.format !== 'post' ? `📐 Format: ${draft.format}` : '',
    '',
    draft.content.slice(0, 800),
    draft.content.length > 800 ? '...' : '',
    draft.hashtags ? `\n🏷️ ${draft.hashtags}` : '',
    media.length > 0 ? `\n📎 ${media.length} media attached` : '',
    '',
    `🤖 Created by: ${draft.agentId || 'agent'}`,
  ].filter(Boolean).join('\n');

  // Send media preview first if available
  for (const m of media.slice(0, 4)) {
    if (m.type === 'image' && m.url) {
      try {
        const imgUrl = m.url.startsWith('http') ? m.url : `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}${m.url}`;
        await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            photo: imgUrl,
            caption: m.caption || m.alt || '',
          }),
        });
      } catch { /* best effort */ }
    }
  }

  // Send text with inline approval buttons
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: preview,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Aprovar', callback_data: `approve:${draftId}` },
            { text: '🔄 Corrigir', callback_data: `correct:${draftId}` },
            { text: '❌ Rejeitar', callback_data: `reject:${draftId}` },
          ],
          [
            { text: '📣 Aprovar e Publicar', callback_data: `publish:${draftId}` },
          ],
          [
            { text: '🕐 30min', callback_data: `schedule:${draftId}:30` },
            { text: '🕐 1h', callback_data: `schedule:${draftId}:60` },
            { text: '🕐 3h', callback_data: `schedule:${draftId}:180` },
            { text: '🕐 24h', callback_data: `schedule:${draftId}:1440` },
          ],
        ],
      },
    }),
  });
}

/* ------------------------------------------------------------------ */
/*  Telegram API helpers                                               */
/* ------------------------------------------------------------------ */

async function getBotToken(): Promise<string | null> {
  const secret = await vault.get('TELEGRAM_BOT_TOKEN');
  return secret?.value || null;
}

async function sendMessage(token: string, chatId: number | string, text: string) {
  return fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  });
}

async function editMessage(token: string, chatId: number | string, messageId: number, text: string) {
  return fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId, text, parse_mode: 'Markdown' }),
  });
}

async function answerCallback(token: string, callbackQueryId: string, text: string) {
  return fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
  });
}
