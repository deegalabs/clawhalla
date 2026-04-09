import { log } from '../lib/logger.js';
import { paths } from '../lib/paths.js';
import { allocatePortPair, BASE_GATEWAY_PORT, BASE_BRIDGE_PORT } from '../lib/ports.js';
import { addTunnel, getTunnel, pruneDead } from '../lib/state.js';
import { parseTarget, spawnTunnel, probeTargetSync, formatTargetForSsh } from '../tunnel/ssh.js';
import { ensureSshKey, installKeyOnRemote, isPermissionDenied } from '../tunnel/keys.js';

export interface ConnectOptions {
  alias?: string;
  identity?: string;
  remoteGatewayPort?: number;
  remoteBridgePort?: number;
  skipProbe?: boolean;
  bindHost?: string;
  noAutoKey?: boolean;
}

/**
 * Derive a default alias from the target. For `clawdbot@vps.example.com` → `vps`.
 * For an ssh_config alias like `ipe-vps` → `ipe-vps` (unchanged).
 */
function defaultAlias(targetInput: string): string {
  const raw = targetInput.trim();
  const atIdx = raw.indexOf('@');
  const host = atIdx >= 0 ? raw.slice(atIdx + 1) : raw;
  const noPort = host.split(':')[0];
  const firstLabel = noPort.split('.')[0];
  return firstLabel || 'vps';
}

export async function connect(
  targetInput: string,
  options: ConnectOptions = {},
): Promise<number> {
  pruneDead();

  const target = parseTarget(targetInput);
  const alias = options.alias || defaultAlias(targetInput);

  if (getTunnel(alias)) {
    log.err(
      `Alias "${alias}" already connected. Use \`clawhalla disconnect ${alias}\` first, or pass --alias <new>.`,
    );
    return 1;
  }

  log.title(`Connecting to ${formatTargetForSsh(target)} as "${alias}"`);

  // 1. Resolve which identity to use.
  //
  // Three cases:
  //   a) User passed --identity — honor it, no auto-provisioning.
  //   b) Target has explicit user@host form — use ClawHalla's managed key and
  //      auto-install it on the remote if the probe comes back with
  //      "Permission denied". This is the path the workshop takes.
  //   c) Target is a bare alias (no @, assumed ssh_config) — trust the
  //      user's ssh setup, don't force our key.
  const isExplicitTarget = Boolean(target.user);
  const autoKey = !options.identity && isExplicitTarget && !options.noAutoKey;
  let identityFile: string | undefined = options.identity;

  if (autoKey) {
    const keyResult = ensureSshKey();
    identityFile = paths.sshKey;
    if (keyResult.generated) {
      log.ok(`Generated ClawHalla SSH key at ${paths.sshKey}`);
    }
  }

  // 2. Probe SSH reachability (unless skipped — useful for ssh_config aliases
  //    that require password/keyboard-interactive which BatchMode blocks).
  if (!options.skipProbe) {
    log.info('Probing SSH connectivity...');
    let probe = probeTargetSync(target, identityFile);

    if (!probe.ok && autoKey && isPermissionDenied(probe.stderr)) {
      log.warn(
        `Remote doesn't trust our key yet — installing it on ${formatTargetForSsh(target)}.`,
      );
      log.dim(
        '  You will be prompted for the remote password ONCE. After this, ' +
          'all future `clawhalla connect` calls are passwordless.',
      );
      console.log('');
      const install = installKeyOnRemote(target);
      console.log('');
      if (!install.ok) {
        log.err('Failed to install ClawHalla key on remote.');
        if (install.stderr) log.dim(`  ${install.stderr}`);
        log.warn('Re-run with --skip-probe if you want to retry manually.');
        return 2;
      }
      log.ok('Key installed. Re-probing...');
      probe = probeTargetSync(target, identityFile);
    }

    if (!probe.ok) {
      log.err('SSH probe failed (BatchMode=yes, ConnectTimeout=5).');
      if (probe.stderr) {
        console.error('');
        console.error(probe.stderr);
        console.error('');
      }
      log.warn(
        'If this VPS uses password or interactive auth only, re-run with --skip-probe.',
      );
      log.warn(
        'Or pass an existing key with --identity <path>, or configure an ~/.ssh/config Host alias.',
      );
      return 2;
    }
    log.ok('SSH reachable.');
  }

  // 2. Allocate a free local port pair.
  const { gateway: localGatewayPort, bridge: localBridgePort } = await allocatePortPair();
  const bindHost = options.bindHost ?? '127.0.0.1';
  log.info(
    `Allocated local ports  ${localGatewayPort} (gateway) → ${localBridgePort} (bridge) on ${bindHost}`,
  );

  // Warn loudly when the user binds to 0.0.0.0 — anyone on the same LAN
  // (coworking wifi, hotel network, conference hall) can reach the forward
  // and will be one gateway token away from the remote OpenClaw instance.
  if (bindHost === '0.0.0.0') {
    log.warn(
      'Binding to 0.0.0.0 — the tunnel is reachable from every machine on your LAN.',
    );
    log.dim(
      '  Anyone on the same network who guesses the gateway token reaches your VPS.',
    );
    log.dim(
      '  Use this flag ONLY on trusted networks (home wifi, personal hotspot).',
    );
    log.dim(
      '  For Path B (native Mission Control) drop --bind and the default 127.0.0.1 is safer.',
    );
  }

  // 3. Spawn detached ssh tunnel.
  const remoteGatewayPort = options.remoteGatewayPort ?? BASE_GATEWAY_PORT;
  const remoteBridgePort = options.remoteBridgePort ?? BASE_BRIDGE_PORT;

  log.info('Spawning SSH tunnel (detached)...');
  let spawned: { pid: number; argv: string[] };
  try {
    spawned = spawnTunnel({
      target,
      localGatewayPort,
      localBridgePort,
      remoteGatewayPort,
      remoteBridgePort,
      identityFile,
      bindHost,
    });
  } catch (err) {
    log.err(`Failed to spawn ssh: ${(err as Error).message}`);
    return 3;
  }

  // 4. Persist tunnel entry BEFORE the grace-wait, so Ctrl-C during the wait
  //    still leaves a recoverable state.
  addTunnel({
    alias,
    user: target.user,
    host: target.host,
    port: target.port,
    bindHost,
    localGatewayPort,
    localBridgePort,
    remoteGatewayPort,
    remoteBridgePort,
    pid: spawned.pid,
    connectedAt: new Date().toISOString(),
  });

  // 5. Tiny grace period to catch immediate failures (auth denied, forward bind failed).
  await sleep(600);
  const stillAlive = isAlive(spawned.pid);
  if (!stillAlive) {
    log.err(
      'SSH tunnel exited immediately. Common causes:\n' +
        '   - Authentication failed (no key, wrong key, password required)\n' +
        '   - Remote OpenClaw gateway is not running on 127.0.0.1:' +
        remoteGatewayPort +
        '\n' +
        '   - Local port already bound (retry: `clawhalla disconnect ' +
        alias +
        '` then `clawhalla connect`)\n',
    );
    // Clean state — the addTunnel above left a stale entry.
    const { removeTunnel } = await import('../lib/state.js');
    removeTunnel(alias);
    return 4;
  }

  // 6. Success summary.
  log.ok(`Tunnel up (pid ${spawned.pid})`);
  console.log('');
  log.kv('Alias             ', alias);
  log.kv('Local gateway     ', `http://${bindHost}:${localGatewayPort}`);
  log.kv('Local bridge      ', `http://${bindHost}:${localBridgePort}`);
  log.kv('Remote target     ', `${formatTargetForSsh(target)}:${target.port}`);
  console.log('');
  const mcHost = bindHost === '0.0.0.0' ? 'host.docker.internal' : bindHost;
  log.dim(
    `Mission Control should point OPENCLAW_GATEWAY to http://${mcHost}:${localGatewayPort}`,
  );
  log.dim(`Disconnect later:  clawhalla disconnect ${alias}`);
  return 0;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}
