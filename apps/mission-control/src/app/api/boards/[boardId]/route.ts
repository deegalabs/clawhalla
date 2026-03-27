import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { boards, cards } from '@/lib/schema';
import { eq, asc } from 'drizzle-orm';
import { broadcastBoardEvent } from '@/lib/events';

type Ctx = { params: Promise<{ boardId: string }> };

// GET /api/boards/:boardId — get board with all cards
export async function GET(_req: NextRequest, ctx: Ctx) {
  const { boardId } = await ctx.params;
  const board = db.select().from(boards).where(eq(boards.id, boardId)).get();

  if (!board) {
    return NextResponse.json({ error: 'Board not found' }, { status: 404 });
  }

  const boardCards = await db
    .select()
    .from(cards)
    .where(eq(cards.boardId, boardId))
    .orderBy(asc(cards.position));

  return NextResponse.json({
    ...board,
    columns: JSON.parse(board.columns),
    settings: board.settings ? JSON.parse(board.settings) : null,
    cards: boardCards.map(c => ({
      ...c,
      labels: c.labels ? JSON.parse(c.labels) : [],
      checklist: c.checklist ? JSON.parse(c.checklist) : [],
      attachments: c.attachments ? JSON.parse(c.attachments) : [],
    })),
  });
}

// PATCH /api/boards/:boardId — update board (name, columns, settings, etc.)
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { boardId } = await ctx.params;
  const body = await req.json();

  const existing = db.select().from(boards).where(eq(boards.id, boardId)).get();
  if (!existing) {
    return NextResponse.json({ error: 'Board not found' }, { status: 404 });
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name !== undefined) updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description;
  if (body.type !== undefined) updates.type = body.type;
  if (body.columns !== undefined) updates.columns = JSON.stringify(body.columns);
  if (body.settings !== undefined) updates.settings = JSON.stringify(body.settings);
  if (body.squad !== undefined) updates.squad = body.squad;

  db.update(boards).set(updates).where(eq(boards.id, boardId)).run();

  broadcastBoardEvent({
    type: 'board.updated',
    boardId,
    by: body.by || 'user',
    data: { fields: Object.keys(body) },
  });

  return NextResponse.json({ ok: true, boardId });
}

// DELETE /api/boards/:boardId — archive (soft delete) or hard delete
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { boardId } = await ctx.params;
  const url = new URL(req.url);
  const hard = url.searchParams.get('hard') === 'true';

  const existing = db.select().from(boards).where(eq(boards.id, boardId)).get();
  if (!existing) {
    return NextResponse.json({ error: 'Board not found' }, { status: 404 });
  }

  if (hard) {
    // Delete all cards, comments, history, then the board
    const boardCards = await db.select().from(cards).where(eq(cards.boardId, boardId));
    for (const card of boardCards) {
      db.delete(cards).where(eq(cards.id, card.id)).run();
    }
    db.delete(boards).where(eq(boards.id, boardId)).run();
  } else {
    db.update(boards)
      .set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(eq(boards.id, boardId))
      .run();
  }

  broadcastBoardEvent({
    type: hard ? 'board.deleted' : 'board.archived',
    boardId,
    by: 'user',
  });

  return NextResponse.json({ ok: true, boardId, action: hard ? 'deleted' : 'archived' });
}
