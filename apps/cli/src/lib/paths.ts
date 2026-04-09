import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

const ROOT = join(homedir(), '.clawhalla');
const TUNNELS_FILE = join(ROOT, 'tunnels.json');
const KEYS_DIR = join(ROOT, 'keys');
const SSH_KEY = join(KEYS_DIR, 'id_ed25519');

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
};
