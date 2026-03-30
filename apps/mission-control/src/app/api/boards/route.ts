import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { boards } from '@/lib/schema';
import { desc, isNull, eq, and } from 'drizzle-orm';
import { broadcastBoardEvent } from '@/lib/events';

function nanoid(prefix = 'board') {
  return `${prefix}_${crypto.randomUUID()}`;
}

// GET /api/boards — list all boards (non-archived)
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const includeArchived = url.searchParams.get('archived') === 'true';
  const squadFilter = url.searchParams.get('squad');

  const conditions = [];
  if (!includeArchived) conditions.push(isNull(boards.archivedAt));
  if (squadFilter) conditions.push(eq(boards.squad, squadFilter));

  const where = conditions.length > 0
    ? conditions.length === 1 ? conditions[0] : and(...conditions)
    : undefined;

  const result = await db.select().from(boards).where(where).orderBy(desc(boards.updatedAt));

  return NextResponse.json(result);
}

// POST /api/boards — create a board
export async function POST(req: NextRequest) {
  const body = await req.json();

  if (!body.name) {
    return NextResponse.json({ ok: false, error: 'name is required' }, { status: 400 });
  }
  if (!body.columns || !Array.isArray(body.columns) || body.columns.length === 0) {
    return NextResponse.json({ ok: false, error: 'columns array is required' }, { status: 400 });
  }

  const now = new Date();
  const newBoard = {
    id: body.id || nanoid(),
    name: body.name,
    description: body.description || null,
    type: body.type || 'kanban',
    columns: JSON.stringify(body.columns),
    owner: body.owner || 'user',
    squad: body.squad || null,
    settings: body.settings ? JSON.stringify(body.settings) : null,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
  };

  await db.insert(boards).values(newBoard);

  broadcastBoardEvent({
    type: 'board.created',
    boardId: newBoard.id,
    by: newBoard.owner,
    data: { name: newBoard.name, type: newBoard.type },
  });

  return NextResponse.json({ ...newBoard, columns: body.columns }, { status: 201 });
}
