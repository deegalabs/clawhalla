import { log } from '../lib/logger.js';
import { getTunnel, isPidAlive, listTunnels, pruneDead, removeTunnel } from '../lib/state.js';

export interface DisconnectOptions {
  all?: boolean;
}

export async function disconnect(
  alias: string | undefined,
  options: DisconnectOptions = {},
): Promise<number> {
  pruneDead();

  if (options.all) {
    const tunnels = listTunnels();
    if (tunnels.length === 0) {
      log.info('No active tunnels to disconnect.');
      return 0;
    }
    let killed = 0;
    for (const t of tunnels) {
      if (killPid(t.pid)) killed++;
      removeTunnel(t.alias);
    }
    log.ok(`Disconnected ${killed}/${tunnels.length} tunnel(s).`);
    return 0;
  }

  if (!alias) {
    log.err('Missing alias. Use `clawhalla disconnect <alias>` or `--all`.');
    return 1;
  }

  const tunnel = getTunnel(alias);
  if (!tunnel) {
    log.err(`No tunnel with alias "${alias}".`);
    return 2;
  }

  if (isPidAlive(tunnel.pid)) {
    if (killPid(tunnel.pid)) {
      log.ok(`Killed ssh pid ${tunnel.pid} (${alias}).`);
    } else {
      log.warn(
        `Failed to kill pid ${tunnel.pid}. Removing entry anyway — check \`ps\` if you suspect a leak.`,
      );
    }
  } else {
    log.warn(`Tunnel "${alias}" pid ${tunnel.pid} was already dead.`);
  }
  removeTunnel(alias);
  return 0;
}

function killPid(pid: number): boolean {
  try {
    process.kill(pid, 'SIGTERM');
    return true;
  } catch {
    return false;
  }
}
