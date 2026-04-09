import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { ensureConfigDir, paths } from './paths.js';

export interface Tunnel {
  alias: string;
  user: string;
  host: string;
  port: number; // remote SSH port (default 22)
  bindHost: string; // local interface the forwards are bound on (default 127.0.0.1)
  localGatewayPort: number; // local port forwarded to remote 18789 (HTTP)
  localBridgePort: number; // local port forwarded to remote 18790 (WS bridge)
  remoteGatewayPort: number; // default 18789
  remoteBridgePort: number; // default 18790
  pid: number;
  connectedAt: string; // ISO8601
}

interface TunnelsFile {
  version: 1;
  tunnels: Tunnel[];
}

const EMPTY: TunnelsFile = { version: 1, tunnels: [] };

function readFile(): TunnelsFile {
  if (!existsSync(paths.tunnelsFile)) return { ...EMPTY };
  try {
    const raw = readFileSync(paths.tunnelsFile, 'utf8');
    const parsed = JSON.parse(raw) as TunnelsFile;
    if (parsed.version !== 1 || !Array.isArray(parsed.tunnels)) {
      return { ...EMPTY };
    }
    return parsed;
  } catch {
    return { ...EMPTY };
  }
}

function writeFile(data: TunnelsFile): void {
  ensureConfigDir();
  writeFileSync(paths.tunnelsFile, JSON.stringify(data, null, 2) + '\n', {
    mode: 0o600,
  });
}

export function listTunnels(): Tunnel[] {
  return readFile().tunnels;
}

export function getTunnel(alias: string): Tunnel | undefined {
  return readFile().tunnels.find((t) => t.alias === alias);
}

export function addTunnel(tunnel: Tunnel): void {
  const data = readFile();
  const without = data.tunnels.filter((t) => t.alias !== tunnel.alias);
  without.push(tunnel);
  writeFile({ version: 1, tunnels: without });
}

export function removeTunnel(alias: string): Tunnel | undefined {
  const data = readFile();
  const target = data.tunnels.find((t) => t.alias === alias);
  if (!target) return undefined;
  writeFile({
    version: 1,
    tunnels: data.tunnels.filter((t) => t.alias !== alias),
  });
  return target;
}

/**
 * Prune tunnels whose PID is no longer alive.
 * Returns the list of entries that were removed.
 */
export function pruneDead(): Tunnel[] {
  const data = readFile();
  const alive: Tunnel[] = [];
  const dead: Tunnel[] = [];
  for (const t of data.tunnels) {
    if (isPidAlive(t.pid)) alive.push(t);
    else dead.push(t);
  }
  if (dead.length > 0) {
    writeFile({ version: 1, tunnels: alive });
  }
  return dead;
}

export function isPidAlive(pid: number): boolean {
  try {
    // Signal 0 does not send a signal — only checks if process exists.
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    // EPERM means the process exists but we can't signal it (still alive).
    return code === 'EPERM';
  }
}
