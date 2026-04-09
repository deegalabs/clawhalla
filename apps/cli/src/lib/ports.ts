import { createServer } from 'node:net';
import { listTunnels } from './state.js';

/**
 * Default base ports. We mirror OpenClaw's defaults (18789 HTTP, 18790 WS bridge)
 * and step by 10 for each additional tunnel — matches the orchestrator pattern.
 */
export const BASE_GATEWAY_PORT = 18789;
export const BASE_BRIDGE_PORT = 18790;
export const PORT_STEP = 10;

/** Check if a TCP port is free on 127.0.0.1. */
export function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '127.0.0.1');
  });
}

/**
 * Allocate a free (gateway, bridge) port pair, starting at BASE and stepping
 * by PORT_STEP. Skips pairs already reserved by a persisted tunnel, even if
 * the PID is dead — `pruneDead` should be called beforehand to clean stale state.
 */
export async function allocatePortPair(): Promise<{
  gateway: number;
  bridge: number;
}> {
  const reserved = new Set<number>();
  for (const t of listTunnels()) {
    reserved.add(t.localGatewayPort);
    reserved.add(t.localBridgePort);
  }

  for (let i = 0; i < 100; i++) {
    const gateway = BASE_GATEWAY_PORT + i * PORT_STEP;
    const bridge = BASE_BRIDGE_PORT + i * PORT_STEP;
    if (reserved.has(gateway) || reserved.has(bridge)) continue;
    // Both ports must be free on the OS.
    const [freeG, freeB] = await Promise.all([
      isPortFree(gateway),
      isPortFree(bridge),
    ]);
    if (freeG && freeB) return { gateway, bridge };
  }
  throw new Error(
    `Could not find a free local port pair after 100 attempts (base ${BASE_GATEWAY_PORT}).`,
  );
}
