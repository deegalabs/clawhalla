import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import * as schema from './schema';

const DB_PATH = process.env.DB_PATH || './data/mission-control.db';

const sqlite = new Database(DB_PATH);
sqlite.pragma('journal_mode = WAL');

// Auto-migrate: run any pending .sql migration files
function autoMigrate() {
  sqlite.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    tag TEXT PRIMARY KEY,
    applied_at INTEGER NOT NULL
  )`);

  const applied = new Set(
    sqlite.prepare('SELECT tag FROM _migrations').all().map((r: any) => r.tag)
  );

  const migrationsDir = join(process.cwd(), 'drizzle');
  let files: string[];
  try {
    files = readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
  } catch {
    return; // no migrations dir (e.g. dev without drizzle/)
  }

  for (const file of files) {
    const tag = file.replace('.sql', '');
    if (applied.has(tag)) continue;

    const sql = readFileSync(join(migrationsDir, file), 'utf-8');
    const statements = sql
      .split('--> statement-breakpoint')
      .map(s => s.trim())
      .filter(Boolean);

    sqlite.transaction(() => {
      for (const stmt of statements) {
        sqlite.exec(stmt);
      }
      sqlite.prepare('INSERT INTO _migrations (tag, applied_at) VALUES (?, ?)').run(tag, Date.now());
    })();

    console.log(`[db] migration applied: ${tag}`);
  }
}

autoMigrate();

export const db = drizzle(sqlite, { schema });
