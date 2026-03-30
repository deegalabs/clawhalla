import { NextRequest, NextResponse } from 'next/server';
import { runTaskScanner, getActiveRuns, getRecentRuns } from '@/lib/task-runner';
import { checkRateLimit, releaseRateLimit } from '@/lib/rate-limit';

/**
 * POST /api/tasks/run — trigger the task runner
 *
 * Body (all optional):
 *   cardId:                string  — run a specific card only
 *   maxConcurrentPerAgent: number  — max tasks per agent (default 1)
 *   timeoutMs:             number  — agent timeout (default 180000)
 *   triggeredBy:           string  — 'manual' | 'cron'
 */
export async function POST(req: NextRequest) {
  const rateLimitError = checkRateLimit('task-runner', { maxConcurrent: 1, maxPerMinute: 5 });
  if (rateLimitError) {
    return NextResponse.json({ ok: false, error: rateLimitError }, { status: 429 });
  }

  try {
    const body = await req.json().catch(() => ({}));

    const result = await runTaskScanner({
      cardId: body.cardId,
      maxConcurrentPerAgent: body.maxConcurrentPerAgent || 1,
      timeoutMs: body.timeoutMs || 180_000,
      triggeredBy: body.triggeredBy || 'manual',
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  } finally {
    releaseRateLimit('task-runner');
  }
}

/**
 * GET /api/tasks/run — check active and recent runs
 *
 * Query: ?status=running (optional, defaults to showing all recent)
 */
export async function GET(req: NextRequest) {
  try {
    const status = req.nextUrl.searchParams.get('status');

    if (status === 'running') {
      const runs = getActiveRuns();
      return NextResponse.json({ ok: true, runs });
    }

    const limit = parseInt(req.nextUrl.searchParams.get('limit') || '20');
    const runs = getRecentRuns(Math.min(limit, 100));
    return NextResponse.json({ ok: true, runs });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
