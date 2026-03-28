import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { cards, cardComments, cardHistory } from '@/lib/schema';
import { eq, asc } from 'drizzle-orm';
import { broadcastBoardEvent } from '@/lib/events';

function nanoid(prefix = 'cmt') {
  return `${prefix}_${crypto.randomUUID()}`;
}

type Ctx = { params: Promise<{ boardId: string; cardId: string }> };

// GET /api/boards/:boardId/cards/:cardId/comments
export async function GET(_req: NextRequest, ctx: Ctx) {
  const { cardId } = await ctx.params;

  const comments = await db
    .select()
    .from(cardComments)
    .where(eq(cardComments.cardId, cardId))
    .orderBy(asc(cardComments.createdAt));

  return NextResponse.json(comments);
}

// POST /api/boards/:boardId/cards/:cardId/comments
export async function POST(req: NextRequest, ctx: Ctx) {
  const { boardId, cardId } = await ctx.params;
  const body = await req.json();

  if (!body.content) {
    return NextResponse.json({ ok: false, error: 'content is required' }, { status: 400 });
  }

  // Verify card exists
  const card = db.select().from(cards).where(eq(cards.id, cardId)).get();
  if (!card) {
    return NextResponse.json({ ok: false, error: 'Card not found' }, { status: 404 });
  }

  const now = new Date();
  const author = body.author || 'user';

  const comment = {
    id: body.id || nanoid(),
    cardId,
    author,
    content: body.content,
    createdAt: now,
  };

  await db.insert(cardComments).values(comment);

  // Log history
  await db.insert(cardHistory).values({
    id: nanoid('hist'),
    cardId,
    action: 'commented',
    by: author,
    fromValue: null,
    toValue: body.content.slice(0, 100),
    timestamp: now,
  });

  broadcastBoardEvent({
    type: 'card.commented',
    boardId,
    cardId,
    by: author,
    data: { content: body.content.slice(0, 200), title: card.title },
  });

  return NextResponse.json(comment, { status: 201 });
}
