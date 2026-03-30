import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { contentDrafts, activities, costEvents } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { publishContent, type PublishRequest } from '@/lib/content-publisher';
import { notify } from '@/lib/notify';

/**
 * POST /api/content/publish — publish a draft to its platform
 *
 * Body:
 *   draftId: string (required) — the draft to publish
 *   OR direct publish:
 *   platform: string, text: string, hashtags?: string, mediaUrls?: string[], format?: string
 *
 * The draft MUST have status 'approved' before publishing.
 * This is the final step — after human approval.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    let publishReq: PublishRequest;
    let draftId: string | null = body.draftId || null;

    if (draftId) {
      // Load draft
      const draft = db.select().from(contentDrafts).where(eq(contentDrafts.id, draftId)).get();
      if (!draft) {
        return NextResponse.json({ ok: false, error: 'Draft not found' }, { status: 404 });
      }

      if (draft.status !== 'approved') {
        return NextResponse.json({
          ok: false,
          error: `Draft must be approved before publishing. Current status: ${draft.status}`,
        }, { status: 400 });
      }

      // Parse media items
      let mediaUrls: string[] = [];
      if (draft.mediaItems) {
        try {
          const items = JSON.parse(draft.mediaItems);
          mediaUrls = items.map((m: { url: string }) => m.url);
        } catch { /* ignore */ }
      } else if (draft.mediaUrl) {
        mediaUrls = [draft.mediaUrl];
      }

      publishReq = {
        platform: draft.platform as PublishRequest['platform'],
        text: draft.content,
        hashtags: draft.hashtags || undefined,
        mediaUrls,
        format: draft.format || 'post',
      };
    } else {
      // Direct publish (must still have explicit approval flag)
      if (!body.approved) {
        return NextResponse.json({ ok: false, error: 'Explicit approval required. Set approved: true' }, { status: 400 });
      }
      if (!body.platform || !body.text) {
        return NextResponse.json({ ok: false, error: 'platform and text required' }, { status: 400 });
      }
      publishReq = {
        platform: body.platform,
        text: body.text,
        hashtags: body.hashtags,
        mediaUrls: body.mediaUrls,
        format: body.format,
        thread: body.thread,
      };
    }

    // Publish
    const result = await publishContent(publishReq);

    // Update draft status
    if (draftId) {
      db.update(contentDrafts).set({
        status: result.ok ? 'published' : 'approved', // revert to approved on failure
        publishedAt: result.ok ? new Date() : undefined,
        publishResult: JSON.stringify({
          ok: result.ok,
          postId: result.postId,
          postUrl: result.postUrl,
          error: result.error,
          publishedAt: result.ok ? new Date().toISOString() : undefined,
        }),
        updatedAt: new Date(),
      }).where(eq(contentDrafts.id, draftId)).run();
    }

    // Log activity
    try {
      db.insert(activities).values({
        id: `act_${crypto.randomUUID()}`,
        agentId: 'saga',
        action: result.ok ? 'content_published' : 'content_publish_failed',
        target: `${publishReq.platform}: ${publishReq.text.slice(0, 100)}`,
        details: result.ok
          ? `Published to ${publishReq.platform}. Post ID: ${result.postId}`
          : `Failed: ${result.error}`,
        timestamp: new Date(),
      }).run();
    } catch { /* ignore */ }

    // Notify
    notify({
      type: result.ok ? 'agent' : 'system',
      title: result.ok ? `Published to ${publishReq.platform}` : `Publish failed: ${publishReq.platform}`,
      body: result.ok
        ? `Content published successfully. ${result.postUrl || ''}`
        : `Error: ${result.error}`,
      icon: result.ok ? '📣' : '❌',
      agentId: 'saga',
      priority: result.ok ? 'normal' : 'high',
      href: '/content',
    });

    return NextResponse.json({
      ok: result.ok,
      platform: result.platform,
      postId: result.postId,
      postUrl: result.postUrl,
      error: result.error,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}

/**
 * GET /api/content/publish?platform=xxx — check if platform is connected
 */
export async function GET(req: NextRequest) {
  try {
    const platform = req.nextUrl.searchParams.get('platform');
    if (!platform) {
      // Check all platforms
      const { checkPlatformConnection } = await import('@/lib/content-publisher');
      const { PLATFORM_IDS } = await import('@/lib/platform-adapters');
      const results: Record<string, { connected: boolean; error?: string }> = {};
      for (const p of PLATFORM_IDS) {
        results[p] = await checkPlatformConnection(p);
      }
      return NextResponse.json({ ok: true, platforms: results });
    }

    const { checkPlatformConnection } = await import('@/lib/content-publisher');
    const result = await checkPlatformConnection(platform as PublishRequest['platform']);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
