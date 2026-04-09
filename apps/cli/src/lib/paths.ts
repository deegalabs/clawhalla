import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

const ROOT = join(homedir(), '.clawhalla');
const TUNNELS_FILE = join(ROOT, 'tunnels.json');
const KEYS_DIR = join(ROOT, 'keys');
const SSH_KEY = join(KEYS_DIR, 'id_ed25519');

// Mission Control managed install. The CLI can clone the clawhalla monorepo
// into SOURCE_DIR and run `apps/mission-control` from there, so builders don't
// have to juggle `cd apps/mission-control && pnpm install && pnpm dev &`.
const SOURCE_DIR = join(ROOT, 'source');
const MC_PID_FILE = join(ROOT, 'mc.pid');
const MC_LOG_FILE = join(ROOT, 'mc.log');

export function ensureConfigDir(): void {
  mkdirSync(ROOT, { recursive: true });
}

export function ensureKeysDir(): void {
  mkdirSync(KEYS_DIR, { recursive: true, mode: 0o700 });
}

export const paths = {
  root: ROOT,
  tunnelsFile: TUNNELS_FILE,
  keysDir: KEYS_DIR,
  sshKey: SSH_KEY,
  sshPubKey: `${SSH_KEY}.pub`,
  sourceDir: SOURCE_DIR,
  mcPidFile: MC_PID_FILE,
  mcLogFile: MC_LOG_FILE,
};
