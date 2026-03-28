import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';
import { notify } from '@/lib/notify';

function oc(cmd: string): string {
  return execSync(`openclaw cron ${cmd}`, { encoding: 'utf-8', timeout: 15000 }).trim();
}

// GET /api/crons — list all cron jobs
export async function GET() {
  try {
    const raw = oc('list --json');
    const data = JSON.parse(raw);
    return NextResponse.json({ ok: true, jobs: data.jobs || data || [] });
  } catch (error) {
    return NextResponse.json({ ok: false, jobs: [], error: String(error) }, { status: 500 });
  }
}

// POST /api/crons — create a new cron job
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, agentId, cron, message, model, timezone } = body;

    if (!name || !agentId || !cron || !message) {
      return NextResponse.json({ ok: false, error: 'name, agentId, cron, message required' }, { status: 400 });
    }

    let cmd = `add --name "${name}" --agent ${agentId} --cron "${cron}" --message "${message.replace(/"/g, '\\"')}" --json --no-deliver --session isolated`;
    if (model) cmd += ` --model ${model}`;
    if (timezone) cmd += ` --tz "${timezone}"`;

    const raw = oc(cmd);
    const result = JSON.parse(raw);
    return NextResponse.json({ ok: true, job: result }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}

// PATCH /api/crons — enable/disable or edit a cron
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, action, name, cron: cronExpr, message } = body;

    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 });

    if (action === 'enable') {
      oc(`enable ${id}`);
      return NextResponse.json({ ok: true, action: 'enabled' });
    }
    if (action === 'disable') {
      oc(`disable ${id}`);
      return NextResponse.json({ ok: true, action: 'disabled' });
    }
    if (action === 'run') {
      try {
        oc(`run ${id}`);
        notify({
          type: 'system',
          title: 'Cron Executed',
          body: `Job "${name || id}" triggered successfully`,
          icon: '⏰',
          href: '/calendar',
          priority: 'normal',
        });
        return NextResponse.json({ ok: true, action: 'triggered' });
      } catch (err) {
        notify({
          type: 'system',
          title: 'Cron Failed',
          body: `Job "${name || id}" failed: ${String(err).slice(0, 100)}`,
          icon: '⚠️',
          href: '/calendar',
          priority: 'urgent',
          sound: true,
        });
        return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
      }
    }

    // Edit fields
    let cmd = `edit ${id}`;
    if (name) cmd += ` --name "${name}"`;
    if (cronExpr) cmd += ` --cron "${cronExpr}"`;
    if (message) cmd += ` --message "${message.replace(/"/g, '\\"')}"`;
    cmd += ' --json';

    const raw = oc(cmd);
    return NextResponse.json({ ok: true, result: raw });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}

// DELETE /api/crons — remove a cron job
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 });

    oc(`rm ${id}`);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
