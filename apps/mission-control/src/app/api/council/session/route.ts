import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';

const WORKSPACE = process.env.WORKSPACE_PATH || `${process.env.HOME}/.openclaw/workspace`;

const COUNCIL_PROMPT = `You are Saga (CPO), moderating an R&D Council session for ClawHalla / Deega Labs.

Your job: Analyze recent research, identify opportunities, and produce a structured memo.

## Process

1. READ recent research: Check company/knowledge_base/insights/ and squads/clop-cabinet/cra/reports/ for the latest findings
2. READ project context: Check projects/clawhalla/memory/ for current state
3. ANALYZE: What trends matter? What opportunities exist? What risks should we address?
4. PRODUCE: Write a council memo with the structure below

## Memo Format

Save the memo to: ${WORKSPACE}/company/knowledge_base/council/YYYY-MM-DD-council-memo.md

\`\`\`markdown
# R&D Council Memo — [Date]
**Session:** #[number]
**Moderated by:** Saga 🔮
**Participants:** Mimir 🧠 (Research), Loki 🦊 (Strategy), Bragi 🎭 (Content)

## Trends Identified
1. [Trend + source + relevance to our projects]
2. [Trend]
3. [Trend]

## Opportunities
1. [Opportunity] — Upside: H/M/L | Effort: H/M/L | Window: [deadline]
   [2-sentence rationale]

## Threats / Risks
1. [What could hurt our positioning]

## Content Angles
- [Topic Bragi should cover this week]
- [Topic]

## Recommendations
1. [Specific action + who should do it + priority]
2. [Action]

## One Uncomfortable Question
[The question no one is asking but should be — Loki's signature]

## Status: DRAFT → awaiting Daniel's review
\`\`\`

Be specific. Use real data from the workspace. No generic advice.
If no recent research exists, note that and recommend what Mimir should research next.`;

// POST /api/council/session — start a council session
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const agentId = body.agentId || 'saga';
    const model = body.model || 'anthropic/claude-sonnet-4-6';

    // Create output directory
    execSync(`mkdir -p "${WORKSPACE}/company/knowledge_base/council"`, { encoding: 'utf-8' });

    // Dispatch agent
    const cmd = `openclaw agent --agent ${agentId} --json -m "${COUNCIL_PROMPT.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;

    // Run in background — don't wait for completion
    execSync(`nohup ${cmd} > /tmp/council-session.log 2>&1 &`, {
      encoding: 'utf-8',
      timeout: 5000,
    });

    return NextResponse.json({
      ok: true,
      message: `Council session started with @${agentId}. Memo will be saved to company/knowledge_base/council/.`,
      agent: agentId,
      model,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to start session';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

// GET /api/council/session — list past council memos
export async function GET() {
  try {
    const { readdirSync, statSync, readFileSync } = require('fs');
    const { join } = require('path');
    const councilDir = join(WORKSPACE, 'company/knowledge_base/council');

    let memos: { name: string; date: string; size: number; preview: string }[] = [];
    try {
      const files = readdirSync(councilDir) as string[];
      memos = files
        .filter((f: string) => f.endsWith('.md'))
        .map((f: string) => {
          const path = join(councilDir, f);
          const stat = statSync(path);
          const content = readFileSync(path, 'utf-8');
          return {
            name: f,
            date: f.replace('council-memo', '').replace('.md', '').replace(/-/g, '').trim() || stat.mtime.toISOString(),
            size: stat.size,
            preview: content.slice(0, 200),
          };
        })
        .sort((a: { name: string }, b: { name: string }) => b.name.localeCompare(a.name));
    } catch {
      // Directory doesn't exist yet
    }

    return NextResponse.json({ ok: true, memos });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
