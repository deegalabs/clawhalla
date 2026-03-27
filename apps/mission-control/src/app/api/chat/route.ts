import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { db } from '@/lib/db';
import { activities } from '@/lib/schema';

// POST /api/chat — send message to an agent (or group)
// Returns streaming SSE response for real-time output
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { agentId, message, mode, agents: groupAgents, topic, model } = body;

    if (!message && !topic) {
      return NextResponse.json({ ok: false, error: 'message or topic required' }, { status: 400 });
    }

    const agent = agentId || 'main';
    const msg = message || topic || '';

    // Build the prompt
    let prompt: string;
    if (mode === 'party' && groupAgents?.length > 0) {
      const moderator = groupAgents[0] || 'saga';
      const participants = groupAgents.map((a: string) => `@${a}`).join(', ');
      prompt = `You are ${moderator}, moderating a Party Mode discussion.

Topic: "${msg}"
Participants: ${participants}

Instructions:
1. Present the topic clearly
2. For each participant, generate their perspective based on their role:
${groupAgents.map((a: string) => `   - @${a}: Give their unique viewpoint based on their expertise`).join('\n')}
3. Synthesize the discussion into key takeaways
4. Propose next actions

Format your response as a discussion transcript:

**${moderator}:** [Opening statement about the topic]

${groupAgents.map((a: string) => `**${a}:** [Their perspective]`).join('\n\n')}

**Summary:**
- [Key takeaway 1]
- [Key takeaway 2]

**Next Actions:**
- [Action 1 — @agent]
- [Action 2 — @agent]`;
    } else {
      prompt = msg;
    }

    // Check if client wants streaming
    const acceptsStream = req.headers.get('accept')?.includes('text/event-stream');

    if (acceptsStream) {
      return streamResponse(agent, prompt, mode, groupAgents, model);
    }

    // Non-streaming fallback
    return execAgent(agent, prompt, mode, groupAgents, model);
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}

// Streaming response via SSE
function streamResponse(
  agent: string,
  prompt: string,
  mode?: string,
  groupAgents?: string[],
  _model?: string,
): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch { /* stream closed */ }
      };

      send({ type: 'start', agent, mode: mode || 'single' });

      const proc = spawn('openclaw', [
        'agent', '--agent', agent, '--json', '-m', prompt,
      ], { timeout: 120000 });

      let output = '';

      proc.stdout?.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        output += text;
        send({ type: 'chunk', text });
      });

      proc.stderr?.on('data', (chunk: Buffer) => {
        send({ type: 'error', text: chunk.toString() });
      });

      proc.on('close', (code) => {
        // Try to parse JSON response from openclaw
        let response = output;
        try {
          const parsed = JSON.parse(output);
          response = parsed.result?.content?.[0]?.text || parsed.response || output;
        } catch { /* raw text */ }

        // Log activity
        try {
          db.insert(activities).values({
            id: `act_${Date.now().toString(36)}_chat`,
            agentId: agent,
            action: 'chat_response',
            target: prompt.slice(0, 80),
            details: `${response.length} chars, exit ${code}`,
            timestamp: new Date(),
          }).run();
        } catch { /* ignore */ }

        send({
          type: 'done',
          ok: code === 0,
          response,
          agent,
          mode: mode || 'single',
          moderator: mode === 'party' ? (groupAgents?.[0] || agent) : undefined,
          participants: groupAgents,
        });

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
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

// Non-streaming execution (fallback)
async function execAgent(
  agent: string,
  prompt: string,
  mode?: string,
  groupAgents?: string[],
  _model?: string,
): Promise<NextResponse> {
  return new Promise((resolve) => {
    const proc = spawn('openclaw', [
      'agent', '--agent', agent, '--json', '-m', prompt,
    ], { timeout: 120000 });

    let output = '';
    let errOutput = '';

    proc.stdout?.on('data', (chunk: Buffer) => { output += chunk.toString(); });
    proc.stderr?.on('data', (chunk: Buffer) => { errOutput += chunk.toString(); });

    proc.on('close', (code) => {
      let response = output;
      try {
        const parsed = JSON.parse(output);
        response = parsed.result?.content?.[0]?.text || parsed.response || output;
      } catch { /* raw text */ }

      if (code !== 0 && !response) {
        resolve(NextResponse.json({
          ok: false,
          error: `Agent error: ${errOutput.slice(0, 200) || 'Process exited with code ' + code}`,
        }, { status: 500 }));
        return;
      }

      // Log activity
      try {
        db.insert(activities).values({
          id: `act_${Date.now().toString(36)}_chat`,
          agentId: agent,
          action: 'chat_response',
          target: prompt.slice(0, 80),
          details: `${response.length} chars`,
          timestamp: new Date(),
        }).run();
      } catch { /* ignore */ }

      resolve(NextResponse.json({
        ok: true,
        mode: mode || 'single',
        agentId: agent,
        moderator: mode === 'party' ? (groupAgents?.[0] || agent) : undefined,
        participants: groupAgents,
        response,
      }));
    });

    proc.on('error', (err) => {
      resolve(NextResponse.json({
        ok: false,
        error: `Agent error: ${String(err).slice(0, 200)}`,
      }, { status: 500 }));
    });
  });
}
