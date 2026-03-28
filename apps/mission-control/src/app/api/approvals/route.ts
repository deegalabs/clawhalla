import { db } from '@/lib/db';
import { approvals } from '@/lib/schema';
import { desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { notify } from '@/lib/notify';

export async function GET() {
  try {
    const all = await db.select().from(approvals).orderBy(desc(approvals.createdAt));
    
    // Separate pending and history
    const pending = all.filter(a => a.status === 'pending');
    const history = all.filter(a => a.status !== 'pending');
    
    return NextResponse.json({ pending, history });
  } catch (error) {
    console.error('Error fetching approvals:', error);
    return NextResponse.json({ pending: [], history: [] });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { title, type, requestedBy, context } = body;
    
    const id = `apr_${Date.now().toString(36)}`;
    
    await db.insert(approvals).values({
      id,
      taskId: title, // Using taskId to store title for MVP
      requestedBy,
      approver: 'daniel', // Default approver
      status: 'pending',
      command: type, // Using command to store type for MVP
      reason: context,
      createdAt: new Date(),
    });
    
    // Notify about pending approval
    notify({
      type: 'approval',
      title: 'Approval Required',
      body: `${requestedBy || 'Agent'} requests: ${title}`,
      icon: '⭐',
      href: '/approvals',
      agentId: requestedBy,
      priority: 'high',
      sound: true,
    });

    return NextResponse.json({ ok: true, id });
  } catch (error) {
    console.error('Error creating approval:', error);
    return NextResponse.json({ error: 'Failed to create approval' }, { status: 500 });
  }
}
