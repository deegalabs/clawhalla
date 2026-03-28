import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { campaigns, campaignContacts } from '@/lib/schema';
import { desc, eq, sql } from 'drizzle-orm';

function nanoid() {
  return `camp_${crypto.randomUUID()}`;
}

// GET /api/campaigns — list all campaigns
export async function GET() {
  const result = await db.select().from(campaigns).orderBy(desc(campaigns.updatedAt));
  return NextResponse.json(result);
}

// POST /api/campaigns — create a campaign
export async function POST(req: NextRequest) {
  const body = await req.json();

  if (!body.name || !body.subject || !body.fromName || !body.fromEmail || !body.templateHtml) {
    return NextResponse.json(
      { ok: false, error: 'name, subject, fromName, fromEmail, and templateHtml are required' },
      { status: 400 }
    );
  }

  const now = new Date();
  const newCampaign = {
    id: nanoid(),
    name: body.name,
    subject: body.subject,
    fromName: body.fromName,
    fromEmail: body.fromEmail,
    replyTo: body.replyTo || null,
    templateHtml: body.templateHtml,
    templateText: body.templateText || null,
    smtpVaultKey: body.smtpVaultKey || 'SMTP_CONNECTION',
    status: 'draft' as const,
    totalContacts: 0,
    sentCount: 0,
    failedCount: 0,
    settings: body.settings ? JSON.stringify(body.settings) : null,
    error: null,
    startedAt: null,
    completedAt: null,
    createdBy: body.createdBy || 'user',
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(campaigns).values(newCampaign);
  return NextResponse.json(newCampaign, { status: 201 });
}
