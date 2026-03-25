import { NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import * as yaml from 'yaml';
import { db } from '@/lib/db';
import { epics, stories, sprints, tasks } from '@/lib/schema';

const WORKSPACE = process.env.HOME + '/.openclaw/workspace';

function parseYaml(filePath: string): unknown[] {
  if (!existsSync(filePath)) return [];
  try {
    const content = readFileSync(filePath, 'utf-8');
    const parsed = yaml.parse(content);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

// POST /api/board/import — migrate YAML board data into SQLite
export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const project = url.searchParams.get('project') || 'clawhalla';
    const boardPath = join(WORKSPACE, 'projects', project, 'board');

    const now = new Date();
    let imported = { epics: 0, stories: 0, sprints: 0, tasks: 0 };

    // Ensure tables exist
    const sqlite = (db as unknown as { $client: { exec: (sql: string) => void } }).$client;
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS epics (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, status TEXT DEFAULT 'active',
        created_by TEXT, approved_by TEXT, priority TEXT DEFAULT 'medium',
        notes TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
        completed_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS stories (
        id TEXT PRIMARY KEY, epic_id TEXT, title TEXT NOT NULL,
        status TEXT DEFAULT 'backlog', points INTEGER, assigned_to TEXT,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, completed_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS sprints (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, status TEXT DEFAULT 'planning',
        start_date TEXT, end_date TEXT, story_ids TEXT,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      );
    `);

    // Add new columns to tasks if they don't exist
    try { sqlite.exec('ALTER TABLE tasks ADD COLUMN story_id TEXT'); } catch { /* already exists */ }
    try { sqlite.exec('ALTER TABLE tasks ADD COLUMN sprint_id TEXT'); } catch { /* already exists */ }
    try { sqlite.exec('ALTER TABLE tasks ADD COLUMN notes TEXT'); } catch { /* already exists */ }

    // Import epics
    const yamlEpics = parseYaml(join(boardPath, 'epics.yaml'));
    for (const e of yamlEpics as Record<string, unknown>[]) {
      try {
        await db.insert(epics).values({
          id: String(e.id),
          title: String(e.title),
          status: String(e.status || 'active'),
          createdBy: e.created_by ? String(e.created_by) : null,
          approvedBy: e.approved_by ? String(e.approved_by) : null,
          priority: e.priority ? String(e.priority) : 'medium',
          notes: e.notes ? String(e.notes) : null,
          createdAt: now,
          updatedAt: now,
          completedAt: e.completed_at ? new Date(String(e.completed_at)) : null,
        }).onConflictDoNothing();
        imported.epics++;
      } catch { /* skip duplicates */ }
    }

    // Import stories
    const yamlStories = parseYaml(join(boardPath, 'stories.yaml'));
    for (const s of yamlStories as Record<string, unknown>[]) {
      try {
        await db.insert(stories).values({
          id: String(s.id),
          epicId: s.epic ? String(s.epic) : s.epic_id ? String(s.epic_id) : null,
          title: String(s.title),
          status: String(s.status || 'backlog'),
          points: s.points ? Number(s.points) : null,
          assignedTo: s.assigned_to ? String(s.assigned_to) : null,
          createdAt: now,
          updatedAt: now,
          completedAt: s.completed_at ? new Date(String(s.completed_at)) : null,
        }).onConflictDoNothing();
        imported.stories++;
      } catch { /* skip */ }
    }

    // Import sprints
    const yamlSprints = parseYaml(join(boardPath, 'sprints.yaml'));
    for (const sp of yamlSprints as Record<string, unknown>[]) {
      try {
        await db.insert(sprints).values({
          id: String(sp.id),
          name: String(sp.name),
          status: String(sp.status || 'planning'),
          startDate: sp.start ? String(sp.start) : null,
          endDate: sp.end ? String(sp.end) : null,
          storyIds: sp.stories ? JSON.stringify(sp.stories) : null,
          createdAt: now,
          updatedAt: now,
        }).onConflictDoNothing();
        imported.sprints++;
      } catch { /* skip */ }
    }

    // Import tasks
    const yamlTasks = parseYaml(join(boardPath, 'tasks.yaml'));
    for (const t of yamlTasks as Record<string, unknown>[]) {
      try {
        await db.insert(tasks).values({
          id: String(t.id),
          title: String(t.title),
          description: t.description ? String(t.description) : null,
          status: String(t.status || 'backlog'),
          priority: String(t.priority || 'medium'),
          assignedTo: t.assigned_to ? String(t.assigned_to) : null,
          projectId: project,
          storyId: t.story ? String(t.story) : null,
          sprintId: t.sprint ? String(t.sprint) : null,
          notes: t.notes ? String(t.notes) : null,
          createdAt: now,
          updatedAt: now,
          completedAt: t.completed_at ? new Date(String(t.completed_at)) : null,
        }).onConflictDoNothing();
        imported.tasks++;
      } catch { /* skip */ }
    }

    return NextResponse.json({ ok: true, imported });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Import failed';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
