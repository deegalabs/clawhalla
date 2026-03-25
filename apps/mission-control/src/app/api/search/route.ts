import { NextResponse } from 'next/server';
import { searchIndex } from '@/lib/search';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get('q');
  const category = url.searchParams.get('category') || undefined;
  const limit = parseInt(url.searchParams.get('limit') || '20');

  if (!q || q.trim().length < 2) {
    return NextResponse.json({ ok: false, error: 'Query must be at least 2 characters' }, { status: 400 });
  }

  try {
    const results = searchIndex.search(q, { category, limit });
    const stats = searchIndex.getStats();

    return NextResponse.json({
      ok: true,
      query: q,
      count: results.length,
      results,
      stats,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Search failed';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

// POST /api/search — trigger reindex
export async function POST() {
  try {
    const result = await searchIndex.index();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Index failed';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
