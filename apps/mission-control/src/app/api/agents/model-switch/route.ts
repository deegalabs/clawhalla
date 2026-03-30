import { NextResponse } from 'next/server';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { WORKSPACE } from '@/lib/paths';
const CONFIG_PATH = join(WORKSPACE, 'config/model-routing.json');

interface ModelRoute {
  taskType: string;
  model: string;
  reason: string;
}

const DEFAULT_ROUTING: ModelRoute[] = [
  { taskType: 'orchestration', model: 'claude-opus-4-6', reason: 'Max reasoning for delegation decisions' },
  { taskType: 'architecture', model: 'claude-opus-4-6', reason: 'Complex design decisions need depth' },
  { taskType: 'security_audit', model: 'claude-opus-4-6', reason: 'Security requires maximum precision' },
  { taskType: 'coding', model: 'claude-sonnet-4-6', reason: 'Good balance of speed and quality' },
  { taskType: 'content', model: 'claude-sonnet-4-6', reason: 'Creative writing needs nuance' },
  { taskType: 'research', model: 'claude-sonnet-4-5', reason: 'Fast research and summarization' },
  { taskType: 'qa', model: 'claude-haiku-4-5', reason: 'Fast checks, low cost' },
  { taskType: 'formatting', model: 'claude-haiku-4-5', reason: 'Simple tasks, minimize cost' },
  { taskType: 'monitoring', model: 'claude-haiku-4-5', reason: 'Frequent checks, keep cost low' },
];

// GET /api/agents/model-switch — get model routing config
export async function GET() {
  try {
    let routing: ModelRoute[];
    try {
      const raw = await readFile(CONFIG_PATH, 'utf-8');
      routing = JSON.parse(raw);
    } catch {
      routing = DEFAULT_ROUTING;
    }

    return NextResponse.json({ ok: true, routing });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load config';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

// POST /api/agents/model-switch — update routing config
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { routing } = body;

    if (!Array.isArray(routing)) {
      return NextResponse.json({ ok: false, error: 'routing must be an array' }, { status: 400 });
    }

    const { mkdir } = await import('fs/promises');
    await mkdir(join(WORKSPACE, 'config'), { recursive: true });
    await writeFile(CONFIG_PATH, JSON.stringify(routing, null, 2));

    return NextResponse.json({ ok: true, saved: routing.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save config';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

// PUT /api/agents/model-switch — recommend model for a task type
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { taskType } = body;

    if (!taskType) {
      return NextResponse.json({ ok: false, error: 'taskType required' }, { status: 400 });
    }

    let routing: ModelRoute[];
    try {
      const raw = await readFile(CONFIG_PATH, 'utf-8');
      routing = JSON.parse(raw);
    } catch {
      routing = DEFAULT_ROUTING;
    }

    const match = routing.find(r => r.taskType === taskType);
    const recommended = match || { taskType, model: 'claude-sonnet-4-5', reason: 'Default fallback' };

    return NextResponse.json({ ok: true, recommended });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Recommendation failed';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
