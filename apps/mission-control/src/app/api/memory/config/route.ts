import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { OPENCLAW_CONFIG } from '@/lib/paths';
import { vault } from '@/lib/vault';

const execFileAsync = promisify(execFile);

interface MemoryConfig {
  provider: string;
  model?: string;
  ollamaUrl?: string;
  enabled: boolean;
}

interface AgentMemoryStatus {
  agentId: string;
  provider: string;
  model: string;
  indexed: number;
  total: number;
  chunks: number;
  dirty: boolean;
  vectorReady: boolean;
  ftsReady: boolean;
  storePath: string;
  issues: string[];
  /** Per-agent override: 'rag' | 'md' | 'default' (inherits from defaults) */
  mode: 'rag' | 'md' | 'default';
}

/**
 * GET /api/memory/config — read current memory/embedding config + RAG status per agent
 */
export async function GET() {
  try {
    // 1. Read config from openclaw.json
    let config: MemoryConfig = { provider: '', enabled: false };
    let agentOverrides: Record<string, 'rag' | 'md'> = {};

    if (existsSync(OPENCLAW_CONFIG)) {
      const raw = JSON.parse(await readFile(OPENCLAW_CONFIG, 'utf-8'));
      const ms = raw.agents?.defaults?.memorySearch;
      if (ms) {
        config = {
          provider: ms.provider || '',
          model: ms.model || undefined,
          ollamaUrl: ms.ollamaUrl || undefined,
          enabled: true,
        };
      }

      // Read per-agent overrides from agents.list
      for (const agent of raw.agents?.list || []) {
        if (agent.memorySearch === false) {
          agentOverrides[agent.id] = 'md';
        } else if (agent.memorySearch && typeof agent.memorySearch === 'object') {
          agentOverrides[agent.id] = 'rag';
        }
        // no key = 'default' (inherits from defaults)
      }
    }

    // 2. Get RAG status from openclaw CLI
    const agents: AgentMemoryStatus[] = [];
    try {
      const { stdout } = await execFileAsync('openclaw', ['memory', 'status'], {
        timeout: 15000,
        env: { ...process.env, NODE_NO_WARNINGS: '1' },
      });
      // Parse the text output
      const blocks = stdout.split(/\nMemory Search \(/);
      for (const block of blocks) {
        const nameMatch = block.match(/^([^)]+)\)/);
        if (!nameMatch) continue;
        const agentId = nameMatch[1];

        const providerMatch = block.match(/Provider:\s+(\S+)/);
        const modelMatch = block.match(/Model:\s+(.+)/);
        const indexedMatch = block.match(/Indexed:\s+(\d+)\/(\d+)\s+files\s+·\s+(\d+)\s+chunks/);
        const dirtyMatch = block.match(/Dirty:\s+(yes|no)/);
        const vectorMatch = block.match(/Vector:\s+(\S+)/);
        const ftsMatch = block.match(/FTS:\s+(\S+)/);
        const storeMatch = block.match(/Store:\s+(.+)/);
        const issuesMatch = block.match(/Issues:\n([\s\S]*?)(?=\n\n|$)/);

        agents.push({
          agentId,
          provider: providerMatch?.[1] || config.provider || 'none',
          model: modelMatch?.[1] || '',
          indexed: parseInt(indexedMatch?.[1] || '0'),
          total: parseInt(indexedMatch?.[2] || '0'),
          chunks: parseInt(indexedMatch?.[3] || '0'),
          dirty: dirtyMatch?.[1] === 'yes',
          vectorReady: vectorMatch?.[1] === 'ready',
          ftsReady: ftsMatch?.[1] === 'ready',
          storePath: storeMatch?.[1]?.trim() || '',
          issues: issuesMatch?.[1]?.trim().split('\n').map(l => l.trim().replace(/^\s+/, '')) || [],
          mode: agentOverrides[agentId] || 'default',
        });
      }

      // Add agents from config that didn't appear in CLI output (e.g. RAG disabled for them)
      if (existsSync(OPENCLAW_CONFIG)) {
        const raw = JSON.parse(await readFile(OPENCLAW_CONFIG, 'utf-8'));
        const cliAgentIds = new Set(agents.map(a => a.agentId));
        for (const agent of raw.agents?.list || []) {
          if (!cliAgentIds.has(agent.id)) {
            agents.push({
              agentId: agent.id,
              provider: 'none',
              model: '',
              indexed: 0,
              total: 0,
              chunks: 0,
              dirty: false,
              vectorReady: false,
              ftsReady: false,
              storePath: '',
              issues: [],
              mode: agentOverrides[agent.id] || 'default',
            });
          }
        }
      }
    } catch {
      // CLI not available — populate from config only
      if (existsSync(OPENCLAW_CONFIG)) {
        const raw = JSON.parse(await readFile(OPENCLAW_CONFIG, 'utf-8'));
        for (const agent of raw.agents?.list || []) {
          agents.push({
            agentId: agent.id,
            provider: config.provider || 'none',
            model: '',
            indexed: 0,
            total: 0,
            chunks: 0,
            dirty: false,
            vectorReady: false,
            ftsReady: false,
            storePath: '',
            issues: [],
            mode: agentOverrides[agent.id] || 'default',
          });
        }
      }
    }

    // 3. Available providers
    const providers = [
      { id: 'ollama', name: 'Ollama (Local)', description: 'Uses Ollama container — zero cost, runs locally', requiresKey: false },
      { id: 'local', name: 'Node GGUF (Local)', description: 'node-llama-cpp — runs inside Node.js process', requiresKey: false },
      { id: 'openai', name: 'OpenAI', description: 'text-embedding-3-small — cloud API', requiresKey: true, keyName: 'OPENAI_API_KEY' },
      { id: 'gemini', name: 'Google Gemini', description: 'text-embedding-004 — cloud API', requiresKey: true, keyName: 'GOOGLE_API_KEY' },
      { id: 'voyage', name: 'Voyage AI', description: 'voyage-3-lite — cloud API', requiresKey: true, keyName: 'VOYAGE_API_KEY' },
      { id: 'mistral', name: 'Mistral', description: 'mistral-embed — cloud API', requiresKey: true, keyName: 'MISTRAL_API_KEY' },
    ];

    return NextResponse.json({ ok: true, config, agents, providers });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}

/**
 * POST /api/memory/config — update memory/embedding provider config
 *
 * Body:
 *   provider: string (ollama | local | openai | gemini | voyage | mistral)
 *   model?: string (optional model override)
 *   ollamaUrl?: string (for ollama provider)
 *   apiKey?: string (for cloud providers — saved to vault)
 *   enabled: boolean
 *   agentModes?: Record<string, 'rag' | 'md' | 'default'> — per-agent overrides
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { provider, model, ollamaUrl, apiKey, enabled, agentModes } = body;

    if (!existsSync(OPENCLAW_CONFIG)) {
      return NextResponse.json({ ok: false, error: 'openclaw.json not found' }, { status: 404 });
    }

    const config = JSON.parse(await readFile(OPENCLAW_CONFIG, 'utf-8'));

    if (!config.agents) config.agents = {};
    if (!config.agents.defaults) config.agents.defaults = {};

    if (!enabled) {
      // Disable memory search globally
      delete config.agents.defaults.memorySearch;
    } else {
      const ms: Record<string, string> = { provider };
      if (model) ms.model = model;
      if (ollamaUrl && provider === 'ollama') ms.ollamaUrl = ollamaUrl;
      config.agents.defaults.memorySearch = ms;
    }

    // Apply per-agent overrides
    if (agentModes && typeof agentModes === 'object') {
      for (const agent of config.agents.list || []) {
        const mode = agentModes[agent.id];
        if (mode === 'md') {
          // Disable RAG for this agent — .md only
          agent.memorySearch = false;
        } else if (mode === 'rag') {
          // Explicitly enable RAG (uses defaults provider unless agent has own config)
          delete agent.memorySearch; // remove false override, inherit from defaults
        } else if (mode === 'default') {
          // Remove any override — inherit from defaults
          delete agent.memorySearch;
        }
      }
    }

    await writeFile(OPENCLAW_CONFIG, JSON.stringify(config, null, 2), 'utf-8');

    // Save API key to vault if provided
    if (apiKey && provider) {
      const keyNames: Record<string, string> = {
        openai: 'OPENAI_API_KEY',
        gemini: 'GOOGLE_API_KEY',
        voyage: 'VOYAGE_API_KEY',
        mistral: 'MISTRAL_API_KEY',
      };
      const keyName = keyNames[provider];
      if (keyName) {
        await vault.set(keyName, apiKey, {
          description: `${provider} API key for memory embeddings`,
          category: 'api_key',
        });
      }
    }

    // Trigger reindex if enabling
    if (enabled) {
      try {
        await execFileAsync('openclaw', ['memory', 'index', '--force'], {
          timeout: 60000,
          env: { ...process.env, NODE_NO_WARNINGS: '1' },
        });
      } catch {
        // Non-fatal — index will happen on next session
      }
    }

    return NextResponse.json({ ok: true, message: enabled ? 'Memory config saved. Indexing started.' : 'Memory search disabled.' });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
