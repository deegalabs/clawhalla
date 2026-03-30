import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { cards, cardHistory, boards } from '@/lib/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { broadcastBoardEvent } from '@/lib/events';
import { SQUADS_BY_ID } from '@/lib/squads';

function nanoid(prefix = 'card') {
  return `${prefix}_${crypto.randomUUID()}`;
}

type Ctx = { params: Promise<{ boardId: string; cardId: string }> };

/**
 * POST /api/boards/:boardId/cards/:cardId/delegate
 *
 * Delegates a card to another squad by:
 * 1. Finding (or creating) a board for the target squad
 * 2. Creating a linked card in that board
 * 3. Marking the source card as "delegated" (column → delegated, delegatedTo → new card id)
 * 4. The new card has delegatedFrom → source card id
 *
 * When the delegated card completes, a callback updates the source card.
 *
 * Body: { targetSquad: string, message?: string }
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const { boardId, cardId } = await ctx.params;

  try {
    const body = await req.json();
    const { targetSquad, message } = body;

    if (!targetSquad) {
      return NextResponse.json({ ok: false, error: 'targetSquad is required' }, { status: 400 });
    }

    // Validate target squad exists
    const squadDef = SQUADS_BY_ID[targetSquad];
    if (!squadDef) {
      return NextResponse.json({ ok: false, error: `Unknown squad: ${targetSquad}` }, { status: 400 });
    }

    // Get source card
    const sourceCard = db.select().from(cards).where(eq(cards.id, cardId)).get();
    if (!sourceCard || sourceCard.boardId !== boardId) {
      return NextResponse.json({ ok: false, error: 'Source card not found' }, { status: 404 });
    }

    // Get source board to know the source squad
    const sourceBoard = db.select().from(boards).where(eq(boards.id, boardId)).get();
    const sourceSquad = sourceBoard?.squad || 'unknown';

    if (sourceSquad === targetSquad) {
      return NextResponse.json({ ok: false, error: 'Cannot delegate to the same squad' }, { status: 400 });
    }

    // Already delegated?
    if (sourceCard.delegatedTo) {
      return NextResponse.json({ ok: false, error: 'Card is already delegated' }, { status: 409 });
    }

    // Find or create a board for the target squad
    let targetBoard = db
      .select()
      .from(boards)
      .where(and(eq(boards.squad, targetSquad), isNull(boards.archivedAt)))
      .get();

    if (!targetBoard) {
      // Create a default kanban board for the target squad
      const newBoardId = `board_${targetSquad}`;
      const now = new Date();
      const defaultColumns = JSON.stringify([
        { id: 'backlog', name: 'Backlog', color: '#6b7280' },
        { id: 'doing', name: 'Doing', color: '#3b82f6' },
        { id: 'review', name: 'Review', color: '#f59e0b' },
        { id: 'done', name: 'Done', color: '#10b981' },
      ]);
      await db.insert(boards).values({
        id: newBoardId,
        name: `${squadDef.name} Board`,
        type: 'kanban',
        columns: defaultColumns,
        owner: 'system',
        squad: targetSquad,
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
      });
      targetBoard = db.select().from(boards).where(eq(boards.id, newBoardId)).get();
    }

    if (!targetBoard) {
      return NextResponse.json({ ok: false, error: 'Failed to find/create target board' }, { status: 500 });
    }

    // Determine the lead agent of the target squad
    const leadAgent = squadDef.agents[0]; // first agent is always lead

    // Create delegated card in target board
    const now = new Date();
    const delegatedCardId = nanoid('card');
    const sourceSquadDef = SQUADS_BY_ID[sourceSquad];
    const delegationNote = message
      ? `\n\n---\n**Delegated from ${sourceSquadDef?.name || sourceSquad} squad:**\n${message}`
      : `\n\n---\n**Delegated from ${sourceSquadDef?.name || sourceSquad} squad**`;

    await db.insert(cards).values({
      id: delegatedCardId,
      boardId: targetBoard.id,
      title: `[${sourceSquadDef?.emoji || '📋'}] ${sourceCard.title}`,
      description: (sourceCard.description || '') + delegationNote,
      column: 'backlog',
      position: 0,
      assignee: leadAgent?.name.toLowerCase() || null,
      priority: sourceCard.priority || 'medium',
      labels: JSON.stringify(['cross-squad', `from:${sourceSquad}`]),
      delegatedFrom: sourceCard.id,
      createdBy: 'claw',
      createdAt: now,
      updatedAt: now,
    });

    // Log history on delegated card
    await db.insert(cardHistory).values({
      id: nanoid('hist'),
      cardId: delegatedCardId,
      action: 'created',
      by: 'claw',
      toValue: `delegated from ${sourceSquad}`,
      timestamp: now,
    });

    // Update source card: mark as delegated
    await db
      .update(cards)
      .set({
        delegatedTo: delegatedCardId,
        column: 'delegated',
        updatedAt: now,
      })
      .where(eq(cards.id, cardId));

    // Log history on source card
    await db.insert(cardHistory).values({
      id: nanoid('hist'),
      cardId: cardId,
      action: 'moved',
      by: 'claw',
      fromValue: sourceCard.column,
      toValue: 'delegated',
      timestamp: now,
    });
    await db.insert(cardHistory).values({
      id: nanoid('hist'),
      cardId: cardId,
      action: 'delegated',
      by: 'claw',
      toValue: `→ ${squadDef.name} (${delegatedCardId})`,
      timestamp: now,
    });

    // Broadcast events
    broadcastBoardEvent({
      type: 'card.moved',
      boardId,
      cardId,
      by: 'claw',
      data: { from: sourceCard.column, to: 'delegated' },
    });
    broadcastBoardEvent({
      type: 'card.created',
      boardId: targetBoard.id,
      cardId: delegatedCardId,
      by: 'claw',
      data: { title: sourceCard.title, squad: targetSquad },
    });

    return NextResponse.json({
      ok: true,
      sourceCard: { id: cardId, column: 'delegated', delegatedTo: delegatedCardId },
      delegatedCard: {
        id: delegatedCardId,
        boardId: targetBoard.id,
        boardName: targetBoard.name,
        squad: targetSquad,
        assignee: leadAgent?.name.toLowerCase() || null,
      },
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
