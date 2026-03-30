import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';
import { homedir } from 'os';
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

    // Security: block dangerous commands (pattern-based, not exact match)
    const blockedPatterns = [
      /rm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+)?\//, // rm -rf /, rm -f /*, rm /etc
      /mkfs/i,
      /dd\s+if=/i,
      /:\(\)\s*\{/,                          // fork bomb
      />\s*\/dev\/sd/,
      /chmod\s+777\s+\//,
      /curl\s.*[|&]/, /wget\s.*[|&]/,       // pipe/chain from curl/wget
      /\bsudo\b/,
      /\bshutdown\b/, /\breboot\b/,
      /\bkill\s+-9\s+1\b/,                   // kill init
      />\s*\/etc\//, />\s*\/boot\//,          // overwrite system files
    ];
    if (blockedPatterns.some(p => p.test(command))) {
      return NextResponse.json({ ok: false, error: 'Command blocked for safety', output: '' });
    }

    // Security: restrict cwd to safe directories
    const allowedPrefixes = [
      process.env.HOME || homedir(),
      '/tmp',
    ];
    const workDir = cwd || process.env.HOME || homedir();
    const resolvedCwd = require('path').resolve(workDir);
    if (!allowedPrefixes.some(prefix => resolvedCwd.startsWith(prefix))) {
      return NextResponse.json({ ok: false, error: 'Working directory not allowed' }, { status: 403 });
    }
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
