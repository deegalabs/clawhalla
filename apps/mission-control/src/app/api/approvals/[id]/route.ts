import { db } from '@/lib/db';
import { approvals } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { startCampaignSend } from '@/lib/campaign-sender';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { decision, decidedBy } = body;

    if (!['approved', 'rejected'].includes(decision)) {
      return NextResponse.json({ ok: false, error: 'Invalid decision' }, { status: 400 });
    }

    // Get the approval before updating
    const [approval] = await db.select().from(approvals).where(eq(approvals.id, id));
    if (!approval) {
      return NextResponse.json({ ok: false, error: 'Approval not found' }, { status: 404 });
    }

    await db.update(approvals)
      .set({
        status: decision,
        approver: decidedBy || 'daniel',
        resolvedAt: new Date(),
      })
      .where(eq(approvals.id, id));

    // Handle approval callbacks
    if (decision === 'approved' && approval.command) {
      await handleApprovalCallback(approval.command);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error updating approval:', error);
    return NextResponse.json({ ok: false, error: 'Failed to update approval' }, { status: 500 });
  }
}

// Execute side effects when an approval is approved
async function handleApprovalCallback(command: string) {
  // Campaign send: "campaign:send:<campaignId>"
  if (command.startsWith('campaign:send:')) {
    const campaignId = command.replace('campaign:send:', '');
    console.log(`[approval] Campaign send approved — starting: ${campaignId}`);
    const result = await startCampaignSend(campaignId);
    if (!result.started) {
      console.error(`[approval] Campaign send failed to start: ${result.error}`);
    }
  }
}
