import { log, colors } from '../lib/logger.js';
import { listTunnels, pruneDead, type Tunnel } from '../lib/state.js';

export async function status(): Promise<number> {
  const dead = pruneDead();
  if (dead.length > 0) {
    log.warn(
      `Removed ${dead.length} stale tunnel entr${dead.length === 1 ? 'y' : 'ies'} (process died).`,
    );
  }

  const tunnels = listTunnels();
  if (tunnels.length === 0) {
    log.info('No active tunnels.');
    log.dim('  Start one with:  clawhalla connect <user@host>');
    return 0;
  }

  log.title(`Active tunnels (${tunnels.length})`);
  for (const t of tunnels) {
    printTunnel(t);
  }
  return 0;
}

function printTunnel(t: Tunnel): void {
  const uptime = formatUptime(new Date(t.connectedAt));
  const target = t.user ? `${t.user}@${t.host}` : t.host;
  console.log(
    `  ${colors.bold}${t.alias}${colors.reset}  ${colors.dim}→ ${target}:${t.port}${colors.reset}`,
  );
  const bind = t.bindHost ?? '127.0.0.1';
  console.log(
    `    gateway  ${colors.cyan}http://${bind}:${t.localGatewayPort}${colors.reset}  ${colors.dim}(remote :${t.remoteGatewayPort})${colors.reset}`,
  );
  if (t.localBridgePort != null && t.remoteBridgePort != null) {
    console.log(
      `    bridge   ${colors.cyan}http://${bind}:${t.localBridgePort}${colors.reset}   ${colors.dim}(remote :${t.remoteBridgePort})${colors.reset}`,
    );
  } else {
    console.log(
      `    bridge   ${colors.dim}disabled (--no-bridge)${colors.reset}`,
    );
  }
  console.log(
    `    pid ${t.pid}  ${colors.dim}·  up ${uptime}${colors.reset}`,
  );
  console.log('');
}

function formatUptime(connectedAt: Date): string {
  const ms = Date.now() - connectedAt.getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m${s % 60 ? ` ${s % 60}s` : ''}`;
  const h = Math.floor(m / 60);
  return `${h}h${m % 60 ? ` ${m % 60}m` : ''}`;
}
