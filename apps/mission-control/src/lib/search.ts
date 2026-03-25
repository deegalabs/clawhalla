import Database from 'better-sqlite3';
import { readFile, readdir, stat } from 'fs/promises';
import { join, relative, extname } from 'path';

const DB_PATH = process.env.DB_PATH || './data/mission-control.db';
const WORKSPACE = process.env.WORKSPACE_PATH || join(process.env.HOME || '/home/clawdbot', '.openclaw/workspace');

const SKIP_DIRS = new Set(['node_modules', '.next', '.git', '.cache', 'venv', '__pycache__', '.openclaw']);
const SUPPORTED_EXTS = new Set(['.md', '.yaml', '.yml']);

function getCategory(filePath: string): string {
  if (filePath.includes('/memory/')) return 'memory';
  if (filePath.includes('/transcriptions/')) return 'transcription';
  if (filePath.includes('/insights/')) return 'insight';
  if (filePath.includes('/reports/')) return 'report';
  if (filePath.includes('/board/')) return 'board';
  if (filePath.includes('/personas/')) return 'persona';
  if (filePath.includes('/skills/')) return 'skill';
  if (filePath.includes('/company/')) return 'company';
  if (filePath.includes('/methodology/')) return 'methodology';
  if (filePath.includes('/projects/')) return 'project';
  if (filePath.includes('/squads/')) return 'squad';
  if (filePath.includes('ADR') || filePath.includes('adr')) return 'adr';
  return 'doc';
}

function extractTitle(content: string, filename: string): string {
  // Try to get title from first H1 or H2
  const match = content.match(/^#+ (.+)$/m);
  if (match) return match[1].trim();
  // Fallback to filename without extension
  return filename.replace(/\.(md|yaml|yml)$/, '').replace(/[-_]/g, ' ');
}

class SearchIndex {
  private db: Database.Database | null = null;
  private indexing = false;

  private getDb(): Database.Database {
    if (!this.db) {
      this.db = new Database(DB_PATH);
      this.db.pragma('journal_mode = WAL');
      this.initFTS();
    }
    return this.db;
  }

  private initFTS() {
    const db = this.db!;

    // Create FTS5 virtual table if not exists
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
        path,
        title,
        category,
        content,
        tokenize='porter unicode61'
      );
    `);

    // Metadata table for tracking indexed files
    db.exec(`
      CREATE TABLE IF NOT EXISTS search_meta (
        path TEXT PRIMARY KEY,
        last_modified INTEGER NOT NULL,
        size INTEGER NOT NULL,
        word_count INTEGER NOT NULL,
        indexed_at INTEGER NOT NULL
      );
    `);
  }

  async index(): Promise<{ indexed: number; skipped: number; removed: number }> {
    if (this.indexing) return { indexed: 0, skipped: 0, removed: 0 };
    this.indexing = true;

    try {
      const db = this.getDb();
      const files = await this.scanFiles(WORKSPACE);

      const existingPaths = new Set(
        (db.prepare('SELECT path FROM search_meta').all() as { path: string }[]).map(r => r.path)
      );

      const currentPaths = new Set<string>();
      let indexed = 0;
      let skipped = 0;

      const insertMeta = db.prepare(
        'INSERT OR REPLACE INTO search_meta (path, last_modified, size, word_count, indexed_at) VALUES (?, ?, ?, ?, ?)'
      );
      const deleteFTS = db.prepare('DELETE FROM search_index WHERE path = ?');
      const insertFTS = db.prepare(
        'INSERT INTO search_index (path, title, category, content) VALUES (?, ?, ?, ?)'
      );
      const getMeta = db.prepare('SELECT last_modified FROM search_meta WHERE path = ?');

      const transaction = db.transaction(() => {
        for (const file of files) {
          currentPaths.add(file.relativePath);

          // Skip if not modified since last index
          const existing = getMeta.get(file.relativePath) as { last_modified: number } | undefined;
          if (existing && existing.last_modified >= file.mtime) {
            skipped++;
            continue;
          }

          // Remove old entry if exists
          deleteFTS.run(file.relativePath);

          // Index
          const title = extractTitle(file.content, file.name);
          const category = getCategory(file.relativePath);
          const wordCount = file.content.split(/\s+/).filter(Boolean).length;

          insertFTS.run(file.relativePath, title, category, file.content);
          insertMeta.run(file.relativePath, file.mtime, file.size, wordCount, Date.now());
          indexed++;
        }

        // Remove entries for deleted files
        let removed = 0;
        for (const path of existingPaths) {
          if (!currentPaths.has(path)) {
            deleteFTS.run(path);
            db.prepare('DELETE FROM search_meta WHERE path = ?').run(path);
            removed++;
          }
        }

        return { indexed, skipped, removed };
      });

      return transaction();
    } finally {
      this.indexing = false;
    }
  }

  async indexFile(absolutePath: string): Promise<void> {
    const db = this.getDb();
    const relativePath = relative(WORKSPACE, absolutePath);

    try {
      const content = await readFile(absolutePath, 'utf-8');
      const stats = await stat(absolutePath);
      const title = extractTitle(content, relativePath.split('/').pop() || '');
      const category = getCategory(relativePath);
      const wordCount = content.split(/\s+/).filter(Boolean).length;

      db.prepare('DELETE FROM search_index WHERE path = ?').run(relativePath);
      db.prepare(
        'INSERT INTO search_index (path, title, category, content) VALUES (?, ?, ?, ?)'
      ).run(relativePath, title, category, content);
      db.prepare(
        'INSERT OR REPLACE INTO search_meta (path, last_modified, size, word_count, indexed_at) VALUES (?, ?, ?, ?, ?)'
      ).run(relativePath, stats.mtimeMs, stats.size, wordCount, Date.now());
    } catch {
      // File might have been deleted
      db.prepare('DELETE FROM search_index WHERE path = ?').run(relativePath);
      db.prepare('DELETE FROM search_meta WHERE path = ?').run(relativePath);
    }
  }

  removeFile(relativePath: string): void {
    const db = this.getDb();
    db.prepare('DELETE FROM search_index WHERE path = ?').run(relativePath);
    db.prepare('DELETE FROM search_meta WHERE path = ?').run(relativePath);
  }

  search(query: string, options?: { category?: string; limit?: number }): SearchResult[] {
    const db = this.getDb();
    const limit = options?.limit || 20;

    // Build FTS5 query — handle simple queries gracefully
    const ftsQuery = query
      .replace(/[^\w\s\-áàãâéêíóôõúüç]/gi, '') // strip special chars
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map(w => `"${w}"*`)  // prefix matching
      .join(' ');

    if (!ftsQuery) return [];

    let sql = `
      SELECT
        search_index.path,
        search_index.title,
        search_index.category,
        snippet(search_index, 3, '<mark>', '</mark>', '...', 40) as snippet,
        rank,
        search_meta.word_count,
        search_meta.size,
        search_meta.last_modified
      FROM search_index
      JOIN search_meta ON search_index.path = search_meta.path
      WHERE search_index MATCH ?
    `;

    const params: (string | number)[] = [ftsQuery];

    if (options?.category) {
      sql += ` AND search_index.category = ?`;
      params.push(options.category);
    }

    sql += ` ORDER BY rank LIMIT ?`;
    params.push(limit);

    try {
      return db.prepare(sql).all(...params) as SearchResult[];
    } catch {
      // FTS query syntax error — fallback to simple LIKE
      const likeSql = `
        SELECT
          search_meta.path,
          '' as title,
          '' as category,
          '' as snippet,
          0 as rank,
          search_meta.word_count,
          search_meta.size,
          search_meta.last_modified
        FROM search_meta
        WHERE path LIKE ?
        LIMIT ?
      `;
      return db.prepare(likeSql).all(`%${query}%`, limit) as SearchResult[];
    }
  }

  getStats(): { totalFiles: number; totalWords: number; lastIndexed: number | null } {
    const db = this.getDb();
    const row = db.prepare(
      'SELECT COUNT(*) as total, COALESCE(SUM(word_count), 0) as words, MAX(indexed_at) as last FROM search_meta'
    ).get() as { total: number; words: number; last: number | null };
    return { totalFiles: row.total, totalWords: row.words, lastIndexed: row.last };
  }

  private async scanFiles(dir: string): Promise<ScannedFile[]> {
    const results: ScannedFile[] = [];
    await this.walkDir(dir, dir, results);
    return results;
  }

  private async walkDir(baseDir: string, currentDir: string, results: ScannedFile[]): Promise<void> {
    let entries;
    try {
      entries = await readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.openclaw') continue;

      const fullPath = join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        await this.walkDir(baseDir, fullPath, results);
      } else if (SUPPORTED_EXTS.has(extname(entry.name).toLowerCase())) {
        try {
          const stats = await stat(fullPath);
          if (stats.size > 500_000) continue; // Skip files > 500KB
          const content = await readFile(fullPath, 'utf-8');
          results.push({
            name: entry.name,
            relativePath: relative(baseDir, fullPath),
            content,
            size: stats.size,
            mtime: stats.mtimeMs,
          });
        } catch {
          continue;
        }
      }
    }
  }
}

export interface SearchResult {
  path: string;
  title: string;
  category: string;
  snippet: string;
  rank: number;
  word_count: number;
  size: number;
  last_modified: number;
}

interface ScannedFile {
  name: string;
  relativePath: string;
  content: string;
  size: number;
  mtime: number;
}

// Singleton
export const searchIndex = new SearchIndex();
