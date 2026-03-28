import { NextResponse } from 'next/server';
import { notify } from '@/lib/notify';

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://127.0.0.1:18789';

// Track gateway state with debouncing to prevent notification flapping
let lastNotifiedState: boolean | null = null;
let consecutiveFailures = 0;
let consecutiveSuccesses = 0;
let lastNotifyTime = 0;
const NOTIFY_COOLDOWN = 60_000; // min 60s between state-change notifications
const FAILURE_THRESHOLD = 3;    // require 3 consecutive failures before notifying offline

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

  // Track consecutive states for debouncing
  if (gatewayOk) {
    consecutiveSuccesses++;
    consecutiveFailures = 0;
  } else {
    consecutiveFailures++;
    consecutiveSuccesses = 0;
  }

  const now = Date.now();
  const cooldownOk = now - lastNotifyTime > NOTIFY_COOLDOWN;

  // Notify offline only after FAILURE_THRESHOLD consecutive failures
  if (!gatewayOk && consecutiveFailures >= FAILURE_THRESHOLD && lastNotifiedState !== false && cooldownOk) {
    lastNotifiedState = false;
    lastNotifyTime = now;
    notify({
      type: 'system',
      title: 'Gateway Offline',
      body: 'OpenClaw gateway is not responding. Agents and chat may be unavailable.',
      icon: '🔴',
      href: '/settings',
      priority: 'urgent',
      sound: true,
    });
  }

  // Notify recovered after 2 consecutive successes (faster recovery signal)
  if (gatewayOk && consecutiveSuccesses >= 2 && lastNotifiedState === false && cooldownOk) {
    lastNotifiedState = true;
    lastNotifyTime = now;
    notify({
      type: 'system',
      title: 'Gateway Recovered',
      body: 'OpenClaw gateway is back online. All systems operational.',
      icon: '🟢',
      href: '/dashboard',
      priority: 'normal',
    });
  }

  // Set initial state without notifying
  if (lastNotifiedState === null && consecutiveSuccesses >= 2) {
    lastNotifiedState = true;
  }

  return NextResponse.json({
    status: gatewayOk ? 'ok' : 'degraded',
    gateway: gatewayOk,
    timestamp: new Date().toISOString(),
  });
}
