import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { cards, boards, cardHistory, cardComments } from '@/lib/schema';
import { eq, and, isNull, asc } from 'drizzle-orm';
import { authenticateRequest, isAuthError } from '@/lib/auth';
import { broadcastBoardEvent } from '@/lib/events';

function nanoid(prefix = 'card') {
  return `${prefix}_${Math.random().toString(36).substring(2, 8)}${Date.now().toString(36)}`;
}

// GET /api/agent/cards — get cards assigned to this agent
// Query: ?boardId=xxx (optional — filter by board)
export async function GET(req: NextRequest) {
  const auth = authenticateRequest(req);
  if (isAuthError(auth)) return auth;

  if (!auth.agentId) {
    return NextResponse.json({ error: 'X-Agent-Id header required' }, { status: 400 });
  }

  const url = new URL(req.url);
  const boardId = url.searchParams.get('boardId');

  let result;
  if (boardId) {
    result = await db
      .select()
      .from(cards)
      .where(and(eq(cards.assignee, auth.agentId), eq(cards.boardId, boardId), isNull(cards.archivedAt)))
      .orderBy(asc(cards.position));
  } else {
    result = await db
      .select()
      .from(cards)
      .where(and(eq(cards.assignee, auth.agentId), isNull(cards.archivedAt)))
      .orderBy(asc(cards.position));
  }

  return NextResponse.json(
    result.map(c => ({
      ...c,
      labels: c.labels ? JSON.parse(c.labels) : [],
      checklist: c.checklist ? JSON.parse(c.checklist) : [],
    }))
  );
}

// POST /api/agent/cards — agent creates a card on a board
// Body: { boardId, title, description?, column?, priority?, assignee? }
export async function POST(req: NextRequest) {
  const auth = authenticateRequest(req);
  if (isAuthError(auth)) return auth;

  if (!auth.agentId) {
    return NextResponse.json({ error: 'X-Agent-Id header required' }, { status: 400 });
  }

  const body = await req.json();
  if (!body.boardId || !body.title) {
    return NextResponse.json({ error: 'boardId and title are required' }, { status: 400 });
  }

  const board = db.select().from(boards).where(eq(boards.id, body.boardId)).get();
  if (!board) {
    return NextResponse.json({ error: 'Board not found' }, { status: 404 });
  }

  const cols = JSON.parse(board.columns);
  const column = body.column || cols[0]?.id || 'backlog';

  const existing = await db
    .select()
    .from(cards)
    .where(and(eq(cards.boardId, body.boardId), eq(cards.column, column)));
  const maxPos = existing.reduce((max, c) => Math.max(max, c.position), -1);

  const now = new Date();
  const newCard = {
    id: nanoid(),
    boardId: body.boardId,
    title: body.title,
    description: body.description || null,
    column,
    position: maxPos + 1,
    assignee: body.assignee || auth.agentId,
    labels: body.labels ? JSON.stringify(body.labels) : null,
    priority: body.priority || 'medium',
    dueDate: null,
    checklist: null,
    attachments: null,
    parentCardId: body.parentCardId || null,
    storyId: null,
    epicId: null,
    sprintId: null,
    progress: 0,
    createdBy: auth.agentId,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    archivedAt: null,
  };

  await db.insert(cards).values(newCard);
  await db.insert(cardHistory).values({
    id: nanoid('hist'),
    cardId: newCard.id,
    action: 'created',
    by: auth.agentId,
    fromValue: null,
    toValue: column,
    timestamp: now,
  });

  broadcastBoardEvent({
    type: 'card.created',
    boardId: body.boardId,
    cardId: newCard.id,
    by: auth.agentId,
    data: { title: newCard.title, column },
  });

  return NextResponse.json({ ok: true, card: newCard }, { status: 201 });
}

// PATCH /api/agent/cards — agent moves/updates a card
// Body: { cardId, column?, progress?, comment? }
export async function PATCH(req: NextRequest) {
  const auth = authenticateRequest(req);
  if (isAuthError(auth)) return auth;

  if (!auth.agentId) {
    return NextResponse.json({ error: 'X-Agent-Id header required' }, { status: 400 });
  }

  const body = await req.json();
  if (!body.cardId) {
    return NextResponse.json({ error: 'cardId is required' }, { status: 400 });
  }

  const card = db.select().from(cards).where(eq(cards.id, body.cardId)).get();
  if (!card) {
    return NextResponse.json({ error: 'Card not found' }, { status: 404 });
  }

  const now = new Date();
  const updates: Record<string, unknown> = { updatedAt: now };

  if (body.column !== undefined && body.column !== card.column) {
    await db.insert(cardHistory).values({
      id: nanoid('hist'),
      cardId: body.cardId,
      action: 'moved',
      by: auth.agentId,
      fromValue: card.column,
      toValue: body.column,
      timestamp: now,
    });
    updates.column = body.column;

    // Auto-complete when moved to done-like column
    if (/^(done|deployed|resolved|published|closed)$/i.test(body.column)) {
      updates.completedAt = now;
    }

    broadcastBoardEvent({
      type: 'card.moved',
      boardId: card.boardId,
      cardId: body.cardId,
      by: auth.agentId,
      data: { from: card.column, to: body.column, title: card.title },
    });
  }

  if (body.progress !== undefined) updates.progress = body.progress;
  if (body.title !== undefined) updates.title = body.title;
  if (body.description !== undefined) updates.description = body.description;
  if (body.priority !== undefined) updates.priority = body.priority;

  db.update(cards).set(updates).where(eq(cards.id, body.cardId)).run();

  // Add comment if provided
  if (body.comment) {
    await db.insert(cardComments).values({
      id: nanoid('cmt'),
      cardId: body.cardId,
      author: auth.agentId,
      content: body.comment,
      createdAt: now,
    });

    broadcastBoardEvent({
      type: 'card.commented',
      boardId: card.boardId,
      cardId: body.cardId,
      by: auth.agentId,
      data: { content: body.comment.slice(0, 200), title: card.title },
    });
  }

  return NextResponse.json({ ok: true, cardId: body.cardId });
}
