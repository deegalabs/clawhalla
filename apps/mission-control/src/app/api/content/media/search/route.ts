import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { contentMedia } from '@/lib/schema';
import { vault } from '@/lib/vault';

/**
 * GET /api/content/media/search — search for images on the web
 *
 * Query params:
 *   q: search query (required)
 *   page: page number (default 1)
 *   perPage: results per page (default 12, max 30)
 *   source: unsplash | pexels (default: tries both)
 *
 * Uses Unsplash and/or Pexels free APIs for royalty-free images.
 * Falls back to agent-powered search if no API keys configured.
 */
export async function GET(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams.get('q');
    if (!q) {
      return NextResponse.json({ ok: false, error: 'q (query) is required' }, { status: 400 });
    }

    const page = parseInt(req.nextUrl.searchParams.get('page') || '1');
    const perPage = Math.min(parseInt(req.nextUrl.searchParams.get('perPage') || '12'), 30);
    const source = req.nextUrl.searchParams.get('source');

    const results: SearchResult[] = [];

    // Try Unsplash
    if (!source || source === 'unsplash') {
      const unsplashResults = await searchUnsplash(q, page, perPage);
      results.push(...unsplashResults);
    }

    // Try Pexels
    if ((!source || source === 'pexels') && results.length < perPage) {
      const pexelsResults = await searchPexels(q, page, perPage - results.length);
      results.push(...pexelsResults);
    }

    // If no API keys, use agent-based search as fallback
    if (results.length === 0) {
      const agentResults = await agentImageSearch(q, perPage);
      results.push(...agentResults);
    }

    return NextResponse.json({
      ok: true,
      query: q,
      results,
      totalResults: results.length,
      page,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}

/**
 * POST /api/content/media/search — save a search result as content media
 *
 * Body: { url, thumbnailUrl, alt, credit, query, draftId?, pipelineId?, type?, sortOrder? }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url, thumbnailUrl, alt, credit, query, draftId, pipelineId, type, sortOrder } = body;

    if (!url) {
      return NextResponse.json({ ok: false, error: 'url is required' }, { status: 400 });
    }

    // Ensure table
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
    `);

    const mediaId = `media_${crypto.randomUUID()}`;
    db.insert(contentMedia).values({
      id: mediaId,
      draftId: draftId || null,
      pipelineId: pipelineId || null,
      type: type || 'image',
      source: 'search',
      url,
      thumbnailUrl: thumbnailUrl || null,
      alt: alt || null,
      sourceQuery: query || null,
      sourceCredit: credit || null,
      sortOrder: sortOrder || 0,
      approved: 0,
      createdAt: new Date(),
    }).run();

    return NextResponse.json({ ok: true, id: mediaId, url });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}

/* ------------------------------------------------------------------ */
/*  Search Providers                                                   */
/* ------------------------------------------------------------------ */

interface SearchResult {
  id: string;
  source: 'unsplash' | 'pexels' | 'agent';
  url: string;           // full resolution
  thumbnailUrl: string;   // preview
  width: number;
  height: number;
  alt: string;
  credit: string;        // photographer name
  creditUrl: string;     // photographer profile
  downloadUrl?: string;  // direct download link
}

async function searchUnsplash(query: string, page: number, perPage: number): Promise<SearchResult[]> {
  const secret = await vault.get('UNSPLASH_ACCESS_KEY');
  if (!secret?.value) return [];

  try {
    const params = new URLSearchParams({
      query,
      page: String(page),
      per_page: String(perPage),
      orientation: 'landscape',
    });
    const res = await fetch(`https://api.unsplash.com/search/photos?${params}`, {
      headers: { Authorization: `Client-ID ${secret.value}` },
    });
    if (!res.ok) return [];

    const data = await res.json();
    return (data.results || []).map((img: Record<string, unknown>) => ({
      id: `unsplash_${img.id}`,
      source: 'unsplash' as const,
      url: (img.urls as Record<string, string>)?.regular || '',
      thumbnailUrl: (img.urls as Record<string, string>)?.thumb || '',
      width: img.width as number,
      height: img.height as number,
      alt: (img.alt_description as string) || (img.description as string) || query,
      credit: (img.user as Record<string, string>)?.name || 'Unsplash',
      creditUrl: (img.user as Record<string, Record<string, string>>)?.links?.html || 'https://unsplash.com',
      downloadUrl: (img.urls as Record<string, string>)?.full,
    }));
  } catch {
    return [];
  }
}

async function searchPexels(query: string, page: number, perPage: number): Promise<SearchResult[]> {
  const secret = await vault.get('PEXELS_API_KEY');
  if (!secret?.value) return [];

  try {
    const params = new URLSearchParams({
      query,
      page: String(page),
      per_page: String(perPage),
      orientation: 'landscape',
    });
    const res = await fetch(`https://api.pexels.com/v1/search?${params}`, {
      headers: { Authorization: secret.value },
    });
    if (!res.ok) return [];

    const data = await res.json();
    return (data.photos || []).map((img: Record<string, unknown>) => ({
      id: `pexels_${img.id}`,
      source: 'pexels' as const,
      url: (img.src as Record<string, string>)?.large || '',
      thumbnailUrl: (img.src as Record<string, string>)?.medium || '',
      width: img.width as number,
      height: img.height as number,
      alt: (img.alt as string) || query,
      credit: (img.photographer as string) || 'Pexels',
      creditUrl: (img.photographer_url as string) || 'https://pexels.com',
      downloadUrl: (img.src as Record<string, string>)?.original,
    }));
  } catch {
    return [];
  }
}

async function agentImageSearch(query: string, limit: number): Promise<SearchResult[]> {
  // Fallback: ask the agent to suggest image URLs from the web
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: 'saga',
        message: `Find ${limit} royalty-free stock images for: "${query}". For each image return a JSON object with: url (direct image URL), alt (description), credit (source). Return ONLY a JSON array, no explanation.`,
      }),
    });
    const data = await res.json();
    if (!data.ok || !data.response) return [];

    // Try to parse JSON from response
    const jsonMatch = data.response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);
    return parsed.slice(0, limit).map((img: Record<string, string>, i: number) => ({
      id: `agent_${Date.now()}_${i}`,
      source: 'agent' as const,
      url: img.url || '',
      thumbnailUrl: img.url || '',
      width: 0,
      height: 0,
      alt: img.alt || query,
      credit: img.credit || 'Web Search',
      creditUrl: '',
    }));
  } catch {
    return [];
  }
}
