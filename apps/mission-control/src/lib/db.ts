import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import * as schema from './schema';

const DB_PATH = process.env.DB_PATH || './data/mission-control.db';

let _db: BetterSQLite3Database<typeof schema> | null = null;

function getDb(): BetterSQLite3Database<typeof schema> {
  if (_db) return _db;

  const sqlite = new Database(DB_PATH);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('busy_timeout = 5000');

  // Auto-migrate: run any pending .sql migration files
  autoMigrate(sqlite);

  _db = drizzle(sqlite, { schema });
  return _db;
}

function autoMigrate(sqlite: Database.Database) {
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

// Proxy that lazily initializes DB on first access
export const db = new Proxy({} as BetterSQLite3Database<typeof schema>, {
  get(_target, prop) {
    return (getDb() as any)[prop];
  },
});
