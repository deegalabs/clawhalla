import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { OPENCLAW_HOME } from '@/lib/paths';
import { join } from 'path';

interface ModelConfig {
  id: string;
  name: string;
  provider: string;
  reasoning?: boolean;
  contextWindow?: number;
  maxTokens?: number;
  cost?: { input: number; output: number };
}

// Color assignment based on model tier
function getModelColor(id: string): string {
  if (id.includes('opus')) return 'text-purple-400';
  if (id.includes('sonnet')) return 'text-blue-400';
  if (id.includes('haiku')) return 'text-green-400';
  if (id.includes('gpt-4')) return 'text-emerald-400';
  if (id.includes('gpt-3')) return 'text-teal-400';
  if (id.includes('gemini')) return 'text-cyan-400';
  if (id.includes('grok')) return 'text-orange-400';
  if (id.includes('mistral')) return 'text-red-400';
  return 'text-gray-400';
}

function getModelDesc(id: string): string {
  if (id.includes('opus')) return 'Deep reasoning';
  if (id.includes('sonnet')) return 'Balanced';
  if (id.includes('haiku')) return 'Fast, lightweight';
  if (id.includes('gpt-4')) return 'OpenAI flagship';
  if (id.includes('gemini')) return 'Google AI';
  if (id.includes('grok')) return 'xAI';
  return '';
}

// GET /api/models — list all configured models from openclaw.json
export async function GET() {
  try {
    const configPath = join(OPENCLAW_HOME, 'openclaw.json');
    if (!existsSync(configPath)) {
      return NextResponse.json({ ok: false, error: 'openclaw.json not found' }, { status: 404 });
    }

    const config = JSON.parse(await readFile(configPath, 'utf-8'));
    const providers = config.models?.providers || {};
    const models: (ModelConfig & { color: string; desc: string; fullId: string })[] = [];

    for (const [providerId, providerConfig] of Object.entries(providers)) {
      const cfg = providerConfig as { models?: Array<{ id: string; name: string; reasoning?: boolean; contextWindow?: number; maxTokens?: number; cost?: { input: number; output: number } }> };
      for (const model of cfg.models || []) {
        models.push({
          id: model.id,
          fullId: `${providerId}/${model.id}`,
          name: model.name,
          provider: providerId,
          reasoning: model.reasoning,
          contextWindow: model.contextWindow,
          maxTokens: model.maxTokens,
          cost: model.cost,
          color: getModelColor(model.id),
          desc: getModelDesc(model.id),
        });
      }
    }

    // Get the default model
    const defaultModel = config.agents?.defaults?.model?.primary || '';

    return NextResponse.json({ ok: true, models, defaultModel });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
