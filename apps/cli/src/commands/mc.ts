// `clawhalla mc` subcommands — install / start / stop / status / logs / open.
//
// These wrap the filesystem and process-management helpers in lib/mc.ts and
// turn them into user-facing commands. The goal is to collapse the workshop's
// "cd apps/mission-control && pnpm install && pnpm dev &" dance into a single
// `clawhalla mc start`.

import { spawn, spawnSync } from 'node:child_process';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { log } from '../lib/logger.js';
import { ensureConfigDir, paths } from '../lib/paths.js';
import {
  CLAWHALLA_REPO,
  DEFAULT_MC_PORT,
  checkTool,
  clearPid,
  ensureMcRuntimeDirs,
  isInMonorepo,
  isProcessAlive,
  openInBrowser,
  probeMc,
  readPid,
  resolveMcDir,
  spawnMcDev,
  stopMcProcess,
  waitForMcReady,
  writePid,
} from '../lib/mc.js';

export interface McOptions {
  port?: number;
}

/* ------------------------------ install ------------------------------ */

export async function mcInstall(): Promise<number> {
  log.title('Installing Mission Control');

  const missingGit = checkTool('git');
  const missingPnpm = checkTool('pnpm');
  if (missingGit || missingPnpm) {
    if (missingGit) log.err(missingGit);
    if (missingPnpm) log.err(missingPnpm);
    log.dim('Install the missing tool(s) and re-run `clawhalla mc install`.');
    return 1;
  }

  ensureConfigDir();

  let mcDir: string;

  if (isInMonorepo()) {
    mcDir = resolveMcDir();
    log.info(`Using in-monorepo source at ${mcDir}`);
  } else {
    // Clone (or pull) the managed copy at ~/.clawhalla/source.
    if (!existsSync(paths.sourceDir)) {
      log.info(`Cloning ${CLAWHALLA_REPO} into ${paths.sourceDir}`);
      const res = spawnSync('git', ['clone', '--depth', '1', CLAWHALLA_REPO, paths.sourceDir], {
        stdio: 'inherit',
      });
      if (res.status !== 0) {
        log.err('git clone failed.');
        return res.status ?? 1;
      }
    } else {
      log.info(`Updating managed source at ${paths.sourceDir}`);
      const res = spawnSync('git', ['pull', '--ff-only'], {
        cwd: paths.sourceDir,
        stdio: 'inherit',
      });
      if (res.status !== 0) {
        log.warn('git pull failed — keeping existing checkout.');
      }
    }
    mcDir = join(paths.sourceDir, 'apps', 'mission-control');
  }

  if (!existsSync(join(mcDir, 'package.json'))) {
    log.err(`Mission Control source not found at ${mcDir}`);
    return 1;
  }

  log.info('Running pnpm install (this may take a minute on first run)...');
  const install = spawnSync('pnpm', ['install'], { cwd: mcDir, stdio: 'inherit' });
  if (install.status !== 0) {
    log.err('pnpm install failed.');
    return install.status ?? 1;
  }

  ensureMcRuntimeDirs(mcDir);

  log.ok('Mission Control is installed.');
  log.kv('Source', mcDir);
  log.dim('Next:  clawhalla mc start');
  return 0;
}

/* -------------------------------- start ------------------------------- */

export async function mcStart(options: McOptions = {}): Promise<number> {
  const port = options.port ?? DEFAULT_MC_PORT;

  const existingPid = readPid();
  if (existingPid && isProcessAlive(existingPid)) {
    log.warn(`Mission Control already running (pid ${existingPid}).`);
    log.kv('URL', `http://localhost:${port}`);
    return 0;
  }
  if (existingPid) clearPid();

  const mcDir = resolveMcDir();
  if (!existsSync(join(mcDir, 'package.json'))) {
    log.err(`Mission Control source not found at ${mcDir}`);
    log.dim('Run `clawhalla mc install` first.');
    return 1;
  }
  if (!existsSync(join(mcDir, 'node_modules'))) {
    log.err(`Mission Control dependencies not installed in ${mcDir}`);
    log.dim('Run `clawhalla mc install` first.');
    return 1;
  }

  const missingPnpm = checkTool('pnpm');
  if (missingPnpm) {
    log.err(missingPnpm);
    return 1;
  }

  ensureMcRuntimeDirs(mcDir);

  log.title('Starting Mission Control');
  log.info(`Spawning pnpm dev in ${mcDir} (port ${port})`);

  let pid: number;
  try {
    pid = spawnMcDev(mcDir, port);
  } catch (err) {
    log.err(err instanceof Error ? err.message : String(err));
    return 1;
  }

  writePid(pid);
  log.info(`Waiting for Mission Control to come online (pid ${pid})...`);
  const ready = await waitForMcReady(port);

  if (!ready) {
    log.err('Mission Control did not respond within 30s.');
    log.dim(`Check the log:  clawhalla mc logs   (file: ${paths.mcLogFile})`);
    return 1;
  }

  log.ok(`Mission Control is up.`);
  log.kv('URL', `http://localhost:${port}`);
  log.kv('PID', String(pid));
  log.kv('Log', paths.mcLogFile);
  log.dim('Stop with:  clawhalla mc stop');
  return 0;
}

/* -------------------------------- stop -------------------------------- */

export async function mcStop(): Promise<number> {
  const pid = readPid();
  if (!pid) {
    log.info('Mission Control is not running (no pidfile).');
    return 0;
  }
  if (!isProcessAlive(pid)) {
    log.info(`Cleaned stale pidfile for dead pid ${pid}.`);
    clearPid();
    return 0;
  }

  log.info(`Stopping Mission Control (pid ${pid})...`);
  const stopped = await stopMcProcess(pid);
  clearPid();

  if (stopped) {
    log.ok('Mission Control stopped.');
    return 0;
  }
  log.err(`Could not confirm process ${pid} exited.`);
  return 1;
}

/* ------------------------------- status ------------------------------- */

export async function mcStatus(options: McOptions = {}): Promise<number> {
  const port = options.port ?? DEFAULT_MC_PORT;
  log.title('Mission Control status');

  const pid = readPid();
  if (!pid) {
    log.warn('Not running (no pidfile).');
    log.dim('Start with:  clawhalla mc start');
    return 1;
  }

  if (!isProcessAlive(pid)) {
    log.warn(`Pidfile points at dead pid ${pid} — run \`clawhalla mc stop\` to clean up.`);
    return 1;
  }

  log.ok(`Process alive (pid ${pid})`);
  const http = await probeMc(port);
  if (http > 0) {
    log.ok(`HTTP reachable (http ${http})`);
  } else {
    log.warn(`Process running but HTTP is not responding on :${port}`);
  }

  log.kv('URL', `http://localhost:${port}`);
  log.kv('Log', paths.mcLogFile);
  return 0;
}

/* -------------------------------- logs -------------------------------- */

export async function mcLogs(follow: boolean): Promise<number> {
  if (!existsSync(paths.mcLogFile)) {
    log.info(`No log file yet at ${paths.mcLogFile}`);
    return 0;
  }

  if (!follow) {
    // One-shot dump of the existing log.
    const size = statSync(paths.mcLogFile).size;
    const start = Math.max(0, size - 16_384); // last 16 KB
    await new Promise<void>((resolve, reject) => {
      const stream = createReadStream(paths.mcLogFile, { start });
      const rl = createInterface({ input: stream });
      rl.on('line', (line) => console.log(line));
      rl.on('close', () => resolve());
      stream.on('error', reject);
    });
    return 0;
  }

  // Follow mode: shell out to `tail -f` for simplicity and correctness.
  if (process.platform === 'win32') {
    log.warn('`mc logs -f` is not supported on Windows cmd/PowerShell yet.');
    log.dim(`Open ${paths.mcLogFile} in your editor, or use: Get-Content -Wait ${paths.mcLogFile}`);
    return 1;
  }
  const child = spawn('tail', ['-n', '200', '-f', paths.mcLogFile], { stdio: 'inherit' });
  return new Promise((resolve) => {
    child.on('exit', (code) => resolve(code ?? 0));
  });
}

/* -------------------------------- open -------------------------------- */

export async function mcOpen(options: McOptions = {}): Promise<number> {
  const port = options.port ?? DEFAULT_MC_PORT;
  const url = `http://localhost:${port}`;
  const ok = openInBrowser(url);
  if (ok) {
    log.ok(`Opened ${url}`);
    return 0;
  }
  log.warn(`Couldn't launch a browser automatically. Open this URL manually:`);
  console.log(`  ${url}`);
  return 0;
}
