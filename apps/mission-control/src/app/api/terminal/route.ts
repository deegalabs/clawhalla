import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';
import { requireAuth, isAuthError } from '@/lib/auth';

// POST /api/terminal — execute a command and return output (auth required)
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (isAuthError(auth)) return auth;

  try {
    const { command, cwd } = await req.json();

    if (!command || typeof command !== 'string') {
      return NextResponse.json({ ok: false, error: 'command required' }, { status: 400 });
    }

    // Security: block dangerous commands
    const blocked = ['rm -rf /', 'mkfs', 'dd if=', ':(){', 'fork bomb', '> /dev/sd', 'chmod 777 /', 'curl | sh', 'wget | sh'];
    if (blocked.some(b => command.includes(b))) {
      return NextResponse.json({ ok: false, error: 'Command blocked for safety', output: '' });
    }

    const workDir = cwd || process.env.HOME || '/home/clawdbot';
    console.log(`[terminal] ${auth.type}${auth.agentId ? `:${auth.agentId}` : ''} executing: ${command.slice(0, 100)}`);

    try {
      const output = execSync(command, {
        encoding: 'utf-8',
        timeout: 30000,
        cwd: workDir,
        env: { ...process.env, TERM: 'xterm-256color' },
        maxBuffer: 1024 * 1024, // 1MB
      });

      return NextResponse.json({ ok: true, output, exitCode: 0 });
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string; status?: number };
      return NextResponse.json({
        ok: true,
        output: (e.stdout || '') + (e.stderr || ''),
        exitCode: e.status || 1,
      });
    }
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
