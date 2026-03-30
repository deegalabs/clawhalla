import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * GET /api/memory/rag?q=<query>&agent=<agentId>&limit=<n>
 *
 * Semantic search across agent memory using OpenClaw's RAG system.
 * Uses `openclaw memory search` CLI under the hood.
 */
export async function GET(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams.get('q');
    const agent = req.nextUrl.searchParams.get('agent') || 'main';
    const limit = req.nextUrl.searchParams.get('limit') || '10';

    if (!q || q.trim().length < 2) {
      return NextResponse.json({ ok: false, error: 'query parameter "q" required (min 2 chars)' }, { status: 400 });
    }

    const args = ['memory', 'search', '--query', q, '--agent', agent, '--max-results', limit, '--json'];

    try {
      let stdout = '';
      let stderr = '';
      try {
        const result = await execFileAsync('openclaw', args, {
          timeout: 15000,
          env: { ...process.env, NODE_NO_WARNINGS: '1', NO_COLOR: '1' },
        });
        stdout = result.stdout;
        stderr = result.stderr;
      } catch (execErr: unknown) {
        // CLI may exit non-zero but still produce valid output
        const e = execErr as { stdout?: string; stderr?: string };
        stdout = e.stdout || '';
        stderr = e.stderr || '';
        if (!stdout && !stderr) throw execErr;
      }

      // Strip ANSI escape codes and find JSON in combined output
      const raw = (stdout || stderr).replace(/\x1b\[[0-9;]*[a-zA-Z]|\x1b\[\?[0-9]*[a-zA-Z]/g, '').trim();
      const jsonStart = raw.indexOf('[');
      const jsonStartObj = raw.indexOf('{');
      const start = jsonStart >= 0 && (jsonStartObj < 0 || jsonStart < jsonStartObj) ? jsonStart : jsonStartObj;
      if (start < 0) {
        return NextResponse.json({ ok: true, query: q, agent, results: [], count: 0, message: 'No results found.' });
      }
      const results = JSON.parse(raw.slice(start));
      return NextResponse.json({
        ok: true,
        query: q,
        agent,
        results: Array.isArray(results) ? results : results.results || [],
        count: Array.isArray(results) ? results.length : results.results?.length || 0,
      });
    } catch (cliError) {
      const errMsg = String(cliError);

      if (errMsg.includes('not configured') || errMsg.includes('unavailable')) {
        return NextResponse.json({
          ok: false,
          error: 'Memory search not configured. Go to Settings > Memory to enable.',
          code: 'NOT_CONFIGURED',
        }, { status: 503 });
      }

      if (errMsg.includes('no memory files')) {
        return NextResponse.json({
          ok: true,
          query: q,
          agent,
          results: [],
          count: 0,
          message: 'No memory files found for this agent.',
        });
      }

      return NextResponse.json({ ok: false, error: `Search failed: ${errMsg.slice(0, 200)}` }, { status: 500 });
    }
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}

/**
 * POST /api/memory/rag — trigger reindex
 *
 * Body:
 *   agent?: string — specific agent to reindex (default: all)
 *   force?: boolean — force full reindex
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const agent = body.agent;
    const force = body.force ?? true;

    const args = ['memory', 'index'];
    if (agent) args.push('--agent', agent);
    if (force) args.push('--force');

    const { stdout } = await execFileAsync('openclaw', args, {
      timeout: 60000,
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
    });

    return NextResponse.json({ ok: true, message: 'Reindex complete', output: stdout.slice(0, 500) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
