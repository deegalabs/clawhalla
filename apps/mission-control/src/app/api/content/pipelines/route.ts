import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { contentPipelines } from '@/lib/schema';
import { eq, desc } from 'drizzle-orm';

function ensureTable() {
  const sqlite = (db as unknown as { $client: { exec: (s: string) => void } }).$client;
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS content_pipelines (
      id TEXT PRIMARY KEY, platform TEXT NOT NULL, topic TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      current_step INTEGER NOT NULL DEFAULT 0,
      steps TEXT NOT NULL,
      final_text TEXT, final_hashtags TEXT,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
  `);
}

// GET /api/content/pipelines — list pipelines
export async function GET(req: NextRequest) {
  try {
    ensureTable();
    const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') || '30'), 100);
    const pipelines = await db.select().from(contentPipelines)
      .orderBy(desc(contentPipelines.updatedAt))
      .limit(limit);

    // Parse steps JSON
    const parsed = pipelines.map(p => ({
      ...p,
      steps: p.steps ? JSON.parse(p.steps) : [],
    }));

    return NextResponse.json({ ok: true, pipelines: parsed });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}

// POST /api/content/pipelines — create or update a pipeline
export async function POST(req: NextRequest) {
  try {
    ensureTable();
    const body = await req.json();
    const { id, platform, topic, status, currentStep, steps, finalText, finalHashtags } = body;

    if (!platform || !topic) {
      return NextResponse.json({ ok: false, error: 'platform and topic required' }, { status: 400 });
    }

    const now = new Date();
    const pipelineId = id || `pipe_${crypto.randomUUID()}`;
    const stepsJson = typeof steps === 'string' ? steps : JSON.stringify(steps || []);

    const existing = id ? db.select().from(contentPipelines).where(eq(contentPipelines.id, id)).get() : null;

    if (existing) {
      db.update(contentPipelines).set({
        platform,
        topic,
        status: status || existing.status,
        currentStep: currentStep ?? existing.currentStep,
        steps: stepsJson,
        finalText: finalText ?? existing.finalText,
        finalHashtags: finalHashtags ?? existing.finalHashtags,
        updatedAt: now,
      }).where(eq(contentPipelines.id, id)).run();
    } else {
      await db.insert(contentPipelines).values({
        id: pipelineId,
        platform,
        topic,
        status: status || 'active',
        currentStep: currentStep || 0,
        steps: stepsJson,
        finalText: finalText || null,
        finalHashtags: finalHashtags || null,
        createdAt: now,
        updatedAt: now,
      });
    }

    return NextResponse.json({ ok: true, id: pipelineId });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}

// DELETE /api/content/pipelines?id=xxx — delete a pipeline
export async function DELETE(req: NextRequest) {
  try {
    ensureTable();
    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 });

    db.delete(contentPipelines).where(eq(contentPipelines.id, id)).run();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
