import { NextResponse } from 'next/server';
import { execSync } from 'child_process';

const REPO_PATH = process.env.REPO_PATH || '/home/clawdbot/clawhalla-repo';

function git(cmd: string): string {
  return execSync(`git -C ${REPO_PATH} ${cmd}`, {
    encoding: 'utf-8',
    timeout: 30000,
  }).trim();
}

// GET /api/git — repo status
export async function GET() {
  try {
    const branch = git('rev-parse --abbrev-ref HEAD');
    const logRaw = git('log --oneline -10');
    const commits = logRaw.split('\n').map(line => {
      const [hash, ...rest] = line.split(' ');
      return { hash, message: rest.join(' ') };
    });

    const statusRaw = git('status --short');
    const dirty = statusRaw.length > 0;
    const changedFiles = dirty ? statusRaw.split('\n').filter(Boolean) : [];

    // Check ahead/behind
    let ahead = 0;
    let behind = 0;
    try {
      const aheadBehind = git('rev-list --left-right --count HEAD...@{upstream}');
      const [a, b] = aheadBehind.split('\t').map(Number);
      ahead = a;
      behind = b;
    } catch {
      // No upstream configured
    }

    const remote = git('remote get-url origin');
    const lastCommitDate = git('log -1 --format=%ci');

    return NextResponse.json({
      ok: true,
      repo: {
        path: REPO_PATH,
        remote,
        branch,
        ahead,
        behind,
        dirty,
        changedFiles,
        commits,
        lastCommitDate,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Git operation failed';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

// POST /api/git — execute git action (push only for now)
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action } = body;

    if (action === 'push') {
      const result = git('push origin HEAD 2>&1');
      return NextResponse.json({ ok: true, action: 'push', output: result || 'Push successful' });
    }

    if (action === 'pull') {
      const result = git('pull --rebase origin HEAD 2>&1');
      return NextResponse.json({ ok: true, action: 'pull', output: result });
    }

    if (action === 'status') {
      const status = git('status');
      return NextResponse.json({ ok: true, action: 'status', output: status });
    }

    return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Git operation failed';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
