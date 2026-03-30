import { NextResponse } from 'next/server';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { WORKSPACE } from '@/lib/paths';
const FEEDBACK_DIR = join(WORKSPACE, 'company/knowledge_base/feedback');

interface FeedbackEntry {
  id: string;
  agentId: string;
  taskId: string;
  type: 'correction' | 'praise' | 'pattern' | 'rule';
  content: string;
  context: string;
  createdAt: string;
  appliedTo: string[]; // which AGENTS.md files were updated
}

// GET /api/feedback — list feedback entries
export async function GET(req: Request) {
  try {
    await mkdir(FEEDBACK_DIR, { recursive: true });
    const indexPath = join(FEEDBACK_DIR, 'index.json');

    let entries: FeedbackEntry[] = [];
    try {
      const raw = await readFile(indexPath, 'utf-8');
      entries = JSON.parse(raw);
    } catch {
      entries = [];
    }

    const url = new URL(req.url);
    const agentId = url.searchParams.get('agent');
    if (agentId) {
      entries = entries.filter(e => e.agentId === agentId);
    }

    return NextResponse.json({ ok: true, entries });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list feedback';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

// POST /api/feedback — record feedback for an agent
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { agentId, taskId, type, content, context } = body;

    if (!agentId || !type || !content) {
      return NextResponse.json({ ok: false, error: 'agentId, type, and content are required' }, { status: 400 });
    }

    const validTypes = ['correction', 'praise', 'pattern', 'rule'];
    if (!validTypes.includes(type)) {
      return NextResponse.json({ ok: false, error: `type must be one of: ${validTypes.join(', ')}` }, { status: 400 });
    }

    await mkdir(FEEDBACK_DIR, { recursive: true });
    const indexPath = join(FEEDBACK_DIR, 'index.json');

    let entries: FeedbackEntry[] = [];
    try {
      const raw = await readFile(indexPath, 'utf-8');
      entries = JSON.parse(raw);
    } catch {
      entries = [];
    }

    const entry: FeedbackEntry = {
      id: `fb_${Date.now().toString(36)}`,
      agentId,
      taskId: taskId || '',
      type,
      content,
      context: context || '',
      createdAt: new Date().toISOString(),
      appliedTo: [],
    };

    // Auto-apply: append feedback to agent's learning log
    const learningPath = join(FEEDBACK_DIR, `${agentId}-learnings.md`);
    let learningContent = '';
    try {
      learningContent = await readFile(learningPath, 'utf-8');
    } catch {
      learningContent = `# Learning Log — ${agentId}\n\nFeedback and lessons learned from task execution.\n\n---\n`;
    }

    const emojiMap: Record<string, string> = { correction: '❌', praise: '✅', pattern: '🔄', rule: '📏' };
    const typeEmoji = emojiMap[type] || '📝';
    learningContent += `\n## ${typeEmoji} ${type.charAt(0).toUpperCase() + type.slice(1)} — ${new Date().toISOString().split('T')[0]}\n`;
    if (taskId) learningContent += `Task: ${taskId}\n`;
    learningContent += `${content}\n`;
    if (context) learningContent += `Context: ${context}\n`;

    await writeFile(learningPath, learningContent);
    entry.appliedTo.push(learningPath);

    entries.push(entry);
    await writeFile(indexPath, JSON.stringify(entries, null, 2));

    return NextResponse.json({ ok: true, feedback: entry });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to record feedback';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
