import { watch } from 'chokidar';
import { join, extname, basename } from 'path';
import { readFileSync } from 'fs';
import { searchIndex } from './search';
import { db } from './db';
import { activities, contentDrafts } from './schema';
import { syncDraftToBoard } from './board-sync';
import { eq } from 'drizzle-orm';
import { WORKSPACE } from '@/lib/paths';
const INDEXABLE_EXTS = new Set(['.md', '.yaml', '.yml']);

/**
 * Parse YAML-style frontmatter from a markdown file.
 * Uses simple regex — no yaml dependency needed.
 * Returns null if no valid frontmatter block is found.
 */
function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } | null {
  const match = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!match) return null;

  const metaBlock = match[1];
  const body = match[2].trim();
  const meta: Record<string, string> = {};

  for (const line of metaBlock.split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key) meta[key] = value;
  }

  return { meta, body };
}

export interface FileEvent {
  type: 'created' | 'updated' | 'deleted';
  path: string;
  relativePath: string;
  timestamp: number;
}

type EventListener = (event: FileEvent) => void;

class WorkspaceWatcher {
  private listeners = new Set<EventListener>();
  private initialized = false;

  init() {
    if (this.initialized) return;
    this.initialized = true;

    const watchPaths = [
      join(WORKSPACE, 'company/org_structure.yaml'),
      join(WORKSPACE, 'projects/clawhalla/board'),
      join(WORKSPACE, 'memory'),
      join(WORKSPACE, 'company/knowledge_base'),
      join(WORKSPACE, 'drafts'),
      join(WORKSPACE, 'squads/*/drafts'),
    ];

    const watcher = watch(watchPaths, {
      ignoreInitial: true,
      persistent: true,
      awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
    });

    watcher.on('add', (path) => { this.emit('created', path); this.reindex(path); this.logActivity('file_created', path); this.handleDraftFile(path); });
    watcher.on('change', (path) => { this.emit('updated', path); this.reindex(path); this.logActivity('file_updated', path); this.handleDraftFile(path); });
    watcher.on('unlink', (path) => { this.emit('deleted', path); this.deindex(path); });
  }

  private emit(type: FileEvent['type'], fullPath: string) {
    const relativePath = fullPath.replace(WORKSPACE + '/', '');
    const event: FileEvent = {
      type,
      path: fullPath,
      relativePath,
      timestamp: Date.now(),
    };
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Don't let one listener crash others
      }
    }
  }

  private logActivity(action: string, fullPath: string) {
    const relativePath = fullPath.replace(WORKSPACE + '/', '');
    const fileName = basename(fullPath);

    // Determine agent from path context
    let agentId = 'system';
    if (relativePath.includes('/board/')) agentId = 'claw';
    else if (relativePath.includes('/memory/')) agentId = 'claw';
    else if (relativePath.includes('/squads/clop-cabinet/cra/')) agentId = 'mimir';
    else if (relativePath.includes('/squads/clop-cabinet/cma/')) agentId = 'bragi';
    else if (relativePath.includes('/squads/clop-cabinet/cba/')) agentId = 'loki';
    else if (relativePath.includes('/squads/dev/')) agentId = 'freya';
    else if (relativePath.includes('/squads/blockchain/')) agentId = 'sindri';
    else if (relativePath.includes('/knowledge_base/')) agentId = 'mimir';

    // Determine specific action for board changes
    let detailedAction = action;
    if (relativePath.includes('tasks.yaml')) detailedAction = 'task_updated';
    else if (relativePath.includes('stories.yaml')) detailedAction = 'task_updated';
    else if (relativePath.includes('sprints.yaml')) detailedAction = 'task_updated';

    try {
      db.insert(activities).values({
        id: `act_${crypto.randomUUID()}`,
        agentId,
        action: detailedAction,
        target: fileName,
        details: relativePath,
        timestamp: new Date(),
      }).run();
    } catch {
      // Non-fatal — don't crash watcher for logging failures
    }
  }

  /**
   * Detect .md files in drafts/ directories, parse frontmatter,
   * and upsert into the contentDrafts table.
   */
  private handleDraftFile(fullPath: string) {
    const relativePath = fullPath.replace(WORKSPACE + '/', '');

    // Only process .md files inside drafts/ directories
    const isDraft =
      extname(fullPath).toLowerCase() === '.md' &&
      /(?:^|\/)drafts\//.test(relativePath);
    if (!isDraft) return;

    try {
      const raw = readFileSync(fullPath, 'utf-8');
      const parsed = parseFrontmatter(raw);
      if (!parsed) return; // no valid frontmatter — skip

      const { meta, body } = parsed;
      const platform = (meta.platform || 'blog').toLowerCase();
      const title = meta.title || body.slice(0, 80).split('\n')[0] || basename(fullPath, '.md');
      const agent = meta.agent || this.agentFromPath(relativePath);
      const status = meta.status || 'draft';

      // Extract hashtags from the last line if it starts with #
      let hashtags = '';
      const lines = body.trimEnd().split('\n');
      const lastLine = lines[lines.length - 1]?.trim() || '';
      if (lastLine.startsWith('#') && /^[#\w\s]+$/.test(lastLine)) {
        hashtags = lastLine
          .split(/\s+/)
          .filter((t) => t.startsWith('#'))
          .map((t) => t.replace(/^#+/, ''))
          .filter(Boolean)
          .join(', ');
      }

      // Build a stable ID from filename to avoid duplicates
      const fileSlug = basename(fullPath, '.md');
      const draftId = `draft_file_${fileSlug}`;
      const now = new Date();

      const existing = db
        .select()
        .from(contentDrafts)
        .where(eq(contentDrafts.id, draftId))
        .get();

      if (existing) {
        db.update(contentDrafts)
          .set({
            title,
            content: body,
            platform,
            status,
            hashtags: hashtags || null,
            agentId: agent,
            scheduledAt: meta.scheduledAt ? new Date(meta.scheduledAt) : null,
            updatedAt: now,
          })
          .where(eq(contentDrafts.id, draftId))
          .run();
      } else {
        db.insert(contentDrafts)
          .values({
            id: draftId,
            title,
            content: body,
            platform,
            status,
            hashtags: hashtags || null,
            mediaUrl: null,
            scheduledAt: meta.scheduledAt ? new Date(meta.scheduledAt) : null,
            agentId: agent,
            pipelineId: null,
            createdAt: now,
            updatedAt: now,
          })
          .run();
      }

      // Sync to board card
      syncDraftToBoard({
        id: draftId,
        title,
        platform,
        agentId: agent,
        status,
      }).catch(() => {});

      // Log activity
      this.logActivity('draft_detected', fullPath);
    } catch (err) {
      console.error('[watcher] handleDraftFile error:', err);
    }
  }

  /** Infer agent from file path context */
  private agentFromPath(relativePath: string): string {
    if (relativePath.includes('/squads/clop-cabinet/cma/')) return 'bragi';
    if (relativePath.includes('/squads/clop-cabinet/cra/')) return 'mimir';
    if (relativePath.includes('/squads/clop-cabinet/cba/')) return 'loki';
    if (relativePath.includes('/squads/dev/')) return 'freya';
    if (relativePath.includes('/squads/blockchain/')) return 'sindri';
    return 'system';
  }

  private reindex(fullPath: string) {
    if (INDEXABLE_EXTS.has(extname(fullPath).toLowerCase())) {
      searchIndex.indexFile(fullPath).catch(() => {});
    }
  }

  private deindex(fullPath: string) {
    if (INDEXABLE_EXTS.has(extname(fullPath).toLowerCase())) {
      const relativePath = fullPath.replace(WORKSPACE + '/', '');
      searchIndex.removeFile(relativePath);
    }
  }

  subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

// Singleton
export const workspaceWatcher = new WorkspaceWatcher();
