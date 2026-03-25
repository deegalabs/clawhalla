import { NextResponse } from 'next/server';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import * as yaml from 'yaml';

const WORKSPACE = process.env.HOME + '/.openclaw/workspace';

export async function PATCH(req: Request) {
  const body = await req.json();
  const { project = 'clawhalla', taskId, status, agentId } = body;
  
  if (!taskId || !status) {
    return NextResponse.json({ error: 'taskId and status required' }, { status: 400 });
  }

  const tasksPath = join(WORKSPACE, 'projects', project, 'board', 'tasks.yaml');
  if (!existsSync(tasksPath)) {
    return NextResponse.json({ error: 'tasks.yaml not found' }, { status: 404 });
  }

  const content = readFileSync(tasksPath, 'utf-8');
  const tasks = yaml.parse(content) || [];
  
  const task = tasks.find((t: any) => t.id === taskId);
  if (!task) {
    return NextResponse.json({ error: 'task not found' }, { status: 404 });
  }

  task.status = status;
  if (agentId) task.updated_by = agentId;
  task.updated_at = new Date().toISOString();

  writeFileSync(tasksPath, yaml.stringify(tasks));
  
  return NextResponse.json({ ok: true, task });
}
