import { db } from '@/lib/db';
import { activities } from '@/lib/schema';
import { desc } from 'drizzle-orm';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get('limit') || '20');
  const agentId = url.searchParams.get('agent_id');

  try {
    let query = db.select().from(activities).orderBy(desc(activities.timestamp)).limit(limit);
    
    const result = await query;
    return NextResponse.json(result);
  } catch (error) {
    console.error('Activities error:', error);
    return NextResponse.json([]);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { agent_id, action, target, details } = body;

    if (!agent_id || !action) {
      return NextResponse.json(
        { error: 'agent_id and action required' },
        { status: 400 }
      );
    }

    // Validate action type
    const validActions = [
      'task_started',
      'task_completed',
      'task_updated',
      'heartbeat_check',
      'approval_requested',
      'approval_resolved',
      'file_created',
      'file_updated',
      'session_started',
      'session_ended',
    ];

    if (!validActions.includes(action)) {
      return NextResponse.json(
        { error: `Invalid action. Valid actions: ${validActions.join(', ')}` },
        { status: 400 }
      );
    }

    const id = `act_${Date.now().toString(36)}`;
    
    await db.insert(activities).values({
      id,
      agentId: agent_id,
      action,
      target: target || null,
      details: details || null,
      timestamp: new Date(),
    });

    return NextResponse.json({ ok: true, id });
  } catch (error) {
    console.error('Activities POST error:', error);
    return NextResponse.json({ error: 'Failed to log activity' }, { status: 500 });
  }
}
