import { db } from '@/lib/db';
import { approvals } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { decision, decidedBy } = body;
    
    if (!['approved', 'rejected'].includes(decision)) {
      return NextResponse.json({ error: 'Invalid decision' }, { status: 400 });
    }
    
    await db.update(approvals)
      .set({
        status: decision,
        approver: decidedBy || 'daniel',
        resolvedAt: new Date(),
      })
      .where(eq(approvals.id, id));
    
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error updating approval:', error);
    return NextResponse.json({ error: 'Failed to update approval' }, { status: 500 });
  }
}
