import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, isAuthError } from '@/lib/auth';
import {
  agents, tasks, activities, boards, cards, cardComments, cardHistory,
  costEvents, approvals, settings, epics, stories, sprints, projects,
} from '@/lib/schema';

// POST /api/reset — reset the database to a fresh state
// Body: { confirm: "RESET" } required to prevent accidental calls
// Auth required — this is a destructive operation
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (isAuthError(auth)) return auth;

  try {
    const body = await req.json();

    if (body.confirm !== 'RESET') {
      return NextResponse.json({ ok: false, error: 'Confirmation required: send { confirm: "RESET" }' }, { status: 400 });
    }

    // Delete all data from all tables (order matters for referential integrity)
    db.delete(cardComments).run();
    db.delete(cardHistory).run();
    db.delete(cards).run();
    db.delete(boards).run();
    db.delete(activities).run();
    db.delete(costEvents).run();
    db.delete(approvals).run();
    db.delete(tasks).run();
    db.delete(sprints).run();
    db.delete(stories).run();
    db.delete(epics).run();
    db.delete(projects).run();
    db.delete(agents).run();
    db.delete(settings).run();

    return NextResponse.json({ ok: true, message: 'All data has been reset. Reload to restart onboarding.' });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
