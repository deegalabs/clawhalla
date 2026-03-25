import { NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import * as yaml from 'yaml';
import { db } from '@/lib/db';
import { tasks, epics, stories, sprints } from '@/lib/schema';
import { desc } from 'drizzle-orm';

const WORKSPACE = process.env.HOME + '/.openclaw/workspace';

function parseYaml(filePath: string): unknown[] {
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
  const source = url.searchParams.get('source') || 'auto'; // auto | sqlite | yaml

  // Try SQLite first
  if (source !== 'yaml') {
    try {
      const dbTasks = await db.select().from(tasks).orderBy(desc(tasks.updatedAt));

      // Only use SQLite if it has data
      if (dbTasks.length > 0 || source === 'sqlite') {
        let dbEpics: unknown[] = [];
        let dbStories: unknown[] = [];
        let dbSprints: unknown[] = [];

        try { dbEpics = await db.select().from(epics); } catch { /* table may not exist */ }
        try { dbStories = await db.select().from(stories); } catch { /* table may not exist */ }
        try { dbSprints = await db.select().from(sprints); } catch { /* table may not exist */ }

        return NextResponse.json({
          ok: true,
          project,
          source: 'sqlite',
          epics: dbEpics,
          stories: dbStories,
          tasks: dbTasks,
          sprints: dbSprints,
          counts: {
            epics: dbEpics.length,
            stories: dbStories.length,
            tasks: dbTasks.length,
            sprints: dbSprints.length,
          },
        });
      }
    } catch {
      // SQLite tables don't exist yet — fall through to YAML
    }
  }

  // Fallback: read YAML
  const boardPath = join(WORKSPACE, 'projects', project, 'board');

  const yamlEpics = parseYaml(join(boardPath, 'epics.yaml'));
  const yamlStories = parseYaml(join(boardPath, 'stories.yaml'));
  const yamlTasks = parseYaml(join(boardPath, 'tasks.yaml'));
  const yamlSprints = parseYaml(join(boardPath, 'sprints.yaml'));

  return NextResponse.json({
    ok: true,
    project,
    source: 'yaml',
    epics: yamlEpics,
    stories: yamlStories,
    tasks: yamlTasks,
    sprints: yamlSprints,
    counts: {
      epics: yamlEpics.length,
      stories: yamlStories.length,
      tasks: yamlTasks.length,
      sprints: yamlSprints.length,
    },
  });
}
