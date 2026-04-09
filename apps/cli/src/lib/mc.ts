// Mission Control process management — install (git clone + pnpm install),
// start (detached pnpm dev), stop (kill via pidfile), status (pid + HTTP probe),
// logs (tail the dev server log), open (xdg-open/open/start the browser).
//
// Design goals:
// - No new runtime deps. Uses only node:* modules and the system `git` / `pnpm`.
// - Detects an in-monorepo CLI invocation and reuses the same clone instead of
//   cloning a second copy into ~/.clawhalla/source.
// - pidfile + log file in ~/.clawhalla so state survives across CLI runs.

import {
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { paths, ensureConfigDir } from './paths.js';

export const DEFAULT_MC_PORT = 3000;
export const CLAWHALLA_REPO = 'https://github.com/deegalabs/clawhalla.git';

/**
 * Resolve the directory where Mission Control source lives.
 *
 * Precedence:
 *   1. Environment override (`CLAWHALLA_MC_DIR`) for power users / tests.
 *   2. In-monorepo detection: walk up from the CLI binary looking for
 *      `apps/mission-control/package.json`. This lets developers run
 *      `clawhalla mc start` directly from a monorepo checkout without an
 *      extra clone in ~/.clawhalla/source.
 *   3. Managed clone at `~/.clawhalla/source/apps/mission-control`.
 */
export function resolveMcDir(): string {
  if (process.env.CLAWHALLA_MC_DIR) return process.env.CLAWHALLA_MC_DIR;

  const inRepo = findMcInMonorepo();
  if (inRepo) return inRepo;

  return join(paths.sourceDir, 'apps', 'mission-control');
}

/** True when the CLI was launched from a clawhalla monorepo checkout. */
export function isInMonorepo(): boolean {
  return !!findMcInMonorepo();
}

function findMcInMonorepo(): string | null {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    let cursor = here;
    for (let i = 0; i < 6; i++) {
      const candidate = join(cursor, 'apps', 'mission-control', 'package.json');
      if (existsSync(candidate)) return dirname(candidate);
      const parent = dirname(cursor);
      if (parent === cursor) break;
      cursor = parent;
    }
  } catch {
    // fall through
  }
  return null;
}

/** Check that a required tool is on PATH. Returns null if ok, error message otherwise. */
export function checkTool(name: string): string | null {
  const res = spawnSync('which', [name], { stdio: 'pipe' });
  if (res.status === 0) return null;
  return `Required tool not found on PATH: ${name}`;
}

/** Ensure OpenClaw workspace and MC data dir exist (both required by the MC runtime). */
export function ensureMcRuntimeDirs(mcDir: string): void {
  mkdirSync(join(homedir(), '.openclaw', 'workspace'), { recursive: true });
  mkdirSync(join(mcDir, 'data'), { recursive: true });
}

/* ------------------------------ pidfile ------------------------------- */

export function readPid(): number | null {
  if (!existsSync(paths.mcPidFile)) return null;
  try {
    const raw = readFileSync(paths.mcPidFile, 'utf-8').trim();
    const pid = Number.parseInt(raw, 10);
    if (!Number.isFinite(pid) || pid <= 0) return null;
    return pid;
  } catch {
    return null;
  }
}

export function writePid(pid: number): void {
  ensureConfigDir();
  writeFileSync(paths.mcPidFile, String(pid), 'utf-8');
}

export function clearPid(): void {
  try {
    if (existsSync(paths.mcPidFile)) unlinkSync(paths.mcPidFile);
  } catch {
    // ignore
  }
}

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------- probe -------------------------------- */

/**
 * HTTP probe Mission Control's root URL with a short timeout.
 * Returns the HTTP status code, or 0 if the server is unreachable.
 */
export async function probeMc(port: number, timeoutMs = 1500): Promise<number> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/`, {
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
    });
    return res.status;
  } catch {
    return 0;
  } finally {
    clearTimeout(timer);
  }
}

/** Wait for MC to start responding after a fresh spawn. */
export async function waitForMcReady(port: number, maxMs = 30_000): Promise<boolean> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const status = await probeMc(port);
    if (status > 0) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

/* ------------------------------- spawn -------------------------------- */

/**
 * Launch `pnpm dev` for Mission Control detached from the CLI process, so the
 * dev server keeps running after `clawhalla mc start` returns. stdout/stderr
 * both land in ~/.clawhalla/mc.log for later inspection via `mc logs`.
 */
export function spawnMcDev(mcDir: string, port: number): number {
  ensureConfigDir();
  const logFd = openSync(paths.mcLogFile, 'a');

  const child = spawn('pnpm', ['dev', '--port', String(port)], {
    cwd: mcDir,
    detached: true,
    stdio: ['ignore', logFd, logFd],
    env: { ...process.env, FORCE_COLOR: '0' },
  });

  if (!child.pid) {
    throw new Error('Failed to spawn pnpm dev (no pid returned).');
  }

  child.unref();
  return child.pid;
}

/**
 * Send SIGTERM to the MC process group. Falls back to SIGKILL after a short
 * grace period if the process is still alive.
 */
export async function stopMcProcess(pid: number): Promise<boolean> {
  try {
    // Negative pid = process group (because we spawned with `detached: true`).
    try { process.kill(-pid, 'SIGTERM'); }
    catch { process.kill(pid, 'SIGTERM'); }
  } catch {
    return false;
  }

  for (let i = 0; i < 20; i++) {
    if (!isProcessAlive(pid)) return true;
    await new Promise((r) => setTimeout(r, 250));
  }

  try {
    try { process.kill(-pid, 'SIGKILL'); }
    catch { process.kill(pid, 'SIGKILL'); }
  } catch {
    // ignore
  }
  return !isProcessAlive(pid);
}

/* --------------------------- open in browser -------------------------- */

export function openInBrowser(url: string): boolean {
  const opener =
    process.platform === 'darwin' ? 'open' :
    process.platform === 'win32' ? 'start' :
    'xdg-open';
  const res = spawnSync(opener, [url], { stdio: 'ignore' });
  return res.status === 0;
}
