import { NextResponse } from 'next/server';
import { existsSync, readFileSync } from 'fs';
import { CLAWHALLA_TUNNELS, OPENCLAW_CONFIG } from '@/lib/paths';

/**
 * GET /api/connection/probe
 *
 * Connectivity preflight. Unlike `/api/connection/detect`, which assumes
 * OpenClaw is installed locally and reads its config, this endpoint is
 * tunnel-mode aware: it reads `~/.clawhalla/tunnels.json` written by the
 * ClawHalla CLI, verifies each tunnel's SSH process is still alive, and
 * probes the forwarded local gateway port for a `/health` response.
 *
 * The onboarding wizard polls this so it can refuse to show the credential
 * form until there's actually *something* for those credentials to talk to.
 */

interface ClawhallaTunnel {
  alias: string;
  user: string;
  host: string;
  port: number;
  bindHost: string;
  localGatewayPort: number;
  localBridgePort: number | null;
  remoteGatewayPort: number;
  remoteBridgePort: number | null;
  pid: number;
  connectedAt: string;
}

interface TunnelsFile {
  version: number;
  tunnels: ClawhallaTunnel[];
}

type Overall =
  | 'connected' // at least one healthy path to a gateway
  | 'tunnel_unreachable' // tunnel process alive, but gateway not responding
  | 'tunnel_dead' // tunnels.json has entries but all pids are dead
  | 'local_only' // no tunnels, but local openclaw.json present
  | 'none'; // nothing found at all

interface TunnelReport {
  alias: string;
  host: string;
  remoteSshPort: number;
  localGatewayPort: number;
  remoteGatewayPort: number;
  pid: number;
  alive: boolean;
  reachable: boolean;
  httpStatus: number | null;
  connectedAt: string;
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    return code === 'EPERM';
  }
}

async function probeHealth(url: string, timeoutMs = 1500): Promise<number | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store',
    });
    return res.status;
  } catch {
    return null;
  }
}

function readTunnels(): ClawhallaTunnel[] {
  if (!existsSync(CLAWHALLA_TUNNELS)) return [];
  try {
    const raw = readFileSync(CLAWHALLA_TUNNELS, 'utf-8');
    const parsed = JSON.parse(raw) as TunnelsFile;
    if (parsed?.version !== 1 || !Array.isArray(parsed.tunnels)) return [];
    return parsed.tunnels;
  } catch {
    return [];
  }
}

export async function GET() {
  const tunnels = readTunnels();
  const hasLocalConfig = existsSync(OPENCLAW_CONFIG);

  const reports: TunnelReport[] = await Promise.all(
    tunnels.map(async (t) => {
      const alive = isPidAlive(t.pid);
      // bindHost may be 0.0.0.0 (when MC runs in docker on linux); probe via loopback.
      const probeHost = '127.0.0.1';
      const url = `http://${probeHost}:${t.localGatewayPort}/health`;
      const status = alive ? await probeHealth(url) : null;
      return {
        alias: t.alias,
        host: t.host,
        remoteSshPort: t.port,
        localGatewayPort: t.localGatewayPort,
        remoteGatewayPort: t.remoteGatewayPort,
        pid: t.pid,
        alive,
        reachable: status !== null && status > 0 && status < 500,
        httpStatus: status,
        connectedAt: t.connectedAt,
      };
    }),
  );

  let overall: Overall;
  if (reports.some((r) => r.reachable)) {
    overall = 'connected';
  } else if (reports.some((r) => r.alive)) {
    overall = 'tunnel_unreachable';
  } else if (reports.length > 0) {
    overall = 'tunnel_dead';
  } else if (hasLocalConfig) {
    overall = 'local_only';
  } else {
    overall = 'none';
  }

  return NextResponse.json({
    ok: true,
    overall,
    tunnels: reports,
    hasLocalConfig,
    hint:
      overall === 'none'
        ? 'No ClawHalla tunnel and no local OpenClaw. Run `clawhalla connect <vps>` in another terminal, or install OpenClaw locally.'
        : overall === 'tunnel_dead'
          ? 'The ClawHalla tunnel SSH process has exited. Re-run `clawhalla connect` to bring it back up.'
          : overall === 'tunnel_unreachable'
            ? 'Tunnel is up but the remote gateway is not responding. Check that OpenClaw is running on the VPS.'
            : null,
  });
}
