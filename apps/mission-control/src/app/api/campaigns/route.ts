import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { campaigns } from '@/lib/schema';
import { desc } from 'drizzle-orm';
import { authenticateRequest, isAuthError } from '@/lib/auth';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SMTP_KEY_RE = /^[A-Z0-9_]{1,64}$/;

function nanoid() {
  return `camp_${crypto.randomUUID()}`;
}

function sanitizeString(s: string, maxLen = 256): string {
  return s.replace(/[\r\n]/g, '').trim().slice(0, maxLen);
}

function validateSettings(raw: Record<string, unknown>): Record<string, unknown> | null {
  const allowed = ['delayMinDay','delayMaxDay','delayMinNight','delayMaxNight','pauseWindows','breakEvery','breakMinMs','breakMaxMs','timezone','maxConsecutiveFails'];
  const out: Record<string, unknown> = {};
  for (const key of allowed) {
    if (raw[key] !== undefined) out[key] = raw[key];
  }
  // Enforce minimums to prevent anti-spam bypass
  if (typeof out.delayMinDay === 'number') out.delayMinDay = Math.max(30_000, out.delayMinDay);
  if (typeof out.delayMaxDay === 'number') out.delayMaxDay = Math.max(60_000, out.delayMaxDay);
  if (typeof out.delayMinNight === 'number') out.delayMinNight = Math.max(60_000, out.delayMinNight);
  if (typeof out.delayMaxNight === 'number') out.delayMaxNight = Math.max(120_000, out.delayMaxNight);
  if (typeof out.breakEvery === 'number') out.breakEvery = Math.max(1, Math.min(100, out.breakEvery));
  if (typeof out.maxConsecutiveFails === 'number') out.maxConsecutiveFails = Math.max(1, Math.min(50, out.maxConsecutiveFails));
  return out;
}

// GET /api/campaigns — list all campaigns
export async function GET(req: NextRequest) {
  const auth = authenticateRequest(req);
  if (isAuthError(auth)) return auth;

  // Agents cannot access campaigns
  if (auth.type === 'agent') {
    return NextResponse.json({ ok: false, error: 'Agents cannot access campaigns' }, { status: 403 });
  }

  const result = await db.select().from(campaigns).orderBy(desc(campaigns.updatedAt));
  return NextResponse.json(result);
}

// POST /api/campaigns — create a campaign
export async function POST(req: NextRequest) {
  const auth = authenticateRequest(req);
  if (isAuthError(auth)) return auth;

  if (auth.type === 'agent') {
    return NextResponse.json({ ok: false, error: 'Agents cannot create campaigns' }, { status: 403 });
  }

  const body = await req.json();

  if (!body.name || !body.subject || !body.fromName || !body.fromEmail || !body.templateHtml) {
    return NextResponse.json(
      { ok: false, error: 'name, subject, fromName, fromEmail, and templateHtml are required' },
      { status: 400 }
    );
  }

  // Validate email format
  if (!EMAIL_RE.test(body.fromEmail)) {
    return NextResponse.json({ ok: false, error: 'Invalid fromEmail format' }, { status: 400 });
  }
  if (body.replyTo && !EMAIL_RE.test(body.replyTo)) {
    return NextResponse.json({ ok: false, error: 'Invalid replyTo format' }, { status: 400 });
  }

  // Validate SMTP vault key
  const smtpKey = body.smtpVaultKey || 'SMTP_CONNECTION';
  if (!SMTP_KEY_RE.test(smtpKey)) {
    return NextResponse.json({ ok: false, error: 'Invalid smtpVaultKey format (uppercase letters, numbers, underscores only)' }, { status: 400 });
  }

  const now = new Date();
  const newCampaign = {
    id: nanoid(),
    name: sanitizeString(body.name),
    subject: sanitizeString(body.subject, 998), // RFC 2822 limit
    fromName: sanitizeString(body.fromName, 128),
    fromEmail: sanitizeString(body.fromEmail, 254),
    replyTo: body.replyTo ? sanitizeString(body.replyTo, 254) : null,
    templateHtml: body.templateHtml,
    templateText: body.templateText || null,
    smtpVaultKey: smtpKey,
    status: 'draft' as const,
    totalContacts: 0,
    sentCount: 0,
    failedCount: 0,
    settings: body.settings ? JSON.stringify(validateSettings(body.settings)) : null,
    error: null,
    startedAt: null,
    completedAt: null,
    createdBy: 'user', // always from auth context, never from body
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(campaigns).values(newCampaign);
  return NextResponse.json(newCampaign, { status: 201 });
}
