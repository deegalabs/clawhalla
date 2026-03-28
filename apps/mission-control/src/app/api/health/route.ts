import { NextResponse } from 'next/server';
import { notify } from '@/lib/notify';

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://127.0.0.1:18789';

// Track gateway state to only notify on transitions
let lastGatewayState: boolean | null = null;

export async function GET() {
  let gatewayOk = false;

  try {
    const res = await fetch(`${GATEWAY_URL}/health`, {
      signal: AbortSignal.timeout(3000),
      cache: 'no-store',
    });
    gatewayOk = res.ok;
  } catch {
    gatewayOk = false;
  }

  // Notify only on state transitions (not every poll)
  if (lastGatewayState !== null && lastGatewayState !== gatewayOk) {
    if (!gatewayOk) {
      notify({
        type: 'system',
        title: 'Gateway Offline',
        body: 'OpenClaw gateway is not responding. Agents and chat may be unavailable.',
        icon: '🔴',
        href: '/settings',
        priority: 'urgent',
        sound: true,
      });
    } else {
      notify({
        type: 'system',
        title: 'Gateway Recovered',
        body: 'OpenClaw gateway is back online. All systems operational.',
        icon: '🟢',
        href: '/dashboard',
        priority: 'normal',
      });
    }
  }
  lastGatewayState = gatewayOk;

  return NextResponse.json({
    status: gatewayOk ? 'ok' : 'degraded',
    gateway: gatewayOk,
    timestamp: new Date().toISOString(),
  });
}
