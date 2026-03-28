import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { boards, cards, cardHistory } from '@/lib/schema';
import { eq, and, asc, isNull, isNotNull } from 'drizzle-orm';
import { broadcastBoardEvent } from '@/lib/events';

function nanoid(prefix = 'card') {
  return `${prefix}_${crypto.randomUUID()}`;
}

type Ctx = { params: Promise<{ boardId: string }> };

// GET /api/boards/:boardId/cards — list cards (optionally filter by column, assignee)
export async function GET(req: NextRequest, ctx: Ctx) {
  const { boardId } = await ctx.params;
  const url = new URL(req.url);
  const column = url.searchParams.get('column');
  const assignee = url.searchParams.get('assignee');
  const archived = url.searchParams.get('archived') === 'true';

  let query = db
    .select()
    .from(cards)
    .where(and(
      eq(cards.boardId, boardId),
      archived ? isNotNull(cards.archivedAt) : isNull(cards.archivedAt),
    ))
    .orderBy(asc(cards.position));

  let result = await query;

  if (column) result = result.filter(c => c.column === column);
  if (assignee) result = result.filter(c => c.assignee === assignee);

  return NextResponse.json(
    result.map(c => ({
      ...c,
      labels: c.labels ? JSON.parse(c.labels) : [],
      checklist: c.checklist ? JSON.parse(c.checklist) : [],
      attachments: c.attachments ? JSON.parse(c.attachments) : [],
    }))
  );
}

// POST /api/boards/:boardId/cards — create a card
export async function POST(req: NextRequest, ctx: Ctx) {
  const { boardId } = await ctx.params;
  const body = await req.json();

  // Verify board exists
  const board = db.select().from(boards).where(eq(boards.id, boardId)).get();
  if (!board) {
    return NextResponse.json({ ok: false, error: 'Board not found' }, { status: 404 });
  }

  if (!body.title) {
    return NextResponse.json({ ok: false, error: 'title is required' }, { status: 400 });
  }

  // Determine column (default to first column)
  const cols = JSON.parse(board.columns);
  const column = body.column || cols[0]?.id || 'backlog';

  // Get max position in column
  const existing = await db
    .select()
    .from(cards)
    .where(and(eq(cards.boardId, boardId), eq(cards.column, column)));
  const maxPos = existing.reduce((max, c) => Math.max(max, c.position), -1);

  const now = new Date();
  const newCard = {
    id: body.id || nanoid(),
    boardId,
    title: body.title,
    description: body.description || null,
    column,
    position: body.position ?? maxPos + 1,
    assignee: body.assignee || null,
    labels: body.labels ? JSON.stringify(body.labels) : null,
    priority: body.priority || 'medium',
    dueDate: body.dueDate ? new Date(body.dueDate) : null,
    checklist: body.checklist ? JSON.stringify(body.checklist) : null,
    attachments: body.attachments ? JSON.stringify(body.attachments) : null,
    parentCardId: body.parentCardId || null,
    storyId: body.storyId || null,
    epicId: body.epicId || null,
    sprintId: body.sprintId || null,
    progress: body.progress ?? 0,
    createdBy: body.createdBy || 'user',
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    archivedAt: null,
  };

  await db.insert(cards).values(newCard);

  // Log history
  await db.insert(cardHistory).values({
    id: nanoid('hist'),
    cardId: newCard.id,
    action: 'created',
    by: newCard.createdBy,
    fromValue: null,
    toValue: column,
    timestamp: now,
  });

  broadcastBoardEvent({
    type: 'card.created',
    boardId,
    cardId: newCard.id,
    by: newCard.createdBy,
    data: { title: newCard.title, column },
  });

  return NextResponse.json(
    { ...newCard, labels: body.labels || [], checklist: body.checklist || [], attachments: body.attachments || [] },
    { status: 201 }
  );
}
