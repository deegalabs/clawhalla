import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { hostname, userInfo } from 'node:os';
import { ensureKeysDir, paths } from '../lib/paths.js';
import type { SshTarget } from './ssh.js';
import { formatTargetForSsh } from './ssh.js';

/**
 * Generate a dedicated ed25519 key for ClawHalla if one doesn't exist yet.
 * The key is passphrase-less on purpose: background tunnels can't prompt,
 * and users expect `clawhalla connect` to "just work" after the first run.
 * Trade-off: the key sits on disk at ~/.clawhalla/keys/id_ed25519 (mode 600).
 */
export function ensureSshKey(): { generated: boolean } {
  if (existsSync(paths.sshKey) && existsSync(paths.sshPubKey)) {
    return { generated: false };
  }
  ensureKeysDir();
  const comment = `clawhalla@${userInfo().username}@${hostname()}`;
  const result = spawnSync(
    'ssh-keygen',
    ['-t', 'ed25519', '-N', '', '-f', paths.sshKey, '-C', comment, '-q'],
    { stdio: ['ignore', 'ignore', 'pipe'], encoding: 'utf8' },
  );
  if (result.status !== 0) {
    throw new Error(
      `ssh-keygen failed (exit ${result.status}): ${(result.stderr || '').trim()}`,
    );
  }
  return { generated: true };
}

/**
 * Install the ClawHalla public key on a remote host's authorized_keys.
 * Uses an inline shell pipeline instead of `ssh-copy-id` because:
 *   - ssh-copy-id is missing on some systems (old Debian, Windows/WSL).
 *   - We want to pass explicit `-i` / IdentitiesOnly flags so the user's
 *     other keys aren't offered first (which would lock them out on hosts
 *     with MaxAuthTries=1).
 * stdio is inherited so the user sees the password prompt interactively.
 */
export function installKeyOnRemote(target: SshTarget): {
  ok: boolean;
  stderr: string;
} {
  const pubKey = readPubKey();
  const sshTarget = formatTargetForSsh(target);
  const remoteCmd =
    'umask 077 && ' +
    'mkdir -p ~/.ssh && ' +
    'touch ~/.ssh/authorized_keys && ' +
    `grep -qxF "${escapeForGrep(pubKey)}" ~/.ssh/authorized_keys || ` +
    `echo "${escapeForShell(pubKey)}" >> ~/.ssh/authorized_keys`;

  const args: string[] = [];
  if (target.port !== 22) args.push('-p', String(target.port));
  args.push(
    '-o',
    'PreferredAuthentications=password,keyboard-interactive',
    '-o',
    'PubkeyAuthentication=no',
    '-o',
    'StrictHostKeyChecking=accept-new',
    '-o',
    'ConnectTimeout=10',
    sshTarget,
    remoteCmd,
  );

  // Inherit stdio so the user can type their password. We can't capture stderr
  // without breaking that, so on failure we just report the exit code.
  const result = spawnSync('ssh', args, { stdio: 'inherit' });
  return {
    ok: result.status === 0,
    stderr: result.status === 0 ? '' : `ssh exited with status ${result.status}`,
  };
}

/**
 * Permission denied is the signal we use to decide whether to offer key
 * installation. Matches both the OpenSSH wording and the "no more methods"
 * fallback.
 */
export function isPermissionDenied(stderr: string): boolean {
  if (!stderr) return false;
  const s = stderr.toLowerCase();
  return (
    s.includes('permission denied') ||
    s.includes('no more authentication methods') ||
    s.includes('authentication failed')
  );
}

function readPubKey(): string {
  return readFileSync(paths.sshPubKey, 'utf8').trim();
}

function escapeForShell(s: string): string {
  // We already know a public key is printable ASCII; escape the characters
  // that would break a double-quoted echo: " \ $ `.
  return s.replace(/[\\"`$]/g, (c) => `\\${c}`);
}

function escapeForGrep(s: string): string {
  // grep -F takes a literal, but it still sits inside a double-quoted arg.
  return escapeForShell(s);
}
