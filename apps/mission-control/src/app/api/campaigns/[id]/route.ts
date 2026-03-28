import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { campaigns, campaignContacts } from '@/lib/schema';
import { eq, and, sql } from 'drizzle-orm';
import { startCampaignSend, abortCampaign, isRunning } from '@/lib/campaign-sender';

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/campaigns/:id — get campaign with stats
export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, id));
  if (!campaign) {
    return NextResponse.json({ ok: false, error: 'Campaign not found' }, { status: 404 });
  }

  // Get contact stats
  const stats = await db.select({
    total: sql<number>`count(*)`,
    pending: sql<number>`sum(case when ${campaignContacts.status} = 'pending' then 1 else 0 end)`,
    sent: sql<number>`sum(case when ${campaignContacts.status} = 'sent' then 1 else 0 end)`,
    failed: sql<number>`sum(case when ${campaignContacts.status} = 'failed' then 1 else 0 end)`,
  }).from(campaignContacts).where(eq(campaignContacts.campaignId, id));

  return NextResponse.json({
    ...campaign,
    settings: campaign.settings ? JSON.parse(campaign.settings) : null,
    stats: stats[0] || { total: 0, pending: 0, sent: 0, failed: 0 },
    isRunning: isRunning(id),
  });
}

// PATCH /api/campaigns/:id — update campaign (only when draft or paused)
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, id));
  if (!campaign) {
    return NextResponse.json({ ok: false, error: 'Campaign not found' }, { status: 404 });
  }

  if (campaign.status === 'sending') {
    return NextResponse.json({ ok: false, error: 'Cannot edit while sending' }, { status: 400 });
  }

  const body = await req.json();
  const updates: Record<string, unknown> = { updatedAt: new Date() };

  const editable = ['name', 'subject', 'fromName', 'fromEmail', 'replyTo', 'templateHtml', 'templateText', 'smtpVaultKey'] as const;
  for (const key of editable) {
    if (body[key] !== undefined) updates[key] = body[key];
  }
  if (body.settings !== undefined) {
    updates.settings = JSON.stringify(body.settings);
  }

  await db.update(campaigns).set(updates).where(eq(campaigns.id, id));
  return NextResponse.json({ ok: true });
}

// DELETE /api/campaigns/:id — delete campaign and contacts
export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;

  if (isRunning(id)) {
    abortCampaign(id);
  }

  await db.delete(campaignContacts).where(eq(campaignContacts.campaignId, id));
  await db.delete(campaigns).where(eq(campaigns.id, id));

  return NextResponse.json({ ok: true });
}

// POST is handled via actions below — but Next.js route only allows one POST per file,
// so we use query params: POST /api/campaigns/:id?action=send|pause|import
export async function POST(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const action = url.searchParams.get('action');

  if (action === 'send') return handleSend(id);
  if (action === 'pause') return handlePause(id);
  if (action === 'import') return handleImport(id, req);
  if (action === 'reset-failed') return handleResetFailed(id);

  return NextResponse.json({ ok: false, error: 'action param required: send|pause|import|reset-failed' }, { status: 400 });
}

// ── Actions ──────────────────────────────────────────────────────────────────

async function handleSend(id: string) {
  const result = await startCampaignSend(id);
  if (!result.started) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, message: 'Campaign sending started' });
}

async function handlePause(id: string) {
  if (isRunning(id)) {
    abortCampaign(id);
    return NextResponse.json({ ok: true, message: 'Campaign paused' });
  }
  return NextResponse.json({ ok: false, error: 'Campaign is not sending' }, { status: 400 });
}

async function handleResetFailed(id: string) {
  await db.update(campaignContacts)
    .set({ status: 'pending', error: null })
    .where(and(eq(campaignContacts.campaignId, id), eq(campaignContacts.status, 'failed')));

  // Reset campaign error
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, id));
  if (campaign) {
    await db.update(campaigns)
      .set({ status: 'draft', error: null, failedCount: 0, updatedAt: new Date() })
      .where(eq(campaigns.id, id));
  }

  return NextResponse.json({ ok: true, message: 'Failed contacts reset to pending' });
}

async function handleImport(id: string, req: NextRequest) {
  const body = await req.json();

  if (!body.contacts || !Array.isArray(body.contacts)) {
    return NextResponse.json({ ok: false, error: 'contacts array required' }, { status: 400 });
  }

  const now = new Date();
  let imported = 0;
  let skipped = 0;

  for (const c of body.contacts) {
    if (!c.email || !c.email.includes('@')) {
      skipped++;
      continue;
    }

    // Check for duplicate
    const existing = await db.select({ id: campaignContacts.id })
      .from(campaignContacts)
      .where(and(
        eq(campaignContacts.campaignId, id),
        eq(campaignContacts.email, c.email.toLowerCase().trim())
      ));

    if (existing.length > 0) {
      skipped++;
      continue;
    }

    await db.insert(campaignContacts).values({
      id: `cc_${crypto.randomUUID()}`,
      campaignId: id,
      email: c.email.toLowerCase().trim(),
      name: c.name || null,
      variables: c.variables ? JSON.stringify(c.variables) : null,
      status: 'pending',
      createdAt: now,
    });
    imported++;
  }

  // Update total count
  const [countResult] = await db.select({
    total: sql<number>`count(*)`,
  }).from(campaignContacts).where(eq(campaignContacts.campaignId, id));

  await db.update(campaigns)
    .set({ totalContacts: countResult.total, updatedAt: now })
    .where(eq(campaigns.id, id));

  return NextResponse.json({ ok: true, imported, skipped, total: countResult.total });
}
