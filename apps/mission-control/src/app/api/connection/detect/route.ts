import { NextResponse } from 'next/server';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { OPENCLAW_HOME, OPENCLAW_CONFIG } from '@/lib/paths';

/**
 * GET /api/connection/detect
 *
 * Reads openclaw.json to auto-detect gateway config that install.sh already created.
 * The onboarding wizard uses this to pre-fill fields instead of asking the user
 * to manually enter values they don't know (like gateway token).
 *
 * Returns only non-secret metadata — the token IS returned here because
 * the wizard needs it to save into MC's vault, but it's already on disk anyway.
 */

const CONFIG_PATH = OPENCLAW_CONFIG;

interface OpenClawConfig {
  gateway?: {
    port?: number;
    mode?: string;
    bind?: string;
    auth?: {
      mode?: string;
      token?: string;
    };
  };
  agents?: {
    defaults?: {
      model?: { primary?: string };
      workspace?: string;
    };
    list?: { id: string; name: string; model?: string }[];
  };
  auth?: {
    profiles?: Record<string, { provider?: string }>;
  };
  models?: {
    providers?: Record<string, unknown>;
  };
}

export async function GET() {
  try {
    if (!existsSync(CONFIG_PATH)) {
      return NextResponse.json({
        ok: true,
        detected: false,
        reason: 'openclaw.json not found — OpenClaw may not be installed',
      });
    }

    const raw = readFileSync(CONFIG_PATH, 'utf-8');
    const config: OpenClawConfig = JSON.parse(raw);

    // Derive gateway URL from config
    const port = config.gateway?.port || 18789;
    const bind = config.gateway?.bind || 'loopback';
    const host = bind === 'loopback' ? '127.0.0.1' : '0.0.0.0';
    const gatewayUrl = `http://${host}:${port}`;

    // Gateway token
    const gatewayToken = config.gateway?.auth?.token || '';

    // Check if gateway is actually reachable
    let gatewayOnline = false;
    try {
      const res = await fetch(`${gatewayUrl}/health`, {
        signal: AbortSignal.timeout(2000),
        cache: 'no-store',
      });
      gatewayOnline = res.ok;
    } catch {
      gatewayOnline = false;
    }

    // Detect existing auth profiles (which providers have keys configured)
    const authProfiles = config.auth?.profiles || {};
    const configuredProviders = Object.keys(authProfiles).map(key => {
      const profile = authProfiles[key];
      return profile?.provider || key.split(':')[0];
    });

    // Available models/providers
    const modelProviders = Object.keys(config.models?.providers || {});

    // Existing agents in gateway
    const agents = (config.agents?.list || []).map(a => ({
      id: a.id,
      name: a.name,
      model: a.model,
    }));

    // Workspace path
    const workspace = config.agents?.defaults?.workspace || join(OPENCLAW_HOME, 'workspace');

    return NextResponse.json({
      ok: true,
      detected: true,
      gateway: {
        url: gatewayUrl,
        port,
        token: gatewayToken,
        online: gatewayOnline,
      },
      agents,
      configuredProviders,
      modelProviders,
      workspace,
      configPath: CONFIG_PATH,
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      detected: false,
      error: String(error),
    });
  }
}
