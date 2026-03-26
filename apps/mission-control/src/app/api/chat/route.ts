import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';

// POST /api/chat — send message to an agent (or group)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { agentId, message, mode, agents: groupAgents, topic } = body;

    if (!message && !topic) {
      return NextResponse.json({ ok: false, error: 'message or topic required' }, { status: 400 });
    }

    // Party Mode — multi-agent discussion
    if (mode === 'party' && groupAgents?.length > 0) {
      const moderator = groupAgents[0] || 'saga';
      const participants = groupAgents.map((a: string) => `@${a}`).join(', ');

      const partyPrompt = `You are ${moderator}, moderating a Party Mode discussion.

Topic: "${topic || message}"
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

      try {
        const result = execSync(
          `openclaw agent --agent ${moderator} --json -m "${partyPrompt.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`,
          { encoding: 'utf-8', timeout: 120000 }
        );

        // Parse response
        let response = '';
        try {
          const parsed = JSON.parse(result);
          response = parsed.result?.content?.[0]?.text || parsed.response || result;
        } catch {
          response = result;
        }

        return NextResponse.json({
          ok: true,
          mode: 'party',
          moderator,
          participants: groupAgents,
          topic: topic || message,
          response,
        });
      } catch (error) {
        return NextResponse.json({ ok: false, error: `Party mode failed: ${String(error).slice(0, 200)}` }, { status: 500 });
      }
    }

    // Single agent chat
    const agent = agentId || 'main';

    try {
      const result = execSync(
        `openclaw agent --agent ${agent} --json -m "${message.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`,
        { encoding: 'utf-8', timeout: 120000 }
      );

      let response = '';
      try {
        const parsed = JSON.parse(result);
        response = parsed.result?.content?.[0]?.text || parsed.response || result;
      } catch {
        response = result;
      }

      return NextResponse.json({
        ok: true,
        mode: 'single',
        agentId: agent,
        response,
      });
    } catch (error) {
      return NextResponse.json({ ok: false, error: `Agent error: ${String(error).slice(0, 200)}` }, { status: 500 });
    }
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
