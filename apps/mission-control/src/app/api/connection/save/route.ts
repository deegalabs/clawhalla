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

    // ---- Settings (non-secret) ----
    if (config.gatewayUrl) setSetting('gateway_url', config.gatewayUrl);
    if (config.ollamaUrl) setSetting('ollama_url', config.ollamaUrl);
    if (config.provider) setSetting('llm_provider', config.provider);
    if (config.channel) setSetting('primary_channel', config.channel);
    if (config.squad) setSetting('active_squad', config.squad);
    setSetting('onboarding_complete', 'true');

    // ---- Secrets → Vault (encrypted) ----

    // Gateway token
    if (typeof config.gatewayToken === 'string' && config.gatewayToken) {
      setSetting('gateway_token', config.gatewayToken);
      await vault.set('GATEWAY_TOKEN', config.gatewayToken, {
        description: 'OpenClaw gateway authentication token',
        category: 'system',
      });
    }

    // LLM API key (Anthropic or Google)
    if (config.apiKey && config.provider) {
      const keyName = config.provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'GOOGLE_API_KEY';
      await vault.set(keyName, config.apiKey, {
        description: `${config.provider} API key (configured during onboarding)`,
        category: 'api_key',
      });
    }

    // Backward compat: anthropicKey field
    if (config.anthropicKey) {
      await vault.set('ANTHROPIC_API_KEY', config.anthropicKey, {
        description: 'Anthropic API key (configured during onboarding)',
        category: 'api_key',
      });
    }

    // Telegram bot token
    if (config.telegramToken) {
      await vault.set('TELEGRAM_BOT_TOKEN', config.telegramToken, {
        description: 'Telegram bot token (configured during onboarding)',
        category: 'channel',
      });
    }

    // Agent customizations (stored as JSON in settings for Claw to read)
    if (config.agentCustomizations) {
      setSetting('agent_customizations', JSON.stringify(config.agentCustomizations));
    }

    // ---- connection.json (non-secret metadata) ----
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(
      CONFIG_PATH,
      JSON.stringify(
        {
          provider: config.provider,
          channel: config.channel,
          squad: config.squad,
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
