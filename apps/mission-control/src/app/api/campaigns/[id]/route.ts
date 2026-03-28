import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { campaigns, campaignContacts } from '@/lib/schema';
import { eq, and, sql } from 'drizzle-orm';
import { authenticateRequest, isAuthError } from '@/lib/auth';
import { checkRateLimit, releaseRateLimit } from '@/lib/rate-limit';
import { startCampaignSend, abortCampaign, isRunning } from '@/lib/campaign-sender';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SMTP_KEY_RE = /^[A-Z0-9_]{1,64}$/;
const MAX_IMPORT_BATCH = 5000;

type RouteContext = { params: Promise<{ id: string }> };

function sanitizeString(s: string, maxLen = 256): string {
  return s.replace(/[\r\n]/g, '').trim().slice(0, maxLen);
}

function denyAgent(auth: { type: string }) {
  if (auth.type === 'agent') {
    return NextResponse.json({ ok: false, error: 'Agents cannot access campaigns' }, { status: 403 });
  }
  return null;
}

// GET /api/campaigns/:id — get campaign with stats
export async function GET(req: NextRequest, ctx: RouteContext) {
  const auth = authenticateRequest(req);
  if (isAuthError(auth)) return auth;
  const denied = denyAgent(auth);
  if (denied) return denied;

  const { id } = await ctx.params;
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, id));
  if (!campaign) {
    return NextResponse.json({ ok: false, error: 'Campaign not found' }, { status: 404 });
  }

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
  const auth = authenticateRequest(req);
  if (isAuthError(auth)) return auth;
  const denied = denyAgent(auth);
  if (denied) return denied;

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

  // Validate editable fields
  if (body.name !== undefined) updates.name = sanitizeString(body.name);
  if (body.subject !== undefined) updates.subject = sanitizeString(body.subject, 998);
  if (body.fromName !== undefined) updates.fromName = sanitizeString(body.fromName, 128);
  if (body.fromEmail !== undefined) {
    if (!EMAIL_RE.test(body.fromEmail)) return NextResponse.json({ ok: false, error: 'Invalid fromEmail' }, { status: 400 });
    updates.fromEmail = sanitizeString(body.fromEmail, 254);
  }
  if (body.replyTo !== undefined) {
    if (body.replyTo && !EMAIL_RE.test(body.replyTo)) return NextResponse.json({ ok: false, error: 'Invalid replyTo' }, { status: 400 });
    updates.replyTo = body.replyTo ? sanitizeString(body.replyTo, 254) : null;
  }
  if (body.templateHtml !== undefined) updates.templateHtml = body.templateHtml;
  if (body.templateText !== undefined) updates.templateText = body.templateText || null;
  if (body.smtpVaultKey !== undefined) {
    if (!SMTP_KEY_RE.test(body.smtpVaultKey)) return NextResponse.json({ ok: false, error: 'Invalid smtpVaultKey' }, { status: 400 });
    updates.smtpVaultKey = body.smtpVaultKey;
  }
  if (body.settings !== undefined) {
    const allowed = ['delayMinDay','delayMaxDay','delayMinNight','delayMaxNight','pauseWindows','breakEvery','breakMinMs','breakMaxMs','timezone','maxConsecutiveFails'];
    const clean: Record<string, unknown> = {};
    for (const k of allowed) { if (body.settings[k] !== undefined) clean[k] = body.settings[k]; }
    // Enforce minimums
    if (typeof clean.delayMinDay === 'number') clean.delayMinDay = Math.max(30_000, clean.delayMinDay);
    if (typeof clean.delayMaxDay === 'number') clean.delayMaxDay = Math.max(60_000, clean.delayMaxDay);
    if (typeof clean.delayMinNight === 'number') clean.delayMinNight = Math.max(60_000, clean.delayMinNight);
    if (typeof clean.delayMaxNight === 'number') clean.delayMaxNight = Math.max(120_000, clean.delayMaxNight);
    if (typeof clean.breakEvery === 'number') clean.breakEvery = Math.max(1, Math.min(100, clean.breakEvery));
    if (typeof clean.maxConsecutiveFails === 'number') clean.maxConsecutiveFails = Math.max(1, Math.min(50, clean.maxConsecutiveFails));
    updates.settings = JSON.stringify(clean);
  }

  await db.update(campaigns).set(updates).where(eq(campaigns.id, id));
  return NextResponse.json({ ok: true });
}

// DELETE /api/campaigns/:id — delete campaign and contacts
export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const auth = authenticateRequest(req);
  if (isAuthError(auth)) return auth;
  const denied = denyAgent(auth);
  if (denied) return denied;

  const { id } = await ctx.params;

  const [campaign] = await db.select({ id: campaigns.id }).from(campaigns).where(eq(campaigns.id, id));
  if (!campaign) {
    return NextResponse.json({ ok: false, error: 'Campaign not found' }, { status: 404 });
  }

  if (isRunning(id)) {
    abortCampaign(id);
  }

  await db.delete(campaignContacts).where(eq(campaignContacts.campaignId, id));
  await db.delete(campaigns).where(eq(campaigns.id, id));

  return NextResponse.json({ ok: true });
}

// POST /api/campaigns/:id?action=send|pause|import|reset-failed
export async function POST(req: NextRequest, ctx: RouteContext) {
  const auth = authenticateRequest(req);
  if (isAuthError(auth)) return auth;
  const denied = denyAgent(auth);
  if (denied) return denied;

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
  // Rate limit: max 1 concurrent send, max 3 per minute
  const rateLimited = checkRateLimit('campaign-send', { maxConcurrent: 1, maxPerMinute: 3 });
  if (rateLimited) {
    return NextResponse.json({ ok: false, error: rateLimited }, { status: 429 });
  }

  const result = await startCampaignSend(id);
  if (!result.started) {
    releaseRateLimit('campaign-send');
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }
  // Note: rate limit released when campaign finishes in campaign-sender.ts
  return NextResponse.json({ ok: true, message: 'Campaign sending started' });
}

async function handlePause(id: string) {
  if (isRunning(id)) {
    abortCampaign(id);
    releaseRateLimit('campaign-send');
    return NextResponse.json({ ok: true, message: 'Campaign paused' });
  }
  return NextResponse.json({ ok: false, error: 'Campaign is not sending' }, { status: 400 });
}

async function handleResetFailed(id: string) {
  const [campaign] = await db.select({ id: campaigns.id, status: campaigns.status }).from(campaigns).where(eq(campaigns.id, id));
  if (!campaign) return NextResponse.json({ ok: false, error: 'Campaign not found' }, { status: 404 });

  await db.update(campaignContacts)
    .set({ status: 'pending', error: null })
    .where(and(eq(campaignContacts.campaignId, id), eq(campaignContacts.status, 'failed')));

  await db.update(campaigns)
    .set({ status: 'draft', error: null, failedCount: 0, updatedAt: new Date() })
    .where(eq(campaigns.id, id));

  return NextResponse.json({ ok: true, message: 'Failed contacts reset to pending' });
}

async function handleImport(id: string, req: NextRequest) {
  const [campaign] = await db.select({ id: campaigns.id }).from(campaigns).where(eq(campaigns.id, id));
  if (!campaign) return NextResponse.json({ ok: false, error: 'Campaign not found' }, { status: 404 });

  const body = await req.json();

  if (!body.contacts || !Array.isArray(body.contacts)) {
    return NextResponse.json({ ok: false, error: 'contacts array required' }, { status: 400 });
  }

  // Limit batch size to prevent DoS
  if (body.contacts.length > MAX_IMPORT_BATCH) {
    return NextResponse.json(
      { ok: false, error: `Maximum ${MAX_IMPORT_BATCH} contacts per import. Split into batches.` },
      { status: 400 }
    );
  }

  const now = new Date();
  let imported = 0;
  let skipped = 0;

  for (const c of body.contacts) {
    // Validate email
    if (!c.email || typeof c.email !== 'string' || !EMAIL_RE.test(c.email.trim())) {
      skipped++;
      continue;
    }

    const email = c.email.toLowerCase().trim();

    // Check for duplicate
    const existing = await db.select({ id: campaignContacts.id })
      .from(campaignContacts)
      .where(and(eq(campaignContacts.campaignId, id), eq(campaignContacts.email, email)));

    if (existing.length > 0) {
      skipped++;
      continue;
    }

    // Validate variables: flat string-to-string, limited size
    let variables: string | null = null;
    if (c.variables && typeof c.variables === 'object') {
      const clean: Record<string, string> = {};
      let keyCount = 0;
      for (const [k, v] of Object.entries(c.variables)) {
        if (keyCount >= 20) break; // max 20 variables
        if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
        if (typeof v === 'string') {
          clean[k.slice(0, 32)] = String(v).slice(0, 500);
          keyCount++;
        }
      }
      if (Object.keys(clean).length > 0) variables = JSON.stringify(clean);
    }

    await db.insert(campaignContacts).values({
      id: `cc_${crypto.randomUUID()}`,
      campaignId: id,
      email,
      name: c.name ? sanitizeString(String(c.name), 128) : null,
      variables,
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
