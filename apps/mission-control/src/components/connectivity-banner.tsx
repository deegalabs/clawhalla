'use client';

import { useEffect, useState } from 'react';

/**
 * Connectivity preflight banner for the onboarding wizard.
 *
 * Mission Control can be reached in two setups:
 *   1. Local OpenClaw running on the same machine (~/.openclaw/openclaw.json exists).
 *   2. A remote OpenClaw reached through an SSH tunnel brought up by
 *      `clawhalla connect` (tunnels registered in ~/.clawhalla/tunnels.json).
 *
 * Historically the onboarding page would happily render its form even when
 * neither was true, which meant users could walk through five steps before
 * discovering the gateway was unreachable. This banner polls /api/connection/probe
 * every few seconds and surfaces the real state at the top of every step, so
 * users see the problem before they fill anything in.
 */

type Overall =
  | 'connected'
  | 'tunnel_unreachable'
  | 'tunnel_dead'
  | 'local_only'
  | 'none';

interface TunnelReport {
  alias: string;
  host: string;
  localGatewayPort: number;
  remoteGatewayPort: number;
  alive: boolean;
  reachable: boolean;
  httpStatus: number | null;
}

interface ProbeResponse {
  ok: boolean;
  overall: Overall;
  tunnels: TunnelReport[];
  hasLocalConfig: boolean;
  hint: string | null;
}

const POLL_MS = 4000;

export function ConnectivityBanner() {
  const [state, setState] = useState<ProbeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      try {
        const res = await fetch('/api/connection/probe', { cache: 'no-store' });
        const data = (await res.json()) as ProbeResponse;
        if (!cancelled) {
          setState(data);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    }

    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (loading) {
    return (
      <div className="mb-4 w-full max-w-md rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-2.5 text-xs text-gray-500">
        Detecting ClawHalla connectivity…
      </div>
    );
  }

  if (!state) return null;

  const palette = paletteFor(state.overall);
  const reachableTunnel = state.tunnels.find((t) => t.reachable);

  return (
    <div
      className={`mb-4 w-full max-w-md rounded-lg border px-4 py-3 text-xs ${palette.wrap}`}
    >
      <div className="flex items-start gap-2.5">
        <span className={`mt-0.5 text-sm leading-none ${palette.icon}`}>{palette.glyph}</span>
        <div className="flex-1 space-y-1">
          <div className={`font-medium ${palette.title}`}>{titleFor(state, reachableTunnel)}</div>
          {state.hint && <div className="text-gray-500">{state.hint}</div>}
          {reachableTunnel && (
            <div className="text-gray-500">
              <code className="text-gray-400">{reachableTunnel.alias}</code>
              {' → '}
              {reachableTunnel.host}
              {' · local '}
              <code className="text-gray-400">:{reachableTunnel.localGatewayPort}</code>
              {' → remote '}
              <code className="text-gray-400">:{reachableTunnel.remoteGatewayPort}</code>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function titleFor(state: ProbeResponse, reachableTunnel?: TunnelReport): string {
  switch (state.overall) {
    case 'connected':
      return reachableTunnel
        ? 'Connected via ClawHalla tunnel'
        : 'Connected to local OpenClaw';
    case 'tunnel_unreachable':
      return 'Tunnel up, remote gateway not responding';
    case 'tunnel_dead':
      return 'ClawHalla tunnel has exited';
    case 'local_only':
      return 'Local OpenClaw config detected (gateway not reachable yet)';
    case 'none':
      return 'No OpenClaw connection detected';
  }
}

function paletteFor(overall: Overall): {
  wrap: string;
  glyph: string;
  icon: string;
  title: string;
} {
  switch (overall) {
    case 'connected':
      return {
        wrap: 'border-emerald-500/30 bg-emerald-500/[0.06]',
        glyph: '●',
        icon: 'text-emerald-400',
        title: 'text-emerald-300',
      };
    case 'tunnel_unreachable':
    case 'local_only':
      return {
        wrap: 'border-amber-500/30 bg-amber-500/[0.06]',
        glyph: '▲',
        icon: 'text-amber-400',
        title: 'text-amber-300',
      };
    case 'tunnel_dead':
    case 'none':
      return {
        wrap: 'border-rose-500/30 bg-rose-500/[0.06]',
        glyph: '■',
        icon: 'text-rose-400',
        title: 'text-rose-300',
      };
  }
}
