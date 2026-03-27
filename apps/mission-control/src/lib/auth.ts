import { NextRequest, NextResponse } from 'next/server';
import { getSetting } from './settings';

// Agent authentication middleware
// Agents authenticate via Bearer token in Authorization header.
// The token is the gateway token stored in MC settings/vault.

export interface AuthContext {
  type: 'user' | 'agent' | 'gateway';
  agentId?: string; // set via X-Agent-Id header
}

export function authenticateRequest(req: NextRequest): AuthContext | NextResponse {
  const authHeader = req.headers.get('authorization');

  // No auth header = browser/user request (trusted, same-origin)
  if (!authHeader) {
    return { type: 'user' };
  }

  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) {
    return NextResponse.json({ error: 'Invalid authorization header' }, { status: 401 });
  }

  // Validate token against stored gateway token
  const gatewayToken = getSetting('gateway_token', process.env.GATEWAY_TOKEN || '');
  if (!gatewayToken) {
    return NextResponse.json({ error: 'Gateway token not configured' }, { status: 503 });
  }

  if (token !== gatewayToken) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
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

// Strict auth — requires Bearer token even for browser requests.
// Use on critical endpoints: vault write, dispatch, terminal, git push.
export function requireAuth(req: NextRequest): AuthContext | NextResponse {
  const authHeader = req.headers.get('authorization');

  if (!authHeader) {
    // Check for internal MC request via X-MC-Internal header
    // This is set by MC's own frontend when calling critical endpoints
    const internalToken = req.headers.get('x-mc-internal');
    const gatewayToken = getSetting('gateway_token', process.env.GATEWAY_TOKEN || '');

    if (internalToken && gatewayToken && internalToken === gatewayToken) {
      return { type: 'user' };
    }

    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  return authenticateRequest(req);
}
