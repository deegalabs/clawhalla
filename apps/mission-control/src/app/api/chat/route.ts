import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { db } from '@/lib/db';
import { activities, agents as agentsTable } from '@/lib/schema';

const WORKSPACE = process.env.WORKSPACE_PATH || join(process.env.HOME || '/home/clawdbot', '.openclaw/workspace');

/**
 * Extract readable text from any OpenClaw JSON response format.
 * Handles multiple response shapes:
 *   - { result: { content: [{ text }] } }           — Claude API format
 *   - { result: { payloads: [{ text }] } }           — OpenClaw agent format
 *   - { result: { text } }                           — Simple result
 *   - { response }                                    — Direct response
 *   - { summary, result: { payloads: [...] } }       — Full run result
 *   - { text }                                        — Bare text
 *   - { message }                                     — Error-style
 *   - { error: { message } }                          — Error wrapper
 */
function extractTextFromResponse(raw: string): { text: string; meta?: Record<string, unknown> } | null {
  try {
    const parsed = JSON.parse(raw);

    // Error responses
    if (parsed.status === 'error' || parsed.error) {
      const errMsg = parsed.error?.message || parsed.error || parsed.message || 'Unknown error';
      return { text: `Error: ${errMsg}` };
    }

    let text = '';
    const meta: Record<string, unknown> = {};

    // Extract metadata if present
    if (parsed.meta) {
      if (parsed.meta.durationMs) meta.durationMs = parsed.meta.durationMs;
      if (parsed.meta.model) meta.model = parsed.meta.model;
      if (parsed.meta.inputTokens) meta.inputTokens = parsed.meta.inputTokens;
      if (parsed.meta.outputTokens) meta.outputTokens = parsed.meta.outputTokens;
    }
    if (parsed.runId) meta.runId = parsed.runId;

    // Try all known response structures
    // 1. result.content[0].text (Claude API / Anthropic format)
    if (parsed.result?.content?.[0]?.text) {
      text = parsed.result.content[0].text;
    }
    // 2. result.payloads[0].text (OpenClaw agent format)
    else if (parsed.result?.payloads) {
      const payloads = parsed.result.payloads;
      if (Array.isArray(payloads)) {
        text = payloads
          .map((p: { text?: string }) => p.text || '')
          .filter(Boolean)
          .join('\n\n');
      }
    }
    // 3. result.text (simple)
    else if (parsed.result?.text) {
      text = parsed.result.text;
    }
    // 4. result as string
    else if (typeof parsed.result === 'string') {
      text = parsed.result;
    }
    // 5. response field
    else if (parsed.response) {
      text = typeof parsed.response === 'string' ? parsed.response : JSON.stringify(parsed.response);
    }
    // 6. summary field (fallback)
    else if (parsed.summary && typeof parsed.summary === 'string' && parsed.summary !== 'completed') {
      text = parsed.summary;
    }
    // 7. text field
    else if (parsed.text) {
      text = parsed.text;
    }
    // 8. message field
    else if (parsed.message) {
      text = parsed.message;
    }
    // 9. output field
    else if (parsed.output) {
      text = typeof parsed.output === 'string' ? parsed.output : JSON.stringify(parsed.output);
    }

    if (text) return { text, meta: Object.keys(meta).length > 0 ? meta : undefined };
    return null;
  } catch {
    return null;
  }
}

// POST /api/chat — send message to an agent (or group in party mode)
// Supports SSE streaming for real-time output
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { agentId, message, mode, agents: groupAgents, topic, model } = body;

    if (!message && !topic) {
      return NextResponse.json({ ok: false, error: 'message or topic required' }, { status: 400 });
    }

    const agent = agentId || 'main';
    const msg = message || topic || '';
    const acceptsStream = req.headers.get('accept')?.includes('text/event-stream');

    // Party mode — sequential multi-agent discussion
    if (mode === 'party' && groupAgents?.length > 0) {
      if (acceptsStream) {
        return streamPartyMode(groupAgents, msg, model);
      }
      return execPartyMode(groupAgents, msg, model);
    }

    // Single agent mode — inject identity context for non-main agents
    let enrichedMsg = msg;
    if (agent !== 'main' && agent !== 'claw') {
      const agentContext = await loadAgentContext(agent);
      if (agentContext) {
        enrichedMsg = `${agentContext}\n\n---\n\nUser message: ${msg}`;
      }
    }

    if (acceptsStream) {
      return streamResponse(agent, enrichedMsg, model);
    }
    return execAgent(agent, enrichedMsg, model);
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}

// Load agent identity, AGENTS.md instructions, and SOUL.md personality
async function loadAgentContext(agentId: string): Promise<string> {
  const parts: string[] = [];
  const resolvedId = resolveAgentId(agentId);

  // Get agent info from DB
  const agentRow = db.select().from(agentsTable).where(
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('drizzle-orm').eq(agentsTable.id, agentId)
  ).get();

  // Strong identity override — this MUST come first so the agent knows who they are
  if (agentRow) {
    parts.push(`IMPORTANT: Your identity for this conversation is ${agentRow.name} (${agentRow.emoji}). You are the ${agentRow.role}. You are NOT Claw. Do NOT identify as Claw. Respond as ${agentRow.name} with your own personality and expertise.`);
  }

  // Load AGENTS.md — the agent's full instructions and role definition
  const agentDir = join(process.env.HOME || '/home/clawdbot', `.openclaw/agents/${resolvedId}/agent`);
  try {
    const agentsMd = await readFile(join(agentDir, 'AGENTS.md'), 'utf-8');
    if (agentsMd) {
      // Include up to 1500 chars of AGENTS.md for rich context
      parts.push(agentsMd.slice(0, 1500));
    }
  } catch { /* no AGENTS.md */ }

  // Load SOUL.md for personality
  for (const base of [
    join(WORKSPACE, `squads`),
    agentDir,
  ]) {
    try {
      const soul = await readFile(join(base, 'SOUL.md'), 'utf-8');
      if (soul) { parts.push(soul.slice(0, 500)); break; }
    } catch { /* no soul file */ }
  }

  return parts.join('\n\n');
}

// Map MC agent IDs to OpenClaw gateway agent IDs
// MC uses "claw" as the chief orchestrator ID, but OpenClaw registers it as "main"
function resolveAgentId(mcId: string): string {
  if (mcId === 'claw') return 'main';
  return mcId;
}

// Run a single agent and return its response
function runAgent(agentId: string, prompt: string, _model?: string): Promise<{ output: string; ok: boolean; duration: number }> {
  const start = Date.now();
  return new Promise((resolve) => {
    const proc = spawn('openclaw', [
      'agent', '--agent', resolveAgentId(agentId), '--json', '-m', prompt,
    ], { timeout: 120000 });

    let output = '';
    let errOutput = '';

    proc.stdout?.on('data', (chunk: Buffer) => { output += chunk.toString(); });
    proc.stderr?.on('data', (chunk: Buffer) => { errOutput += chunk.toString(); });

    proc.on('close', (code) => {
      const extracted = extractTextFromResponse(output);
      const response = extracted?.text || output.trim() || '';

      resolve({
        output: response || errOutput || `Process exited with code ${code}`,
        ok: code === 0 && !!response && !response.startsWith('Error:'),
        duration: Date.now() - start,
      });
    });

    proc.on('error', (err) => {
      resolve({ output: `Agent error: ${String(err).slice(0, 500)}`, ok: false, duration: Date.now() - start });
    });
  });
}

// --- Streaming single agent ---
function streamResponse(agent: string, prompt: string, _model?: string): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: unknown) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)); } catch { /* closed */ }
      };

      send({ type: 'start', agent, mode: 'single' });

      const proc = spawn('openclaw', ['agent', '--agent', resolveAgentId(agent), '--json', '-m', prompt], { timeout: 120000 });
      let output = '';
      let errBuf = '';

      proc.stdout?.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        output += text;
        send({ type: 'chunk', text, agent });
      });

      proc.stderr?.on('data', (chunk: Buffer) => {
        errBuf += chunk.toString();
      });

      proc.on('close', (code) => {
        const extracted = extractTextFromResponse(output);
        const response = extracted?.text || output.trim() || errBuf || 'No response received.';
        const isOk = code === 0 && !!extracted?.text && !response.startsWith('Error:');

        logActivity(agent, prompt, response, isOk);

        send({ type: 'done', ok: isOk, response, agent, mode: 'single' });
        controller.close();
      });

      proc.on('error', (err) => {
        send({ type: 'error', text: String(err) });
        send({ type: 'done', ok: false, response: `Agent error: ${String(err)}`, agent });
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
  });
}

// --- Streaming party mode — each agent responds sequentially ---
function streamPartyMode(agentIds: string[], topic: string, _model?: string): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)); } catch { /* closed */ }
      };

      send({ type: 'start', mode: 'party', agents: agentIds, topic });

      const allResponses: { agentId: string; response: string }[] = [];
      let conversationContext = `Topic for discussion: "${topic}"\n\n`;

      // Each agent responds in sequence, seeing previous agents' responses
      for (const agentId of agentIds) {
        send({ type: 'agent_start', agent: agentId });

        // Build context-aware prompt
        const soulContext = await loadAgentContext(agentId);
        let agentPrompt: string;

        if (allResponses.length === 0) {
          // First agent opens the discussion
          agentPrompt = `${soulContext}\n\nYou are participating in a group discussion.\n\n${conversationContext}\nYou are the first to speak. Share your perspective on this topic based on your expertise and role. Be direct and opinionated. Keep your response focused (2-4 paragraphs).`;
        } else {
          // Subsequent agents build on previous responses
          const prevContext = allResponses.map(r => `**${r.agentId}:** ${r.response}`).join('\n\n');
          agentPrompt = `${soulContext}\n\nYou are participating in a group discussion.\n\n${conversationContext}\nPrevious responses:\n${prevContext}\n\nNow it's your turn. Respond to what was said, add your unique perspective based on your role. You can agree, disagree, or build on others' ideas. Be authentic to your personality. Keep your response focused (2-4 paragraphs).`;
        }

        // Stream this agent's response
        // Use 'main' agent for party mode to avoid IDENTITY.md conflicts — the prompt contains the agent's full identity
        const result = await new Promise<string>((resolve) => {
          const proc = spawn('openclaw', ['agent', '--agent', 'main', '--json', '-m', agentPrompt], { timeout: 90000 });
          let output = '';

          proc.stdout?.on('data', (chunk: Buffer) => {
            const text = chunk.toString();
            output += text;
            send({ type: 'chunk', text, agent: agentId });
          });

          let partyErrBuf = '';
          proc.stderr?.on('data', (chunk: Buffer) => {
            partyErrBuf += chunk.toString();
          });

          proc.on('close', (code) => {
            const extracted = extractTextFromResponse(output);
            const response = extracted?.text || output.trim() || partyErrBuf || 'No response.';
            const isOk = code === 0 && !!extracted?.text && !response.startsWith('Error:');

            send({ type: 'agent_done', agent: agentId, ok: isOk, response });
            logActivity(agentId, `[Party] ${topic}`, response, isOk);
            resolve(response);
          });

          proc.on('error', (err) => {
            const errMsg = `Error: ${String(err).slice(0, 200)}`;
            send({ type: 'agent_done', agent: agentId, ok: false, response: errMsg });
            resolve(errMsg);
          });
        });

        allResponses.push({ agentId, response: result });
        conversationContext += `**${agentId}:** ${result}\n\n`;
      }

      // Final synthesis
      send({
        type: 'done',
        ok: true,
        mode: 'party',
        agents: agentIds,
        responses: allResponses,
        topic,
      });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
  });
}

// --- Non-streaming fallbacks ---
async function execAgent(agent: string, prompt: string, model?: string): Promise<NextResponse> {
  const result = await runAgent(agent, prompt, model);
  logActivity(agent, prompt, result.output, result.ok);

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.output }, { status: 500 });
  }

  return NextResponse.json({ ok: true, mode: 'single', agentId: agent, response: result.output });
}

async function execPartyMode(agentIds: string[], topic: string, model?: string): Promise<NextResponse> {
  const allResponses: { agentId: string; response: string }[] = [];
  let context = '';

  for (const agentId of agentIds) {
    const soulContext = await loadAgentContext(agentId);
    const prev = allResponses.map(r => `**${r.agentId}:** ${r.response}`).join('\n\n');
    const prompt = allResponses.length === 0
      ? `${soulContext}\n\nGroup discussion topic: "${topic}"\nYou speak first. Share your perspective. Be direct.`
      : `${soulContext}\n\nGroup discussion topic: "${topic}"\n\nPrevious:\n${prev}\n\nYour turn. Respond authentically.`;

    // Use 'main' agent for party mode to avoid IDENTITY.md conflicts
    const result = await runAgent('main', prompt, model);
    allResponses.push({ agentId, response: result.output });
    context += `**${agentId}:** ${result.output}\n\n`;
    logActivity(agentId, `[Party] ${topic}`, result.output, result.ok);
  }

  // Build combined response
  const combined = allResponses.map(r => `**${r.agentId}:** ${r.response}`).join('\n\n---\n\n');

  return NextResponse.json({
    ok: true,
    mode: 'party',
    agents: agentIds,
    responses: allResponses,
    response: combined,
    topic,
  });
}

function logActivity(agent: string, prompt: string, response: string, ok: boolean) {
  try {
    db.insert(activities).values({
      id: `act_${Date.now().toString(36)}_chat`,
      agentId: agent,
      action: ok ? 'chat_response' : 'chat_error',
      target: prompt.slice(0, 80),
      details: `${response.length} chars`,
      timestamp: new Date(),
    }).run();
  } catch { /* ignore */ }
}
