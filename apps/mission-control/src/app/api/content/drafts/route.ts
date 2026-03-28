import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { contentDrafts } from '@/lib/schema';
import { eq, desc } from 'drizzle-orm';

function ensureTable() {
  const sqlite = (db as unknown as { $client: { exec: (s: string) => void } }).$client;
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS content_drafts (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL,
      platform TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft',
      hashtags TEXT, media_url TEXT,
      scheduled_at INTEGER, published_at INTEGER,
      agent_id TEXT, pipeline_id TEXT,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
  `);
}

// GET /api/content/drafts — list all drafts
export async function GET(req: NextRequest) {
  try {
    ensureTable();
    const status = req.nextUrl.searchParams.get('status');
    const limit = parseInt(req.nextUrl.searchParams.get('limit') || '50');

    const drafts = status
      ? await db.select().from(contentDrafts).where(eq(contentDrafts.status, status)).orderBy(desc(contentDrafts.updatedAt)).limit(limit)
      : await db.select().from(contentDrafts).orderBy(desc(contentDrafts.updatedAt)).limit(limit);
    return NextResponse.json({ ok: true, drafts });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}

// POST /api/content/drafts — create or update a draft
export async function POST(req: NextRequest) {
  try {
    ensureTable();
    const body = await req.json();
    const { id, platform, text, hashtags, imageUrl, scheduledFor, status, agentId, pipelineId } = body;

    if (!platform || !text) {
      return NextResponse.json({ ok: false, error: 'platform and text required' }, { status: 400 });
    }

    const now = new Date();
    const draftId = id || `draft_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

    const existing = id ? db.select().from(contentDrafts).where(eq(contentDrafts.id, id)).get() : null;

    if (existing) {
      db.update(contentDrafts).set({
        title: text.slice(0, 80),
        content: text,
        platform,
        status: status || existing.status,
        hashtags: hashtags || null,
        mediaUrl: imageUrl || null,
        scheduledAt: scheduledFor ? new Date(scheduledFor) : null,
        agentId: agentId || existing.agentId,
        pipelineId: pipelineId || existing.pipelineId,
        updatedAt: now,
      }).where(eq(contentDrafts.id, id)).run();
    } else {
      await db.insert(contentDrafts).values({
        id: draftId,
        title: text.slice(0, 80),
        content: text,
        platform,
        status: status || 'draft',
        hashtags: hashtags || null,
        mediaUrl: imageUrl || null,
        scheduledAt: scheduledFor ? new Date(scheduledFor) : null,
        agentId: agentId || null,
        pipelineId: pipelineId || null,
        createdAt: now,
        updatedAt: now,
      });
    }

    return NextResponse.json({ ok: true, id: draftId });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}

// DELETE /api/content/drafts?id=xxx — delete a draft
export async function DELETE(req: NextRequest) {
  try {
    ensureTable();
    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 });

    db.delete(contentDrafts).where(eq(contentDrafts.id, id)).run();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
