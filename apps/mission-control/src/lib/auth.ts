import { NextRequest, NextResponse } from 'next/server';
import { getSetting } from './settings';
import { randomBytes } from 'crypto';

// Agent authentication middleware
// Agents authenticate via Bearer token in Authorization header.
// The token is the gateway token stored in MC settings/vault.

export interface AuthContext {
  type: 'user' | 'agent' | 'gateway';
  agentId?: string; // set via X-Agent-Id header
}

// Internal session token — generated once per process, used for MC frontend → API calls.
// Not guessable from outside, not the same as the gateway token.
const MC_SESSION_TOKEN = randomBytes(32).toString('hex');

/** Get the session token for frontend to use in X-MC-Internal header */
export function getMCSessionToken(): string {
  return MC_SESSION_TOKEN;
}

export function authenticateRequest(req: NextRequest): AuthContext | NextResponse {
  const authHeader = req.headers.get('authorization');

  // No auth header = browser/user request (trusted same-origin for read-only)
  if (!authHeader) {
    return { type: 'user' };
  }

  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) {
    return NextResponse.json({ ok: false, error: 'Invalid authorization header' }, { status: 401 });
  }

  // Validate token against stored gateway token
  const gatewayToken = getSetting('gateway_token', process.env.GATEWAY_TOKEN || '');
  if (!gatewayToken) {
    return NextResponse.json({ ok: false, error: 'Gateway token not configured' }, { status: 503 });
  }

  if (token !== gatewayToken) {
    return NextResponse.json({ ok: false, error: 'Invalid token' }, { status: 401 });
  }

  // Determine if this is gateway or agent
  const agentId = req.headers.get('x-agent-id');
  if (agentId) {
    return { type: 'agent', agentId };
  }

  return { type: 'gateway' };
}

// Helper to check if result is an error response
export function isAuthError(result: AuthContext | NextResponse): result is NextResponse {
  return result instanceof NextResponse;
}

// Strict auth — requires Bearer token or internal session token.
// Use on critical endpoints: vault write, dispatch, terminal, git push, reset, delete.
export function requireAuth(req: NextRequest): AuthContext | NextResponse {
  const authHeader = req.headers.get('authorization');

  if (!authHeader) {
    // Check for internal MC session token (crypto-random, per-process)
    const internalToken = req.headers.get('x-mc-internal');
    if (internalToken && internalToken === MC_SESSION_TOKEN) {
      return { type: 'user' };
    }

    return NextResponse.json({ ok: false, error: 'Authentication required' }, { status: 401 });
  }

  return authenticateRequest(req);
}
