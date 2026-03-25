import { NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import * as yaml from 'yaml';

const WORKSPACE = process.env.HOME + '/.openclaw/workspace';

function parseYaml(filePath: string) {
  if (!existsSync(filePath)) return [];
  try {
    const content = readFileSync(filePath, 'utf-8');
    const parsed = yaml.parse(content);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const project = url.searchParams.get('project') || 'clawhalla';
  const boardPath = join(WORKSPACE, 'projects', project, 'board');

  const epics = parseYaml(join(boardPath, 'epics.yaml'));
  const stories = parseYaml(join(boardPath, 'stories.yaml'));
  const tasks = parseYaml(join(boardPath, 'tasks.yaml'));
  const sprints = parseYaml(join(boardPath, 'sprints.yaml'));

  return NextResponse.json({
    ok: true,
    project,
    epics,
    stories,
    tasks,
    sprints,
    counts: {
      epics: epics.length,
      stories: stories.length,
      tasks: tasks.length,
      sprints: sprints.length,
    }
  });
}
