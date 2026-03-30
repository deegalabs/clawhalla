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

// Well-known models per provider (fallback when not explicitly configured)
const KNOWN_MODELS: Record<string, Array<{ id: string; name: string }>> = {
  anthropic: [
    { id: 'claude-opus-4-6', name: 'Claude Opus 4.6' },
    { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
    { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5' },
  ],
  openai: [
    { id: 'gpt-4o', name: 'GPT-4o' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
    { id: 'o3', name: 'o3' },
    { id: 'o3-mini', name: 'o3 Mini' },
  ],
  xai: [
    { id: 'grok-3', name: 'Grok 3' },
    { id: 'grok-3-mini', name: 'Grok 3 Mini' },
  ],
  google: [
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
  ],
  mistral: [
    { id: 'mistral-large-latest', name: 'Mistral Large' },
    { id: 'mistral-small-latest', name: 'Mistral Small' },
  ],
};

type ModelEntry = ModelConfig & { color: string; desc: string; fullId: string };

// GET /api/models — list all configured models from openclaw.json + known provider models
export async function GET() {
  try {
    const configPath = join(OPENCLAW_HOME, 'openclaw.json');
    if (!existsSync(configPath)) {
      return NextResponse.json({ ok: false, error: 'openclaw.json not found' }, { status: 404 });
    }

    const config = JSON.parse(await readFile(configPath, 'utf-8'));
    const providers = config.models?.providers || {};
    const models: ModelEntry[] = [];
    const seenIds = new Set<string>();

    // 1. Add explicitly configured models (these have cost/context info)
    for (const [providerId, providerConfig] of Object.entries(providers)) {
      const cfg = providerConfig as { models?: Array<{ id: string; name: string; reasoning?: boolean; contextWindow?: number; maxTokens?: number; cost?: { input: number; output: number } }> };
      for (const model of cfg.models || []) {
        seenIds.add(model.id);
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

      // 2. Add known models for this provider that aren't configured
      const knownForProvider = KNOWN_MODELS[providerId] || [];
      for (const known of knownForProvider) {
        if (!seenIds.has(known.id)) {
          seenIds.add(known.id);
          models.push({
            id: known.id,
            fullId: `${providerId}/${known.id}`,
            name: known.name,
            provider: providerId,
            color: getModelColor(known.id),
            desc: getModelDesc(known.id),
          });
        }
      }
    }

    // Get the default model
    const defaultModel = config.agents?.defaults?.model?.primary || '';

    return NextResponse.json({ ok: true, models, defaultModel });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
