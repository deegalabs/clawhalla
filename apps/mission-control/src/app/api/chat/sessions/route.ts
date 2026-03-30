import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { chatSessions, chatMessages } from '@/lib/schema';
import { eq, desc, sql } from 'drizzle-orm';
import { requireAuth, isAuthError } from '@/lib/auth';

// Ensure tables exist
function ensureTables() {
  const sqlite = (db as unknown as { $client: { exec: (s: string) => void } }).$client;
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, agent_id TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'single', participants TEXT, model TEXT,
      message_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, archived_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY, session_id TEXT NOT NULL, role TEXT NOT NULL,
      agent_id TEXT, content TEXT NOT NULL, tool_calls TEXT, thinking_content TEXT,
      artifacts TEXT, attachments TEXT, model TEXT,
      input_tokens INTEGER, output_tokens INTEGER, duration_ms INTEGER,
      created_at INTEGER NOT NULL
    );
  `);
}

// GET /api/chat/sessions — list sessions (newest first)
export async function GET(req: NextRequest) {
  try {
    ensureTables();
    const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') || '30'), 100);
    const sessions = await db.select().from(chatSessions)
      .orderBy(desc(chatSessions.updatedAt))
      .limit(limit);
    return NextResponse.json({ ok: true, sessions });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}

// POST /api/chat/sessions — create or update a session + add messages
export async function POST(req: NextRequest) {
  try {
    ensureTables();
    const body = await req.json();
    const { sessionId, title, agentId, mode, participants, model, messages: msgs } = body;

    if (!sessionId) {
      return NextResponse.json({ ok: false, error: 'sessionId required' }, { status: 400 });
    }

    const now = new Date();

    // Upsert session
    const existing = db.select().from(chatSessions).where(eq(chatSessions.id, sessionId)).get();
    if (existing) {
      // Count actual messages in DB after upsert (computed below)
      db.update(chatSessions).set({
        title: title || existing.title,
        updatedAt: now,
      }).where(eq(chatSessions.id, sessionId)).run();
    } else {
      await db.insert(chatSessions).values({
        id: sessionId,
        title: title || 'New Chat',
        agentId: agentId || 'main',
        mode: mode || 'single',
        participants: participants ? JSON.stringify(participants) : null,
        model: model || null,
        messageCount: msgs?.length || 0,
        createdAt: now,
        updatedAt: now,
      });
    }

    // Upsert messages — update content if message already exists (streaming sends empty content first)
    if (msgs && Array.isArray(msgs)) {
      for (const msg of msgs) {
        const msgId = msg.id || `msg_${crypto.randomUUID()}`;
        const existing = db.select().from(chatMessages).where(eq(chatMessages.id, msgId)).get();
        if (existing) {
          // Only update if new content is non-empty (don't overwrite with empty)
          if (msg.content && msg.content.trim()) {
            db.update(chatMessages).set({
              content: msg.content,
              role: msg.role || existing.role,
              agentId: msg.agentId || existing.agentId,
              toolCalls: msg.toolCalls ? JSON.stringify(msg.toolCalls) : existing.toolCalls,
              thinkingContent: msg.thinkingContent || existing.thinkingContent,
              artifacts: msg.artifacts ? JSON.stringify(msg.artifacts) : existing.artifacts,
            }).where(eq(chatMessages.id, msgId)).run();
          }
        } else {
          await db.insert(chatMessages).values({
            id: msgId,
            sessionId,
            role: msg.role,
            agentId: msg.agentId || null,
            content: msg.content || '',
            toolCalls: msg.toolCalls ? JSON.stringify(msg.toolCalls) : null,
            thinkingContent: msg.thinkingContent || null,
            artifacts: msg.artifacts ? JSON.stringify(msg.artifacts) : null,
            attachments: msg.attachments ? JSON.stringify(msg.attachments) : null,
            model: msg.model || null,
            inputTokens: msg.inputTokens || null,
            outputTokens: msg.outputTokens || null,
            durationMs: msg.durationMs || null,
            createdAt: msg.createdAt ? new Date(msg.createdAt) : now,
          });
        }
      }
    }

    // Update messageCount to actual count in DB
    const countRow = db.select({ count: sql<number>`count(*)` }).from(chatMessages)
      .where(eq(chatMessages.sessionId, sessionId)).get();
    if (countRow) {
      db.update(chatSessions).set({ messageCount: countRow.count }).where(eq(chatSessions.id, sessionId)).run();
    }

    return NextResponse.json({ ok: true, sessionId });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}

// DELETE /api/chat/sessions?id=xxx — delete a session and its messages
export async function DELETE(req: NextRequest) {
  const auth = requireAuth(req);
  if (isAuthError(auth)) return auth;
  try {
    ensureTables();
    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 });

    db.delete(chatMessages).where(eq(chatMessages.sessionId, id)).run();
    db.delete(chatSessions).where(eq(chatSessions.id, id)).run();

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
