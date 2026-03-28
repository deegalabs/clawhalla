import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { campaignContacts } from '@/lib/schema';
import { eq, desc } from 'drizzle-orm';
import { authenticateRequest, isAuthError } from '@/lib/auth';

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/campaigns/:id/contacts — list contacts for a campaign
export async function GET(req: NextRequest, ctx: RouteContext) {
  const auth = authenticateRequest(req);
  if (isAuthError(auth)) return auth;

  if (auth.type === 'agent') {
    return NextResponse.json({ ok: false, error: 'Agents cannot access campaign contacts' }, { status: 403 });
  }

  const { id } = await ctx.params;

  const result = await db.select({
    id: campaignContacts.id,
    email: campaignContacts.email,
    name: campaignContacts.name,
    status: campaignContacts.status,
    sentAt: campaignContacts.sentAt,
    error: campaignContacts.error,
  })
    .from(campaignContacts)
    .where(eq(campaignContacts.campaignId, id))
    .orderBy(desc(campaignContacts.createdAt))
    .limit(500); // Paginated — max 500 per request

  return NextResponse.json(result);
}
