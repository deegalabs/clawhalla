import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { contentMedia } from '@/lib/schema';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads', 'content');
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

function ensureTable() {
  const sqlite = (db as unknown as { $client: { exec: (s: string) => void } }).$client;
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS content_media (
      id TEXT PRIMARY KEY, draft_id TEXT, pipeline_id TEXT,
      type TEXT NOT NULL, source TEXT NOT NULL, url TEXT NOT NULL,
      thumbnail_url TEXT, alt TEXT, caption TEXT, mime_type TEXT,
      width INTEGER, height INTEGER, size_bytes INTEGER,
      sort_order INTEGER DEFAULT 0, source_query TEXT, source_credit TEXT,
      approved INTEGER DEFAULT 0, created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_content_media_draft ON content_media(draft_id);
    CREATE INDEX IF NOT EXISTS idx_content_media_pipeline ON content_media(pipeline_id);
  `);
}

/**
 * POST /api/content/media/upload — upload a file (base64 or multipart)
 *
 * Body (JSON):
 *   file: base64 string (data:image/png;base64,... or raw base64)
 *   filename: original filename
 *   type: image | video | carousel_slide | thumbnail
 *   draftId?: link to draft
 *   pipelineId?: link to pipeline
 *   alt?: alt text
 *   caption?: carousel caption
 *   sortOrder?: slide order
 *
 * OR multipart/form-data with 'file' field
 */
export async function POST(req: NextRequest) {
  try {
    ensureTable();

    // Ensure upload directory exists
    if (!existsSync(UPLOAD_DIR)) {
      await mkdir(UPLOAD_DIR, { recursive: true });
    }

    const contentType = req.headers.get('content-type') || '';
    let fileBuffer: Buffer;
    let filename: string;
    let mimeType: string;
    let meta: Record<string, string | number | undefined> = {};

    if (contentType.includes('multipart/form-data')) {
      // Handle multipart upload
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      if (!file) {
        return NextResponse.json({ ok: false, error: 'No file provided' }, { status: 400 });
      }
      fileBuffer = Buffer.from(await file.arrayBuffer());
      filename = file.name;
      mimeType = file.type;
      meta = {
        type: (formData.get('type') as string) || 'image',
        draftId: (formData.get('draftId') as string) || undefined,
        pipelineId: (formData.get('pipelineId') as string) || undefined,
        alt: (formData.get('alt') as string) || undefined,
        caption: (formData.get('caption') as string) || undefined,
        sortOrder: parseInt((formData.get('sortOrder') as string) || '0'),
      };
    } else {
      // Handle JSON with base64
      const body = await req.json();
      if (!body.file) {
        return NextResponse.json({ ok: false, error: 'No file data provided' }, { status: 400 });
      }

      // Strip data URL prefix if present
      let base64 = body.file;
      mimeType = body.mimeType || 'image/jpeg';
      const dataUrlMatch = base64.match(/^data:([^;]+);base64,(.+)$/);
      if (dataUrlMatch) {
        mimeType = dataUrlMatch[1];
        base64 = dataUrlMatch[2];
      }

      fileBuffer = Buffer.from(base64, 'base64');
      filename = body.filename || `upload_${Date.now()}.${mimeType.split('/')[1] || 'jpg'}`;
      meta = {
        type: body.type || 'image',
        draftId: body.draftId,
        pipelineId: body.pipelineId,
        alt: body.alt,
        caption: body.caption,
        sortOrder: body.sortOrder || 0,
      };
    }

    // Validate size
    if (fileBuffer.length > MAX_FILE_SIZE) {
      return NextResponse.json({ ok: false, error: `File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)` }, { status: 400 });
    }

    // Generate unique filename
    const ext = path.extname(filename) || `.${mimeType.split('/')[1] || 'jpg'}`;
    const uniqueName = `${Date.now()}_${crypto.randomUUID().slice(0, 8)}${ext}`;
    const filePath = path.join(UPLOAD_DIR, uniqueName);

    // Write file
    await writeFile(filePath, fileBuffer);

    // URL relative to public
    const url = `/uploads/content/${uniqueName}`;

    // Save to DB
    const mediaId = `media_${crypto.randomUUID()}`;
    db.insert(contentMedia).values({
      id: mediaId,
      draftId: (meta.draftId as string) || null,
      pipelineId: (meta.pipelineId as string) || null,
      type: (meta.type as string) || 'image',
      source: 'upload',
      url,
      alt: (meta.alt as string) || null,
      caption: (meta.caption as string) || null,
      mimeType,
      sizeBytes: fileBuffer.length,
      sortOrder: (meta.sortOrder as number) || 0,
      approved: 0,
      createdAt: new Date(),
    }).run();

    return NextResponse.json({
      ok: true,
      media: {
        id: mediaId,
        url,
        type: meta.type,
        mimeType,
        sizeBytes: fileBuffer.length,
        filename: uniqueName,
      },
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}

/**
 * GET /api/content/media/upload?draftId=xxx — list media for a draft
 */
export async function GET(req: NextRequest) {
  try {
    ensureTable();
    const draftId = req.nextUrl.searchParams.get('draftId');
    const pipelineId = req.nextUrl.searchParams.get('pipelineId');

    const { eq, desc } = await import('drizzle-orm');

    let items;
    if (draftId) {
      items = db.select().from(contentMedia).where(eq(contentMedia.draftId, draftId)).all();
    } else if (pipelineId) {
      items = db.select().from(contentMedia).where(eq(contentMedia.pipelineId, pipelineId)).all();
    } else {
      items = db.select().from(contentMedia).orderBy(desc(contentMedia.createdAt)).limit(50).all();
    }

    return NextResponse.json({ ok: true, media: items });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}

/**
 * DELETE /api/content/media/upload?id=xxx — delete a media item
 */
export async function DELETE(req: NextRequest) {
  try {
    ensureTable();
    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 });

    const { eq } = await import('drizzle-orm');

    // Get the file path before deleting
    const item = db.select().from(contentMedia).where(eq(contentMedia.id, id)).get();
    if (item && item.source === 'upload' && item.url.startsWith('/uploads/')) {
      const filePath = path.join(process.cwd(), 'public', item.url);
      try {
        const { unlink } = await import('fs/promises');
        await unlink(filePath);
      } catch { /* file may already be gone */ }
    }

    db.delete(contentMedia).where(eq(contentMedia.id, id)).run();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
