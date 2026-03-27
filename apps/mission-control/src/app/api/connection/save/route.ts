import { NextRequest, NextResponse } from 'next/server';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { setSetting } from '@/lib/settings';
import { vault } from '@/lib/vault';

const DATA_DIR = './data';
const CONFIG_PATH = `${DATA_DIR}/connection.json`;

export async function GET() {
  try {
    if (existsSync(CONFIG_PATH)) {
      const { readFileSync } = await import('fs');
      const data = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
      return NextResponse.json({ ok: true, config: data });
    }
    return NextResponse.json({ ok: true, config: null });
  } catch {
    return NextResponse.json({ ok: true, config: null });
  }
}

export async function POST(req: NextRequest) {
  try {
    const config = await req.json();

    // Persist gateway connection to DB (required for cloud/multi-tenant)
    if (config.gatewayUrl) setSetting('gateway_url', config.gatewayUrl);
    if (typeof config.gatewayToken === 'string') setSetting('gateway_token', config.gatewayToken);
    if (config.ollamaUrl) setSetting('ollama_url', config.ollamaUrl);
    setSetting('onboarding_complete', 'true');

    // Save API key to encrypted vault
    if (config.anthropicKey) {
      await vault.set('ANTHROPIC_API_KEY', config.anthropicKey, {
        description: 'Anthropic API key (configured during onboarding)',
        category: 'api_key',
      });
    }

    // Write connection.json (mode + ssh config, no secrets)
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(
      CONFIG_PATH,
      JSON.stringify(
        {
          mode: config.mode,
          gatewayUrl: config.gatewayUrl,
          ...(config.mode === 'ssh' ? { ssh: config.ssh } : {}),
          connectedAt: config.connectedAt || new Date().toISOString(),
        },
        null,
        2,
      ),
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
