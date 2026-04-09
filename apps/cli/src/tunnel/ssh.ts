import { spawn, spawnSync } from 'node:child_process';

export interface SshTarget {
  user: string;
  host: string;
  port: number; // remote SSH port
}

export interface TunnelSpec {
  target: SshTarget;
  localGatewayPort: number;
  localBridgePort: number;
  remoteGatewayPort: number;
  remoteBridgePort: number;
  identityFile?: string;
  /**
   * Local interface to bind the forwarded ports on. Defaults to 127.0.0.1.
   * Use 0.0.0.0 to reach the tunnel from Docker containers on Linux (where
   * host.docker.internal resolves to the docker0 bridge IP, which cannot
   * reach a loopback-only bind).
   */
  bindHost?: string;
}

/**
 * Parse a target like `user@host`, `user@host:2222`, or an ssh_config alias.
 * For ssh_config aliases the host is returned as-is and user is left empty —
 * ssh(1) will fill it from ~/.ssh/config.
 */
export function parseTarget(input: string): SshTarget {
  const raw = input.trim();
  if (!raw) throw new Error('Empty SSH target.');

  let user = '';
  let rest = raw;
  const atIdx = raw.indexOf('@');
  if (atIdx >= 0) {
    user = raw.slice(0, atIdx);
    rest = raw.slice(atIdx + 1);
  }

  let host = rest;
  let port = 22;
  const colonIdx = rest.indexOf(':');
  if (colonIdx >= 0) {
    host = rest.slice(0, colonIdx);
    const portStr = rest.slice(colonIdx + 1);
    const parsed = Number.parseInt(portStr, 10);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 65535) {
      throw new Error(`Invalid SSH port: ${portStr}`);
    }
    port = parsed;
  }
  if (!host) throw new Error(`Invalid SSH target: ${raw}`);
  return { user, host, port };
}

export function formatTargetForSsh(target: SshTarget): string {
  return target.user ? `${target.user}@${target.host}` : target.host;
}

/**
 * Spawn a detached background ssh tunnel. Returns the child PID.
 *
 * Flags:
 *   -N            no remote command (we only want port forwarding)
 *   -T            no PTY allocation
 *   -o ExitOnForwardFailure=yes  fail fast if the forward can't bind
 *   -o ServerAliveInterval=30    keep NAT mappings alive
 *   -o StrictHostKeyChecking=accept-new   UX: accept new hosts, error on mismatch
 *   -L ...        forward local:remote
 *
 * We use `spawn` + `detached:true` + `unref()` instead of `ssh -f` because
 * `-f` forks ssh internally and we lose the PID, making disconnect hard.
 */
export function spawnTunnel(spec: TunnelSpec): {
  pid: number;
  argv: string[];
} {
  const { target, localGatewayPort, localBridgePort, remoteGatewayPort, remoteBridgePort } = spec;
  const bindHost = spec.bindHost ?? '127.0.0.1';
  // Prefix the -L forward with an explicit bind address. For non-loopback
  // binds we also set GatewayPorts=yes to satisfy ssh's default policy.
  const bindPrefix = `${bindHost}:`;
  const nonLoopback = bindHost !== '127.0.0.1' && bindHost !== 'localhost';

  const args: string[] = ['-N', '-T'];
  if (target.port !== 22) args.push('-p', String(target.port));
  if (spec.identityFile) {
    args.push('-i', spec.identityFile, '-o', 'IdentitiesOnly=yes');
  }
  args.push(
    '-o',
    'ExitOnForwardFailure=yes',
    '-o',
    'ServerAliveInterval=30',
    '-o',
    'ServerAliveCountMax=3',
    '-o',
    'StrictHostKeyChecking=accept-new',
  );
  if (nonLoopback) {
    args.push('-o', 'GatewayPorts=yes');
  }
  args.push(
    '-L',
    `${bindPrefix}${localGatewayPort}:127.0.0.1:${remoteGatewayPort}`,
    '-L',
    `${bindPrefix}${localBridgePort}:127.0.0.1:${remoteBridgePort}`,
    formatTargetForSsh(target),
  );

  const child = spawn('ssh', args, {
    detached: true,
    stdio: 'ignore',
  });

  if (child.pid === undefined) {
    throw new Error('Failed to spawn ssh (no PID).');
  }

  child.unref();
  return { pid: child.pid, argv: ['ssh', ...args] };
}

/**
 * Probe a target quickly with BatchMode + ConnectTimeout to surface bad creds
 * or unreachable hosts before we try to start the background tunnel.
 *
 * When `identityFile` is set, only that key is offered (IdentitiesOnly=yes).
 * This matters on hosts with MaxAuthTries=1 where ssh would otherwise try
 * the user's agent keys first and get rejected.
 */
export function probeTargetSync(
  target: SshTarget,
  identityFile?: string,
): {
  ok: boolean;
  stderr: string;
} {
  const args: string[] = [];
  if (target.port !== 22) args.push('-p', String(target.port));
  if (identityFile) {
    args.push('-i', identityFile, '-o', 'IdentitiesOnly=yes');
  }
  args.push(
    '-o',
    'BatchMode=yes',
    '-o',
    'ConnectTimeout=5',
    '-o',
    'StrictHostKeyChecking=accept-new',
    formatTargetForSsh(target),
    'true',
  );
  const result = spawnSync('ssh', args, { encoding: 'utf8' });
  return {
    ok: result.status === 0,
    stderr: (result.stderr || '').trim(),
  };
}
