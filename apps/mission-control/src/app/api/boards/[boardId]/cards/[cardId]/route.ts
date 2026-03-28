import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { cards, cardHistory } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { broadcastBoardEvent } from '@/lib/events';
import { notify } from '@/lib/notify';

function nanoid(prefix = 'hist') {
  return `${prefix}_${Math.random().toString(36).substring(2, 8)}${Date.now().toString(36)}`;
}

type Ctx = { params: Promise<{ boardId: string; cardId: string }> };

// GET /api/boards/:boardId/cards/:cardId — get single card with history
export async function GET(_req: NextRequest, ctx: Ctx) {
  const { boardId, cardId } = await ctx.params;

  const card = db.select().from(cards).where(eq(cards.id, cardId)).get();
  if (!card || card.boardId !== boardId) {
    return NextResponse.json({ error: 'Card not found' }, { status: 404 });
  }

  const history = await db
    .select()
    .from(cardHistory)
    .where(eq(cardHistory.cardId, cardId));

  return NextResponse.json({
    ...card,
    labels: card.labels ? JSON.parse(card.labels) : [],
    checklist: card.checklist ? JSON.parse(card.checklist) : [],
    attachments: card.attachments ? JSON.parse(card.attachments) : [],
    history,
  });
}

// PATCH /api/boards/:boardId/cards/:cardId — update card fields
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { boardId, cardId } = await ctx.params;
  const body = await req.json();

  const card = db.select().from(cards).where(eq(cards.id, cardId)).get();
  if (!card || card.boardId !== boardId) {
    return NextResponse.json({ error: 'Card not found' }, { status: 404 });
  }

  const now = new Date();
  const by = body.by || 'user';
  const updates: Record<string, unknown> = { updatedAt: now };

  // Track column moves
  if (body.column !== undefined && body.column !== card.column) {
    await db.insert(cardHistory).values({
      id: nanoid(),
      cardId,
      action: 'moved',
      by,
      fromValue: card.column,
      toValue: body.column,
      timestamp: now,
    });
    updates.column = body.column;

    broadcastBoardEvent({
      type: 'card.moved',
      boardId,
      cardId,
      by,
      data: { from: card.column, to: body.column, title: card.title },
    });
  }

  // Track assignee changes
  if (body.assignee !== undefined && body.assignee !== card.assignee) {
    await db.insert(cardHistory).values({
      id: nanoid(),
      cardId,
      action: 'assigned',
      by,
      fromValue: card.assignee,
      toValue: body.assignee,
      timestamp: now,
    });
    updates.assignee = body.assignee;

    broadcastBoardEvent({
      type: 'card.assigned',
      boardId,
      cardId,
      by,
      data: { assignee: body.assignee, title: card.title },
    });
  }

  if (body.title !== undefined) updates.title = body.title;
  if (body.description !== undefined) updates.description = body.description;
  if (body.position !== undefined) updates.position = body.position;
  if (body.priority !== undefined) updates.priority = body.priority;
  if (body.dueDate !== undefined) updates.dueDate = body.dueDate ? new Date(body.dueDate) : null;
  if (body.progress !== undefined) updates.progress = body.progress;
  if (body.labels !== undefined) updates.labels = JSON.stringify(body.labels);
  if (body.checklist !== undefined) updates.checklist = JSON.stringify(body.checklist);
  if (body.attachments !== undefined) updates.attachments = JSON.stringify(body.attachments);
  if (body.parentCardId !== undefined) updates.parentCardId = body.parentCardId;
  if (body.storyId !== undefined) updates.storyId = body.storyId;
  if (body.epicId !== undefined) updates.epicId = body.epicId;
  if (body.sprintId !== undefined) updates.sprintId = body.sprintId;

  // Restore from archive
  if (body.archivedAt === null) updates.archivedAt = null;

  // Auto-set completedAt when moved to a "done"-like column
  if (body.column && /^(done|deployed|resolved|published|closed)$/i.test(body.column)) {
    updates.completedAt = now;

    notify({
      type: 'task',
      title: 'Task Completed',
      body: `"${card.title}" moved to ${body.column}${card.assignee ? ` by @${card.assignee}` : ''}`,
      icon: '✅',
      href: '/tasks',
      agentId: card.assignee || by,
      priority: 'low',
    });
  }

  db.update(cards).set(updates).where(eq(cards.id, cardId)).run();

  // General update event (if not already a move/assign)
  if (!body.column && !body.assignee) {
    broadcastBoardEvent({
      type: 'card.updated',
      boardId,
      cardId,
      by,
      data: { fields: Object.keys(body), title: card.title },
    });
  }

  return NextResponse.json({ ok: true, cardId });
}

// DELETE /api/boards/:boardId/cards/:cardId — archive or delete
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { boardId, cardId } = await ctx.params;
  const url = new URL(req.url);
  const hard = url.searchParams.get('hard') === 'true';

  const card = db.select().from(cards).where(eq(cards.id, cardId)).get();
  if (!card || card.boardId !== boardId) {
    return NextResponse.json({ error: 'Card not found' }, { status: 404 });
  }

  if (hard) {
    db.delete(cards).where(eq(cards.id, cardId)).run();
  } else {
    db.update(cards)
      .set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(eq(cards.id, cardId))
      .run();
  }

  broadcastBoardEvent({
    type: hard ? 'card.deleted' : 'card.archived',
    boardId,
    cardId,
    by: 'user',
    data: { title: card.title },
  });

  return NextResponse.json({ ok: true, cardId, action: hard ? 'deleted' : 'archived' });
}
