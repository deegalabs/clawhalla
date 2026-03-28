import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { chatSessions, chatMessages } from '@/lib/schema';
import { eq, asc } from 'drizzle-orm';

// GET /api/chat/sessions/:id — get session with all messages
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const session = db.select().from(chatSessions).where(eq(chatSessions.id, id)).get();
    if (!session) {
      return NextResponse.json({ ok: false, error: 'Session not found' }, { status: 404 });
    }

    const messages = await db.select().from(chatMessages)
      .where(eq(chatMessages.sessionId, id))
      .orderBy(asc(chatMessages.createdAt));

    // Parse JSON fields
    const parsed = messages.map(m => ({
      ...m,
      toolCalls: m.toolCalls ? JSON.parse(m.toolCalls) : null,
      artifacts: m.artifacts ? JSON.parse(m.artifacts) : null,
      attachments: m.attachments ? JSON.parse(m.attachments) : null,
    }));

    return NextResponse.json({
      ok: true,
      session: {
        ...session,
        participants: session.participants ? JSON.parse(session.participants) : null,
      },
      messages: parsed,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
