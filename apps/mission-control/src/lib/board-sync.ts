import { db } from '@/lib/db';
import { boards, cards, cardHistory } from '@/lib/schema';
import { eq, and, like, sql } from 'drizzle-orm';
import { broadcastBoardEvent } from '@/lib/events';

/**
 * Board Sync — maps content pipeline events to board cards.
 *
 * Cards are linked to drafts via a `draft:{draftId}` entry in the
 * card's labels JSON array.  All operations are fire-and-forget:
 * failures are logged but never block the caller.
 */

// Maps content draft status to board column IDs
const STATUS_TO_COLUMN: Record<string, string> = {
  draft: 'ideas',
  researching: 'researching',
  writing: 'writing',
  review: 'review',
  approved: 'review',
  published: 'published',
  rejected: 'ideas', // back to ideas for rework
};

function draftLabel(draftId: string): string {
  return `draft:${draftId}`;
}

/**
 * Find the Content Pipeline board.
 * Prefers a board whose ID is 'board_social', falls back to any board
 * whose columns JSON contains both 'ideas' and 'published'.
 */
async function findContentBoard(): Promise<string | null> {
  // Try exact ID first
  const exact = db.select().from(boards).where(eq(boards.id, 'board_social')).get();
  if (exact) return exact.id;

  // Fallback: scan for a board with matching columns
  const all = db.select({ id: boards.id, columns: boards.columns }).from(boards).all();
  for (const b of all) {
    try {
      const cols: Array<{ id: string }> = JSON.parse(b.columns);
      const ids = cols.map(c => c.id);
      if (ids.includes('ideas') && ids.includes('published')) {
        return b.id;
      }
    } catch { /* skip malformed */ }
  }

  return null;
}

/**
 * Find an existing card linked to a specific draft.
 */
function findCardByDraft(boardId: string, draftId: string) {
  const label = draftLabel(draftId);
  // labels is a JSON array stored as text — use LIKE for a pragmatic match
  return db
    .select()
    .from(cards)
    .where(and(eq(cards.boardId, boardId), like(cards.labels, `%${label}%`)))
    .get();
}

/**
 * Create or update a board card when a new draft is created / updated.
 */
export async function syncDraftToBoard(draft: {
  id: string;
  title: string;
  platform: string;
  agentId: string | null;
  status: string;
}): Promise<void> {
  try {
    const boardId = await findContentBoard();
    if (!boardId) return;

    const column = STATUS_TO_COLUMN[draft.status] || 'ideas';
    const label = draftLabel(draft.id);
    const labelsArr = [draft.platform, label];

    const existing = findCardByDraft(boardId, draft.id);

    if (existing) {
      // Update existing card
      const now = new Date();
      db.update(cards)
        .set({
          title: draft.title,
          column,
          assignee: draft.agentId || existing.assignee,
          labels: JSON.stringify(labelsArr),
          updatedAt: now,
        })
        .where(eq(cards.id, existing.id))
        .run();

      if (existing.column !== column) {
        db.insert(cardHistory).values({
          id: `hist_${crypto.randomUUID()}`,
          cardId: existing.id,
          action: 'moved',
          by: 'system',
          fromValue: existing.column,
          toValue: column,
          timestamp: now,
        }).run();

        broadcastBoardEvent({
          type: 'card.moved',
          boardId,
          cardId: existing.id,
          by: 'system',
          data: { from: existing.column, to: column },
        });
      }
    } else {
      // Create new card
      const now = new Date();

      // Get max position in target column
      const maxResult = db
        .select({ max: sql<number>`coalesce(max(${cards.position}), -1)` })
        .from(cards)
        .where(and(eq(cards.boardId, boardId), eq(cards.column, column)))
        .get();
      const pos = (maxResult?.max ?? -1) + 1;

      const cardId = `card_${crypto.randomUUID()}`;

      await db.insert(cards).values({
        id: cardId,
        boardId,
        title: draft.title,
        description: null,
        column,
        position: pos,
        assignee: draft.agentId || null,
        labels: JSON.stringify(labelsArr),
        priority: 'medium',
        dueDate: null,
        checklist: null,
        attachments: null,
        parentCardId: null,
        storyId: null,
        epicId: null,
        sprintId: null,
        progress: 0,
        createdBy: 'system',
        createdAt: now,
        updatedAt: now,
        completedAt: null,
        archivedAt: null,
      });

      await db.insert(cardHistory).values({
        id: `hist_${crypto.randomUUID()}`,
        cardId,
        action: 'created',
        by: 'system',
        fromValue: null,
        toValue: column,
        timestamp: now,
      });

      broadcastBoardEvent({
        type: 'card.created',
        boardId,
        cardId,
        by: 'system',
        data: { title: draft.title, column },
      });
    }
  } catch (err) {
    console.error('[board-sync] syncDraftToBoard error:', err);
  }
}

/**
 * Move a card when a draft's status changes.
 */
export async function syncDraftStatus(
  draftId: string,
  newStatus: string,
): Promise<void> {
  try {
    const boardId = await findContentBoard();
    if (!boardId) return;

    const card = findCardByDraft(boardId, draftId);
    if (!card) return; // no linked card — nothing to move

    const newColumn = STATUS_TO_COLUMN[newStatus];
    if (!newColumn || card.column === newColumn) return; // no change

    const now = new Date();

    db.update(cards)
      .set({ column: newColumn, updatedAt: now })
      .where(eq(cards.id, card.id))
      .run();

    db.insert(cardHistory).values({
      id: `hist_${crypto.randomUUID()}`,
      cardId: card.id,
      action: 'moved',
      by: 'system',
      fromValue: card.column,
      toValue: newColumn,
      timestamp: now,
    }).run();

    broadcastBoardEvent({
      type: 'card.moved',
      boardId,
      cardId: card.id,
      by: 'system',
      data: { from: card.column, to: newColumn },
    });
  } catch (err) {
    console.error('[board-sync] syncDraftStatus error:', err);
  }
}
